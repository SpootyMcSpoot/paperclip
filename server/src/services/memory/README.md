# Memory Service

Vector-based semantic memory for Paperclip agents using Qdrant.

## Configuration

Configure via environment variables:

```bash
# Qdrant connection
QDRANT_HOST=localhost                    # Default: qdrant.llm.svc.cluster.local
QDRANT_PORT=6333                         # Default: 6333
QDRANT_API_KEY=your-api-key             # Optional: API key for authentication

# Alternative: mount API key as secret
QDRANT_API_KEY_PATH=/var/run/secrets/qdrant/api-key
```

## Usage

### Store Memory

```typescript
import { storeMemory } from "./memory-service.js";

await storeMemory({
  companyId: "...",
  agentId: "...",
  content: "Important fact to remember",
  metadata: {
    type: "fact",
    source: "document",
    tags: ["architecture", "api"],
  },
});
```

### Search Memory

```typescript
import { searchMemories } from "./memory-service.js";

const results = await searchMemories({
  companyId: "...",
  query: "How does authentication work?",
  limit: 5,
});
```

## Architecture

- Each company gets its own Qdrant collection: `company_{uuid}`
- Memories are stored as vectors with metadata
- PostgreSQL tracks memory metadata and provenance
- Qdrant handles vector similarity search

## Deployment

### Local Development

```bash
# Start Qdrant
docker run -p 6333:6333 qdrant/qdrant

# Set environment
export QDRANT_HOST=localhost
export QDRANT_PORT=6333
```

### Kubernetes

Deploy Qdrant to your cluster, then configure Paperclip:

```yaml
env:
  - name: QDRANT_HOST
    value: "qdrant.namespace.svc.cluster.local"
  - name: QDRANT_API_KEY
    valueFrom:
      secretKeyRef:
        name: qdrant-credentials
        key: api-key
```
