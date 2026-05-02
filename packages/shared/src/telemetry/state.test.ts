import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOrCreateState } from "./state.js";

describe("loadOrCreateState", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "telemetry-state-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a fresh state file when directory has no state.json", () => {
    const stateDir = path.join(dir, "telemetry");
    expect(existsSync(stateDir)).toBe(false);

    const state = loadOrCreateState(stateDir, "1.2.3");

    expect(state.installId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(state.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(state.firstSeenVersion).toBe("1.2.3");
    expect(typeof state.createdAt).toBe("string");
    expect(Number.isFinite(Date.parse(state.createdAt))).toBe(true);
    expect(existsSync(path.join(stateDir, "state.json"))).toBe(true);
  });

  it("creates the state directory recursively when it does not exist", () => {
    const nested = path.join(dir, "deep", "nested", "telemetry");
    loadOrCreateState(nested, "1.0.0");
    expect(existsSync(path.join(nested, "state.json"))).toBe(true);
  });

  it("persists JSON that is itself parseable and matches the returned state", () => {
    const stateDir = path.join(dir, "telemetry");
    const state = loadOrCreateState(stateDir, "9.9.9");

    const raw = readFileSync(path.join(stateDir, "state.json"), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(state);
  });

  it("reuses an existing valid state file (idempotent across calls)", () => {
    const stateDir = path.join(dir, "telemetry");
    const first = loadOrCreateState(stateDir, "1.0.0");
    const second = loadOrCreateState(stateDir, "9.9.9");
    expect(second.installId).toBe(first.installId);
    expect(second.salt).toBe(first.salt);
    expect(second.firstSeenVersion).toBe(first.firstSeenVersion);
  });

  it("regenerates state when the file is malformed JSON", () => {
    const stateDir = path.join(dir, "telemetry");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(path.join(stateDir, "state.json"), "{not valid json", "utf-8");

    const state = loadOrCreateState(stateDir, "2.0.0");
    expect(state.installId).toBeTruthy();
    expect(state.salt).toBeTruthy();
    expect(state.firstSeenVersion).toBe("2.0.0");
  });

  it("regenerates state when JSON is missing installId", () => {
    const stateDir = path.join(dir, "telemetry");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      path.join(stateDir, "state.json"),
      JSON.stringify({ salt: "abc", createdAt: "now", firstSeenVersion: "x" }),
      "utf-8",
    );

    const state = loadOrCreateState(stateDir, "3.0.0");
    expect(state.installId).toMatch(/-/);
    expect(state.firstSeenVersion).toBe("3.0.0");
  });

  it("regenerates state when JSON is missing salt", () => {
    const stateDir = path.join(dir, "telemetry");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      path.join(stateDir, "state.json"),
      JSON.stringify({ installId: "abc", createdAt: "now", firstSeenVersion: "x" }),
      "utf-8",
    );

    const state = loadOrCreateState(stateDir, "3.0.0");
    expect(state.salt).toMatch(/^[0-9a-f]+$/);
    expect(state.firstSeenVersion).toBe("3.0.0");
  });

  it("each fresh install has a unique installId and salt", () => {
    const a = loadOrCreateState(path.join(dir, "a"), "1.0.0");
    const b = loadOrCreateState(path.join(dir, "b"), "1.0.0");
    expect(a.installId).not.toBe(b.installId);
    expect(a.salt).not.toBe(b.salt);
  });
});
