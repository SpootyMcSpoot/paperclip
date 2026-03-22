# Paperclip Initial Setup Guide

This guide covers all initial configuration needed to deploy Paperclip with AI stack integrations to the STAX cluster.

## Prerequisites Checklist

### 1. STAX Infrastructure Services

Verify these services are deployed and healthy:

```bash
# Qdrant (Vector Database)
kubectl get pods -n ai -l app=qdrant
kubectl port-forward -n ai svc/qdrant 6333:6333
curl http://localhost:6333/health

# Langfuse (LLM Observability)
kubectl get pods -n ai -l app=langfuse
kubectl port-forward -n ai svc/langfuse 3000:3000
curl http://localhost:3000/api/public/health

# AI Firewall (LLM Security)
kubectl get pods -n ai -l app=ai-firewall
kubectl port-forward -n ai svc/ai-firewall 8000:8000
curl http://localhost:8000/health

# LiteLLM Gateway
kubectl get pods -n ai -l app=litellm
kubectl port-forward -n ai svc/litellm 4000:4000
curl http://localhost:4000/health

# PostgreSQL (Core Database)
kubectl get pods -n core -l app=postgres
```

### 2. MCP Services (Optional)

If using MCP tool integration:

```bash
# Check MCP services namespace
kubectl get namespace mcp

# Check deployed MCP servers
kubectl get pods -n mcp
# Expected: mcp-github, mcp-kubernetes, mcp-prometheus, etc.
```

### 3. Code Graph Service (Optional)

If using semantic code analysis:

```bash
# Check Code Graph deployment
kubectl get pods -n ai -l app=code-graph
kubectl port-forward -n ai svc/code-graph 8097:8097
curl http://localhost:8097/health
```

## Step 1: Database Setup

### Create Paperclip Database

The Pulumi deployment creates a dedicated PostgreSQL instance, but you can also use the shared STAX PostgreSQL:

**Option A: Dedicated PostgreSQL (Deployed by Pulumi)**
- Automatically created by the Paperclip stack
- 10Gi PVC with Longhorn HA
- Automatic snapshots every 6 hours
- Daily backups at 2AM

**Option B: Shared STAX PostgreSQL**

```bash
# Connect to STAX PostgreSQL
kubectl exec -it postgres-0 -n core -- psql -U postgres

# Create database and user
CREATE DATABASE paperclip;
CREATE USER paperclip WITH PASSWORD 'SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE paperclip TO paperclip;
ALTER DATABASE paperclip OWNER TO paperclip;
\q

# Update DATABASE_URL in Pulumi config
pulumi config set --secret database_url 'postgresql://paperclip:SECURE_PASSWORD_HERE@postgres.core.svc.cluster.local:5432/paperclip'
```

## Step 2: Langfuse API Keys

Langfuse requires API keys for trace ingestion. Get them from the UI:

```bash
# Port-forward to Langfuse UI
kubectl port-forward -n ai svc/langfuse 3000:3000

# Open browser to http://localhost:3000
# 1. Log in to Langfuse (check deployment docs for credentials)
# 2. Go to Settings → Projects → Create New Project
#    - Name: "Paperclip Production"
#    - Description: "STAX Paperclip autonomous agent platform"
# 3. Go to Settings → API Keys
# 4. Generate new key pair
#    - Name: "Paperclip Production Keys"
#    - Copy public key (pk-lf-...)
#    - Copy secret key (sk-lf-...)
```

## Step 3: Create Kubernetes Secrets

Create secrets before deploying Paperclip:

```bash
# Create paperclip namespace
kubectl create namespace paperclip

# Langfuse credentials
kubectl create secret generic paperclip-langfuse-credentials \
  --from-literal=public-key='pk-lf-YOUR_PUBLIC_KEY' \
  --from-literal=secret-key='sk-lf-YOUR_SECRET_KEY' \
  -n paperclip

# AI Firewall API key (if authentication is enabled)
kubectl create secret generic paperclip-ai-firewall-credentials \
  --from-literal=api-key='your-ai-firewall-api-key' \
  -n paperclip

# Qdrant API key (if authentication is enabled)
kubectl create secret generic paperclip-qdrant-credentials \
  --from-literal=api-key='your-qdrant-api-key' \
  -n paperclip

# Better Auth secrets (for Paperclip authentication)
kubectl create secret generic paperclip-auth-secrets \
  --from-literal=auth-secret="$(openssl rand -base64 32)" \
  --from-literal=jwt-secret="$(openssl rand -base64 32)" \
  -n paperclip
```

## Step 4: Configure MCP Servers

Create MCP servers configuration file:

```bash
# Create MCP config JSON
cat > mcp-servers.json << 'EOF'
{
  "github": {
    "url": "http://mcp-github.mcp.svc.cluster.local:8080",
    "env": {
      "GITHUB_TOKEN": "ghp_YOUR_GITHUB_PAT"
    }
  },
  "kubernetes": {
    "url": "http://mcp-kubernetes.mcp.svc.cluster.local:8080"
  },
  "prometheus": {
    "url": "http://mcp-prometheus.mcp.svc.cluster.local:8080"
  },
  "postgres": {
    "url": "http://mcp-postgres.mcp.svc.cluster.local:8080",
    "env": {
      "DATABASE_URL": "postgresql://user:pass@postgres.core.svc.cluster.local:5432/stax"
    }
  }
}
EOF

# Create Kubernetes ConfigMap
kubectl create configmap paperclip-mcp-config \
  --from-file=servers.json=mcp-servers.json \
  -n paperclip
```

## Step 5: Pulumi Configuration

Set Pulumi stack configuration:

```bash
cd /var/home/pestilence/repos/stax/pulumi/stacks/21-paperclip

# Set required configuration
pulumi config set domain spooty.io
pulumi config set namespace paperclip
pulumi config set environment production
pulumi config set image ghcr.io/anomalous-ventures/paperclip:latest
pulumi config set admin_email pestilence@spooty.io

# Set secrets
pulumi config set --secret auth_secret "$(openssl rand -base64 32)"
pulumi config set --secret jwt_secret "$(openssl rand -base64 32)"

# Optional: Set custom database URL (if not using bundled PostgreSQL)
# pulumi config set --secret database_url 'postgresql://paperclip:pass@postgres.core.svc.cluster.local:5432/paperclip'
```

## Step 6: Update Pulumi Deployment Module

Add AI service environment variables to `/var/home/pestilence/repos/stax/pulumi/modules/services/paperclip.py`:

```python
# Add to env_vars list in PaperclipService.deploy_resources():

# AI Stack Services
EnvVarArgs(
    name="QDRANT_URL",
    value="http://qdrant.ai.svc.cluster.local:6333",
),
EnvVarArgs(
    name="LANGFUSE_BASE_URL",
    value="http://langfuse.ai.svc.cluster.local:3000",
),
EnvVarArgs(
    name="LANGFUSE_PUBLIC_KEY_PATH",
    value="/secrets/langfuse/public-key",
),
EnvVarArgs(
    name="LANGFUSE_SECRET_KEY_PATH",
    value="/secrets/langfuse/secret-key",
),
EnvVarArgs(
    name="AI_FIREWALL_URL",
    value="http://ai-firewall.ai.svc.cluster.local:8000",
),
EnvVarArgs(
    name="AI_FIREWALL_ENABLED",
    value="true",
),
EnvVarArgs(
    name="CODE_GRAPH_URL",
    value="http://code-graph.ai.svc.cluster.local:8097",
),
EnvVarArgs(
    name="LITELLM_BASE_URL",
    value="http://litellm.ai.svc.cluster.local:4000",
),
EnvVarArgs(
    name="EMBEDDING_MODEL",
    value="text-embedding-3-small",
),
EnvVarArgs(
    name="EMBEDDING_DIMENSIONS",
    value="1536",
),

# MCP Configuration (loaded from ConfigMap)
EnvVarArgs(
    name="MCP_SERVERS_CONFIG_PATH",
    value="/config/mcp/servers.json",
),
```

Also add volume mounts for secrets and config:

```python
# Add to volume_mounts list:
VolumeMountArgs(
    name="langfuse-credentials",
    mount_path="/secrets/langfuse",
    read_only=True,
),
VolumeMountArgs(
    name="mcp-config",
    mount_path="/config/mcp",
    read_only=True,
),

# Add to volumes list:
VolumeArgs(
    name="langfuse-credentials",
    secret=k8s.core.v1.SecretVolumeSourceArgs(
        secret_name="paperclip-langfuse-credentials",
    ),
),
VolumeArgs(
    name="mcp-config",
    config_map=k8s.core.v1.ConfigMapVolumeSourceArgs(
        name="paperclip-mcp-config",
    ),
),
```

## Step 7: Deploy Paperclip

```bash
cd /var/home/pestilence/repos/stax/pulumi/stacks/21-paperclip

# Activate Pulumi environment
source ../../venv/bin/activate
export KUBECONFIG=~/.kube/microk8s-config
export PULUMI_CONFIG_PASSPHRASE="stax-stage"

# Preview deployment
pulumi preview

# Deploy
pulumi up

# Check deployment
kubectl get pods -n paperclip
kubectl logs -n paperclip deployment/paperclip -f
```

## Step 8: Configure Traefik Ingress

Create IngressRoute for external access:

```yaml
# File: ingress-route.yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: paperclip
  namespace: paperclip
  annotations:
    kubernetes.io/ingress.class: traefik
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`paperclip.spooty.io`)
      kind: Rule
      services:
        - name: paperclip
          port: 3100
      middlewares:
        - name: authentik-forward-auth
          namespace: auth
  tls:
    certResolver: cloudflare
```

Apply:

```bash
kubectl apply -f ingress-route.yaml
```

## Step 9: Initialize Vector Memory

Test Qdrant connection and create initial collections:

```bash
# Port-forward to Paperclip API
kubectl port-forward -n paperclip svc/paperclip 3100:3100

# Check AI services status
curl http://localhost:3100/api/services/status

# Initialize vector collections (auto-created on first use)
# Collections are created per-company when first memory is stored
```

## Step 10: Verify Integrations

### Test Each AI Service

```bash
# 1. Qdrant (Vector Memory)
curl -X POST http://localhost:3100/api/memory \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "test-company-id",
    "content": "Test memory for vector storage",
    "metadata": {"type": "test"}
  }'

# 2. Langfuse (Check traces in UI)
# - Trigger an agent execution
# - Open https://langfuse.spooty.io
# - Navigate to project "Paperclip Production"
# - Check for new traces

# 3. AI Firewall
curl -X POST http://localhost:3100/api/heartbeat/wake \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent-id",
    "context": "My SSN is 123-45-6789"
  }'
# Check logs for PII sanitization

# 4. MCP Tools
curl http://localhost:3100/api/mcp/tools?agentId=test-agent-id
# Should return available tools based on agent role

# 5. Code Graph
curl http://localhost:3100/api/code-graph/health
```

### Check Logs

```bash
# Paperclip API logs
kubectl logs -n paperclip deployment/paperclip --tail=100 -f

# Filter for AI service connections
kubectl logs -n paperclip deployment/paperclip | grep -E "(Qdrant|Langfuse|AI Firewall|MCP|Code Graph)"

# Expected output:
# "Qdrant vector memory ready"
# "Langfuse observability enabled"
# "AI Firewall connected"
# "MCP tools enabled"
# "Code Graph client initialized"
```

## Step 11: Create Test Company and Agent

```bash
# Create test company
curl -X POST http://localhost:3100/api/companies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "STAX Test Company",
    "domain": "stax-test.spooty.io"
  }'

# Create CEO agent
curl -X POST http://localhost:3100/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "STAX CEO",
    "role": "ceo",
    "runtime": "litellm_gateway",
    "companyId": "<company-id-from-above>"
  }'

# Wake agent for test execution
curl -X POST http://localhost:3100/api/heartbeat/wake \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "<agent-id-from-above>",
    "context": "Analyze platform status and report key metrics"
  }'
```

## Step 12: Monitoring and Alerts

### Import Grafana Dashboards

```bash
# Dashboards should be created for:
# 1. Paperclip API Metrics
# 2. Agent Execution Performance
# 3. LLM Cost Attribution (Langfuse)
# 4. AI Firewall Security Events
# 5. Vector Memory Usage
```

### Set Up Alerts

Configure AlertManager rules:

```yaml
# File: paperclip-alerts.yaml
groups:
  - name: paperclip
    rules:
      - alert: PaperclipAPIDown
        expr: up{job="paperclip-api"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Paperclip API is down"

      - alert: PaperclipHighLLMCost
        expr: rate(paperclip_llm_tokens_total[1h]) > 1000000
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "High LLM token usage detected"

      - alert: PaperclipAIFirewallBlocks
        expr: rate(paperclip_ai_firewall_blocks_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High rate of AI Firewall blocks"
```

## Configuration Checklist

Use this checklist to ensure all configurations are complete:

- [ ] STAX AI services deployed and healthy
- [ ] Paperclip namespace created
- [ ] Database created (dedicated or shared PostgreSQL)
- [ ] Langfuse API keys generated and stored in secret
- [ ] AI Firewall API key stored in secret (if required)
- [ ] Qdrant API key stored in secret (if required)
- [ ] Better Auth secrets created
- [ ] MCP servers configured in ConfigMap
- [ ] Pulumi configuration set (domain, namespace, image, etc.)
- [ ] Pulumi module updated with AI service env vars
- [ ] Pulumi module updated with secret/config volume mounts
- [ ] Paperclip deployed via Pulumi
- [ ] IngressRoute configured with Authentik forward-auth
- [ ] TLS certificate obtained and valid
- [ ] Vector memory tested (Qdrant connection)
- [ ] LLM observability tested (Langfuse traces)
- [ ] AI Firewall tested (PII detection)
- [ ] MCP tools tested (tool discovery)
- [ ] Code Graph tested (health check)
- [ ] Test company and agent created
- [ ] Grafana dashboards imported
- [ ] AlertManager rules configured
- [ ] Backup schedules verified (Longhorn snapshots)
- [ ] Documentation updated with deployment details

## Troubleshooting Common Issues

### Issue: Langfuse keys not mounted

```bash
# Check secret exists
kubectl get secret paperclip-langfuse-credentials -n paperclip

# Check pod has volume mount
kubectl describe pod -n paperclip <pod-name> | grep -A5 "Mounts:"

# Check files are readable
kubectl exec -it -n paperclip <pod-name> -- cat /secrets/langfuse/public-key
```

### Issue: Qdrant connection timeout

```bash
# Check Qdrant is accessible from paperclip pod
kubectl exec -it -n paperclip <pod-name> -- \
  curl http://qdrant.ai.svc.cluster.local:6333/health

# Check network policies
kubectl get networkpolicies -n paperclip
kubectl get networkpolicies -n ai
```

### Issue: MCP tools not available

```bash
# Check MCP config is loaded
kubectl exec -it -n paperclip <pod-name> -- \
  cat /config/mcp/servers.json

# Check MCP servers are accessible
kubectl exec -it -n paperclip <pod-name> -- \
  curl http://mcp-github.mcp.svc.cluster.local:8080/health
```

### Issue: AI Firewall blocking legitimate prompts

```bash
# Check AI Firewall logs
kubectl logs -n ai deployment/ai-firewall | grep -i blocked

# Temporarily disable
kubectl set env deployment/paperclip AI_FIREWALL_ENABLED=false -n paperclip

# Restart pods
kubectl rollout restart deployment/paperclip -n paperclip
```

## Next Steps

After initial setup:

1. **Configure CI/CD**: Set up GitHub Actions for automated builds and deployments
2. **Production Hardening**: Review security policies, resource limits, and backup schedules
3. **Performance Tuning**: Adjust resource requests/limits based on actual usage
4. **Documentation**: Document company-specific configurations and workflows
5. **Training**: Onboard team on Paperclip usage and agent management
6. **Monitoring**: Set up custom dashboards and alerts based on your SLAs
7. **Scaling**: Plan horizontal scaling strategy for high-volume workloads

## Support

For issues or questions:

- **Documentation**: See `/docs` directory for detailed guides
- **Logs**: Check application logs with `kubectl logs`
- **Health Checks**: Use `/health` and `/api/services/status` endpoints
- **Community**: Check GitHub issues and discussions
