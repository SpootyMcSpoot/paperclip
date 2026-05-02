import { describe, expect, it } from "vitest";
import {
  deriveProjectUrlKey,
  hasNonAsciiContent,
  normalizeProjectUrlKey,
} from "./project-url-key.js";

// Contract tests for project-url-key. Drives /projects/<key> routing.
// Diverges from agent-url-key on ONE critical behavior: when input has
// non-ASCII content, the slug gets a UUID short-id suffix to disambiguate
// (otherwise "机器人 alpha" + "ボット alpha" would collide on '/projects/alpha').

describe("normalizeProjectUrlKey", () => {
  it("matches the agent-url-key normalization shape", () => {
    expect(normalizeProjectUrlKey("My Project")).toBe("my-project");
    expect(normalizeProjectUrlKey("---foo---")).toBe("foo");
    expect(normalizeProjectUrlKey("!!!")).toBeNull();
    expect(normalizeProjectUrlKey(null)).toBeNull();
  });
});

describe("hasNonAsciiContent", () => {
  it("returns true for any non-ASCII codepoint", () => {
    // Used to gate the short-id suffix in deriveProjectUrlKey -- if this
    // returns false on non-ASCII, the suffix is skipped and slugs collide.
    expect(hasNonAsciiContent("Café")).toBe(true);
    expect(hasNonAsciiContent("机器人")).toBe(true);
    expect(hasNonAsciiContent("emoji \u{1F60A}")).toBe(true);
  });

  it("returns false for plain ASCII and non-strings", () => {
    expect(hasNonAsciiContent("plain ascii 123 -")).toBe(false);
    expect(hasNonAsciiContent("")).toBe(false);
    expect(hasNonAsciiContent(null)).toBe(false);
    expect(hasNonAsciiContent(undefined)).toBe(false);
  });
});

describe("deriveProjectUrlKey", () => {
  const UUID = "550e8400-e29b-41d4-a716-446655440000";
  const SHORT = "550e8400";

  it("returns plain slug when ASCII normalizable", () => {
    expect(deriveProjectUrlKey("Hello World")).toBe("hello-world");
  });

  it("appends short-id when name has non-ASCII content (collision guard)", () => {
    // "Café Project" normalizes to "caf-project" -- but so would "Caft
    // Project". Without the suffix the user couldn't distinguish them.
    expect(deriveProjectUrlKey("Café Project", UUID)).toBe(`caf-project-${SHORT}`);
  });

  it("uses short-id alone when non-ASCII strips ALL alphanumerics", () => {
    // "机器人" has no ASCII alnums -- normalize returns null -- fall
    // through to short-id-only branch.
    expect(deriveProjectUrlKey("机器人", UUID)).toBe(SHORT);
  });

  it("falls back to fallback string when no UUID", () => {
    expect(deriveProjectUrlKey(null, "BackupName")).toBe("backupname");
    expect(deriveProjectUrlKey("!!!", "Real Name")).toBe("real-name");
  });

  it("returns 'project' sentinel when nothing normalizable", () => {
    // Same rationale as agent-url-key -- prevents '/projects/' collision.
    expect(deriveProjectUrlKey(null)).toBe("project");
    expect(deriveProjectUrlKey("!!!", "@@@")).toBe("project");
  });

  it("ignores non-UUID fallback for short-id branch", () => {
    // If fallback isn't a real UUID, shortIdFromUuid returns null --
    // a non-ASCII name with non-UUID fallback should NOT silently produce
    // a slug that looks UUID-prefixed.
    expect(deriveProjectUrlKey("Café", "not-a-uuid")).toBe("caf");
  });
});
