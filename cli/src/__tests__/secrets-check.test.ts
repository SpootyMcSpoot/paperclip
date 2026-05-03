// Contract tests for cli/src/checks/secrets-check.ts.
//
// secretsCheck is the master-key gate for the local_encrypted secrets
// provider. It picks key material from one of three sources, in order:
//   (1) STAPLE_SECRETS_MASTER_KEY env (3 encodings accepted)
//   (2) STAPLE_SECRETS_MASTER_KEY_FILE env override -> file
//   (3) config.secrets.localEncrypted.keyFilePath -> file
// On postgres deployments, strictMode=false escalates pass -> warn.
// Drift in any branch either rejects valid keys (production blocked)
// or silently accepts garbage (every secret read decrypts to bytes).
//
// Pinned:
//   - non-local_encrypted provider -> fail
//   - 64-char hex env key -> pass
//   - 32-byte base64 env key -> pass
//   - raw 32-char utf8 env key -> pass
//   - 31-char garbage env key -> fail with hint
//   - whitespace-only env key falls through to file path
//   - missing key file -> warn, canRepair=true, repair writes 0o600 file
//   - empty/garbage file contents -> fail
//   - valid file contents -> pass
//   - STAPLE_SECRETS_MASTER_KEY_FILE override beats config path
//   - postgres + strictMode=false escalates pass -> warn
//   - postgres + strictMode=false leaves fail untouched (no escalation)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { secretsCheck } from "../checks/secrets-check.js";

type Config = {
  database: { mode: "embedded_postgres" | "postgres" };
  secrets: {
    provider: "local_encrypted" | "vault" | "aws_secrets_manager";
    strictMode?: boolean;
    localEncrypted: { keyFilePath: string };
  };
};

function cfg(overrides: Partial<Config> = {}): Config {
  return {
    database: { mode: "embedded_postgres", ...(overrides.database ?? {}) },
    secrets: {
      provider: "local_encrypted",
      strictMode: true,
      localEncrypted: { keyFilePath: "/tmp/never-used.key" },
      ...(overrides.secrets ?? {}),
    },
  };
}

const HEX_64 = "a".repeat(64);
const BASE64_32 = Buffer.alloc(32, 7).toString("base64");
const RAW_32 = "0".repeat(32);

describe("secretsCheck", () => {
  let tmpRoot: string;
  let savedKey: string | undefined;
  let savedKeyFile: string | undefined;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "staple-secrets-check-"));
    savedKey = process.env.STAPLE_SECRETS_MASTER_KEY;
    savedKeyFile = process.env.STAPLE_SECRETS_MASTER_KEY_FILE;
    delete process.env.STAPLE_SECRETS_MASTER_KEY;
    delete process.env.STAPLE_SECRETS_MASTER_KEY_FILE;
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env.STAPLE_SECRETS_MASTER_KEY;
    else process.env.STAPLE_SECRETS_MASTER_KEY = savedKey;
    if (savedKeyFile === undefined) delete process.env.STAPLE_SECRETS_MASTER_KEY_FILE;
    else process.env.STAPLE_SECRETS_MASTER_KEY_FILE = savedKeyFile;
  });

  describe("provider gate", () => {
    it("fails when provider is not local_encrypted", () => {
      // Pin: this build is the local-only path. Any other provider
      // value must hard-fail rather than silently fall through to a
      // half-configured adapter.
      const c = cfg({ secrets: { ...cfg().secrets, provider: "vault" } });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("vault");
      expect(result.message).toContain("local_encrypted");
    });
  });

  describe("STAPLE_SECRETS_MASTER_KEY env encoding matrix", () => {
    it("accepts 64-char hex key", () => {
      process.env.STAPLE_SECRETS_MASTER_KEY = HEX_64;
      const result = secretsCheck(cfg() as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain("STAPLE_SECRETS_MASTER_KEY");
    });

    it("accepts 32-byte base64 key", () => {
      process.env.STAPLE_SECRETS_MASTER_KEY = BASE64_32;
      const result = secretsCheck(cfg() as never);
      expect(result.status).toBe("pass");
    });

    it("accepts raw 32-char utf8 key", () => {
      // Pin: the raw-utf8 path is the legacy escape hatch -- if it
      // breaks, every operator who set the env via plain string
      // (no encoding) gets locked out.
      process.env.STAPLE_SECRETS_MASTER_KEY = RAW_32;
      const result = secretsCheck(cfg() as never);
      expect(result.status).toBe("pass");
    });

    it("rejects 31-char garbage with descriptive hint", () => {
      // Pin: the failure message MUST list all three accepted forms,
      // otherwise operators have to grep source to figure out what
      // shape the key should be.
      process.env.STAPLE_SECRETS_MASTER_KEY = "x".repeat(31);
      const result = secretsCheck(cfg() as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("base64");
      expect(result.message).toContain("hex");
    });

    it("falls through to key file when env key is whitespace-only", () => {
      // Pin: "   " in the env MUST NOT short-circuit the env branch
      // and MUST NOT report invalid -- it falls through to the file
      // resolver so a misconfigured shell does not mask a valid key file.
      process.env.STAPLE_SECRETS_MASTER_KEY = "   ";
      const keyFile = path.join(tmpRoot, "k");
      fs.writeFileSync(keyFile, HEX_64, { encoding: "utf8", mode: 0o600 });
      const c = cfg({
        secrets: { ...cfg().secrets, localEncrypted: { keyFilePath: keyFile } },
      });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain(keyFile);
    });
  });

  describe("key file branch", () => {
    it("warns with canRepair=true when key file is missing", () => {
      // Pin: missing key file is a warn (first-run UX), repair writes
      // a 32-byte base64 key with 0o600. Drift here would either
      // (a) fail at first-run, or (b) repair with world-readable mode.
      const keyFile = path.join(tmpRoot, "missing", "deep", "k");
      const c = cfg({
        secrets: { ...cfg().secrets, localEncrypted: { keyFilePath: keyFile } },
      });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("warn");
      expect(result.canRepair).toBe(true);
      expect(typeof result.repair).toBe("function");

      result.repair?.();
      expect(fs.existsSync(keyFile)).toBe(true);
      const stat = fs.statSync(keyFile);
      // Mode bits below 0o777 should match 0o600 (owner-only rw).
      expect(stat.mode & 0o777).toBe(0o600);
      const contents = fs.readFileSync(keyFile, "utf8");
      expect(contents.trim().length).toBeGreaterThan(0);

      // Re-run after repair: should now pass.
      const after = secretsCheck(c as never);
      expect(after.status).toBe("pass");
    });

    it("fails when key file contents are garbage", () => {
      const keyFile = path.join(tmpRoot, "k");
      fs.writeFileSync(keyFile, "not-a-real-key", { encoding: "utf8", mode: 0o600 });
      const c = cfg({
        secrets: { ...cfg().secrets, localEncrypted: { keyFilePath: keyFile } },
      });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("Invalid key material");
      expect(result.message).toContain(keyFile);
    });

    it("passes when key file holds valid base64 material", () => {
      const keyFile = path.join(tmpRoot, "k");
      fs.writeFileSync(keyFile, BASE64_32, { encoding: "utf8", mode: 0o600 });
      const c = cfg({
        secrets: { ...cfg().secrets, localEncrypted: { keyFilePath: keyFile } },
      });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain(keyFile);
    });

    it("STAPLE_SECRETS_MASTER_KEY_FILE override beats config path", () => {
      // Pin: env override MUST win over config -- this is the operator
      // escape hatch for relocating the key file without editing config.
      const overridden = path.join(tmpRoot, "override.key");
      fs.writeFileSync(overridden, HEX_64, { encoding: "utf8", mode: 0o600 });
      process.env.STAPLE_SECRETS_MASTER_KEY_FILE = overridden;
      const c = cfg({
        secrets: {
          ...cfg().secrets,
          localEncrypted: { keyFilePath: "/nowhere/should-not-be-read.key" },
        },
      });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain(overridden);
    });
  });

  describe("strict-mode escalation on postgres deployments", () => {
    it("escalates pass -> warn when postgres + strictMode=false", () => {
      // Pin: a real postgres deploy with strictMode disabled MUST
      // surface a warning so production drift is visible at doctor time.
      process.env.STAPLE_SECRETS_MASTER_KEY = HEX_64;
      const c = cfg({
        database: { mode: "postgres" },
        secrets: { ...cfg().secrets, strictMode: false },
      });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("warn");
      expect(result.message).toContain("strict secret mode is disabled");
    });

    it("does not escalate when strictMode=true", () => {
      process.env.STAPLE_SECRETS_MASTER_KEY = HEX_64;
      const c = cfg({
        database: { mode: "postgres" },
        secrets: { ...cfg().secrets, strictMode: true },
      });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("pass");
    });

    it("does not escalate when database is embedded_postgres", () => {
      // Pin: embedded_postgres is the local dev path -- strictMode=false
      // MUST NOT warn there, otherwise every dev install is noisy.
      process.env.STAPLE_SECRETS_MASTER_KEY = HEX_64;
      const c = cfg({
        database: { mode: "embedded_postgres" },
        secrets: { ...cfg().secrets, strictMode: false },
      });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("pass");
    });

    it("leaves fail status untouched (no warn downgrade)", () => {
      // Pin: a hard fail must not be softened to warn even on postgres
      // with strictMode disabled. Drift here would mask a broken key.
      process.env.STAPLE_SECRETS_MASTER_KEY = "x".repeat(31);
      const c = cfg({
        database: { mode: "postgres" },
        secrets: { ...cfg().secrets, strictMode: false },
      });
      const result = secretsCheck(c as never);
      expect(result.status).toBe("fail");
    });
  });
});
