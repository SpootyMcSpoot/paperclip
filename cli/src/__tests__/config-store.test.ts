// Contract tests for cli/src/config/store.ts.
//
// store.ts is the only sanctioned read/write path for ~/.staple/.../
// config.json. Drift breaks two critical contracts:
//   (a) the legacy pglite -> embedded-postgres migration -- if it stops
//       firing, every install that predates the rename fails to load
//       with a schema error, and the user has no upgrade path.
//   (b) the 0o600 mode on the on-disk config + .backup -- the secrets
//       master-key path may be encoded inside config-adjacent files,
//       so a wider mode would expose key material to other users.
//
// Pinned:
//   - resolveConfigPath: override path wins
//   - resolveConfigPath: STAPLE_CONFIG env wins over default
//   - resolveConfigPath: ancestor walk finds .staple/config.json
//   - resolveConfigPath: falls back to default home path when nothing exists
//   - readConfig: returns null when file is missing (not throw)
//   - readConfig: throws with file path when JSON is malformed
//   - readConfig: applies pglite -> embedded-postgres migration before validation
//   - readConfig: throws when validation fails (formatted issues)
//   - writeConfig: creates parent dir recursively
//   - writeConfig: backs up existing file as .backup with mode 0o600
//   - writeConfig: writes new file with mode 0o600
//   - configExists: matches presence/absence of resolved path

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { stapleConfigSchema, type StapleConfig } from "../config/schema.js";
import {
  configExists,
  readConfig,
  resolveConfigPath,
  writeConfig,
} from "../config/store.js";

function defaultValidConfig(): StapleConfig {
  return stapleConfigSchema.parse({});
}

describe("config/store", () => {
  let tmpRoot: string;
  let saved: { home?: string; cfg?: string; instance?: string; cwd: string };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "staple-config-store-"));
    saved = {
      home: process.env.STAPLE_HOME,
      cfg: process.env.STAPLE_CONFIG,
      instance: process.env.STAPLE_INSTANCE_ID,
      cwd: process.cwd(),
    };
    // Pin every test under tmpRoot so we never read or write the real
    // ~/.staple. Clear STAPLE_CONFIG by default; tests that need it set
    // it explicitly.
    process.env.STAPLE_HOME = path.join(tmpRoot, ".staple");
    delete process.env.STAPLE_CONFIG;
    delete process.env.STAPLE_INSTANCE_ID;
  });

  afterEach(() => {
    process.chdir(saved.cwd);
    if (saved.home === undefined) delete process.env.STAPLE_HOME;
    else process.env.STAPLE_HOME = saved.home;
    if (saved.cfg === undefined) delete process.env.STAPLE_CONFIG;
    else process.env.STAPLE_CONFIG = saved.cfg;
    if (saved.instance === undefined) delete process.env.STAPLE_INSTANCE_ID;
    else process.env.STAPLE_INSTANCE_ID = saved.instance;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("resolveConfigPath", () => {
    it("returns absolute resolved override path verbatim", () => {
      const explicit = path.join(tmpRoot, "elsewhere", "cfg.json");
      expect(resolveConfigPath(explicit)).toBe(path.resolve(explicit));
    });

    it("falls back to STAPLE_CONFIG env when no override given", () => {
      // Pin: env var beats home-default fallback. Operators rely on this
      // to redirect doctor/configure at a non-home install.
      const envPath = path.join(tmpRoot, "via-env", "cfg.json");
      process.env.STAPLE_CONFIG = envPath;
      expect(resolveConfigPath()).toBe(path.resolve(envPath));
    });

    it("scans ancestors for .staple/config.json before falling back to default", () => {
      // Pin: walking up from cwd MUST find a project-local .staple/
      // config.json. Drift would silently load the home-default
      // instance for users who structure their work in a project.
      const projectDir = path.join(tmpRoot, "proj", "deep", "nested");
      fs.mkdirSync(projectDir, { recursive: true });
      const projectCfgDir = path.join(tmpRoot, "proj", ".staple");
      fs.mkdirSync(projectCfgDir, { recursive: true });
      const projectCfg = path.join(projectCfgDir, "config.json");
      fs.writeFileSync(projectCfg, JSON.stringify(defaultValidConfig(), null, 2));

      process.chdir(projectDir);
      expect(resolveConfigPath()).toBe(path.resolve(projectCfg));
    });

    it("falls back to STAPLE_HOME default when no ancestor cfg found", () => {
      const cwdDir = path.join(tmpRoot, "fresh-cwd");
      fs.mkdirSync(cwdDir, { recursive: true });
      process.chdir(cwdDir);

      const result = resolveConfigPath();
      // STAPLE_HOME points at tmpRoot/.staple in beforeEach.
      expect(result).toContain(path.join(tmpRoot, ".staple"));
      expect(result.endsWith("config.json")).toBe(true);
    });
  });

  describe("readConfig", () => {
    it("returns null when the resolved file does not exist", () => {
      // Pin: no-config is NOT an error. The CLI uses null to drive
      // the "first-run, run configure" flow.
      const cwdDir = path.join(tmpRoot, "empty-cwd");
      fs.mkdirSync(cwdDir, { recursive: true });
      process.chdir(cwdDir);
      expect(readConfig()).toBeNull();
    });

    it("returns parsed config for a valid file", () => {
      const cfgPath = path.join(tmpRoot, "valid", "config.json");
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(defaultValidConfig(), null, 2));
      const result = readConfig(cfgPath);
      expect(result).not.toBeNull();
      expect(result?.server?.port).toBeDefined();
    });

    it("throws with file path when JSON is malformed", () => {
      const cfgPath = path.join(tmpRoot, "bad", "config.json");
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, "{ not valid json");
      expect(() => readConfig(cfgPath)).toThrow(/Failed to parse JSON at/);
      expect(() => readConfig(cfgPath)).toThrow(new RegExp(cfgPath.replace(/\\/g, "\\\\")));
    });

    it("throws with formatted issues when schema validation fails", () => {
      const cfgPath = path.join(tmpRoot, "schema-bad", "config.json");
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      // server.port out of range -- forces a schema error.
      const bad = { ...defaultValidConfig(), server: { ...defaultValidConfig().server, port: 0 } };
      fs.writeFileSync(cfgPath, JSON.stringify(bad));
      expect(() => readConfig(cfgPath)).toThrow(/Invalid config at/);
    });

    it("migrates legacy database.mode 'pglite' to 'embedded-postgres'", () => {
      // Pin: legacy pglite installs MUST upgrade transparently. Drift
      // here would break every existing install at first read.
      const cfgPath = path.join(tmpRoot, "legacy", "config.json");
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      const legacy = {
        ...defaultValidConfig(),
        database: {
          ...defaultValidConfig().database,
          mode: "pglite",
          pgliteDataDir: "/tmp/pglite-data",
          pglitePort: 55555,
        },
      };
      fs.writeFileSync(cfgPath, JSON.stringify(legacy));

      const result = readConfig(cfgPath);
      expect(result?.database.mode).toBe("embedded-postgres");
      expect(result?.database.embeddedPostgresDataDir).toBe("/tmp/pglite-data");
      expect(result?.database.embeddedPostgresPort).toBe(55555);
    });

    it("does not clobber embeddedPostgresDataDir when already set during migration", () => {
      // Pin: if a config was partially migrated (mode=pglite but
      // embeddedPostgresDataDir already set), preserve the new field.
      const cfgPath = path.join(tmpRoot, "partial-legacy", "config.json");
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      const legacy = {
        ...defaultValidConfig(),
        database: {
          ...defaultValidConfig().database,
          mode: "pglite",
          embeddedPostgresDataDir: "/already/set",
          pgliteDataDir: "/old/should/lose",
        },
      };
      fs.writeFileSync(cfgPath, JSON.stringify(legacy));

      const result = readConfig(cfgPath);
      expect(result?.database.embeddedPostgresDataDir).toBe("/already/set");
    });
  });

  describe("writeConfig", () => {
    it("creates parent directory recursively when missing", () => {
      const cfgPath = path.join(tmpRoot, "deep", "nested", "config.json");
      expect(fs.existsSync(path.dirname(cfgPath))).toBe(false);
      writeConfig(defaultValidConfig(), cfgPath);
      expect(fs.existsSync(cfgPath)).toBe(true);
    });

    it("writes file with mode 0o600", () => {
      // Pin: config may contain references to encrypted-secret key
      // file paths and other operationally-sensitive fields. Mode
      // wider than 0o600 leaks to other local users.
      if (process.platform === "win32") return; // POSIX-only contract
      const cfgPath = path.join(tmpRoot, "mode-check", "config.json");
      writeConfig(defaultValidConfig(), cfgPath);
      const stat = fs.statSync(cfgPath);
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it("backs up existing config to .backup with mode 0o600 before overwriting", () => {
      // Pin: writeConfig MUST atomically (modulo OS limits) preserve
      // the prior config as <path>.backup so a misconfiguration is
      // recoverable. Drift to "no backup" makes configure idempotency
      // a one-way door.
      if (process.platform === "win32") return;
      const cfgPath = path.join(tmpRoot, "with-backup", "config.json");
      writeConfig(defaultValidConfig(), cfgPath);
      const original = fs.readFileSync(cfgPath, "utf8");

      const updated = defaultValidConfig();
      updated.server.port = 4242;
      writeConfig(updated, cfgPath);

      const backupPath = cfgPath + ".backup";
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.readFileSync(backupPath, "utf8")).toBe(original);
      const stat = fs.statSync(backupPath);
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it("does not create .backup when overwriting a missing file", () => {
      const cfgPath = path.join(tmpRoot, "first-write", "config.json");
      writeConfig(defaultValidConfig(), cfgPath);
      expect(fs.existsSync(cfgPath + ".backup")).toBe(false);
    });
  });

  describe("configExists", () => {
    it("returns true when resolved file exists", () => {
      const cfgPath = path.join(tmpRoot, "exists", "config.json");
      writeConfig(defaultValidConfig(), cfgPath);
      expect(configExists(cfgPath)).toBe(true);
    });

    it("returns false when resolved file is missing", () => {
      const cfgPath = path.join(tmpRoot, "missing", "config.json");
      expect(configExists(cfgPath)).toBe(false);
    });
  });
});
