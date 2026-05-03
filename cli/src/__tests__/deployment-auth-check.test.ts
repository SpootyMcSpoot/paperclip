// Contract tests for cli/src/checks/deployment-auth-check.ts.
//
// deploymentAuthCheck encodes the security posture rules between
// {deploymentMode, exposure, bind, auth.baseUrlMode, publicBaseUrl}.
// Each branch is a load-bearing security gate -- drift here would
// either:
//   (a) let local_trusted bind to a non-loopback interface (LAN
//       exposure for an "untrusted" deployment), or
//   (b) let authenticated mode boot without a session secret (every
//       cookie vulnerable), or
//   (c) let public exposure use plain http auth URL (session theft).
//
// Pinned:
//   - local_trusted + non-loopback bind -> fail (with bind in message)
//   - local_trusted + loopback bind -> pass
//   - authenticated/proxy_auth without secret env -> fail
//   - BETTER_AUTH_SECRET satisfies the secret gate
//   - STAPLE_AGENT_JWT_SECRET fallback satisfies the gate
//   - Whitespace-only secret rejected (trim before truthy)
//   - explicit baseUrlMode + missing publicBaseUrl -> fail
//   - public exposure + non-explicit baseUrlMode -> fail
//   - public exposure + http URL -> warn (cookie-theft guard)
//   - public exposure + invalid URL -> fail
//   - public exposure + https URL -> pass
//   - private + authenticated + secret + auto baseUrl -> pass
//   - inferBindModeFromHost is consulted when bind is absent

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deploymentAuthCheck } from "../checks/deployment-auth-check.js";

type Config = {
  server: {
    deploymentMode: "local_trusted" | "authenticated" | "proxy_auth";
    exposure: "private" | "public";
    bind?: "loopback" | "lan" | "tailnet" | "custom";
    host: string;
  };
  auth: {
    baseUrlMode: "auto" | "explicit";
    publicBaseUrl?: string;
  };
};

function cfg(overrides: Partial<Config["server"]> & { auth?: Partial<Config["auth"]> }): Config {
  const { auth = {}, ...server } = overrides;
  return {
    server: {
      deploymentMode: "local_trusted",
      exposure: "private",
      bind: "loopback",
      host: "127.0.0.1",
      ...server,
    },
    auth: {
      baseUrlMode: "auto",
      ...auth,
    },
  };
}

describe("deploymentAuthCheck", () => {
  let savedSecret: string | undefined;
  let savedJwtSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.BETTER_AUTH_SECRET;
    savedJwtSecret = process.env.STAPLE_AGENT_JWT_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.STAPLE_AGENT_JWT_SECRET;
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = savedSecret;
    if (savedJwtSecret === undefined) delete process.env.STAPLE_AGENT_JWT_SECRET;
    else process.env.STAPLE_AGENT_JWT_SECRET = savedJwtSecret;
  });

  describe("local_trusted mode", () => {
    it("passes with loopback bind", () => {
      const result = deploymentAuthCheck(cfg({ bind: "loopback" }) as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain("loopback");
    });

    it("fails when bind is lan (LAN exposure for untrusted deployment)", () => {
      // Pin: local_trusted MUST be loopback. Drift to allow lan would
      // expose the "no auth" stack on the LAN.
      const result = deploymentAuthCheck(cfg({ bind: "lan" }) as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("loopback");
      expect(result.message).toContain("lan");
    });

    it("fails when bind is tailnet", () => {
      const result = deploymentAuthCheck(cfg({ bind: "tailnet" }) as never);
      expect(result.status).toBe("fail");
    });

    it("infers loopback from 127.0.0.1 when bind is unset", () => {
      // Pin: when bind is absent, inferBindModeFromHost must produce
      // "loopback" for 127.0.0.1. Without that fallback, every default
      // local_trusted install would fail doctor.
      const c = cfg({}) as Config;
      c.server.bind = undefined;
      c.server.host = "127.0.0.1";
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("pass");
    });
  });

  describe("authenticated mode -- secret gate", () => {
    it("fails when neither auth secret env var is set", () => {
      const c = cfg({
        deploymentMode: "authenticated",
        bind: "lan",
        auth: { baseUrlMode: "auto" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("BETTER_AUTH_SECRET");
    });

    it("passes when BETTER_AUTH_SECRET is set", () => {
      process.env.BETTER_AUTH_SECRET = "secret-value";
      const c = cfg({
        deploymentMode: "authenticated",
        bind: "lan",
        auth: { baseUrlMode: "auto" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("pass");
    });

    it("falls back to STAPLE_AGENT_JWT_SECRET", () => {
      // Pin: legacy env name must still satisfy the gate. A regression
      // here would force every existing install to migrate at once.
      process.env.STAPLE_AGENT_JWT_SECRET = "legacy-secret";
      const c = cfg({
        deploymentMode: "authenticated",
        bind: "lan",
        auth: { baseUrlMode: "auto" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("pass");
    });

    it("rejects whitespace-only secret (trim before truthy)", () => {
      // Pin: "   " MUST NOT satisfy the gate.
      process.env.BETTER_AUTH_SECRET = "   ";
      const c = cfg({
        deploymentMode: "authenticated",
        bind: "lan",
        auth: { baseUrlMode: "auto" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("BETTER_AUTH_SECRET");
    });
  });

  describe("explicit baseUrlMode + publicBaseUrl gating", () => {
    beforeEach(() => {
      process.env.BETTER_AUTH_SECRET = "ok";
    });

    it("fails when baseUrlMode=explicit and publicBaseUrl is missing", () => {
      const c = cfg({
        deploymentMode: "authenticated",
        bind: "lan",
        auth: { baseUrlMode: "explicit" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("publicBaseUrl");
    });

    it("passes private/authenticated/auto baseUrlMode after secret gate", () => {
      const c = cfg({
        deploymentMode: "authenticated",
        bind: "lan",
        auth: { baseUrlMode: "auto" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain("authenticated/private");
      expect(result.message).toContain("auto");
    });
  });

  describe("public exposure -- TLS + URL gates", () => {
    beforeEach(() => {
      process.env.BETTER_AUTH_SECRET = "ok";
    });

    it("fails when public + auto baseUrlMode (must be explicit)", () => {
      const c = cfg({
        deploymentMode: "authenticated",
        exposure: "public",
        bind: "lan",
        auth: { baseUrlMode: "auto" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("explicit");
    });

    it("warns when public + http (cookie-theft guard)", () => {
      // Pin: http URL on public exposure is warn, not fail. Operators
      // intentionally use http during local TLS-termination setup.
      // BUT it MUST emit a signal so production never lands here.
      const c = cfg({
        deploymentMode: "authenticated",
        exposure: "public",
        bind: "lan",
        auth: { baseUrlMode: "explicit", publicBaseUrl: "http://staple.example.com" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("warn");
      expect(result.message).toContain("https");
    });

    it("fails when publicBaseUrl is not a valid URL", () => {
      const c = cfg({
        deploymentMode: "authenticated",
        exposure: "public",
        bind: "lan",
        auth: { baseUrlMode: "explicit", publicBaseUrl: "not a url" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("valid URL");
    });

    it("passes when public + explicit + https", () => {
      const c = cfg({
        deploymentMode: "authenticated",
        exposure: "public",
        bind: "lan",
        auth: { baseUrlMode: "explicit", publicBaseUrl: "https://staple.example.com" },
      });
      const result = deploymentAuthCheck(c as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain("public");
    });
  });
});
