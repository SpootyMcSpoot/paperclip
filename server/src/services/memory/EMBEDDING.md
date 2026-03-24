# Embedding Service Configuration

The memory service uses embeddings to enable semantic similarity search. This document explains how to configure the embedding provider.

## Providers

### 1. LiteLLM Gateway (Recommended for STAX)

Uses LiteLLM Gateway to access various embedding models (OpenAI, Azure, local models, etc.).

```bash
# Required
LITELLM_BASE_URL=http://litellm.llm.svc.cluster.local:4000

# Optional
EMBEDDING_MODEL=text-embedding-3-small  # Default
EMBEDDING_DIMENSIONS=1536                # Default
```

**Supported models:**
- `text-embedding-3-small` (1536 dims, OpenAI)
- `text-embedding-3-large` (3072 dims, OpenAI)
- `text-embedding-ada-002` (1536 dims, OpenAI, legacy)
- Any model configured in LiteLLM

**Benefits:**
- Centralized model access via LiteLLM
- No API keys needed in Staple
- Supports fallback models
- Cost tracking via LiteLLM

### 2. OpenAI API (Direct)

Direct OpenAI API access (fallback when LiteLLM not available).

```bash
# Required
OPENAI_API_KEY=sk-...

# Optional
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

**Models:**
- `text-embedding-3-small` - 1536 dims, $0.02/1M tokens
- `text-embedding-3-large` - 3072 dims, $0.13/1M tokens
- `text-embedding-ada-002` - 1536 dims, $0.10/1M tokens (legacy)

### 3. Local Fallback (Development Only)

When no embedding service is configured, a deterministic hash-based embedding is used.

**Warning:** Local fallback does NOT capture semantic similarity. It's purely for testing the Qdrant integration without API keys.

```bash
# No configuration needed - automatically used when neither
# LITELLM_BASE_URL nor OPENAI_API_KEY is set
```

**Characteristics:**
- Deterministic (same text = same vector)
- Fast (no API calls)
- No semantic understanding
- 1536 dimensions
- **NOT suitable for production**

## Configuration Examples

### Local Development (No API Key)

```bash
# Qdrant only
QDRANT_HOST=localhost
QDRANT_PORT=6333

# Embedding: uses local fallback automatically
```

### Local Development (with OpenAI)

```bash
# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333

# Embedding via OpenAI
OPENAI_API_KEY=sk-proj-...
EMBEDDING_MODEL=text-embedding-3-small
```

### STAX Deployment

```bash
# Qdrant (in llm namespace)
QDRANT_HOST=qdrant.llm.svc.cluster.local
QDRANT_PORT=6333
QDRANT_API_KEY_PATH=/var/run/secrets/qdrant/api-key

# Embedding via LiteLLM Gateway
LITELLM_BASE_URL=http://litellm.llm.svc.cluster.local:4000
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

## Changing Embedding Models

**Important:** Changing the embedding model or dimensions requires recreating Qdrant collections.

### Steps:

1. **Export existing memories** (if you want to keep them):
   ```bash
   GET /api/companies/{companyId}/memories
   ```

2. **Delete old collection**:
   ```bash
   # Via Qdrant API or CLI
   curl -X DELETE http://localhost:6333/collections/company_{id}
   ```

3. **Update environment**:
   ```bash
   EMBEDDING_MODEL=text-embedding-3-large
   EMBEDDING_DIMENSIONS=3072
   ```

4. **Restart server** - new collection will be created with new dimensions

5. **Re-import memories** (if exported):
   ```bash
   POST /api/companies/{companyId}/memories
   ```

## Health Check

Check embedding configuration:

```bash
curl http://localhost:3100/api/memory/health
```

Response:
```json
{
  "configured": true,
  "healthy": true,
  "embedding": {
    "configured": true,
    "dimensions": 1536,
    "provider": "production",
    "warning": null
  }
}
```

If using local fallback:
```json
{
  "configured": true,
  "healthy": true,
  "embedding": {
    "configured": false,
    "dimensions": 1536,
    "provider": "fallback",
    "warning": "Using local fallback embeddings (not suitable for production)"
  }
}
```

## Performance Considerations

### Caching

The embedding service caches embeddings by the first 200 characters of text:
- Cache size: 1000 entries (LRU)
- Identical text = instant cache hit
- Reduces API calls significantly

### Batch Processing

For bulk memory imports, consider:
1. Using larger cache size (modify `CACHE_MAX_SIZE`)
2. Rate limiting to avoid API throttling
3. Processing in batches with delays

### Cost Estimation

**text-embedding-3-small** at $0.02/1M tokens:
- 1000 memories × 200 words each = ~266,000 tokens
- Cost: ~$0.005 (half a cent)
- Very affordable for typical workloads

## Troubleshooting

### "Embedding generation failed, using fallback"

**Cause:** API call to LiteLLM or OpenAI failed

**Solutions:**
1. Check network connectivity to embedding service
2. Verify API keys are correct
3. Check LiteLLM logs for errors
4. Ensure model is available in LiteLLM config

### "Collection has different dimensions"

**Cause:** Existing collection uses different embedding dimensions

**Solutions:**
1. Delete collection and recreate (data loss)
2. Or export/re-import with new dimensions
3. Or use same dimensions as existing collection

### Memory search returns random results

**Cause:** Using local fallback embeddings

**Solution:** Configure production embedding service (LiteLLM or OpenAI)

## Future Enhancements

Potential improvements:
- [ ] Support for sentence-transformers (local embeddings)
- [ ] Support for Azure OpenAI
- [ ] Support for Google Vertex AI embeddings
- [ ] Persistent embedding cache (Redis/database)
- [ ] Batch embedding API for bulk imports
- [ ] Custom embedding models via API
