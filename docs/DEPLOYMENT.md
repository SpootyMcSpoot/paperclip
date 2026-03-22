# Paperclip Deployment Guide

This guide covers deploying Paperclip to the STAX Kubernetes cluster with all AI stack integrations enabled.

## Prerequisites

- STAX AI stack deployed (stacks 08-ai, 14-ai-firewall, 12-mcp-services)
- PostgreSQL database available
- LiteLLM Gateway configured and running
- Kubernetes cluster access

## Required Services

| Service | Stack | Endpoint | Purpose |
|---------|-------|----------|---------|
| Qdrant | 08-ai | `qdrant.ai.svc.cluster.local:6333` | Vector memory storage |
| Langfuse | 08-ai | `langfuse.ai.svc.cluster.local:3000` | LLM observability |
| AI Firewall | 14-ai-firewall | `ai-firewall.ai.svc.cluster.local:8000` | LLM security |
| Code Graph | 08-ai (or custom) | `code-graph.ai.svc.cluster.local:8097` | Semantic code analysis |
| MCP Gateway | 12-mcp-services | `mcp.mcp.svc.cluster.local:8080` | Tool integration |
| LiteLLM | 08-ai | `litellm.ai.svc.cluster.local:4000` | LLM inference + embeddings |
| PostgreSQL | 02-core or custom | `postgres.core.svc.cluster.local:5432` | Database |

## Configuration Steps

### 1. Database Setup

Create Paperclip database and user:

```bash
# Connect to PostgreSQL
kubectl exec -it postgres-0 -n core -- psql -U postgres

# Create database and user
CREATE DATABASE paperclip;
CREATE USER paperclip WITH PASSWORD 'SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE paperclip TO paperclip;
\q
```

### 2. Langfuse API Keys

Get Langfuse API keys from the UI:

```bash
# Port-forward to access Langfuse UI
kubectl port-forward -n ai svc/langfuse 3000:3000

# Open browser to http://localhost:3000
# 1. Log in to Langfuse
# 2. Go to Settings → API Keys
# 3. Create new project: "Paperclip Production"
# 4. Generate API keys
# 5. Save the public key (pk-lf-...) and secret key (sk-lf-...)
```

### 3. Create Kubernetes Secrets

```bash
# Paperclip database credentials
kubectl create secret generic paperclip-db-credentials \
  --from-literal=url='postgresql://paperclip:SECURE_PASSWORD_HERE@postgres.core.svc.cluster.local:5432/paperclip' \
  -n paperclip

# Langfuse credentials
kubectl create secret generic paperclip-langfuse-credentials \
  --from-literal=public-key='pk-lf-...' \
  --from-literal=secret-key='sk-lf-...' \
  -n paperclip

# AI Firewall API key (if required)
kubectl create secret generic paperclip-ai-firewall-credentials \
  --from-literal=api-key='your-api-key' \
  -n paperclip

# Qdrant API key (if required)
kubectl create secret generic paperclip-qdrant-credentials \
  --from-literal=api-key='your-api-key' \
  -n paperclip
```

### 4. MCP Server Configuration

Configure MCP servers JSON:

```json
{
  "github": {
    "url": "http://mcp-github.mcp.svc.cluster.local:8080",
    "env": {
      "GITHUB_TOKEN": "ghp_..."
    }
  },
  "kubernetes": {
    "url": "http://mcp-kubernetes.mcp.svc.cluster.local:8080"
  },
  "prometheus": {
    "url": "http://mcp-prometheus.mcp.svc.cluster.local:8080"
  }
}
```

Store as secret:

```bash
kubectl create secret generic paperclip-mcp-config \
  --from-file=servers.json=/path/to/mcp-servers.json \
  -n paperclip
```

### 5. Deploy Paperclip

Create Pulumi deployment:

```bash
cd /var/home/pestilence/repos/stax/pulumi/stacks
# Paperclip stack will be created (TBD - stack number to be assigned)

# Preview changes
pulumi preview

# Deploy
pulumi up
```

### 6. Verify Deployment

Check all pods are running:

```bash
kubectl get pods -n paperclip
```

Expected output:
```
NAME                           READY   STATUS    RESTARTS   AGE
paperclip-api-xxxxx-yyyyy      1/1     Running   0          5m
```

Check service health:

```bash
# Port-forward to API
kubectl port-forward -n paperclip svc/paperclip-api 3100:3100

# Health check
curl http://localhost:3100/health

# Check AI services status
curl http://localhost:3100/api/services/status
```

Expected response:
```json
{
  "status": "healthy",
  "aiServices": {
    "qdrant": "connected",
    "langfuse": "configured",
    "aiFirewall": "connected",
    "codeGraph": "connected",
    "mcp": "configured"
  }
}
```

### 7. Initialize Vector Memory

Create initial Qdrant collections:

```bash
# The collections will be created automatically on first use
# Or manually create via API:
curl -X POST http://localhost:3100/api/memory/init
```

### 8. Configure Ingress

Add Traefik IngressRoute for external access:

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: paperclip-api
  namespace: paperclip
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`paperclip-api.spooty.io`)
      kind: Rule
      services:
        - name: paperclip-api
          port: 3100
      middlewares:
        - name: authentik-forward-auth
          namespace: auth
  tls:
    certResolver: cloudflare
```

## Environment Variables Reference

See `.env.example` for full list. Key variables:

```bash
# Core
DATABASE_URL=postgresql://paperclip:pass@postgres.core.svc.cluster.local:5432/paperclip
PORT=3100
SERVE_UI=false

# Qdrant
QDRANT_URL=http://qdrant.ai.svc.cluster.local:6333

# Langfuse
LANGFUSE_BASE_URL=http://langfuse.ai.svc.cluster.local:3000
LANGFUSE_PUBLIC_KEY_PATH=/secrets/langfuse/public-key
LANGFUSE_SECRET_KEY_PATH=/secrets/langfuse/secret-key

# AI Firewall
AI_FIREWALL_URL=http://ai-firewall.ai.svc.cluster.local:8000

# Code Graph
CODE_GRAPH_URL=http://code-graph.ai.svc.cluster.local:8097

# Embedding Service
LITELLM_BASE_URL=http://litellm.ai.svc.cluster.local:4000
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

## Testing the Deployment

### 1. Test Core API

```bash
# Create a test company
curl -X POST http://paperclip-api.spooty.io/api/companies \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Company"}'

# Create a test agent
curl -X POST http://paperclip-api.spooty.io/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "role": "developer",
    "runtime": "litellm_gateway"
  }'
```

### 2. Test Vector Memory

```bash
# Store a memory
curl -X POST http://paperclip-api.spooty.io/api/memory \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "...",
    "content": "Test memory content",
    "metadata": {"type": "test"}
  }'

# Search memories
curl -X POST http://paperclip-api.spooty.io/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "...",
    "query": "test",
    "limit": 10
  }'
```

### 3. Test LLM Observability

Run an agent task and check Langfuse:

```bash
# Trigger agent execution
curl -X POST http://paperclip-api.spooty.io/api/heartbeat/wake \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "...",
    "context": "Test task"
  }'

# View trace in Langfuse UI
# Open https://langfuse.spooty.io
# Go to Traces → find your execution
```

### 4. Test AI Firewall

```bash
# Send a prompt with PII (should be sanitized)
curl -X POST http://paperclip-api.spooty.io/api/heartbeat/wake \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "...",
    "context": "My email is john@example.com and SSN is 123-45-6789"
  }'

# Check logs for sanitization
kubectl logs -n paperclip deployment/paperclip-api | grep "AI Firewall"
```

### 5. Test MCP Tools

```bash
# List available MCP tools for an agent
curl http://paperclip-api.spooty.io/api/mcp/tools?agentId=...

# Execute agent with MCP tools available
curl -X POST http://paperclip-api.spooty.io/api/heartbeat/wake \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "...",
    "context": "List my GitHub repositories"
  }'
```

## Troubleshooting

### Qdrant Connection Issues

```bash
# Check Qdrant is running
kubectl get pods -n ai -l app=qdrant

# Test connection from pod
kubectl exec -it paperclip-api-xxxxx -n paperclip -- \
  curl http://qdrant.ai.svc.cluster.local:6333/health
```

### Langfuse Not Receiving Traces

```bash
# Check Langfuse keys are mounted
kubectl exec -it paperclip-api-xxxxx -n paperclip -- \
  cat /secrets/langfuse/public-key

# Check Langfuse is accessible
kubectl exec -it paperclip-api-xxxxx -n paperclip -- \
  curl http://langfuse.ai.svc.cluster.local:3000/api/public/health
```

### AI Firewall Blocking Legitimate Prompts

Adjust sensitivity or disable specific detectors:

```bash
# Check firewall logs
kubectl logs -n ai deployment/ai-firewall | grep "blocked"

# Disable firewall temporarily
kubectl set env deployment/paperclip-api AI_FIREWALL_ENABLED=false -n paperclip
```

### MCP Tools Not Available

```bash
# Check MCP config is loaded
kubectl exec -it paperclip-api-xxxxx -n paperclip -- env | grep MCP

# Check MCP servers are accessible
kubectl exec -it paperclip-api-xxxxx -n paperclip -- \
  curl http://mcp-github.mcp.svc.cluster.local:8080/health
```

## Monitoring

### Key Metrics

Monitor these in Grafana:

- `paperclip_api_requests_total`: API request count
- `paperclip_heartbeat_runs_total`: Agent execution count
- `paperclip_memory_operations_total`: Vector memory operations
- `paperclip_llm_tokens_total`: Token usage (from Langfuse)
- `paperclip_ai_firewall_blocks_total`: Security blocks

### Logs

```bash
# API logs
kubectl logs -n paperclip deployment/paperclip-api --tail=100 -f

# Structured JSON logs
kubectl logs -n paperclip deployment/paperclip-api -f | jq

# Filter for errors
kubectl logs -n paperclip deployment/paperclip-api -f | grep -i error
```

### Dashboards

Import Grafana dashboards:

1. Paperclip API Overview
2. Agent Execution Metrics
3. LLM Cost Attribution (Langfuse integration)
4. AI Firewall Security Events

## Scaling

### Horizontal Scaling

```bash
# Scale API replicas
kubectl scale deployment/paperclip-api --replicas=3 -n paperclip
```

### Resource Limits

Adjust based on workload:

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "2Gi"
    cpu: "1000m"
```

### Database Performance

- Use connection pooling (built-in)
- Monitor query performance
- Add indexes as needed
- Consider read replicas for reporting

### Vector Memory Performance

- Pre-create collections for known companies
- Use batch operations for bulk imports
- Monitor Qdrant memory usage
- Increase Qdrant replicas if needed

## Backup and Recovery

### Database Backups

```bash
# Automated backups via Velero (configured in STAX)
# Manual backup:
kubectl exec -it postgres-0 -n core -- \
  pg_dump -U paperclip paperclip > paperclip-backup-$(date +%Y%m%d).sql
```

### Vector Memory Backups

```bash
# Qdrant snapshots (automated via Qdrant configuration)
# Manual export via API:
curl -X POST http://qdrant.ai.svc.cluster.local:6333/collections/company_*/snapshots
```

## Security Checklist

- [ ] Database credentials stored in secrets (not ConfigMaps)
- [ ] Langfuse keys stored in secrets
- [ ] AI Firewall enabled for production
- [ ] Authentik forward-auth configured on ingress
- [ ] Network policies restrict pod-to-pod traffic
- [ ] Resource quotas set for namespace
- [ ] Pod security standards enforced
- [ ] Secrets encrypted at rest (Vault integration)
- [ ] Audit logging enabled
- [ ] TLS certificates valid and auto-renewing

## Next Steps

1. **Configure CI/CD**: Set up GitHub Actions for automated deployments
2. **Enable Monitoring**: Import Grafana dashboards and configure alerts
3. **Set Up Backups**: Configure automated backup schedules
4. **Performance Tuning**: Adjust resource limits based on actual usage
5. **Security Hardening**: Enable all security features and review policies
6. **Documentation**: Document company-specific configurations and workflows
