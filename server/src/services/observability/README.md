# Observability Service

LLM observability and cost tracking for Paperclip agents using Langfuse.

## Configuration

Configure via environment variables:

```bash
# Langfuse connection
LANGFUSE_HOST=localhost                    # Default: localhost
LANGFUSE_PORT=3000                         # Default: 3000
LANGFUSE_BASE_URL=http://localhost:3000    # Alternative: full URL

# Langfuse authentication (required)
LANGFUSE_PUBLIC_KEY=pk-lf-...              # Project public key
LANGFUSE_SECRET_KEY=sk-lf-...              # Project secret key

# Alternative: mount keys as secrets
LANGFUSE_PUBLIC_KEY_PATH=/var/run/secrets/langfuse/public-key
LANGFUSE_SECRET_KEY_PATH=/var/run/secrets/langfuse/secret-key
```

## Usage

### Wrap LLM Calls with Tracing

```typescript
import { getLangfuseClient } from "./langfuse-client.js";

const langfuse = getLangfuseClient();
if (!langfuse) {
  // Langfuse not configured, proceed without tracing
}

// Create trace for agent execution
const trace = langfuse.trace({
  name: "agent-execution",
  userId: agentId,
  metadata: {
    companyId,
    issueId,
    heartbeatRunId,
  },
});

// Create generation span for LLM call
const generation = trace.generation({
  name: "llm-completion",
  model: "qwen35-coder",
  input: prompt,
});

// ... make LLM call ...

// Record output and usage
generation.end({
  output: completion,
  usage: {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  },
});

// Flush to Langfuse
await langfuse.shutdownAsync();
```

## Architecture

- Langfuse tracks: traces (executions), generations (LLM calls), spans (operations)
- Each trace has metadata: agent, company, issue, run
- Cost calculated from token usage + model pricing
- Traces are batched and sent asynchronously

## Deployment

### Local Development

```bash
# Start Langfuse
docker run -p 3000:3000 langfuse/langfuse

# Create project in UI, get keys
# Set environment
export LANGFUSE_HOST=localhost
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
```

### Kubernetes

Deploy Langfuse to your cluster, create project, then configure Paperclip:

```yaml
env:
  - name: LANGFUSE_HOST
    value: "langfuse.namespace.svc.cluster.local"
  - name: LANGFUSE_PUBLIC_KEY_PATH
    value: "/var/run/secrets/langfuse/public-key"
  - name: LANGFUSE_SECRET_KEY_PATH
    value: "/var/run/secrets/langfuse/secret-key"
volumes:
  - name: langfuse-secret
    secret:
      secretName: langfuse-credentials
volumeMounts:
  - name: langfuse-secret
    mountPath: /var/run/secrets/langfuse
    readOnly: true
```

## Getting Keys

1. Access Langfuse UI
2. Create a project (e.g., "Paperclip Production")
3. Go to Settings → API Keys
4. Create new key pair
5. Copy public key (pk-lf-...) and secret key (sk-lf-...)
6. Configure in environment or mount as secrets

## Features

- **Traces**: Full agent execution lifecycle
- **Generations**: Individual LLM calls with prompts and completions
- **Spans**: Custom operations (memory search, tool calls, etc.)
- **Cost tracking**: Automatic cost calculation from token usage
- **Metadata**: Rich context (agent, company, issue, run)
- **Async flushing**: Non-blocking trace submission

## Metrics Available

- Token usage per agent/company/model
- Cost per agent/company/time period
- Latency per LLM call
- Error rates
- Model usage distribution
- Agent activity patterns
