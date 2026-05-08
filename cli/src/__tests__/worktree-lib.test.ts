// Contract tests for cli/src/commands/worktree-lib.ts.
//
// worktree-lib is the path/config translator for `staple worktree`. It
// is shared between the worktree-create and worktree-merge commands and
// produces the on-disk layout and shell-export contract the operator's
// shell relies on. Drift in any of these breaks the worktree workflow:
//   (a) seed-plan: minimal-mode MUST exclude the runtime-state tables
//       that bloat clones; drift to "include them" tanks new-worktree
//       startup time.
//   (b) loopback rewrite: only loopback URLs get port-swapped. Drift to
//       "rewrite all" sends staging traffic at a random local port.
//   (c) shell-export: empty values MUST be filtered or the shell line
//       silently nukes the var.
//
// Pinned:
//   - isWorktreeSeedMode true for "minimal"/"full", false otherwise
//   - resolveWorktreeSeedPlan("full") yields empty exclusions+nullify
//   - resolveWorktreeSeedPlan("minimal") yields canonical exclude list
//     including activity_log + heartbeat_runs (state tables)
//   - sanitizeWorktreeInstanceId trims, lowercases, collapses runs of
//     non-alnum, falls back to "worktree" on empty after normalization
//   - resolveSuggestedWorktreeName: explicit wins, else cwd basename
//   - generateWorktreeColor returns 7-char #RRGGBB hex
//   - resolveWorktreeLocalPaths threads instanceId into per-instance
//     paths and lays out backup/log/storage under data/
//   - rewriteLocalUrlPort: rewrites 127.0.0.1/localhost/[::1], passes
//     through public hostnames, returns input on parse failure
//   - buildWorktreeEnvEntries omits absent branding keys
//   - formatShellExports drops blank values + uses POSIX-quote escape

import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKTREE_HOME,
  buildWorktreeEnvEntries,
  formatShellExports,
  generateWorktreeColor,
  isWorktreeSeedMode,
  resolveSuggestedWorktreeName,
  resolveWorktreeLocalPaths,
  resolveWorktreeSeedPlan,
  rewriteLocalUrlPort,
  sanitizeWorktreeInstanceId,
} from "../commands/worktree-lib.js";

describe("worktree seed plan", () => {
  it("type-guards the canonical mode set", () => {
    expect(isWorktreeSeedMode("minimal")).toBe(true);
    expect(isWorktreeSeedMode("full")).toBe(true);
    expect(isWorktreeSeedMode("FULL")).toBe(false);
    expect(isWorktreeSeedMode("partial")).toBe(false);
    expect(isWorktreeSeedMode("")).toBe(false);
  });

  it("full mode yields empty exclusions + nullify", () => {
    const plan = resolveWorktreeSeedPlan("full");
    expect(plan.mode).toBe("full");
    expect(plan.excludedTables).toEqual([]);
    expect(plan.nullifyColumns).toEqual({});
  });

  it("minimal mode excludes runtime-state tables", () => {
    // Pin: state tables (activity_log, heartbeat_runs, etc.) MUST be
    // dropped from the minimal seed. Drift to "keep them" copies hot
    // operational state into every new worktree.
    const plan = resolveWorktreeSeedPlan("minimal");
    expect(plan.mode).toBe("minimal");
    expect(plan.excludedTables).toContain("activity_log");
    expect(plan.excludedTables).toContain("heartbeat_runs");
    expect(plan.excludedTables).toContain("agent_runtime_state");
    expect(plan.excludedTables).toContain("workspace_runtime_services");
    expect(plan.nullifyColumns.issues).toEqual(["checkout_run_id", "execution_run_id"]);
  });

  it("minimal mode returns a fresh copy each call (no shared mutation)", () => {
    // Pin: each caller MUST receive an isolated snapshot. Otherwise a
    // caller mutating the array (e.g. seeder removing a table) breaks
    // every subsequent worktree.
    const a = resolveWorktreeSeedPlan("minimal");
    const b = resolveWorktreeSeedPlan("minimal");
    a.excludedTables.push("polluted");
    expect(b.excludedTables).not.toContain("polluted");
    a.nullifyColumns.issues.push("polluted");
    expect(b.nullifyColumns.issues).not.toContain("polluted");
  });
});

describe("sanitizeWorktreeInstanceId", () => {
  it("trims, lowercases, and collapses non-alnum runs", () => {
    expect(sanitizeWorktreeInstanceId("  Foo Bar Baz  ")).toBe("foo-bar-baz");
    expect(sanitizeWorktreeInstanceId("a..b__c--d!!e")).toBe("a-b__c-d-e");
  });

  it("falls back to 'worktree' when normalization empties the string", () => {
    // Pin: pure-symbol input MUST still produce a usable instance id,
    // not throw. Drift to "" would collide with the empty-id branch in
    // path resolution.
    expect(sanitizeWorktreeInstanceId("")).toBe("worktree");
    expect(sanitizeWorktreeInstanceId("!!!")).toBe("worktree");
    expect(sanitizeWorktreeInstanceId("---")).toBe("worktree");
  });
});

describe("resolveSuggestedWorktreeName", () => {
  it("explicit name beats cwd basename", () => {
    expect(resolveSuggestedWorktreeName("/repos/foo", "explicit-name")).toBe("explicit-name");
  });

  it("falls back to cwd basename when explicit is missing/blank", () => {
    expect(resolveSuggestedWorktreeName("/repos/my-project")).toBe("my-project");
    expect(resolveSuggestedWorktreeName("/repos/my-project", "")).toBe("my-project");
    expect(resolveSuggestedWorktreeName("/repos/my-project", "   ")).toBe("my-project");
  });
});

describe("generateWorktreeColor", () => {
  it("returns a 7-character #RRGGBB hex string", () => {
    // Pin: UI relies on the #RRGGBB shape for CSS injection. Drift to
    // hsl()/rgb()/short-hex breaks every chip in the worktree picker.
    for (let i = 0; i < 16; i += 1) {
      const c = generateWorktreeColor();
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("resolveWorktreeLocalPaths", () => {
  it("lays out per-instance dirs under data/ and uses absolute paths", () => {
    const paths = resolveWorktreeLocalPaths({
      cwd: "/repos/proj",
      homeDir: "/home/op/.staple-worktrees",
      instanceId: "my-instance",
    });
    expect(paths.instanceRoot).toBe("/home/op/.staple-worktrees/instances/my-instance");
    expect(paths.embeddedPostgresDataDir).toBe(
      "/home/op/.staple-worktrees/instances/my-instance/db",
    );
    expect(paths.backupDir).toBe(
      "/home/op/.staple-worktrees/instances/my-instance/data/backups",
    );
    expect(paths.storageDir).toBe(
      "/home/op/.staple-worktrees/instances/my-instance/data/storage",
    );
    expect(paths.logDir).toBe("/home/op/.staple-worktrees/instances/my-instance/logs");
    expect(paths.secretsKeyFilePath).toBe(
      "/home/op/.staple-worktrees/instances/my-instance/secrets/master.key",
    );
    expect(paths.repoConfigDir).toBe("/repos/proj/.staple");
    expect(paths.configPath).toBe("/repos/proj/.staple/config.json");
    expect(paths.envPath).toBe("/repos/proj/.staple/.env");
    expect(paths.contextPath).toBe("/home/op/.staple-worktrees/context.json");
  });

  it("falls back to DEFAULT_WORKTREE_HOME (~ expansion) when homeDir omitted", () => {
    // Pin: `~` MUST be expanded -- raw `~/.staple-worktrees` would
    // create a literal "~"-named directory next to cwd.
    const paths = resolveWorktreeLocalPaths({ cwd: "/repos/proj", instanceId: "id" });
    expect(paths.homeDir.startsWith("/")).toBe(true);
    expect(paths.homeDir.includes("~")).toBe(false);
    expect(paths.homeDir.endsWith(DEFAULT_WORKTREE_HOME.replace("~/", ""))).toBe(true);
  });

  it("resolves relative cwd to absolute", () => {
    const paths = resolveWorktreeLocalPaths({
      cwd: "rel/path",
      homeDir: "/home/op/.staple-worktrees",
      instanceId: "id",
    });
    expect(path.isAbsolute(paths.cwd)).toBe(true);
  });
});

describe("rewriteLocalUrlPort", () => {
  it("rewrites only loopback URLs", () => {
    expect(rewriteLocalUrlPort("http://127.0.0.1:3000/x", 4242)).toBe("http://127.0.0.1:4242/x");
    expect(rewriteLocalUrlPort("http://localhost:3000/x", 4242)).toBe("http://localhost:4242/x");
    expect(rewriteLocalUrlPort("http://[::1]:3000/x", 4242)).toBe("http://[::1]:4242/x");
  });

  it("passes through public hostnames unchanged", () => {
    // Pin: public hosts MUST stay verbatim. Drift to "rewrite all"
    // would send staging traffic at a random local port -- silent
    // env-bleed.
    const u = "https://staging.staple.example/api";
    expect(rewriteLocalUrlPort(u, 9999)).toBe(u);
  });

  it("returns the input unchanged on parse failure", () => {
    // Pin: malformed input MUST NOT throw -- the worktree config build
    // path supplies user-set strings.
    expect(rewriteLocalUrlPort("not a url", 4242)).toBe("not a url");
  });

  it("returns undefined when input is undefined", () => {
    expect(rewriteLocalUrlPort(undefined, 4242)).toBeUndefined();
  });
});

describe("buildWorktreeEnvEntries", () => {
  const paths = {
    cwd: "/cwd",
    repoConfigDir: "/cwd/.staple",
    configPath: "/cwd/.staple/config.json",
    envPath: "/cwd/.staple/.env",
    homeDir: "/home/op/.staple-worktrees",
    instanceId: "id",
    instanceRoot: "/home/op/.staple-worktrees/instances/id",
    contextPath: "/home/op/.staple-worktrees/context.json",
    embeddedPostgresDataDir: "/home/op/.staple-worktrees/instances/id/db",
    backupDir: "/home/op/.staple-worktrees/instances/id/data/backups",
    logDir: "/home/op/.staple-worktrees/instances/id/logs",
    secretsKeyFilePath: "/home/op/.staple-worktrees/instances/id/secrets/master.key",
    storageDir: "/home/op/.staple-worktrees/instances/id/data/storage",
  };

  it("emits the worktree env contract without branding when absent", () => {
    const env = buildWorktreeEnvEntries(paths);
    expect(env.STAPLE_HOME).toBe(paths.homeDir);
    expect(env.STAPLE_INSTANCE_ID).toBe("id");
    expect(env.STAPLE_CONFIG).toBe(paths.configPath);
    expect(env.STAPLE_CONTEXT).toBe(paths.contextPath);
    expect(env.STAPLE_IN_WORKTREE).toBe("true");
    expect("STAPLE_WORKTREE_NAME" in env).toBe(false);
    expect("STAPLE_WORKTREE_COLOR" in env).toBe(false);
  });

  it("includes branding when supplied", () => {
    const env = buildWorktreeEnvEntries(paths, { name: "alpha", color: "#deadbe" });
    expect(env.STAPLE_WORKTREE_NAME).toBe("alpha");
    expect(env.STAPLE_WORKTREE_COLOR).toBe("#deadbe");
  });
});

describe("formatShellExports", () => {
  it("filters blank values and quotes single-quote-safe", () => {
    // Pin: empty values MUST NOT generate `export X=` (which would
    // silently unset). Drift here breaks shell sourcing of the file.
    const out = formatShellExports({
      A: "value",
      B: "",
      C: "   ",
      D: "with 'quote' and space",
    });
    const lines = out.split("\n").sort();
    expect(lines).toContain("export A='value'");
    expect(lines.find((l) => l.startsWith("export B"))).toBeUndefined();
    expect(lines.find((l) => l.startsWith("export C"))).toBeUndefined();
    // D contains a single quote -- must be POSIX-escaped.
    expect(out).toContain("export D=");
    expect(out).toContain("with ");
    // single quote must be replaced/escaped (not appear bare in a quoted block).
    const dLine = lines.find((l) => l.startsWith("export D="))!;
    expect(dLine.startsWith("export D='")).toBe(true);
    expect(dLine.endsWith("'")).toBe(true);
  });

  it("returns empty string for all-blank input", () => {
    expect(formatShellExports({ A: "", B: "  " })).toBe("");
  });
});
