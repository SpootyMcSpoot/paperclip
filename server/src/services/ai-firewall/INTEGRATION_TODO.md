# AI Firewall Integration TODO

## Completed ✅
- [x] Firewall client with configurable endpoints
- [x] Prompt checking (checkPrompt)
- [x] Response checking (checkResponse)
- [x] Health check
- [x] Statistics endpoint
- [x] Fail-open behavior (default)
- [x] Environment configuration

## Remaining Work

### 1. Adapter Integration
**Priority: HIGH**

Wrap adapters with firewall checks:

```typescript
// packages/adapters/litellm-gateway/src/server/execute.ts
import { checkPrompt, checkResponse, isAIFirewallEnabled } from "@paperclipai/server/services/ai-firewall";

export async function execute(ctx: AdapterExecutionContext) {
  // Check prompt if firewall enabled
  if (isAIFirewallEnabled()) {
    const promptCheck = await checkPrompt({
      prompt: ctx.context,
      userId: ctx.agent.id,
      sessionId: ctx.runId,
      metadata: {
        companyId: ctx.agent.companyId,
        agentRole: ctx.agent.role,
      },
    });

    if (promptCheck.blocked) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `AI Firewall blocked prompt: ${promptCheck.reason}`,
        errorCode: "ai_firewall_blocked_prompt",
      };
    }

    // Use sanitized prompt if provided
    const safePrompt = promptCheck.sanitizedPrompt || ctx.context;
    // ... use safePrompt instead of ctx.context
  }

  // ... call LLM ...

  // Check response if firewall enabled
  if (isAIFirewallEnabled() && result.summary) {
    const responseCheck = await checkResponse(result.summary, {
      companyId: ctx.agent.companyId,
      agentId: ctx.agent.id,
    });

    if (responseCheck.blocked) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `AI Firewall blocked response: ${responseCheck.reason}`,
        errorCode: "ai_firewall_blocked_response",
      };
    }
  }

  return result;
}
```

### 2. Database Logging
**Priority: MEDIUM**

Log all firewall blocks for audit:

```typescript
// In database schema
export const firewallBlocks = pgTable("firewall_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  agentId: uuid("agent_id").notNull(),
  type: text("type").notNull(), // "prompt" or "response"
  content: text("content").notNull(), // The blocked content
  reason: text("reason").notNull(),
  detections: jsonb("detections"),
  issueId: uuid("issue_id"),
  heartbeatRunId: uuid("heartbeat_run_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Log every block
await db.insert(firewallBlocks).values({
  companyId,
  agentId,
  type: "prompt",
  content: prompt,
  reason: check.reason,
  detections: check.detections,
  issueId,
  heartbeatRunId,
});
```

### 3. Agent Bypass Permission
**Priority: MEDIUM**

Allow specific agents to bypass firewall:

```typescript
// Check agent permissions
if (agent.permissions?.bypassAIFirewall) {
  // Skip firewall checks
  return await executeWithoutFirewall(ctx);
}

// Otherwise, run firewall checks
return await executeWithFirewall(ctx);
```

### 4. Per-Company Policies
**Priority: LOW**

Different firewall policies per company:

```typescript
// In database schema
export const firewallPolicies = pgTable("firewall_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  checkPrompts: boolean("check_prompts").notNull().default(true),
  checkResponses: boolean("check_responses").notNull().default(true),
  piiRedaction: boolean("pii_redaction").notNull().default(true),
  detectionThreshold: text("detection_threshold").notNull().default("medium"),
  allowedDetections: jsonb("allowed_detections"), // Types to ignore
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Use company policy
const policy = await db
  .select()
  .from(firewallPolicies)
  .where(eq(firewallPolicies.companyId, companyId))
  .limit(1);

if (!policy[0]?.enabled) {
  // Company has firewall disabled
  return await executeWithoutFirewall(ctx);
}
```

### 5. UI for Firewall Blocks
**Priority: MEDIUM**

Add UI to:
- View firewall block history
- See detection details
- Review blocked prompts/responses
- Override false positives
- Manage company policies

### 6. Fail-Closed Mode
**Priority: LOW**

Make fail behavior configurable:

```typescript
const failClosed = process.env.AI_FIREWALL_FAIL_CLOSED === "true";

if (firewallError) {
  if (failClosed) {
    // Block on error
    return { blocked: true, reason: "Firewall unavailable" };
  } else {
    // Allow on error (current behavior)
    return { allowed: true, blocked: false };
  }
}
```

### 7. Firewall Metrics
**Priority: LOW**

Track firewall performance:
- Check latency (p50, p90, p99)
- Block rate by detection type
- False positive rate
- Firewall availability

### 8. Custom Detection Rules
**Priority: LOW**

Allow companies to add custom rules:

```typescript
export const firewallRules = pgTable("firewall_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  name: text("name").notNull(),
  pattern: text("pattern").notNull(), // Regex pattern
  severity: text("severity").notNull(), // low, medium, high, critical
  action: text("action").notNull(), // block, redact, warn
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

## Testing

### Unit Tests
- [x] Basic configuration tests
- [ ] Prompt checking
- [ ] Response checking
- [ ] Fail-open behavior
- [ ] Error handling

### Integration Tests
- [ ] Connect to real AI Firewall
- [ ] Check prompts with PII
- [ ] Check responses with detections
- [ ] Handle firewall errors
- [ ] Verify fail-open behavior

### E2E Tests
- [ ] Agent prompts blocked by firewall
- [ ] Agent continues with sanitized prompt
- [ ] Firewall blocks logged to database
- [ ] Statistics accurate

## Documentation

- [x] README for AI Firewall service
- [ ] Adapter integration guide
- [ ] Policy configuration guide
- [ ] Troubleshooting guide
- [ ] Compliance guide (GDPR, HIPAA, PCI-DSS)

## Security

- [x] API key support
- [ ] Per-agent bypass permission
- [ ] Audit logging for all blocks
- [ ] Per-company policies
- [ ] Content sanitization in logs

## Performance

- [ ] Async response checking (non-blocking)
- [ ] Prompt/response caching (identical content)
- [ ] Batch checking (multiple prompts at once)
- [ ] Circuit breaker (disable on repeated failures)

## Compliance

- [ ] PII redaction logging (which PII types found)
- [ ] Compliance reports (GDPR, HIPAA, etc.)
- [ ] Data retention policies
- [ ] Audit trail export
