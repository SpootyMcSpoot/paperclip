# MCP (Model Context Protocol) Integration

Enable Paperclip agents to use MCP tools for infrastructure operations.

## What is MCP?

Model Context Protocol (MCP) is a standard for connecting AI agents to external tools and data sources. It provides a unified interface for:

- Infrastructure operations (Kubernetes, GitHub, databases)
- Data queries (Prometheus metrics, logs)
- External services (APIs, webhooks)

## Configuration

Configure MCP servers via environment variables:

### Simple Configuration (Multiple Servers)

```bash
# Format: name:url,name:url,...
MCP_SERVERS=github:http://mcp-github.mcp-services.svc.cluster.local,kubernetes:http://mcp-kubernetes.mcp-services.svc.cluster.local
```

### Individual Server Configuration

```bash
# GitHub operations
MCP_SERVER_GITHUB_URL=http://mcp-github.mcp-services.svc.cluster.local

# Kubernetes operations
MCP_SERVER_KUBERNETES_URL=http://mcp-kubernetes.mcp-services.svc.cluster.local

# PostgreSQL operations
MCP_SERVER_POSTGRES_URL=http://mcp-postgres-server.mcp-services.svc.cluster.local

# Prometheus queries
MCP_SERVER_PROMETHEUS_URL=http://mcp-prometheus.mcp-services.svc.cluster.local
```

### Command-Based MCP Servers

For local MCP servers that run as processes:

```bash
MCP_SERVER_FILESYSTEM_COMMAND=/usr/bin/mcp-filesystem
MCP_SERVER_FILESYSTEM_ARGS=/data
```

## Usage

### List Available Tools

```typescript
import { getMCPManager } from "./mcp-client.js";

const manager = getMCPManager();

// List tools from GitHub MCP server
const tools = await manager.listTools("github");
// [
//   { name: "create_issue", description: "Create a GitHub issue", ... },
//   { name: "list_prs", description: "List pull requests", ... },
// ]
```

### Call a Tool

```typescript
import { getMCPManager } from "./mcp-client.js";

const manager = getMCPManager();

// Create a GitHub issue
const result = await manager.callTool("github", "create_issue", {
  repo: "user/repo",
  title: "Bug report",
  body: "Description of the bug",
});

console.log(result.content[0].text);
// "Created issue #123: Bug report"
```

### Agent Integration

Enable agents to use MCP tools based on their role:

```typescript
// Define agent permissions
const agentPermissions = {
  sre: ["kubernetes", "prometheus"],
  devops: ["github", "kubernetes"],
  dba: ["postgres"],
};

// In agent execution
const allowedServers = agentPermissions[agent.role] || [];

// Discover available tools
const availableTools = [];
for (const serverName of allowedServers) {
  const tools = await manager.listTools(serverName);
  availableTools.push(...tools.map(t => ({ ...t, server: serverName })));
}

// Agent can now call tools
const result = await manager.callTool(
  "kubernetes",
  "get_pods",
  { namespace: "production" }
);
```

## Architecture

```
Paperclip Agent
      │
      ├─> MCPClientManager
      │        │
      │        ├─> MCP Server: GitHub
      │        │    └─ Tools: create_issue, list_prs, merge_pr, ...
      │        │
      │        ├─> MCP Server: Kubernetes
      │        │    └─ Tools: get_pods, describe_pod, get_logs, ...
      │        │
      │        ├─> MCP Server: Prometheus
      │        │    └─ Tools: query, query_range, get_alerts, ...
      │        │
      │        └─> MCP Server: PostgreSQL
      │             └─ Tools: query, list_tables, describe_table, ...
```

## Available MCP Servers (STAX)

| Server | URL | Tools |
|--------|-----|-------|
| GitHub | mcp-github.mcp-services.svc.cluster.local | Issue management, PR operations, repo queries |
| Kubernetes | mcp-kubernetes.mcp-services.svc.cluster.local | Pod operations, logs, deployments, services |
| PostgreSQL | mcp-postgres-server.mcp-services.svc.cluster.local | Query execution, schema inspection |
| Prometheus | mcp-prometheus.mcp-services.svc.cluster.local | Metrics queries, alerts |

## Security

- **Tool Access Control**: Agents can only call tools from servers they have permission for
- **Audit Logging**: All tool calls are logged with agent/company/issue context
- **Read-Only First**: Start with read-only tools, require approval for write operations
- **Network Policies**: MCP servers isolated in separate namespace

## Example Use Cases

### SRE Agent: Check Pod Health

```typescript
const pods = await manager.callTool("kubernetes", "get_pods", {
  namespace: "production",
  labelSelector: "app=api",
});

const metrics = await manager.callTool("prometheus", "query", {
  query: "sum(rate(http_requests_total[5m])) by (pod)",
});
```

### DevOps Agent: Create PR

```typescript
const pr = await manager.callTool("github", "create_pr", {
  repo: "user/repo",
  title: "Update deployment config",
  head: "feat/update-config",
  base: "main",
  body: "Automated update from Paperclip",
});
```

### DBA Agent: Query Database

```typescript
const result = await manager.callTool("postgres", "query", {
  database: "production",
  query: "SELECT count(*) FROM users WHERE created_at > NOW() - INTERVAL '1 day'",
});
```

## Deployment

### Local Development

```bash
# Start local MCP servers or use remote ones
export MCP_SERVER_GITHUB_URL=http://localhost:8080
```

### Kubernetes

```yaml
env:
  - name: MCP_SERVERS
    value: "github:http://mcp-github.mcp-services.svc.cluster.local,kubernetes:http://mcp-kubernetes.mcp-services.svc.cluster.local"
```

## Transport Support

### HTTP Transport (Streamable HTTP)

For remote MCP servers using HTTP endpoints:

```typescript
manager.registerServer({
  name: "github",
  url: "http://mcp-github.mcp-services.svc.cluster.local",
});
```

Uses MCP Streamable HTTP protocol:
- HTTP POST for sending messages
- HTTP GET with Server-Sent Events for receiving messages
- Automatic reconnection with exponential backoff
- Session management and resumption

### Stdio Transport

For local MCP servers running as processes:

```typescript
manager.registerServer({
  name: "filesystem",
  command: "/usr/bin/mcp-filesystem",
  args: ["/data"],
  env: { DEBUG: "true" },
});
```

## Limitations

- Tool execution is synchronous (no streaming)
- No built-in retry/fallback logic for tool calls
- WebSocket transport not yet implemented (use HTTP instead)

## Roadmap

- [x] HTTP transport support (Streamable HTTP)
- [ ] WebSocket transport support
- [ ] Tool call caching
- [ ] Async tool execution
- [ ] Tool call retry logic
- [ ] Built-in rate limiting
- [ ] Tool result validation
- [ ] Permission system integration
