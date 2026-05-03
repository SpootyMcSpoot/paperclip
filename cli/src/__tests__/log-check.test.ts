// Contract tests for cli/src/checks/log-check.ts.
//
// logCheck is a self-repairing check: it creates the log directory
// when missing, then probes write access. Two failure modes drift
// silently:
//   (a) log lines disappear because the resolver picked a parallel
//       path that the runtime never opens, or
//   (b) the check passes against a stale path even when the actual
//       runtime path is read-only.
//
// Pinned:
//   - Existing writable dir -> pass with logDir in message
//   - Missing dir created via mkdirSync recursive -> pass
//   - Read-only dir -> fail with repair hint, canRepair=false
//   - Result is keyed off resolveRuntimeLikePath(logDir, configPath)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { logCheck } from "../checks/log-check.js";

type LoggingShape = { logging: { mode: "file" | "cloud"; logDir: string } };

function makeConfig(logDir: string): LoggingShape {
  return { logging: { mode: "file", logDir } };
}

describe("logCheck", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "staple-log-check-"));
  });

  afterEach(() => {
    try {
      fs.chmodSync(tmpRoot, 0o755);
    } catch {
      // already writable
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns pass when log directory exists and is writable", () => {
    const logDir = path.join(tmpRoot, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const result = logCheck(makeConfig(logDir) as never);
    expect(result.status).toBe("pass");
    expect(result.name).toBe("Log directory");
    expect(result.message).toContain(logDir);
  });

  it("creates the log directory when missing then returns pass", () => {
    // Pin: missing directory MUST be auto-created (mkdir recursive),
    // not raise. The CLI relies on this so first-run users do not
    // hit a missing-dir failure for a path that the runtime can
    // safely create.
    const logDir = path.join(tmpRoot, "nested", "logs", "leaf");
    expect(fs.existsSync(logDir)).toBe(false);
    const result = logCheck(makeConfig(logDir) as never);
    expect(fs.existsSync(logDir)).toBe(true);
    expect(result.status).toBe("pass");
  });

  it("returns fail with repair hint when directory is not writable", () => {
    // Pin: read-only existing dir -> fail w/ canRepair=false because
    // the CLI cannot fix permissions safely. Drift here would either
    // (a) silently pass via permissive umask, or
    // (b) flip canRepair=true and trigger a destructive repair attempt.
    if (process.getuid && process.getuid() === 0) {
      // root bypasses W_OK; skip rather than emit a false pass
      return;
    }
    const logDir = path.join(tmpRoot, "ro-logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.chmodSync(logDir, 0o555);
    try {
      const result = logCheck(makeConfig(logDir) as never);
      expect(result.status).toBe("fail");
      expect(result.canRepair).toBe(false);
      expect(result.repairHint).toContain("permissions");
      expect(result.message).toContain(logDir);
    } finally {
      fs.chmodSync(logDir, 0o755);
    }
  });

  it("resolves logDir relative to configPath via resolveRuntimeLikePath", () => {
    // Pin: when configPath is supplied, the resolver considers the
    // configDir as a candidate root for relative logDir. This is the
    // contract path-resolver tests already pin from below; this test
    // confirms log-check actually threads configPath through and does
    // not silently fall back to cwd.
    const configDir = path.join(tmpRoot, "workspace", "cfg");
    fs.mkdirSync(configDir, { recursive: true });
    const expected = path.join(configDir, "logs");
    fs.mkdirSync(expected, { recursive: true });

    const result = logCheck(
      makeConfig("logs") as never,
      path.join(configDir, "staple.json"),
    );

    expect(result.status).toBe("pass");
    expect(result.message).toContain(expected);
  });

  it("absolute logDir bypasses candidate scan", () => {
    // Pin: absolute paths skip the resolver's candidate priority list
    // and land verbatim. Drift here would relocate logs to a parallel
    // candidate root and silently lose writes.
    const logDir = path.join(tmpRoot, "absolute-logs");
    fs.mkdirSync(logDir, { recursive: true });
    const result = logCheck(makeConfig(logDir) as never, "/elsewhere/cfg.json");
    expect(result.status).toBe("pass");
    expect(result.message).toContain(logDir);
  });
});
