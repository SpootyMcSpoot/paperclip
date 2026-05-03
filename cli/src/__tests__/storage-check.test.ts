// Contract tests for cli/src/checks/storage-check.ts.
//
// storageCheck branches on provider. Two silent-drift surfaces:
//   (a) local_disk: same self-repair pattern as log-check -- if it
//       drops the W_OK probe, doctor would pass against an actually
//       read-only baseDir, then write paths blow up at runtime.
//   (b) s3: doctor explicitly does NOT reach out, but it MUST still
//       reject empty bucket/region. A regression that lets an empty
//       bucket through would silently succeed and only fail when the
//       runtime tries to upload.
//
// Pinned:
//   - local_disk + writable baseDir -> pass
//   - local_disk + missing baseDir -> auto-create (recursive mkdir)
//   - local_disk + read-only baseDir -> fail w/ canRepair=false + repair hint
//   - s3 + empty bucket -> fail w/ "non-empty bucket and region"
//   - s3 + empty region -> fail w/ "non-empty bucket and region"
//   - s3 + bucket whitespace-only -> rejected (trim before length check)
//   - s3 + populated bucket+region -> warn (no reachability probe)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { storageCheck } from "../checks/storage-check.js";

type Config = {
  storage: {
    provider: "local_disk" | "s3";
    localDisk: { baseDir: string };
    s3: {
      bucket: string;
      region: string;
      endpoint?: string;
      prefix: string;
      forcePathStyle: boolean;
    };
  };
};

function localDisk(baseDir: string): Config {
  return {
    storage: {
      provider: "local_disk",
      localDisk: { baseDir },
      s3: { bucket: "staple", region: "us-east-1", prefix: "", forcePathStyle: false },
    },
  };
}

function s3(bucket: string, region: string): Config {
  return {
    storage: {
      provider: "s3",
      localDisk: { baseDir: "/unused" },
      s3: { bucket, region, prefix: "", forcePathStyle: false },
    },
  };
}

describe("storageCheck", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "staple-storage-check-"));
  });

  afterEach(() => {
    try {
      fs.chmodSync(tmpRoot, 0o755);
    } catch {
      // already writable
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("local_disk", () => {
    it("returns pass when baseDir exists and is writable", () => {
      const baseDir = path.join(tmpRoot, "store");
      fs.mkdirSync(baseDir, { recursive: true });
      const result = storageCheck(localDisk(baseDir) as never);
      expect(result.status).toBe("pass");
      expect(result.name).toBe("Storage");
      expect(result.message).toContain(baseDir);
    });

    it("creates baseDir when missing", () => {
      // Pin: doctor MUST self-repair missing baseDir (mkdir recursive).
      // First-run users would otherwise hit a fail for a path the
      // CLI can safely make.
      const baseDir = path.join(tmpRoot, "deep", "nested", "store");
      expect(fs.existsSync(baseDir)).toBe(false);
      const result = storageCheck(localDisk(baseDir) as never);
      expect(fs.existsSync(baseDir)).toBe(true);
      expect(result.status).toBe("pass");
    });

    it("returns fail with repair hint when baseDir is read-only", () => {
      // Pin: read-only baseDir -> fail w/ canRepair=false. Drift would
      // either flip canRepair=true (destructive auto-chmod) or pass
      // silently (lost W_OK probe).
      if (process.getuid && process.getuid() === 0) {
        return;
      }
      const baseDir = path.join(tmpRoot, "ro-store");
      fs.mkdirSync(baseDir, { recursive: true });
      fs.chmodSync(baseDir, 0o555);
      try {
        const result = storageCheck(localDisk(baseDir) as never);
        expect(result.status).toBe("fail");
        expect(result.canRepair).toBe(false);
        expect(result.repairHint).toContain("storage.localDisk.baseDir");
        expect(result.message).toContain(baseDir);
      } finally {
        fs.chmodSync(baseDir, 0o755);
      }
    });

    it("threads configPath into the resolver for relative baseDir", () => {
      // Pin: relative baseDir resolves against configDir, not cwd.
      const configDir = path.join(tmpRoot, "workspace", "cfg");
      fs.mkdirSync(configDir, { recursive: true });
      const expected = path.join(configDir, "store");
      fs.mkdirSync(expected, { recursive: true });

      const result = storageCheck(
        localDisk("store") as never,
        path.join(configDir, "staple.json"),
      );

      expect(result.status).toBe("pass");
      expect(result.message).toContain(expected);
    });
  });

  describe("s3", () => {
    it("fails when bucket is empty", () => {
      const result = storageCheck(s3("", "us-east-1") as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("non-empty bucket and region");
      expect(result.canRepair).toBe(false);
      expect(result.repairHint).toContain("configure");
    });

    it("fails when region is empty", () => {
      const result = storageCheck(s3("staple", "") as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("non-empty bucket and region");
    });

    it("fails when bucket is whitespace-only (trim then length check)", () => {
      // Pin: whitespace MUST not satisfy the non-empty contract.
      // Drift here would let "   " through and the runtime would
      // build a malformed S3 URI.
      const result = storageCheck(s3("   ", "us-east-1") as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("non-empty bucket and region");
    });

    it("fails when region is whitespace-only", () => {
      const result = storageCheck(s3("staple", "   ") as never);
      expect(result.status).toBe("fail");
      expect(result.message).toContain("non-empty bucket and region");
    });

    it("returns warn (no reachability probe) when bucket+region populated", () => {
      // Pin: doctor MUST NOT reach out to S3. A regression that turned
      // this into an actual API call would slow doctor and add a hard
      // dependency on egress that local-trusted deployments can not
      // satisfy.
      const result = storageCheck(s3("my-bucket", "us-west-2") as never);
      expect(result.status).toBe("warn");
      expect(result.message).toContain("my-bucket");
      expect(result.message).toContain("us-west-2");
      expect(result.message).toContain("Reachability check is skipped");
      expect(result.canRepair).toBe(false);
    });
  });
});
