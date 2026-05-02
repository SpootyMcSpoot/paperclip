// Contract tests for packages/shared/src/config-schema.ts.
//
// stapleConfigSchema gates every config write -- onboard, configure, and
// the doctor reload all run through it. Drift in the superRefine block
// silently lets bad combos through:
//
//   - local_trusted + public exposure -- would expose a single-tenant
//     local instance to the LAN/internet (auth not enforced).
//   - server.exposure=public + auto base URL -- would emit auth callbacks
//     to the wrong origin and break SSO sign-in.
//   - server.exposure=public without auth.publicBaseUrl -- callbacks 500.
//   - bind=custom without customBindHost -- server picks 127.0.0.1 and
//     silently disagrees with operator intent.
//
// Each test feeds a complete-but-minimal config and asserts the precise
// expected error path, so a refactor that drops a check fails loud.

import { describe, expect, it } from "vitest";
import { stapleConfigSchema, type StapleConfig } from "./config-schema.js";

const META = {
  $meta: { version: 1 as const, updatedAt: "2026-05-02T00:00:00Z", source: "configure" as const },
};

const LOGGING = { logging: { mode: "file" as const, logDir: "/tmp/log" } };

const baseConfig = (overrides: Partial<{
  server: Partial<StapleConfig["server"]>;
  auth: Partial<StapleConfig["auth"]>;
}> = {}) => ({
  ...META,
  database: { mode: "embedded-postgres" as const },
  ...LOGGING,
  server: {
    deploymentMode: "local_trusted" as const,
    exposure: "private" as const,
    bind: "loopback" as const,
    host: "127.0.0.1",
    port: 3100,
    serveUi: true,
    allowedHostnames: [],
    ...overrides.server,
  },
  auth: { baseUrlMode: "auto" as const, disableSignUp: false, ...overrides.auth },
  telemetry: { enabled: true },
});

// ---------------------------------------------------------------------------
// happy-path defaults
// ---------------------------------------------------------------------------

describe("stapleConfigSchema -- defaults", () => {
  it("local_trusted + private + loopback parses cleanly", () => {
    const result = stapleConfigSchema.safeParse(baseConfig());
    expect(result.success).toBe(true);
  });

  it("fills storage / secrets / telemetry defaults when omitted", () => {
    const result = stapleConfigSchema.safeParse(baseConfig());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.storage.provider).toBe("local_disk");
    expect(result.data.secrets.provider).toBe("local_encrypted");
    expect(result.data.telemetry.enabled).toBe(true);
  });

  it("database.backup defaults populate when omitted", () => {
    const result = stapleConfigSchema.safeParse(baseConfig());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.database.backup.enabled).toBe(true);
    expect(result.data.database.backup.intervalMinutes).toBe(60);
    expect(result.data.database.backup.retentionDays).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// superRefine: local_trusted + exposure cross-field
// ---------------------------------------------------------------------------

describe("stapleConfigSchema -- local_trusted + exposure", () => {
  it("rejects local_trusted with public exposure", () => {
    // Drift here = single-tenant local instance accidentally exposed
    // without auth -- exactly the footgun the cross-field check exists
    // to prevent.
    const result = stapleConfigSchema.safeParse(
      baseConfig({ server: { exposure: "public" }, auth: { baseUrlMode: "explicit", publicBaseUrl: "https://example.com" } }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("server.exposure must be private when deploymentMode is local_trusted");
  });
});

// ---------------------------------------------------------------------------
// superRefine: bind validation (delegated to validateConfiguredBindMode)
// ---------------------------------------------------------------------------

describe("stapleConfigSchema -- bind validation", () => {
  it("rejects local_trusted with non-loopback bind", () => {
    const result = stapleConfigSchema.safeParse(
      baseConfig({ server: { bind: "lan", host: "0.0.0.0" } }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("local_trusted requires server.bind=loopback");
  });

  it("rejects bind=custom without customBindHost (when host is loopback)", () => {
    // Refining authenticated mode so the local_trusted gate doesn't
    // mask the bind error first.
    const result = stapleConfigSchema.safeParse(
      baseConfig({
        server: { deploymentMode: "authenticated", bind: "custom", host: "127.0.0.1" },
        auth: { baseUrlMode: "explicit", publicBaseUrl: "https://example.com" },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes("customBindHost is required"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// superRefine: auth.baseUrlMode + publicBaseUrl
// ---------------------------------------------------------------------------

describe("stapleConfigSchema -- auth base URL", () => {
  it("rejects baseUrlMode=explicit without publicBaseUrl", () => {
    // Without a publicBaseUrl, callbacks default to localhost and SSO
    // sign-in fails; keep this check sticky.
    const result = stapleConfigSchema.safeParse(
      baseConfig({ auth: { baseUrlMode: "explicit" } }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes("auth.publicBaseUrl is required"))).toBe(true);
  });

  it("accepts baseUrlMode=explicit with valid publicBaseUrl URL", () => {
    const result = stapleConfigSchema.safeParse(
      baseConfig({ auth: { baseUrlMode: "explicit", publicBaseUrl: "https://staple.example.com" } }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects publicBaseUrl that is not a URL", () => {
    // The base zod schema enforces .url() -- this guards against a
    // plain hostname being silently accepted as the auth origin.
    const result = stapleConfigSchema.safeParse(
      baseConfig({ auth: { baseUrlMode: "explicit", publicBaseUrl: "not-a-url" } }),
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// superRefine: public exposure cross-field
// ---------------------------------------------------------------------------

describe("stapleConfigSchema -- public exposure", () => {
  it("rejects public exposure with auto base URL mode", () => {
    // Drift here = SSO callbacks emitted to whatever auto-detection
    // picks -- usually the wrong origin in production.
    const result = stapleConfigSchema.safeParse(
      baseConfig({
        server: { deploymentMode: "authenticated", exposure: "public" },
        auth: { baseUrlMode: "auto" },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(
      messages.some((m) => m.includes("auth.baseUrlMode must be explicit")),
    ).toBe(true);
  });

  it("accepts public exposure with explicit base URL", () => {
    const result = stapleConfigSchema.safeParse(
      baseConfig({
        server: { deploymentMode: "authenticated", exposure: "public", bind: "lan", host: "0.0.0.0" },
        auth: { baseUrlMode: "explicit", publicBaseUrl: "https://staple.example.com" },
      }),
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// numeric bounds
// ---------------------------------------------------------------------------

describe("stapleConfigSchema -- numeric bounds", () => {
  it("rejects port below 1 or above 65535", () => {
    const tooLow = stapleConfigSchema.safeParse(baseConfig({ server: { port: 0 } }));
    expect(tooLow.success).toBe(false);
    const tooHigh = stapleConfigSchema.safeParse(baseConfig({ server: { port: 70000 } }));
    expect(tooHigh.success).toBe(false);
  });

  it("rejects backup retentionDays of 0 or > 3650", () => {
    const bad = stapleConfigSchema.safeParse({
      ...baseConfig(),
      database: { mode: "embedded-postgres" as const, backup: { retentionDays: 0 } },
    });
    expect(bad.success).toBe(false);
    const tooBig = stapleConfigSchema.safeParse({
      ...baseConfig(),
      database: { mode: "embedded-postgres" as const, backup: { retentionDays: 4000 } },
    });
    expect(tooBig.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// $meta version pin
// ---------------------------------------------------------------------------

describe("stapleConfigSchema -- $meta", () => {
  it("requires version literal 1", () => {
    // Bumping the schema version is a deliberate migration event --
    // accepting v2 here without a migration would corrupt configs.
    const result = stapleConfigSchema.safeParse({
      ...baseConfig(),
      $meta: { version: 2 as unknown as 1, updatedAt: "x", source: "configure" },
    });
    expect(result.success).toBe(false);
  });

  it("requires source from {onboard, configure, doctor}", () => {
    const result = stapleConfigSchema.safeParse({
      ...baseConfig(),
      $meta: { version: 1 as const, updatedAt: "x", source: "cli" as unknown as "configure" },
    });
    expect(result.success).toBe(false);
  });
});
