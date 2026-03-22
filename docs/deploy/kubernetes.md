# Kubernetes Deployment Guide

This guide covers deploying Paperclip to a Kubernetes cluster with optional AI service integrations.

## Prerequisites

- Kubernetes cluster (1.24+)
- `kubectl` configured with cluster access
- PostgreSQL database (in-cluster or external)
- (Optional) AI services deployed (Qdrant, Langfuse, etc.)

## Architecture

```
Internet → Ingress Controller → Paperclip Service → PostgreSQL
                                      ↓
                          (Optional) AI Services
                          - Qdrant (Vector Memory)
                          - Langfuse (Observability)
                          - AI Firewall (Security)
                          - MCP Gateway (Tools)
```

## Quick Start

### 1. Create Namespace

```bash
kubectl create namespace paperclip
```

### 2. Database Setup

**Option A: External PostgreSQL**

Create database and user in your PostgreSQL instance:

```sql
CREATE DATABASE paperclip;
CREATE USER paperclip WITH PASSWORD 'secure-password-here';
GRANT ALL PRIVILEGES ON DATABASE paperclip TO paperclip;
```

**Option B: In-Cluster PostgreSQL**

Deploy a PostgreSQL StatefulSet (example in `examples/postgres.yaml`).

### 3. Create Secrets

```bash
# Database credentials
kubectl create secret generic paperclip-db \
  --from-literal=url='postgresql://paperclip:PASSWORD@postgres-service:5432/paperclip' \
  -n paperclip

# Application secrets
kubectl create secret generic paperclip-auth \
  --from-literal=auth-secret="$(openssl rand -base64 32)" \
  --from-literal=jwt-secret="$(openssl rand -base64 32)" \
  -n paperclip
```

### 4. Configure AI Services (Optional)

If using AI services, create additional secrets:

```bash
# Langfuse (LLM Observability)
kubectl create secret generic paperclip-langfuse \
  --from-literal=public-key='your-public-key' \
  --from-literal=secret-key='your-secret-key' \
  -n paperclip

# Qdrant (Vector Memory)
# kubectl create secret generic paperclip-qdrant \
#   --from-literal=api-key='your-api-key' \
#   -n paperclip

# AI Firewall (Security)
# kubectl create secret generic paperclip-ai-firewall \
#   --from-literal=api-key='your-api-key' \
#   -n paperclip
```

### 5. Deploy Paperclip

Create deployment manifest (`paperclip-deployment.yaml`):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: paperclip
  namespace: paperclip
spec:
  replicas: 2
  selector:
    matchLabels:
      app: paperclip
  template:
    metadata:
      labels:
        app: paperclip
    spec:
      containers:
      - name: paperclip
        image: ghcr.io/anomalous-ventures/paperclip:latest
        ports:
        - containerPort: 3100
          name: http
        env:
        # Core configuration
        - name: PORT
          value: "3100"
        - name: SERVE_UI
          value: "true"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: paperclip-db
              key: url
        - name: BETTER_AUTH_SECRET
          valueFrom:
            secretKeyRef:
              name: paperclip-auth
              key: auth-secret
        - name: PAPERCLIP_AGENT_JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: paperclip-auth
              key: jwt-secret

        # AI Services (optional - uncomment to enable)
        # Qdrant (Vector Memory)
        # - name: QDRANT_URL
        #   value: "http://qdrant-service:6333"

        # Langfuse (LLM Observability)
        # - name: LANGFUSE_BASE_URL
        #   value: "http://langfuse-service:3000"
        # - name: LANGFUSE_PUBLIC_KEY_PATH
        #   value: "/secrets/langfuse/public-key"
        # - name: LANGFUSE_SECRET_KEY_PATH
        #   value: "/secrets/langfuse/secret-key"

        # AI Firewall (Security)
        # - name: AI_FIREWALL_URL
        #   value: "http://ai-firewall-service:8000"

        # MCP (Tool Integration)
        # - name: MCP_SERVERS
        #   value: '{"github":{"url":"http://mcp-github:8080"}}'

        # Embedding Service
        # - name: LITELLM_BASE_URL
        #   value: "http://litellm-service:4000"
        # - name: EMBEDDING_MODEL
        #   value: "text-embedding-3-small"

        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"

        livenessProbe:
          httpGet:
            path: /health
            port: 3100
          initialDelaySeconds: 30
          periodSeconds: 10

        readinessProbe:
          httpGet:
            path: /health
            port: 3100
          initialDelaySeconds: 10
          periodSeconds: 5

        # Volume mounts for AI service secrets (optional)
        # volumeMounts:
        # - name: langfuse-credentials
        #   mountPath: /secrets/langfuse
        #   readOnly: true

      # Volumes for AI service secrets (optional)
      # volumes:
      # - name: langfuse-credentials
      #   secret:
      #     secretName: paperclip-langfuse

---
apiVersion: v1
kind: Service
metadata:
  name: paperclip
  namespace: paperclip
spec:
  selector:
    app: paperclip
  ports:
  - port: 3100
    targetPort: 3100
    name: http
  type: ClusterIP
```

Apply the manifest:

```bash
kubectl apply -f paperclip-deployment.yaml
```

### 6. Configure Ingress

Example using nginx-ingress:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: paperclip
  namespace: paperclip
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - paperclip.example.com
    secretName: paperclip-tls
  rules:
  - host: paperclip.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: paperclip
            port:
              number: 3100
```

## Environment Variables Reference

### Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `PORT` | No | `3100` | Server port |
| `SERVE_UI` | No | `false` | Enable built-in web UI |
| `BETTER_AUTH_SECRET` | Yes | - | Authentication secret |
| `PAPERCLIP_AGENT_JWT_SECRET` | Yes | - | JWT signing secret |

### AI Services (Optional)

| Variable | Description | Example |
|----------|-------------|---------|
| `QDRANT_URL` | Qdrant vector database endpoint | `http://qdrant:6333` |
| `QDRANT_API_KEY` | Qdrant API key (if auth enabled) | - |
| `LANGFUSE_BASE_URL` | Langfuse observability endpoint | `http://langfuse:3000` |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public API key | `pk-lf-...` |
| `LANGFUSE_SECRET_KEY` | Langfuse secret API key | `sk-lf-...` |
| `AI_FIREWALL_URL` | AI Firewall endpoint | `http://ai-firewall:8000` |
| `AI_FIREWALL_ENABLED` | Enable AI Firewall checks | `true` |
| `CODE_GRAPH_URL` | Code Graph endpoint | `http://code-graph:8097` |
| `LITELLM_BASE_URL` | LiteLLM Gateway for embeddings | `http://litellm:4000` |
| `EMBEDDING_MODEL` | Embedding model name | `text-embedding-3-small` |
| `EMBEDDING_DIMENSIONS` | Embedding vector dimensions | `1536` |

See `.env.example` for complete list.

## AI Services Integration

### Qdrant (Vector Memory)

Enables semantic memory storage for agents.

**Deployment**: Deploy Qdrant in your cluster or use hosted service.

**Configuration**:
```bash
export QDRANT_URL=http://qdrant-service:6333
# Optional: export QDRANT_API_KEY=your-key
```

**Verification**:
```bash
curl http://paperclip:3100/api/memory/health
```

### Langfuse (LLM Observability)

Enables LLM call tracing and cost tracking.

**Deployment**: Deploy Langfuse or use hosted service.

**Setup**:
1. Create project in Langfuse UI
2. Generate API keys (Settings → API Keys)
3. Store keys in Kubernetes secret
4. Configure environment variables

**Verification**:
```bash
# Trigger an agent execution
# Check traces in Langfuse UI
```

### AI Firewall (Security)

Enables prompt injection detection and PII sanitization.

**Deployment**: Deploy AI Firewall service.

**Configuration**:
```bash
export AI_FIREWALL_URL=http://ai-firewall-service:8000
export AI_FIREWALL_ENABLED=true
```

**Verification**:
```bash
# Send prompt with PII
# Check logs for sanitization
kubectl logs -n paperclip deployment/paperclip | grep "AI Firewall"
```

### MCP (Model Context Protocol)

Enables agents to use external tools (GitHub, Kubernetes, etc.).

**Configuration**:
```json
{
  "github": {"url": "http://mcp-github:8080"},
  "kubernetes": {"url": "http://mcp-kubernetes:8080"}
}
```

Store in ConfigMap and mount to container.

## Verification

### Health Check

```bash
kubectl port-forward -n paperclip svc/paperclip 3100:3100
curl http://localhost:3100/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected"
}
```

### Check Logs

```bash
kubectl logs -n paperclip deployment/paperclip --tail=100 -f
```

### Test API

```bash
# Create test company
curl -X POST http://localhost:3100/api/companies \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Company"}'
```

## Scaling

### Horizontal Scaling

```bash
kubectl scale deployment/paperclip --replicas=3 -n paperclip
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

## Monitoring

### Metrics

Paperclip exposes Prometheus metrics at `/metrics`.

### Grafana Dashboards

Import example dashboards from `examples/grafana/`.

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl get pods -n paperclip

# Check events
kubectl describe pod <pod-name> -n paperclip

# Check logs
kubectl logs <pod-name> -n paperclip
```

### Database Connection Issues

```bash
# Test database connectivity from pod
kubectl exec -it <pod-name> -n paperclip -- \
  psql $DATABASE_URL -c "SELECT 1"
```

### AI Service Connection Issues

```bash
# Test Qdrant connection
kubectl exec -it <pod-name> -n paperclip -- \
  curl http://qdrant-service:6333/health

# Test Langfuse connection
kubectl exec -it <pod-name> -n paperclip -- \
  curl http://langfuse-service:3000/api/public/health
```

## Backup and Recovery

### Database Backups

Use PostgreSQL backup tools:

```bash
# Automated backups via Kubernetes CronJob
# See examples/backup-cronjob.yaml
```

### Vector Memory Backups

Qdrant supports snapshots via API:

```bash
curl -X POST http://qdrant-service:6333/collections/{collection}/snapshots
```

## Security Checklist

- [ ] Database credentials stored in secrets (not ConfigMaps)
- [ ] API keys stored in secrets
- [ ] TLS enabled on ingress
- [ ] Network policies restrict pod-to-pod traffic
- [ ] Resource quotas set for namespace
- [ ] Pod security standards enforced
- [ ] Regular security updates applied

## Next Steps

1. Configure monitoring and alerting
2. Set up automated backups
3. Tune resource limits based on usage
4. Configure authentication provider (OAuth, OIDC, etc.)
5. Set up CI/CD pipeline for deployments

## Support

- **Documentation**: See `/docs` for detailed guides
- **Issues**: https://github.com/Anomalous-Ventures/paperclip/issues
- **Community**: https://github.com/Anomalous-Ventures/paperclip/discussions
