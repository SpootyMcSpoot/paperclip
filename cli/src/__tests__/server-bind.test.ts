// Contract tests for cli/src/config/server-bind.ts.
//
// resolveQuickstartServerConfig + buildPresetServerConfig +
// buildCustomServerConfig translate user-facing wizard answers into a
// (server, auth) pair that the rest of the CLI persists. Drift in the
// decision tree either:
//   (a) silently downgrades a stated bind preference (e.g. user picked
//       lan, config persists loopback), or
//   (b) corrupts the auth.baseUrlMode / publicBaseUrl pairing (which the
//       deployment-auth-check then rejects but ALWAYS after writing config).
//
// Pinned:
//   - inferConfiguredBind: explicit bind wins over host inference
//   - inferConfiguredBind: customBindHost beats host when both unset bind
//   - buildPresetServerConfig(loopback) -> deploymentMode=local_trusted, host=127.0.0.1
//   - buildPresetServerConfig(lan) -> deploymentMode=authenticated, host=0.0.0.0
//   - buildPresetServerConfig(tailnet) without env -> falls back to loopback host
//   - buildPresetServerConfig(tailnet) with STAPLE_TAILNET_BIND_HOST honored
//   - buildCustomServerConfig: 127.0.0.1 -> bind=loopback, customBindHost undefined
//   - buildCustomServerConfig: 0.0.0.0 -> bind=lan
//   - buildCustomServerConfig: arbitrary host -> bind=custom + customBindHost set
//   - buildCustomServerConfig: local_trusted forces exposure=private regardless of input
//   - buildCustomServerConfig: authenticated/public -> baseUrlMode=explicit
//   - resolveQuickstartServerConfig: explicit bind=loopback short-circuits to preset
//   - resolveQuickstartServerConfig: bind=custom routes to buildCustomServerConfig
//   - resolveQuickstartServerConfig: trimmed host present routes to custom builder
//   - resolveQuickstartServerConfig: authenticated+public+no host -> 0.0.0.0
//   - resolveQuickstartServerConfig: authenticated+private+no host -> lan preset
//   - resolveQuickstartServerConfig: no bind / no host / no mode -> loopback preset

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildCustomServerConfig,
  buildPresetServerConfig,
  inferConfiguredBind,
  resolveQuickstartServerConfig,
} from "../config/server-bind.js";

const baseInput = {
  port: 7777,
  allowedHostnames: ["app.example.com"],
  serveUi: true,
};

describe("inferConfiguredBind", () => {
  it("returns explicit bind when set", () => {
    expect(inferConfiguredBind({ bind: "lan", host: "127.0.0.1" } as never)).toBe("lan");
  });

  it("infers loopback from 127.0.0.1 when bind unset", () => {
    expect(inferConfiguredBind({ host: "127.0.0.1" } as never)).toBe("loopback");
  });

  it("infers lan from 0.0.0.0 when bind unset", () => {
    expect(inferConfiguredBind({ host: "0.0.0.0" } as never)).toBe("lan");
  });

  it("infers custom from arbitrary host when bind unset", () => {
    expect(inferConfiguredBind({ host: "10.1.2.3" } as never)).toBe("custom");
  });

  it("prefers customBindHost over host when bind unset", () => {
    // Pin: customBindHost is the persistent storage for "user typed
    // their own host" -- it beats legacy host field.
    expect(
      inferConfiguredBind({ customBindHost: "10.1.2.3", host: "127.0.0.1" } as never),
    ).toBe("custom");
  });

  it("returns loopback fallback when nothing supplied", () => {
    expect(inferConfiguredBind(undefined)).toBe("loopback");
  });
});

describe("buildPresetServerConfig", () => {
  it("loopback preset binds to 127.0.0.1 and sets local_trusted", () => {
    // Pin: loopback preset MUST set deploymentMode=local_trusted.
    // Anything else here would make doctor fail ("local_trusted
    // requires loopback bind") for every default install.
    const out = buildPresetServerConfig("loopback", baseInput);
    expect(out.server.deploymentMode).toBe("local_trusted");
    expect(out.server.host).toBe("127.0.0.1");
    expect(out.server.bind).toBe("loopback");
    expect(out.server.exposure).toBe("private");
    expect(out.auth.baseUrlMode).toBe("auto");
  });

  it("lan preset binds to 0.0.0.0 and sets authenticated", () => {
    const out = buildPresetServerConfig("lan", baseInput);
    expect(out.server.deploymentMode).toBe("authenticated");
    expect(out.server.host).toBe("0.0.0.0");
    expect(out.server.bind).toBe("lan");
  });

  describe("tailnet", () => {
    let saved: string | undefined;

    beforeEach(() => {
      saved = process.env.STAPLE_TAILNET_BIND_HOST;
    });

    afterEach(() => {
      if (saved === undefined) delete process.env.STAPLE_TAILNET_BIND_HOST;
      else process.env.STAPLE_TAILNET_BIND_HOST = saved;
    });

    it("tailnet without detected host falls back to loopback host", () => {
      // Pin: when neither STAPLE_TAILNET_BIND_HOST nor the `tailscale`
      // CLI surfaces an address, the host MUST fall back to 127.0.0.1
      // so the server still boots on something safe.
      delete process.env.STAPLE_TAILNET_BIND_HOST;
      const out = buildPresetServerConfig("tailnet", baseInput);
      expect(out.server.bind).toBe("tailnet");
      expect(out.server.host).toBe("127.0.0.1");
      expect(out.server.deploymentMode).toBe("authenticated");
    });

    it("tailnet honors STAPLE_TAILNET_BIND_HOST when set", () => {
      process.env.STAPLE_TAILNET_BIND_HOST = "100.64.1.42";
      const out = buildPresetServerConfig("tailnet", baseInput);
      expect(out.server.host).toBe("100.64.1.42");
    });
  });
});

describe("buildCustomServerConfig", () => {
  it("classifies 127.0.0.1 as bind=loopback with no customBindHost", () => {
    const out = buildCustomServerConfig({
      ...baseInput,
      deploymentMode: "local_trusted",
      exposure: "private",
      host: "127.0.0.1",
    });
    expect(out.server.bind).toBe("loopback");
    expect(out.server.customBindHost).toBeUndefined();
  });

  it("classifies 0.0.0.0 as bind=lan with no customBindHost", () => {
    const out = buildCustomServerConfig({
      ...baseInput,
      deploymentMode: "authenticated",
      exposure: "private",
      host: "0.0.0.0",
    });
    expect(out.server.bind).toBe("lan");
    expect(out.server.customBindHost).toBeUndefined();
  });

  it("classifies arbitrary host as bind=custom with customBindHost set", () => {
    // Pin: a typed hostname like "staple.lan" MUST persist as
    // customBindHost so the runtime rebinds to it. Drift here would
    // silently rebind to 0.0.0.0 (LAN exposure).
    const out = buildCustomServerConfig({
      ...baseInput,
      deploymentMode: "authenticated",
      exposure: "private",
      host: "staple.lan",
    });
    expect(out.server.bind).toBe("custom");
    expect(out.server.customBindHost).toBe("staple.lan");
    expect(out.server.host).toBe("staple.lan");
  });

  it("trims whitespace from host", () => {
    const out = buildCustomServerConfig({
      ...baseInput,
      deploymentMode: "authenticated",
      exposure: "private",
      host: "  10.1.2.3  ",
    });
    expect(out.server.host).toBe("10.1.2.3");
    expect(out.server.customBindHost).toBe("10.1.2.3");
  });

  it("local_trusted forces exposure=private regardless of input", () => {
    // Pin: local_trusted MUST never persist as public -- doctor would
    // fail later, but worse: someone might disable doctor and run
    // unauthenticated on the LAN.
    const out = buildCustomServerConfig({
      ...baseInput,
      deploymentMode: "local_trusted",
      exposure: "public",
      host: "127.0.0.1",
    });
    expect(out.server.exposure).toBe("private");
  });

  it("authenticated+public sets auth.baseUrlMode=explicit and stores publicBaseUrl", () => {
    const out = buildCustomServerConfig({
      ...baseInput,
      deploymentMode: "authenticated",
      exposure: "public",
      host: "0.0.0.0",
      publicBaseUrl: "https://staple.example.com",
    });
    expect(out.auth.baseUrlMode).toBe("explicit");
    expect(out.auth.publicBaseUrl).toBe("https://staple.example.com");
  });

  it("authenticated+private leaves auth.baseUrlMode=auto", () => {
    const out = buildCustomServerConfig({
      ...baseInput,
      deploymentMode: "authenticated",
      exposure: "private",
      host: "0.0.0.0",
    });
    expect(out.auth.baseUrlMode).toBe("auto");
  });
});

describe("resolveQuickstartServerConfig", () => {
  beforeEach(() => {
    delete process.env.STAPLE_TAILNET_BIND_HOST;
  });

  it("explicit bind=loopback short-circuits to preset (ignores host/mode/exposure)", () => {
    // Pin: an explicit preset bind MUST win over conflicting host or
    // deploymentMode hints -- otherwise the wizard picker becomes
    // advisory rather than authoritative.
    const out = resolveQuickstartServerConfig({
      ...baseInput,
      bind: "loopback",
      host: "10.1.2.3",
      deploymentMode: "authenticated",
      exposure: "public",
    });
    expect(out.server.bind).toBe("loopback");
    expect(out.server.host).toBe("127.0.0.1");
    expect(out.server.deploymentMode).toBe("local_trusted");
  });

  it("explicit bind=lan -> lan preset", () => {
    const out = resolveQuickstartServerConfig({ ...baseInput, bind: "lan" });
    expect(out.server.bind).toBe("lan");
    expect(out.server.host).toBe("0.0.0.0");
    expect(out.server.deploymentMode).toBe("authenticated");
  });

  it("bind=custom routes through buildCustomServerConfig with provided host", () => {
    const out = resolveQuickstartServerConfig({
      ...baseInput,
      bind: "custom",
      host: "staple.lan",
      deploymentMode: "authenticated",
      exposure: "private",
    });
    expect(out.server.bind).toBe("custom");
    expect(out.server.customBindHost).toBe("staple.lan");
  });

  it("bind=custom with empty host falls back to loopback", () => {
    // Pin: rather than persist an empty host, custom bind without
    // input falls back to 127.0.0.1 (re-classified to loopback).
    const out = resolveQuickstartServerConfig({
      ...baseInput,
      bind: "custom",
      host: "",
    });
    expect(out.server.host).toBe("127.0.0.1");
    expect(out.server.bind).toBe("loopback");
  });

  it("trimmed host present routes through custom builder (no preset short-circuit)", () => {
    const out = resolveQuickstartServerConfig({
      ...baseInput,
      bind: null,
      host: "   10.1.2.3   ",
      deploymentMode: "authenticated",
      exposure: "private",
    });
    expect(out.server.bind).toBe("custom");
    expect(out.server.host).toBe("10.1.2.3");
  });

  it("host with no deploymentMode infers local_trusted from loopback", () => {
    // Pin: a typed loopback host with NO deploymentMode hint MUST
    // resolve to local_trusted, mirroring the inferConfiguredBind path.
    const out = resolveQuickstartServerConfig({
      ...baseInput,
      bind: null,
      host: "127.0.0.1",
    });
    expect(out.server.deploymentMode).toBe("local_trusted");
  });

  it("authenticated+public+no host -> 0.0.0.0 + explicit baseUrl", () => {
    const out = resolveQuickstartServerConfig({
      ...baseInput,
      bind: null,
      host: null,
      deploymentMode: "authenticated",
      exposure: "public",
      publicBaseUrl: "https://staple.example.com",
    });
    expect(out.server.host).toBe("0.0.0.0");
    expect(out.server.bind).toBe("lan");
    expect(out.auth.baseUrlMode).toBe("explicit");
    expect(out.auth.publicBaseUrl).toBe("https://staple.example.com");
  });

  it("authenticated+private+no host -> lan preset", () => {
    const out = resolveQuickstartServerConfig({
      ...baseInput,
      bind: null,
      host: null,
      deploymentMode: "authenticated",
      exposure: "private",
    });
    expect(out.server.bind).toBe("lan");
    expect(out.server.deploymentMode).toBe("authenticated");
  });

  it("nothing supplied -> loopback preset (safest default)", () => {
    // Pin: empty input MUST default to local_trusted on loopback --
    // this is the new-install golden path.
    const out = resolveQuickstartServerConfig({
      ...baseInput,
      bind: null,
      host: null,
      deploymentMode: null,
      exposure: null,
    });
    expect(out.server.bind).toBe("loopback");
    expect(out.server.deploymentMode).toBe("local_trusted");
  });
});
