// Contract tests for cli/src/checks/database-check.ts.
//
// Three drift surfaces:
//   (a) postgres mode without a connection string MUST fail (not pass
//       with default). Drift to pass would let stapleai try to boot
//       against a non-existent DB and crash mid-startup.
//   (b) embedded-postgres mode MUST self-repair the data dir. Drift
//       loses the first-run UX.
//   (c) An unknown mode value MUST fail with the offending mode in
//       the message. Drift to pass on unrecognized mode would hide
//       schema regressions.
//
// The actual PostgreSQL roundtrip path (await createDb -> SELECT 1)
// is NOT exercised here -- it requires mocking the dynamic import of
// "@stapleai/db" and the test would assert little beyond what the
// driver tests already cover. Pinning the deterministic branches is
// the higher-value contract.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { databaseCheck } from "../checks/database-check.js";

type Config = {
  database: {
    mode: "postgres" | "embedded-postgres" | string;
    connectionString?: string;
    embeddedPostgresDataDir: string;
    embeddedPostgresPort: number;
  };
};

function postgres(connectionString?: string): Config {
  return {
    database: {
      mode: "postgres",
      connectionString,
      embeddedPostgresDataDir: "/tmp/unused",
      embeddedPostgresPort: 54329,
    },
  };
}

function embedded(dataDir: string, port = 54329): Config {
  return {
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: dataDir,
      embeddedPostgresPort: port,
    },
  };
}

describe("databaseCheck", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "staple-db-check-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("postgres mode", () => {
    it("returns fail when connectionString is missing", async () => {
      const result = await databaseCheck(postgres() as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("connection string");
      expect(result.canRepair).toBe(false);
      expect(result.repairHint).toContain("configure");
    });

    it("returns fail when connectionString is empty string", async () => {
      // Pin: empty string is treated as missing. Drift to truthy-only
      // check would pass against "" then fail at db connect.
      const result = await databaseCheck(postgres("") as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("connection string");
    });
  });

  describe("embedded-postgres mode", () => {
    it("creates the data dir when missing then returns pass", async () => {
      // Pin: missing dataDir auto-created (mkdir recursive). First-run
      // users would otherwise see a fail for a path stapleai can make.
      const dataDir = path.join(tmpRoot, "deep", "nested", "db");
      expect(fs.existsSync(dataDir)).toBe(false);
      const result = await databaseCheck(embedded(dataDir) as never);
      expect(fs.existsSync(dataDir)).toBe(true);
      expect(result.status).toBe("pass");
      expect(result.message).toContain(dataDir);
    });

    it("includes the configured port in the pass message", async () => {
      // Pin: operators rely on the port appearing in the message to
      // pick up custom-port deployments. Drift to omit would silently
      // mask a non-default port.
      const dataDir = path.join(tmpRoot, "db");
      fs.mkdirSync(dataDir, { recursive: true });
      const result = await databaseCheck(embedded(dataDir, 55555) as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain("55555");
    });

    it("threads configPath through resolveRuntimeLikePath", async () => {
      const configDir = path.join(tmpRoot, "workspace", "cfg");
      fs.mkdirSync(configDir, { recursive: true });
      const expected = path.join(configDir, "db");
      fs.mkdirSync(expected, { recursive: true });

      const result = await databaseCheck(
        embedded("db") as never,
        path.join(configDir, "staple.json"),
      );

      expect(result.status).toBe("pass");
      expect(result.message).toContain(expected);
    });
  });

  describe("unknown mode", () => {
    it("returns fail with the offending mode in the message", async () => {
      // Pin: unrecognized mode MUST fail loudly (with the offending
      // value visible) rather than silently pass. Drift would hide
      // schema migrations that introduced new modes.
      const cfg: Config = {
        database: {
          mode: "redis",
          embeddedPostgresDataDir: "/tmp/unused",
          embeddedPostgresPort: 54329,
        },
      };
      const result = await databaseCheck(cfg as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("redis");
      expect(result.canRepair).toBe(false);
      expect(result.repairHint).toContain("configure");
    });
  });
});
