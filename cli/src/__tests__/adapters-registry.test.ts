// Contract tests for cli/src/adapters/registry.ts.
//
// The CLI dispatches to a per-adapter `formatStdoutEvent` based on the
// adapter `type` string carried in stream events. The type-string set is
// CONSUMER-FACING (server emits these strings; CLI keys off them); a
// drift in any literal silently breaks live-streaming output.
//
// The fallback semantics (`?? processCLIAdapter`) are the SAFETY NET --
// an unknown type does NOT throw, it falls back to the generic process
// adapter. A regression that throws would crash the CLI on the first
// event from a newer server emitting a type the CLI doesn't know yet.
//
// Pinned:
//   * Every documented adapter type resolves to a module with a
//     `formatStdoutEvent` function (not undefined, not the fallback).
//   * `cursor` is the EXACT string for the cursor adapter (NOT
//     "cursor_local") -- this is the only adapter without the _local
//     suffix and would drift to "cursor_local" on a thoughtless rename.
//   * Unknown type returns the process adapter (fallback semantics).
//   * The registry is a 1:1 type->module map (no shadowing on duplicate).
import { describe, expect, it } from "vitest";
import { getCLIAdapter } from "../adapters/registry.js";
import { processCLIAdapter } from "../adapters/process/index.js";
import { httpCLIAdapter } from "../adapters/http/index.js";

describe("getCLIAdapter", () => {
  // Pin: server emits these adapter type strings; CLI must resolve each
  // to a real module with a formatStdoutEvent function. A typo in the
  // server's emitted type silently regresses to the fallback (process)
  // and operators see plain JSON instead of pretty event formatting.
  const expectedTypes = [
    "claude_local",
    "codex_local",
    "opencode_local",
    "pi_local",
    "cursor", // intentional: NO _local suffix
    "gemini_local",
    "openclaw_gateway",
    "process",
    "http",
  ];

  for (const type of expectedTypes) {
    it(`resolves "${type}" to a real adapter with formatStdoutEvent`, () => {
      const adapter = getCLIAdapter(type);
      expect(adapter).toBeDefined();
      expect(adapter.type).toBe(type);
      expect(typeof adapter.formatStdoutEvent).toBe("function");
    });
  }

  it("resolves cursor as exactly 'cursor' (NOT 'cursor_local')", () => {
    // Pin: cursor is the only adapter WITHOUT a _local suffix.
    // A drift to "cursor_local" silently breaks every cursor session.
    const cursorAdapter = getCLIAdapter("cursor");
    expect(cursorAdapter.type).toBe("cursor");
    // And the would-be drift name MUST NOT resolve to cursor:
    const wouldBeDrift = getCLIAdapter("cursor_local");
    expect(wouldBeDrift).toBe(processCLIAdapter); // falls back, not cursor
  });

  it("falls back to processCLIAdapter for an unknown type (no throw)", () => {
    // Pin: unknown type MUST return the process adapter, NOT throw and
    // NOT return undefined. A regression that throws would crash the
    // CLI on first event from a server that emits a newer adapter type.
    expect(() => getCLIAdapter("totally-unknown-12345")).not.toThrow();
    const fallback = getCLIAdapter("totally-unknown-12345");
    expect(fallback).toBe(processCLIAdapter);
  });

  it("returns the SAME module instance on repeated lookups (registry is stable)", () => {
    // Pin: lookups must be idempotent -- adapter modules are shared
    // singletons. A regression that constructed a new adapter per
    // lookup would break event-handler identity comparisons.
    const a = getCLIAdapter("claude_local");
    const b = getCLIAdapter("claude_local");
    expect(a).toBe(b);
  });

  it("process adapter is the documented fallback target (identity check)", () => {
    // Pin: the fallback target IS processCLIAdapter (imported above
    // from the same module the registry uses). A drift to a NEW
    // fallback would silently change behavior for unknown types.
    const fallback = getCLIAdapter("xyz-missing");
    expect(fallback).toBe(processCLIAdapter);
    // Sanity: process adapter is itself reachable by its own type.
    expect(getCLIAdapter("process")).toBe(processCLIAdapter);
  });

  it("http adapter is registered and distinct from process", () => {
    // Pin: http and process are SEPARATE adapters (transport
    // distinction); a registry collapse to a single shared adapter
    // would silently route http events through process formatter.
    const http = getCLIAdapter("http");
    expect(http).toBe(httpCLIAdapter);
    expect(http).not.toBe(processCLIAdapter);
  });
});
