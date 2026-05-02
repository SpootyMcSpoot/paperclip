// Contract tests for cli/src/config/secrets-key.ts.
//
// `ensureLocalSecretsKeyFile` is the bootstrap that materializes the
// 32-byte master key for the LOCAL_ENCRYPTED secrets backend. It runs on
// every CLI startup and ITS BEHAVIOR IS LOAD-BEARING:
//
//   * Wrong file mode (0o644 instead of 0o600) silently leaks the
//     master key to every other user on the host -- they could decrypt
//     every secret in `.staple/secrets/`.
//
//   * Overwriting an existing key file rotates the encryption key on
//     every startup, irreversibly bricking access to every previously
//     stored secret.
//
//   * Missing the env-var precedence (`STAPLE_SECRETS_MASTER_KEY` set in
//     the environment) would write a stale file the next CLI invocation
//     would prefer over the user's intent.
//
//   * Triggering write-key for a non-`local_encrypted` provider (e.g.
//     vault) would generate keys that are never used and litter the
//     filesystem with high-value plaintext at every startup.
//
// The discriminated-union return shape is the contract the caller uses
// to decide what to log/print -- a drift to "ok" / null / boolean would
// silently break the operator-facing breadcrumb.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureLocalSecretsKeyFile } from "../config/secrets-key.js";

const ORIGINAL_ENV = { ...process.env };

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "staple-secrets-key-test-"));
}

function makeConfig(overrides: {
  provider: "local_encrypted" | "vault" | "env";
  keyFilePath: string;
}) {
  return {
    secrets: {
      provider: overrides.provider,
      localEncrypted: { keyFilePath: overrides.keyFilePath },
    },
    // deliberately UNTYPED -- the real schema has many more fields,
    // but Pick<StapleConfig, "secrets"> only reads .secrets
  } as Parameters<typeof ensureLocalSecretsKeyFile>[0];
}

describe("ensureLocalSecretsKeyFile", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.STAPLE_SECRETS_MASTER_KEY;
    delete process.env.STAPLE_SECRETS_MASTER_KEY_FILE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns skipped_provider when provider is not local_encrypted", () => {
    // Pin: non-local-encrypted providers (vault, env) MUST NOT trigger a
    // key-file write. A drift would scatter unused 32-byte keys across
    // every filesystem and silently widen the secret blast radius.
    const tmp = makeTmpDir();
    const result = ensureLocalSecretsKeyFile(
      makeConfig({ provider: "vault", keyFilePath: path.join(tmp, "k") }),
    );
    expect(result.status).toBe("skipped_provider");
    expect(result.path).toBeNull();
    expect(fs.existsSync(path.join(tmp, "k"))).toBe(false);
  });

  it("returns skipped_env when STAPLE_SECRETS_MASTER_KEY is set", () => {
    // Pin: env-var beats file. A drift that wrote the file anyway would
    // mask the operator's intent on the next CLI run (file would be
    // preferred when env var unset).
    const tmp = makeTmpDir();
    process.env.STAPLE_SECRETS_MASTER_KEY = "in-env-master-key";
    const result = ensureLocalSecretsKeyFile(
      makeConfig({
        provider: "local_encrypted",
        keyFilePath: path.join(tmp, "k"),
      }),
    );
    expect(result.status).toBe("skipped_env");
    expect(result.path).toBeNull();
    expect(fs.existsSync(path.join(tmp, "k"))).toBe(false);
  });

  it("ignores empty/whitespace STAPLE_SECRETS_MASTER_KEY and writes file", () => {
    // Pin: empty-string env var is treated as unset. A drift to "if
    // process.env.X" (truthy-only) would already work, but `.trim()` is
    // load-bearing -- a file injecting "   " into the env should NOT
    // suppress the bootstrap.
    const tmp = makeTmpDir();
    process.env.STAPLE_SECRETS_MASTER_KEY = "   ";
    const result = ensureLocalSecretsKeyFile(
      makeConfig({
        provider: "local_encrypted",
        keyFilePath: path.join(tmp, "k"),
      }),
    );
    expect(result.status).toBe("created");
  });

  it("returns existing without rewriting when file already present", () => {
    // Pin: NEVER rotate the key on startup. A drift to overwrite would
    // brick decryption of every previously stored secret -- catastrophic
    // and silent (the symptom is "secrets stopped decrypting" with no
    // log line indicating why).
    const tmp = makeTmpDir();
    const keyPath = path.join(tmp, "k");
    fs.writeFileSync(keyPath, "preexisting-content");
    const result = ensureLocalSecretsKeyFile(
      makeConfig({ provider: "local_encrypted", keyFilePath: keyPath }),
    );
    expect(result.status).toBe("existing");
    expect(result.path).toBe(keyPath);
    expect(fs.readFileSync(keyPath, "utf8")).toBe("preexisting-content");
  });

  it("creates a new key file with mode 0o600", () => {
    // Pin: the file mode MUST be 0o600. A drift to 0o644 would let any
    // local user read the master key and decrypt every stored secret.
    const tmp = makeTmpDir();
    const keyPath = path.join(tmp, "nested", "k");
    const result = ensureLocalSecretsKeyFile(
      makeConfig({ provider: "local_encrypted", keyFilePath: keyPath }),
    );
    expect(result.status).toBe("created");
    expect(result.path).toBe(keyPath);
    expect(fs.existsSync(keyPath)).toBe(true);
    const mode = fs.statSync(keyPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("creates a key whose base64 decodes to 32 bytes", () => {
    // Pin: 32-byte (256-bit) symmetric key for AES-GCM. A drift to
    // 16/24 bytes would silently weaken the cipher to AES-128 or fail
    // to instantiate the cipher entirely.
    const tmp = makeTmpDir();
    const keyPath = path.join(tmp, "k");
    ensureLocalSecretsKeyFile(
      makeConfig({ provider: "local_encrypted", keyFilePath: keyPath }),
    );
    const b64 = fs.readFileSync(keyPath, "utf8");
    const decoded = Buffer.from(b64, "base64");
    expect(decoded.length).toBe(32);
  });

  it("STAPLE_SECRETS_MASTER_KEY_FILE override redirects the write target", () => {
    // Pin: env override wins over config. A drift to read only the
    // config field would silently ignore the operator's path override
    // -- they'd find the keyfile in the wrong location after CLI run.
    const tmp = makeTmpDir();
    const overridePath = path.join(tmp, "override-key");
    const configPath = path.join(tmp, "config-key");
    process.env.STAPLE_SECRETS_MASTER_KEY_FILE = overridePath;
    const result = ensureLocalSecretsKeyFile(
      makeConfig({
        provider: "local_encrypted",
        keyFilePath: configPath,
      }),
    );
    expect(result.status).toBe("created");
    expect(result.path).toBe(overridePath);
    expect(fs.existsSync(overridePath)).toBe(true);
    expect(fs.existsSync(configPath)).toBe(false);
  });
});
