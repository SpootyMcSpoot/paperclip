# AI Firewall Service

LLM security layer for Paperclip - PII detection, prompt injection protection, content filtering.

## What is AI Firewall?

AI Firewall sits between agents and LLMs to:
- Detect and block PII (emails, phone numbers, SSNs, credit cards)
- Prevent prompt injection attacks
- Filter inappropriate content
- Enforce content policies
- Audit all LLM interactions

## Configuration

Configure via environment variables:

```bash
# AI Firewall connection
AI_FIREWALL_URL=http://localhost:8000           # Required
AI_FIREWALL_API_KEY=your-api-key                # Optional: API key
AI_FIREWALL_API_KEY_PATH=/var/run/secrets/...   # Optional: secret file path
AI_FIREWALL_ENABLED=true                         # Optional: enable/disable (default: true if URL set)
```

## Usage

### Check Prompt Before LLM

```typescript
import { checkPrompt, isAIFirewallEnabled } from "./firewall-client.js";

if (isAIFirewallEnabled()) {
  const check = await checkPrompt({
    prompt: userInput,
    userId: agentId,
    sessionId: runId,
    metadata: {
      companyId,
      issueId,
    },
  });

  if (check.blocked) {
    throw new Error(`Prompt blocked: ${check.reason}`);
  }

  // Use sanitized prompt if provided (PII redacted)
  const safePrompt = check.sanitizedPrompt || userInput;

  // Send safePrompt to LLM
}
```

### Check Response After LLM

```typescript
import { checkResponse, isAIFirewallEnabled } from "./firewall-client.js";

const llmResponse = await callLLM(prompt);

if (isAIFirewallEnabled()) {
  const check = await checkResponse(llmResponse, {
    companyId,
    agentId,
  });

  if (check.blocked) {
    throw new Error(`Response blocked: ${check.reason}`);
  }
}

return llmResponse;
```

### Adapter Integration

Wrap adapter execution with firewall checks:

```typescript
import { checkPrompt, checkResponse } from "./firewall-client.js";

export async function execute(ctx: AdapterExecutionContext) {
  // Check prompt
  const promptCheck = await checkPrompt({
    prompt: ctx.context,
    userId: ctx.agent.id,
    sessionId: ctx.runId,
  });

  if (promptCheck.blocked) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Firewall blocked prompt: ${promptCheck.reason}`,
      errorCode: "ai_firewall_blocked_prompt",
    };
  }

  // Call LLM with sanitized prompt
  const safePrompt = promptCheck.sanitizedPrompt || ctx.context;
  const result = await callLLM(safePrompt);

  // Check response
  const responseCheck = await checkResponse(result.text);

  if (responseCheck.blocked) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Firewall blocked response: ${responseCheck.reason}`,
      errorCode: "ai_firewall_blocked_response",
    };
  }

  return result;
}
```

## Detections

AI Firewall can detect:

### PII (Personally Identifiable Information)
- Email addresses
- Phone numbers
- Social Security Numbers
- Credit card numbers
- IP addresses
- Physical addresses

### Security Threats
- Prompt injection attacks
- Jailbreak attempts
- System prompt extraction
- Indirect prompt injection

### Content Policy
- Inappropriate content
- Hate speech
- Violence
- Adult content

### Data Leakage
- API keys
- Passwords
- Tokens
- Internal URLs

## Architecture

```
Agent Prompt
     │
     ├─> AI Firewall: checkPrompt()
     │        │
     │        ├─ PII Detection
     │        ├─ Injection Detection
     │        ├─ Policy Check
     │        └─ Return: allowed/blocked/sanitized
     │
     ├─> LLM (if allowed)
     │
     ├─> AI Firewall: checkResponse()
     │        │
     │        ├─ PII Detection
     │        ├─ Content Filter
     │        └─ Return: allowed/blocked
     │
     └─> Return to Agent (if allowed)
```

## Fail-Open vs Fail-Closed

**Current behavior: Fail-Open**

If AI Firewall is unavailable or errors:
- Prompts and responses are allowed
- Error is logged
- Agent continues execution

This prevents AI Firewall outages from blocking all agent work.

**To change to Fail-Closed:**

Set `AI_FIREWALL_FAIL_CLOSED=true` (not yet implemented - see TODO)

## Bypass for Trusted Agents

Some agents may need to bypass firewall (e.g., security research agents):

```typescript
// In agent configuration
{
  "permissions": {
    "bypassAIFirewall": true
  }
}

// In adapter
if (agent.permissions?.bypassAIFirewall) {
  // Skip firewall checks
}
```

## Statistics and Monitoring

Get firewall statistics:

```typescript
import { getFirewallStats } from "./firewall-client.js";

const stats = await getFirewallStats(companyId, agentId);
// {
//   totalChecks: 1234,
//   blocked: 56,
//   allowed: 1178,
//   detectionsByType: {
//     "pii.email": 23,
//     "pii.phone": 12,
//     "injection.system_prompt": 15,
//     "policy.inappropriate": 6,
//   }
// }
```

## Deployment

### Local Development

```bash
# Start AI Firewall
docker run -p 8000:8000 ai-firewall:latest

# Set environment
export AI_FIREWALL_URL=http://localhost:8000
```

### Kubernetes

```yaml
env:
  - name: AI_FIREWALL_URL
    value: "http://ai-firewall.namespace.svc.cluster.local:8000"
  - name: AI_FIREWALL_API_KEY_PATH
    value: "/var/run/secrets/ai-firewall/api-key"
volumes:
  - name: ai-firewall-secret
    secret:
      secretName: ai-firewall-credentials
volumeMounts:
  - name: ai-firewall-secret
    mountPath: /var/run/secrets/ai-firewall
    readOnly: true
```

## Configuration Options

- **Per-Company Policies**: Different companies can have different policies
- **Per-Agent Bypass**: Specific agents can bypass firewall
- **Detection Thresholds**: Adjust sensitivity of detections
- **Custom Rules**: Add custom detection patterns

## Performance

- **Latency**: ~50-200ms per check (depends on firewall deployment)
- **Async Checks**: Response checks can be async (non-blocking)
- **Caching**: Identical prompts cached (30s TTL)
- **Batch Mode**: Check multiple prompts/responses in one call

## Compliance

AI Firewall helps with:
- **GDPR**: PII detection and redaction
- **HIPAA**: PHI (Protected Health Information) detection
- **PCI-DSS**: Credit card number detection
- **SOC 2**: Audit logging of all LLM interactions
