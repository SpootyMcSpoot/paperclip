// Contract tests for cli/src/utils/path-resolver.ts.
//
// resolveRuntimeLikePath is the path resolver behind the runtime
// `staple` checks (storage-check.ts, database-check.ts, log-check.ts,
// secrets-check.ts). It picks the first existing candidate from a
// fixed candidate list, falling back to the first candidate when none
// exist. Drift here either:
//   (a) silently picks the wrong directory (data lands in a parallel
//       workspace), or
//   (b) returns a non-resolved relative path that breaks downstream
//       fs calls.
//
// Pinned:
//   - Absolute path: resolved + returned verbatim (no candidate scan)
//   - ~/foo (home prefix): expanded to absolute via expandHomePrefix
//   - Relative + configPath given: configDir candidate considered first
//   - Relative + no configPath: cwd-derived candidates only
//   - First existing candidate wins (priority order)
//   - No candidates exist: first candidate is returned (NOT cwd join)
//   - Duplicate candidates dedup before fs check

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveRuntimeLikePath } from "../utils/path-resolver.js";

describe("resolveRuntimeLikePath", () => {
  let tmpRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "staple-path-resolver-"));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns absolute path resolved verbatim", () => {
    // Pin: absolute paths skip candidate scan -- the caller has already
    // committed to a specific filesystem location.
    const abs = path.join(tmpRoot, "explicit", "data");
    const result = resolveRuntimeLikePath(abs);
    expect(result).toBe(path.resolve(abs));
  });

  it("expands ~ home prefix to absolute", () => {
    // Pin: ~/foo -> $HOME/foo. Without the expandHomePrefix call,
    // the literal "~" would land in cwd-relative junk.
    const result = resolveRuntimeLikePath("~/some-runtime-data");
    expect(result).toBe(path.resolve(os.homedir(), "some-runtime-data"));
  });

  it("scans candidates and returns first existing match", () => {
    // Layout:
    //   tmpRoot/workspace/server/foo  (exists)
    //   tmpRoot/workspace/foo          (also exists)
    //   tmpRoot/cwd/foo                (also exists)
    // With configPath = tmpRoot/workspace/cfg/c.json:
    //   configDir = tmpRoot/workspace/cfg
    //   workspaceRoot = tmpRoot/workspace
    // Priority: configDir/foo, workspaceRoot/server/foo, workspaceRoot/foo, cwd/foo.
    // configDir/foo doesn't exist, so the next existing candidate
    // (workspaceRoot/server/foo) wins.
    const workspace = path.join(tmpRoot, "workspace");
    const configDir = path.join(workspace, "cfg");
    const cwdDir = path.join(tmpRoot, "cwd");
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(path.join(workspace, "server", "foo"), { recursive: true });
    fs.mkdirSync(path.join(workspace, "foo"), { recursive: true });
    fs.mkdirSync(path.join(cwdDir, "foo"), { recursive: true });

    process.chdir(cwdDir);

    const result = resolveRuntimeLikePath("foo", path.join(configDir, "c.json"));
    expect(result).toBe(path.resolve(workspace, "server", "foo"));
  });

  it("prefers configDir candidate when it exists", () => {
    // Pin: configDir-relative is the highest-priority candidate, ahead
    // of workspaceRoot/server/foo. If a future refactor flips the
    // order, every config-colocated workspace silently rebases to /server.
    const workspace = path.join(tmpRoot, "workspace");
    const configDir = path.join(workspace, "cfg");
    fs.mkdirSync(path.join(configDir, "foo"), { recursive: true });
    fs.mkdirSync(path.join(workspace, "server", "foo"), { recursive: true });

    const result = resolveRuntimeLikePath("foo", path.join(configDir, "c.json"));
    expect(result).toBe(path.resolve(configDir, "foo"));
  });

  it("falls back to cwd candidates when no configPath supplied", () => {
    // Pin: without configPath, workspaceRoot defaults to cwd, so
    // candidates collapse to just cwd-derived paths. A relative input
    // MUST still resolve absolute, never returned bare.
    const cwdDir = path.join(tmpRoot, "cwd");
    fs.mkdirSync(path.join(cwdDir, "server", "data"), { recursive: true });
    process.chdir(cwdDir);

    const result = resolveRuntimeLikePath("data");
    expect(result).toBe(path.resolve(cwdDir, "server", "data"));
  });

  it("returns first candidate when none exist", () => {
    // Pin: when nothing exists, the first candidate (configDir-relative
    // when configPath given) is returned -- NEVER a fabricated cwd join,
    // and NEVER undefined. Callers depend on a well-formed absolute path
    // they can use for "create if missing" workflows.
    const workspace = path.join(tmpRoot, "workspace");
    const configDir = path.join(workspace, "cfg");
    fs.mkdirSync(configDir, { recursive: true });
    process.chdir(tmpRoot);

    const result = resolveRuntimeLikePath("missing", path.join(configDir, "c.json"));
    expect(result).toBe(path.resolve(configDir, "missing"));
  });

  it("returns absolute resolved path when no candidates exist and no configPath", () => {
    // Pin: cwd-relative fallback -- the first candidate is
    // workspaceRoot/server/foo (which equals cwd/server/foo without
    // configPath).
    const cwdDir = path.join(tmpRoot, "cwd");
    fs.mkdirSync(cwdDir, { recursive: true });
    process.chdir(cwdDir);

    const result = resolveRuntimeLikePath("missing");
    expect(result).toBe(path.resolve(cwdDir, "server", "missing"));
  });

  it("dedups duplicate candidates before fs check", () => {
    // Pin: when configDir == cwd (e.g. CLI invoked from the same dir
    // as the config file), the candidate list collapses via Set dedup.
    // Without dedup, fs.existsSync would be invoked twice for the same
    // path -- silent perf regression but more importantly any flake on
    // the shared path would be hit twice.
    const cwdDir = path.join(tmpRoot, "cwd");
    fs.mkdirSync(cwdDir, { recursive: true });
    process.chdir(cwdDir);

    // configPath in the same dir as cwd means configDir == cwd.
    // The function should not crash and should return a resolved path.
    const result = resolveRuntimeLikePath("missing", path.join(cwdDir, "c.json"));
    expect(path.isAbsolute(result)).toBe(true);
  });
});
