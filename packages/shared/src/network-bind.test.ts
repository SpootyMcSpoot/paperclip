// Contract tests for packages/shared/src/network-bind.ts.
//
// Pin the bind-mode resolution surface that gates how the staple-ai
// server exposes itself on the network:
//
//   - loopback (127.0.0.1)  -- safe local-trusted default
//   - lan (0.0.0.0)         -- exposes to all interfaces
//   - tailnet               -- only when a Tailscale host is detected
//   - custom                -- requires an explicit customBindHost
//
// Drift in inferBindModeFromHost / validateConfiguredBindMode /
// resolveRuntimeBind silently changes whether a server binds to the
// open internet -- so we pin every branch with surgical inputs.
import { describe, expect, it } from "vitest";
import {
  ALL_INTERFACES_BIND_HOST,
  LOOPBACK_BIND_HOST,
  inferBindModeFromHost,
  isAllInterfacesHost,
  isLoopbackHost,
  resolveRuntimeBind,
  validateConfiguredBindMode,
} from "./network-bind.js";

describe("constants", () => {
  it("LOOPBACK_BIND_HOST is 127.0.0.1", () => {
    // Pinned because docs and CLI banner messages reference this exact
    // string -- changing it silently breaks "open http://127.0.0.1:..."
    // links in the launch UI.
    expect(LOOPBACK_BIND_HOST).toBe("127.0.0.1");
  });

  it("ALL_INTERFACES_BIND_HOST is 0.0.0.0", () => {
    expect(ALL_INTERFACES_BIND_HOST).toBe("0.0.0.0");
  });
});

describe("isLoopbackHost", () => {
  it.each([
    ["127.0.0.1", true],
    ["localhost", true],
    ["LOCALHOST", true], // case-insensitive guard -- env var inputs vary
    ["::1", true],       // IPv6 loopback -- regression bait if normalize drops casing
    ["  127.0.0.1  ", true], // trim guard -- shell echo padding
    ["0.0.0.0", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("isLoopbackHost(%j) -> %s", (input, expected) => {
    expect(isLoopbackHost(input as string | null | undefined)).toBe(expected);
  });
});

describe("isAllInterfacesHost", () => {
  it.each([
    ["0.0.0.0", true],
    ["::", true],         // IPv6 unspecified -- often missed in normalizers
    ["  0.0.0.0  ", true],
    ["127.0.0.1", false],
    ["", false],
    [null, false],
  ])("isAllInterfacesHost(%j) -> %s", (input, expected) => {
    expect(isAllInterfacesHost(input as string | null | undefined)).toBe(expected);
  });
});

describe("inferBindModeFromHost", () => {
  it("undefined / empty / loopback host -> loopback", () => {
    expect(inferBindModeFromHost(undefined)).toBe("loopback");
    expect(inferBindModeFromHost("")).toBe("loopback");
    expect(inferBindModeFromHost("127.0.0.1")).toBe("loopback");
    expect(inferBindModeFromHost("localhost")).toBe("loopback");
  });

  it("0.0.0.0 / :: -> lan (all-interfaces)", () => {
    expect(inferBindModeFromHost("0.0.0.0")).toBe("lan");
    expect(inferBindModeFromHost("::")).toBe("lan");
  });

  it("matches tailnet host only when opts.tailnetBindHost is provided AND equal", () => {
    // Pin the "==" comparison: pure equality, no CIDR or substring.
    // If somebody refactors to "startsWith", a 100.64.x.x prefix
    // collision becomes a false-positive tailnet flag.
    expect(inferBindModeFromHost("100.64.0.5", { tailnetBindHost: "100.64.0.5" })).toBe("tailnet");
    expect(inferBindModeFromHost("100.64.0.5", { tailnetBindHost: "100.64.0.6" })).toBe("custom");
    expect(inferBindModeFromHost("100.64.0.5")).toBe("custom"); // no tailnet hint
  });

  it("non-loopback non-lan host falls through to custom", () => {
    expect(inferBindModeFromHost("192.168.1.10")).toBe("custom");
  });
});

describe("validateConfiguredBindMode", () => {
  it("local_trusted requires loopback", () => {
    // CRITICAL: this is the security gate -- local_trusted skips auth
    // entirely. If the validator drift lets bind=lan through,
    // unauthenticated users on the LAN can hit the API.
    const errors = validateConfiguredBindMode({
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      bind: "lan",
    });
    expect(errors).toContain("local_trusted requires server.bind=loopback");
  });

  it("local_trusted + loopback bind -> no error", () => {
    expect(
      validateConfiguredBindMode({
        deploymentMode: "local_trusted",
        deploymentExposure: "private",
        bind: "loopback",
      }),
    ).toEqual([]);
  });

  it("custom bind without customBindHost AND without explicit host -> error", () => {
    const errors = validateConfiguredBindMode({
      deploymentMode: "authenticated",
      deploymentExposure: "private",
      bind: "custom",
    });
    expect(errors).toContain("server.customBindHost is required when server.bind=custom");
  });

  it("custom bind with explicit non-loopback non-lan host satisfies the requirement", () => {
    // Legacy migration path: existing configs that set host=192.168.x
    // without customBindHost should NOT error -- inferBindModeFromHost
    // already resolved them to custom.
    const errors = validateConfiguredBindMode({
      deploymentMode: "authenticated",
      deploymentExposure: "private",
      bind: "custom",
      host: "192.168.1.10",
    });
    expect(errors).toEqual([]);
  });

  it("authenticated+public+tailnet rejected (tailnet is private-only)", () => {
    // Tailnet binding behind a public DNS name leaks the tailnet IP
    // when the public reverse proxy fails over. Forbid the combo.
    const errors = validateConfiguredBindMode({
      deploymentMode: "authenticated",
      deploymentExposure: "public",
      bind: "tailnet",
    });
    expect(errors).toContain(
      "server.bind=tailnet is only supported for authenticated/private deployments",
    );
  });

  it("authenticated+private+tailnet allowed", () => {
    expect(
      validateConfiguredBindMode({
        deploymentMode: "authenticated",
        deploymentExposure: "private",
        bind: "tailnet",
      }),
    ).toEqual([]);
  });
});

describe("resolveRuntimeBind", () => {
  it("loopback -> 127.0.0.1, no errors", () => {
    expect(resolveRuntimeBind({ bind: "loopback" })).toEqual({
      bind: "loopback",
      host: "127.0.0.1",
      customBindHost: undefined,
      errors: [],
    });
  });

  it("lan -> 0.0.0.0, no errors", () => {
    expect(resolveRuntimeBind({ bind: "lan" })).toEqual({
      bind: "lan",
      host: "0.0.0.0",
      customBindHost: undefined,
      errors: [],
    });
  });

  it("custom + customBindHost -> use the explicit host", () => {
    expect(resolveRuntimeBind({ bind: "custom", customBindHost: "10.0.0.5" })).toEqual({
      bind: "custom",
      host: "10.0.0.5",
      customBindHost: "10.0.0.5",
      errors: [],
    });
  });

  it("custom + legacy host (non-loopback non-lan) is promoted to customBindHost", () => {
    // Migration safety: legacy configs set `host: "192.168.x"` only.
    // Resolver MUST treat it as the customBindHost rather than erroring.
    expect(resolveRuntimeBind({ bind: "custom", host: "192.168.1.10" })).toEqual({
      bind: "custom",
      host: "192.168.1.10",
      customBindHost: "192.168.1.10",
      errors: [],
    });
  });

  it("custom + no customBindHost + loopback host -> falls back to loopback + error", () => {
    // The error string is matched by the launch UI to surface a
    // "configure custom host" prompt -- pin the wording.
    const result = resolveRuntimeBind({ bind: "custom", host: "127.0.0.1" });
    expect(result.host).toBe("127.0.0.1");
    expect(result.errors).toEqual([
      "server.customBindHost is required when server.bind=custom",
    ]);
  });

  it("tailnet + tailnetBindHost -> use detected tailnet host", () => {
    expect(
      resolveRuntimeBind({ bind: "tailnet", tailnetBindHost: "100.64.0.5" }),
    ).toEqual({
      bind: "tailnet",
      host: "100.64.0.5",
      customBindHost: undefined,
      errors: [],
    });
  });

  it("tailnet without detected tailnet host -> error, falls back to loopback", () => {
    // The error string is consumed by the daemon launcher to print a
    // "run tailscale up" hint -- pin the exact wording.
    const result = resolveRuntimeBind({ bind: "tailnet" });
    expect(result.host).toBe("127.0.0.1");
    expect(result.errors).toEqual([
      "server.bind=tailnet requires a detected Tailscale address or STAPLE_TAILNET_BIND_HOST",
    ]);
  });

  it("nil bind + nil host -> defaults to loopback", () => {
    // The "no config at all" path. If this regresses to lan/all-interfaces,
    // a fresh install silently exposes itself on every LAN-attached
    // interface on first launch -- worst-case onboarding bug.
    expect(resolveRuntimeBind({})).toEqual({
      bind: "loopback",
      host: "127.0.0.1",
      customBindHost: undefined,
      errors: [],
    });
  });
});
