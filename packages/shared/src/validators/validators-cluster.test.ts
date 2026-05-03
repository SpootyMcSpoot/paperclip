// Contract tests for the small Zod validators in packages/shared/src/validators/.
//
// These schemas guard the JSON shapes that cross the CLI <-> server <-> UI
// boundary. Drift here corrupts at the boundary, not the call site, so the
// tests pin the exact shape rather than going through a downstream caller.
//
// Pinned:
//   - text.normalizeEscapedLineBreaks: every \r\n / \n / \r escape sequence
//     collapses to a single LF. Drift breaks paste-from-shell flows that
//     ship literal backslash-n.
//   - secret.envBindingSchema: legacy bare-string + plain + secret_ref
//     accepted; secret_ref REQUIRES a uuid + accepts "latest" version.
//   - secret.createSecretSchema: name + value required and non-empty.
//   - budget.upsertBudgetPolicySchema: defaults applied for metric /
//     windowKind / warnPercent / hardStopEnabled / notifyEnabled / isActive
//     so the UI can post a minimal payload.
//   - budget.resolveBudgetIncidentSchema: amount REQUIRED when action is
//     raise_budget_and_resume; otherwise optional.
//   - cost.createCostEventSchema: token defaults are 0, biller falls back
//     to provider, occurredAt MUST be ISO 8601.
//   - feedback.upsertIssueFeedbackVoteSchema: reason capped at 1000 chars.

import { describe, expect, it } from "vitest";

import { multilineTextSchema, normalizeEscapedLineBreaks } from "./text.js";
import {
  envBindingSchema,
  createSecretSchema,
  rotateSecretSchema,
  updateSecretSchema,
} from "./secret.js";
import { upsertBudgetPolicySchema, resolveBudgetIncidentSchema } from "./budget.js";
import { createCostEventSchema, updateBudgetSchema } from "./cost.js";
import { upsertIssueFeedbackVoteSchema } from "./feedback.js";

describe("validators/text", () => {
  it("collapses \\r\\n then \\n then \\r escape sequences to LF", () => {
    expect(normalizeEscapedLineBreaks("a\\r\\nb")).toBe("a\nb");
    expect(normalizeEscapedLineBreaks("a\\nb")).toBe("a\nb");
    expect(normalizeEscapedLineBreaks("a\\rb")).toBe("a\nb");
  });

  it("preserves real newlines and unrelated backslashes", () => {
    expect(normalizeEscapedLineBreaks("a\nb")).toBe("a\nb");
    expect(normalizeEscapedLineBreaks("a\\tb")).toBe("a\\tb");
  });

  it("multilineTextSchema applies the same transform via parse", () => {
    expect(multilineTextSchema.parse("hello\\nworld")).toBe("hello\nworld");
  });
});

describe("validators/secret/envBindingSchema", () => {
  it("accepts a bare legacy string", () => {
    expect(envBindingSchema.parse("plaintext-legacy")).toBe("plaintext-legacy");
  });

  it("accepts an explicit plain object", () => {
    const result = envBindingSchema.parse({ type: "plain", value: "hi" });
    expect(result).toEqual({ type: "plain", value: "hi" });
  });

  it("accepts a secret_ref with a uuid and optional version", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(envBindingSchema.parse({ type: "secret_ref", secretId: id })).toEqual({
      type: "secret_ref",
      secretId: id,
    });
    expect(
      envBindingSchema.parse({ type: "secret_ref", secretId: id, version: "latest" }),
    ).toEqual({ type: "secret_ref", secretId: id, version: "latest" });
    expect(
      envBindingSchema.parse({ type: "secret_ref", secretId: id, version: 7 }),
    ).toEqual({ type: "secret_ref", secretId: id, version: 7 });
  });

  it("rejects secret_ref with a non-uuid secretId", () => {
    // Pin: drifting to plain z.string() would let attackers inject
    // path traversal into a downstream lookup. Keep uuid.
    expect(() =>
      envBindingSchema.parse({ type: "secret_ref", secretId: "not-a-uuid" }),
    ).toThrow();
  });

  it("rejects secret_ref with a version that is zero or negative", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(() =>
      envBindingSchema.parse({ type: "secret_ref", secretId: id, version: 0 }),
    ).toThrow();
    expect(() =>
      envBindingSchema.parse({ type: "secret_ref", secretId: id, version: -1 }),
    ).toThrow();
  });
});

describe("validators/secret/createSecretSchema", () => {
  it("requires a non-empty name and value", () => {
    expect(() => createSecretSchema.parse({ name: "", value: "x" })).toThrow();
    expect(() => createSecretSchema.parse({ name: "foo", value: "" })).toThrow();
  });

  it("accepts a minimal create payload and leaves provider/description optional", () => {
    const out = createSecretSchema.parse({ name: "API_KEY", value: "sk-test" });
    expect(out.name).toBe("API_KEY");
    expect(out.value).toBe("sk-test");
    expect(out.provider).toBeUndefined();
  });

  it("rotateSecretSchema requires a non-empty value", () => {
    expect(() => rotateSecretSchema.parse({ value: "" })).toThrow();
    expect(rotateSecretSchema.parse({ value: "next" })).toEqual({ value: "next" });
  });

  it("updateSecretSchema accepts an empty payload (all fields optional)", () => {
    expect(updateSecretSchema.parse({})).toEqual({});
  });
});

describe("validators/budget/upsertBudgetPolicySchema", () => {
  const scopeId = "22222222-2222-4222-8222-222222222222";

  it("applies defaults for metric, windowKind, warn/hardStop/notify/isActive", () => {
    const out = upsertBudgetPolicySchema.parse({
      scopeType: "agent",
      scopeId,
      amount: 1000,
    });
    expect(out.metric).toBe("billed_cents");
    expect(out.windowKind).toBe("calendar_month_utc");
    expect(out.warnPercent).toBe(80);
    expect(out.hardStopEnabled).toBe(true);
    expect(out.notifyEnabled).toBe(true);
    expect(out.isActive).toBe(true);
  });

  it("clamps warnPercent to 1..99", () => {
    expect(() =>
      upsertBudgetPolicySchema.parse({
        scopeType: "agent",
        scopeId,
        amount: 1,
        warnPercent: 0,
      }),
    ).toThrow();
    expect(() =>
      upsertBudgetPolicySchema.parse({
        scopeType: "agent",
        scopeId,
        amount: 1,
        warnPercent: 100,
      }),
    ).toThrow();
  });

  it("rejects negative amount", () => {
    expect(() =>
      upsertBudgetPolicySchema.parse({
        scopeType: "agent",
        scopeId,
        amount: -1,
      }),
    ).toThrow();
  });

  it("rejects an unknown scopeType", () => {
    expect(() =>
      upsertBudgetPolicySchema.parse({
        scopeType: "person",
        scopeId,
        amount: 1,
      }),
    ).toThrow();
  });
});

describe("validators/budget/resolveBudgetIncidentSchema", () => {
  it("requires amount when action is raise_budget_and_resume", () => {
    expect(() =>
      resolveBudgetIncidentSchema.parse({ action: "raise_budget_and_resume" }),
    ).toThrow();
    const ok = resolveBudgetIncidentSchema.parse({
      action: "raise_budget_and_resume",
      amount: 5000,
    });
    expect(ok.amount).toBe(5000);
  });

  it("leaves amount optional for keep_paused", () => {
    const out = resolveBudgetIncidentSchema.parse({ action: "keep_paused" });
    expect(out.amount).toBeUndefined();
  });
});

describe("validators/cost/createCostEventSchema", () => {
  const agentId = "33333333-3333-4333-8333-333333333333";

  it("defaults token counters to 0 and biller falls back to provider", () => {
    const out = createCostEventSchema.parse({
      agentId,
      provider: "openai",
      model: "gpt-4o",
      costCents: 12,
      occurredAt: "2026-01-02T03:04:05.000Z",
    });
    expect(out.inputTokens).toBe(0);
    expect(out.cachedInputTokens).toBe(0);
    expect(out.outputTokens).toBe(0);
    expect(out.biller).toBe("openai");
    expect(out.billingType).toBe("unknown");
  });

  it("preserves an explicit biller distinct from provider", () => {
    const out = createCostEventSchema.parse({
      agentId,
      provider: "openai",
      biller: "litellm",
      model: "gpt-4o",
      costCents: 12,
      occurredAt: "2026-01-02T03:04:05.000Z",
    });
    expect(out.biller).toBe("litellm");
  });

  it("rejects negative tokens", () => {
    expect(() =>
      createCostEventSchema.parse({
        agentId,
        provider: "openai",
        model: "gpt-4o",
        costCents: 0,
        inputTokens: -1,
        occurredAt: "2026-01-02T03:04:05.000Z",
      }),
    ).toThrow();
  });

  it("rejects a non-ISO occurredAt string", () => {
    expect(() =>
      createCostEventSchema.parse({
        agentId,
        provider: "openai",
        model: "gpt-4o",
        costCents: 0,
        occurredAt: "not a date",
      }),
    ).toThrow();
  });

  it("updateBudgetSchema rejects negative monthly budget", () => {
    expect(() => updateBudgetSchema.parse({ budgetMonthlyCents: -1 })).toThrow();
    expect(updateBudgetSchema.parse({ budgetMonthlyCents: 0 })).toEqual({
      budgetMonthlyCents: 0,
    });
  });
});

describe("validators/feedback/upsertIssueFeedbackVoteSchema", () => {
  const targetId = "44444444-4444-4444-8444-444444444444";

  it("accepts a minimal upvote", () => {
    const out = upsertIssueFeedbackVoteSchema.parse({
      targetType: "issue_comment",
      targetId,
      vote: "up",
    });
    expect(out.vote).toBe("up");
    expect(out.reason).toBeUndefined();
  });

  it("trims and caps reason at 1000 chars", () => {
    const reason = "  " + "x".repeat(998) + "  ";
    const out = upsertIssueFeedbackVoteSchema.parse({
      targetType: "issue_comment",
      targetId,
      vote: "down",
      reason,
    });
    expect(out.reason).toBe("x".repeat(998));

    expect(() =>
      upsertIssueFeedbackVoteSchema.parse({
        targetType: "issue_comment",
        targetId,
        vote: "down",
        reason: "y".repeat(1001),
      }),
    ).toThrow();
  });
});
