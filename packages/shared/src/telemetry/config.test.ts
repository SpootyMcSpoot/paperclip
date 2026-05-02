import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveTelemetryConfig } from "./config.js";

const TRACKED_ENV_KEYS = [
  "STAPLE_TELEMETRY_DISABLED",
  "DO_NOT_TRACK",
  "CI",
  "CONTINUOUS_INTEGRATION",
  "BUILD_NUMBER",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "STAPLE_TELEMETRY_ENDPOINT",
] as const;

describe("resolveTelemetryConfig", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of TRACKED_ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of TRACKED_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("returns enabled=true with no endpoint when nothing is set", () => {
    expect(resolveTelemetryConfig()).toEqual({ enabled: true, endpoint: undefined });
  });

  it("disables when STAPLE_TELEMETRY_DISABLED=1", () => {
    process.env.STAPLE_TELEMETRY_DISABLED = "1";
    expect(resolveTelemetryConfig()).toEqual({ enabled: false });
  });

  it("disables when DO_NOT_TRACK=1", () => {
    process.env.DO_NOT_TRACK = "1";
    expect(resolveTelemetryConfig()).toEqual({ enabled: false });
  });

  it.each(["CI", "CONTINUOUS_INTEGRATION", "BUILD_NUMBER", "GITHUB_ACTIONS", "GITLAB_CI"])(
    "disables when %s=true",
    (key) => {
      process.env[key] = "true";
      expect(resolveTelemetryConfig()).toEqual({ enabled: false });
    },
  );

  it.each(["CI", "CONTINUOUS_INTEGRATION", "BUILD_NUMBER", "GITHUB_ACTIONS", "GITLAB_CI"])(
    'also accepts "1" as truthy for %s',
    (key) => {
      process.env[key] = "1";
      expect(resolveTelemetryConfig()).toEqual({ enabled: false });
    },
  );

  it("does NOT treat arbitrary values as CI (e.g. CI=false stays enabled)", () => {
    process.env.CI = "false";
    expect(resolveTelemetryConfig()).toEqual({ enabled: true, endpoint: undefined });
  });

  it("disables when fileConfig.enabled === false", () => {
    expect(resolveTelemetryConfig({ enabled: false })).toEqual({ enabled: false });
  });

  it("ignores fileConfig.enabled === undefined and stays enabled", () => {
    expect(resolveTelemetryConfig({})).toEqual({ enabled: true, endpoint: undefined });
  });

  it("ignores fileConfig.enabled === true (default already enabled)", () => {
    expect(resolveTelemetryConfig({ enabled: true })).toEqual({ enabled: true, endpoint: undefined });
  });

  it("env STAPLE_TELEMETRY_DISABLED beats fileConfig.enabled=true", () => {
    process.env.STAPLE_TELEMETRY_DISABLED = "1";
    expect(resolveTelemetryConfig({ enabled: true })).toEqual({ enabled: false });
  });

  it("DO_NOT_TRACK beats fileConfig.enabled=true", () => {
    process.env.DO_NOT_TRACK = "1";
    expect(resolveTelemetryConfig({ enabled: true })).toEqual({ enabled: false });
  });

  it("CI beats fileConfig.enabled=true", () => {
    process.env.GITHUB_ACTIONS = "true";
    expect(resolveTelemetryConfig({ enabled: true })).toEqual({ enabled: false });
  });

  it("STAPLE_TELEMETRY_ENDPOINT is passed through when enabled", () => {
    process.env.STAPLE_TELEMETRY_ENDPOINT = "https://example.test/ingest";
    expect(resolveTelemetryConfig()).toEqual({
      enabled: true,
      endpoint: "https://example.test/ingest",
    });
  });

  it("empty STAPLE_TELEMETRY_ENDPOINT becomes undefined", () => {
    process.env.STAPLE_TELEMETRY_ENDPOINT = "";
    expect(resolveTelemetryConfig()).toEqual({ enabled: true, endpoint: undefined });
  });

  it("disabled config does NOT include endpoint field", () => {
    process.env.STAPLE_TELEMETRY_ENDPOINT = "https://example.test/ingest";
    process.env.DO_NOT_TRACK = "1";
    expect(resolveTelemetryConfig()).toEqual({ enabled: false });
  });
});
