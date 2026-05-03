// Contract tests for cli/src/checks/llm-check.ts.
//
// llmCheck has three drift surfaces that all degrade silently:
//   (a) "optional" branches (no llm, or no apiKey) MUST stay pass.
//       Drift to fail/warn here would make every fresh install fail
//       doctor before the user has even configured a provider.
//   (b) The 401 -> fail mapping is the single signal a user has to
//       know their key is wrong. Drift to warn would hide a broken
//       key behind a soft signal that doctor's exit code ignores.
//   (c) 200/400 -> pass for Claude is intentional: the smoke request
//       sends a 1-token prompt and Anthropic returns 400 for "auth ok
//       but request body too small". Treating 400 as fail would
//       reject every valid key.
//
// Pinned:
//   - undefined llm -> pass (optional)
//   - llm without apiKey -> pass (optional)
//   - claude 200 -> pass
//   - claude 400 -> pass (auth-ok smoke contract)
//   - claude 401 -> fail w/ canRepair=false + repair hint
//   - claude 500 -> warn (no fail)
//   - openai 200 -> pass
//   - openai 401 -> fail w/ canRepair=false + repair hint
//   - openai 503 -> warn
//   - fetch throws -> warn "Could not reach"

import { afterEach, describe, expect, it, vi } from "vitest";

import { llmCheck } from "../checks/llm-check.js";

type LlmShape = { llm?: { provider: "claude" | "openai"; apiKey?: string } };

function withLlm(provider: "claude" | "openai", apiKey?: string): LlmShape {
  return { llm: { provider, apiKey } };
}

function jsonResp(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("llmCheck", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns pass when llm config is absent (optional)", async () => {
    // Pin: a fresh install has no llm config and MUST NOT fail doctor.
    const result = await llmCheck({} as never);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("optional");
  });

  it("returns pass when apiKey is missing (optional)", async () => {
    // Pin: a configured provider w/o key is intentionally optional --
    // doctor should not fail before the user has supplied creds.
    const result = await llmCheck(withLlm("claude") as never);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("optional");
  });

  describe("claude", () => {
    it("returns pass on 200", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp(200, { ok: true })));
      const result = await llmCheck(withLlm("claude", "sk-ant-x") as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain("Claude");
    });

    it("returns pass on 400 (auth-ok smoke contract)", async () => {
      // Pin: Anthropic returns 400 for malformed bodies even when the
      // key is valid. This must NOT be treated as a key failure.
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp(400, { error: "bad input" })));
      const result = await llmCheck(withLlm("claude", "sk-ant-x") as never);
      expect(result.status).toBe("pass");
    });

    it("returns fail on 401", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp(401, { error: "auth" })));
      const result = await llmCheck(withLlm("claude", "sk-bad") as never);
      expect(result.status).toBe("fail");
      expect(result.canRepair).toBe(false);
      expect(result.repairHint).toContain("configure");
      expect(result.message).toContain("401");
    });

    it("returns warn on 500 (not fail -- transient upstream)", async () => {
      // Pin: 5xx upstream MUST NOT be reported as a fail; doctor
      // would otherwise block local boots on a transient cloud blip.
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp(500)));
      const result = await llmCheck(withLlm("claude", "sk-x") as never);
      expect(result.status).toBe("warn");
      expect(result.message).toContain("500");
    });

    it("calls the messages endpoint with x-api-key header", async () => {
      // Pin: probe MUST hit /v1/messages with x-api-key (not Authorization).
      // Drift would either route to /v1/models (404 from Anthropic) or
      // send the wrong auth header (universal 401).
      const fetchMock = vi.fn().mockResolvedValue(jsonResp(200));
      vi.stubGlobal("fetch", fetchMock);
      await llmCheck(withLlm("claude", "sk-token") as never);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/v1/messages");
      expect((init as RequestInit).method).toBe("POST");
      expect(((init as RequestInit).headers as Record<string, string>)["x-api-key"]).toBe(
        "sk-token",
      );
    });
  });

  describe("openai", () => {
    it("returns pass on 200", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp(200, { data: [] })));
      const result = await llmCheck(withLlm("openai", "sk-x") as never);
      expect(result.status).toBe("pass");
      expect(result.message).toContain("OpenAI");
    });

    it("returns fail on 401", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp(401, { error: "auth" })));
      const result = await llmCheck(withLlm("openai", "sk-bad") as never);
      expect(result.status).toBe("fail");
      expect(result.canRepair).toBe(false);
      expect(result.repairHint).toContain("configure");
      expect(result.message).toContain("401");
    });

    it("returns warn on 503", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp(503)));
      const result = await llmCheck(withLlm("openai", "sk-x") as never);
      expect(result.status).toBe("warn");
      expect(result.message).toContain("503");
    });

    it("calls /v1/models with Bearer authorization", async () => {
      // Pin: openai probe MUST GET /v1/models with Bearer header.
      // Drift to POST /v1/messages would 404 every check.
      const fetchMock = vi.fn().mockResolvedValue(jsonResp(200, { data: [] }));
      vi.stubGlobal("fetch", fetchMock);
      await llmCheck(withLlm("openai", "sk-token") as never);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/v1/models");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sk-token");
    });
  });

  it("returns warn when fetch rejects (could not reach)", async () => {
    // Pin: network failure is warn, not fail. Local-trusted deployments
    // intentionally have no egress and MUST NOT be flagged as broken
    // by doctor.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await llmCheck(withLlm("claude", "sk-x") as never);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("Could not reach");
  });
});
