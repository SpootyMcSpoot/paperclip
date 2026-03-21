# Langfuse Observability Integration TODO

## Completed ✅
- [x] Langfuse client with configurable endpoints
- [x] Trace adapter wrapper for LLM calls
- [x] Generic tracing utilities

## Remaining Work

### 1. Wrap Adapters with Tracing
**Priority: HIGH**

The tracing wrapper is ready, but needs to be integrated into adapters.

**Option A: Wrapper Pattern (Non-invasive)**
```typescript
// packages/adapters/litellm-gateway/src/server/index.ts
import { createTracedExecute } from "@paperclipai/server/services/observability";
import { execute as originalExecute } from "./execute.js";

export const execute = createTracedExecute(originalExecute);
```

**Option B: Direct Integration**
Modify `execute.ts` directly to call `traceAdapterExecution()`.

**Recommendation**: Use Option A (wrapper) - keeps adapter code clean and tracing is optional.

### 2. Server Integration
**Priority: HIGH**

Add to `server/src/index.ts`:
```typescript
import { shutdownLangfuse, isLangfuseConfigured } from "./services/observability/index.js";

// On startup
if (isLangfuseConfigured()) {
  console.log("Langfuse observability enabled");
}

// On shutdown
process.on("SIGTERM", async () => {
  await shutdownLangfuse();
  process.exit(0);
});
```

### 3. Get Langfuse Keys from STAX Deployment
**Priority: HIGH**

Current state: Langfuse is deployed at langfuse.llm.svc.cluster.local:3000

Steps:
1. Access Langfuse UI: https://langfuse.spooty.io
2. Create project: "Paperclip Production"
3. Generate API keys (Settings → API Keys)
4. Store keys in Kubernetes secret:
   ```bash
   kubectl create secret generic langfuse-paperclip-keys \
     --from-literal=public-key=pk-lf-... \
     --from-literal=secret-key=sk-lf-... \
     -n paperclip
   ```
5. Mount secret in Paperclip deployment
6. Update `.stax/env` with key paths

### 4. Cost Attribution
**Priority: MEDIUM**

Add cost calculation:
```typescript
// Map model names to cost per 1M tokens
const MODEL_COSTS = {
  "qwen35-coder": { input: 0, output: 0 }, // Local model, free
  "claude-opus-4-6": { input: 15, output: 75 },
  "gpt-4o": { input: 2.5, output: 10 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
  return (
    (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output
  );
}

// In trace-adapter.ts
generation.end({
  // ... existing fields
  usage: {
    promptTokens: result.usage.inputTokens,
    completionTokens: result.usage.outputTokens,
    totalTokens: result.usage.inputTokens + result.usage.outputTokens,
    totalCost: calculateCost(model, result.usage.inputTokens, result.usage.outputTokens),
  },
});
```

### 5. Trace Additional Operations
**Priority: MEDIUM**

Add tracing for:
- Memory search operations (search latency, result count)
- MCP tool calls (tool name, input, output, latency)
- Document processing (document ID, processing time)
- Issue operations (create, update, assign)

### 6. Dashboard and Queries
**Priority: LOW**

Create Langfuse dashboards:
- Agent cost breakdown (by agent, by company, by model)
- Token usage trends over time
- Latency percentiles (p50, p90, p99)
- Error rates by agent/model
- Most expensive operations

### 7. Alerts and Budgets
**Priority: LOW**

Implement budget alerts:
- Warn when agent approaches monthly budget
- Alert on unusually high token usage
- Notify on error rate spikes
- Track cost per issue/project

### 8. Trace Enrichment
**Priority: LOW**

Add more context to traces:
- Issue title and description
- Project name
- Document titles being processed
- Tool call results
- Memory search queries

## Testing

### Unit Tests
- [x] Basic configuration tests
- [ ] Trace creation and metadata
- [ ] Cost calculation
- [ ] Error handling

### Integration Tests
- [ ] Full trace flow (create → generation → flush)
- [ ] Traces appear in Langfuse UI
- [ ] Cost attribution accuracy
- [ ] Multiple concurrent executions

### E2E Tests
- [ ] Agent execution creates trace
- [ ] Traces visible in Langfuse dashboard
- [ ] Cost tracking works correctly
- [ ] No performance degradation

## Documentation

- [x] README for observability service
- [ ] API documentation
- [ ] Langfuse setup guide
- [ ] Cost optimization guide
- [ ] Dashboard creation guide

## Performance Optimization

- [x] Async trace flushing (non-blocking)
- [ ] Batch trace submissions
- [ ] Trace sampling for high-volume agents
- [ ] Local trace buffering on Langfuse unavailability

## Security

- [ ] Sanitize traces (remove PII, secrets)
- [ ] Rate limiting on trace submissions
- [ ] Audit logging for trace access
- [ ] Role-based access to Langfuse dashboards
