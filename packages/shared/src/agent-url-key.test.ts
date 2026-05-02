import { describe, expect, it } from "vitest";
import { deriveAgentUrlKey, isUuidLike, normalizeAgentUrlKey } from "./agent-url-key.js";

// Contract tests for agent-url-key. The agent URL key is the slug used in
// /agents/<key> routes -- a regression that lets a non-canonical form slip
// through breaks deep-links + collapses two distinct agents onto the same
// URL. Pin the normalization rules + the UUID detector exhaustively.

describe("normalizeAgentUrlKey", () => {
  it("lowercases + replaces non-alphanumeric runs with single dash", () => {
    expect(normalizeAgentUrlKey("My Agent v2")).toBe("my-agent-v2");
    expect(normalizeAgentUrlKey("FOO__BAR  baz")).toBe("foo-bar-baz");
  });

  it("trims leading and trailing dashes after normalization", () => {
    // Dashes can appear at the edge after stripping non-alphanumerics --
    // the route handler MUST NOT produce '/agents/-foo-' or '/agents/foo-'.
    expect(normalizeAgentUrlKey("---foo bar---")).toBe("foo-bar");
    expect(normalizeAgentUrlKey("!!!hello!!!")).toBe("hello");
  });

  it("returns null for non-string and pure-symbol input", () => {
    // Pure symbol inputs collapse to '' after normalization -- callers
    // rely on null (not '') to chain a fallback. A regression to ''
    // would make deriveAgentUrlKey skip its second-arg fallback.
    expect(normalizeAgentUrlKey(null)).toBeNull();
    expect(normalizeAgentUrlKey(undefined)).toBeNull();
    expect(normalizeAgentUrlKey("")).toBeNull();
    expect(normalizeAgentUrlKey("!!!")).toBeNull();
    expect(normalizeAgentUrlKey("   ")).toBeNull();
  });

  it("handles unicode by stripping non-ASCII alphanumerics", () => {
    // Regex /[^a-z0-9]+/g treats every non-ASCII char as a delimiter --
    // pinned so a future i18n PR doesn't silently change route shape
    // without an explicit migration.
    expect(normalizeAgentUrlKey("Café Robot")).toBe("caf-robot");
    expect(normalizeAgentUrlKey("机器人 alpha")).toBe("alpha");
  });
});

describe("isUuidLike", () => {
  it("accepts canonical v1-v5 UUIDs case-insensitively", () => {
    // Pinned because the same regex gates the fallback short-id branch
    // in deriveProjectUrlKey -- weakening it would let arbitrary strings
    // slip into the short-id path.
    expect(isUuidLike("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuidLike("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    expect(isUuidLike(" 550e8400-e29b-41d4-a716-446655440000 ")).toBe(true);
  });

  it("rejects malformed and non-UUID input", () => {
    expect(isUuidLike("not-a-uuid")).toBe(false);
    expect(isUuidLike("550e8400-e29b-61d4-a716-446655440000")).toBe(false); // version=6 invalid
    expect(isUuidLike("550e8400-e29b-41d4-c716-446655440000")).toBe(false); // variant=c invalid
    expect(isUuidLike("550e8400e29b41d4a716446655440000")).toBe(false); // missing dashes
    expect(isUuidLike(null)).toBe(false);
    expect(isUuidLike(undefined)).toBe(false);
  });
});

describe("deriveAgentUrlKey", () => {
  it("uses primary name when normalizable", () => {
    expect(deriveAgentUrlKey("Lookup Agent")).toBe("lookup-agent");
  });

  it("falls back to second arg when primary is empty/symbolic", () => {
    expect(deriveAgentUrlKey("!!!", "Backup Name")).toBe("backup-name");
    expect(deriveAgentUrlKey(null, "ID-1234")).toBe("id-1234");
    expect(deriveAgentUrlKey("", "Backup")).toBe("backup");
  });

  it("returns 'agent' sentinel when both inputs unnormalizable", () => {
    // Pin the literal -- callers may build URLs as `/agents/${key}` and
    // a silent change to '' would yield '/agents/' (catch-all collision).
    expect(deriveAgentUrlKey(null)).toBe("agent");
    expect(deriveAgentUrlKey("!!!", "@@@")).toBe("agent");
    expect(deriveAgentUrlKey(undefined, undefined)).toBe("agent");
  });
});
