# Integration Services

Staple supports optional integrations with external services for enhanced capabilities.

## Memory Service (Qdrant)

Enable semantic memory storage and retrieval for agents.

**Configuration:**
```bash
QDRANT_HOST=localhost              # Default: localhost
QDRANT_PORT=6333                   # Default: 6333
QDRANT_URL=http://localhost:6333   # Alternative: full URL
QDRANT_API_KEY=your-key            # Optional: API key
QDRANT_API_KEY_PATH=/path/to/key   # Optional: secret file path
```

**Usage:** See `server/src/services/memory/README.md`

## Observability (Langfuse)

Track LLM calls, costs, and latency.

**Configuration:**
```bash
LANGFUSE_HOST=localhost
LANGFUSE_PORT=3000
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
```

**Status:** Planned (see roadmap.example.yaml)

## MCP (Model Context Protocol)

Enable infrastructure tool access (GitHub, Kubernetes, Prometheus, databases).

**Configuration:**
```bash
# Simple format
MCP_SERVERS=github:http://...,kubernetes:http://...

# Or individual servers
MCP_SERVER_GITHUB_URL=http://localhost:8080
MCP_SERVER_KUBERNETES_URL=http://localhost:8081
MCP_SERVER_POSTGRES_URL=http://localhost:8082
MCP_SERVER_PROMETHEUS_URL=http://localhost:8083
```

**Features:**
- Multi-server support
- Role-based access control (SRE, DevOps, DBA, etc.)
- Tool discovery and execution
- Audit logging

**Status:** Core implementation complete, HTTP transport needed (see server/src/services/mcp/INTEGRATION_TODO.md)

## AI Firewall

Add security layer for LLM requests (PII detection, prompt injection protection).

**Configuration:**
```bash
AI_FIREWALL_URL=http://localhost:8000
AI_FIREWALL_API_KEY=your-key
```

**Status:** Planned (see roadmap.example.yaml)

## Code Graph

Semantic code analysis beyond text search.

**Configuration:**
```bash
CODE_GRAPH_URL=http://localhost:8097
```

**Status:** Planned (see roadmap.example.yaml)

## Deployment Patterns

### Local Development

Use `.env` file with localhost endpoints:

```bash
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

### Kubernetes

Mount secrets and use cluster-internal service names:

```yaml
env:
  - name: QDRANT_HOST
    value: "qdrant.namespace.svc.cluster.local"
  - name: QDRANT_API_KEY_PATH
    value: "/var/run/secrets/qdrant/api-key"
volumes:
  - name: qdrant-secret
    secret:
      secretName: qdrant-credentials
volumeMounts:
  - name: qdrant-secret
    mountPath: /var/run/secrets/qdrant
    readOnly: true
```

### Custom Deployment

For custom environments (internal clusters, corporate networks):

1. Copy `.stax.example/` to `.stax/`
2. Update `.stax/env` with your endpoints
3. Load environment from `.stax/env` in your deployment

The `.stax/` directory is gitignored, keeping your configuration private while allowing you to maintain it locally.

## Feature Flags

All integrations are optional and disabled by default. They activate when configuration is provided.

Check if a service is configured:
```typescript
import { isQdrantConfigured } from "./services/memory/qdrant-client.js";

if (isQdrantConfigured()) {
  // Use Qdrant for memory
} else {
  // Fall back to database-only storage
}
```
