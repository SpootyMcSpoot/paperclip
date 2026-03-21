# MCP Integration TODO

## Completed ✅
- [x] MCP SDK integration
- [x] MCPClientManager class
- [x] Tool discovery (listTools)
- [x] Tool execution (callTool)
- [x] Agent permission system
- [x] Environment configuration

## Remaining Work

### 1. HTTP/WebSocket Transport Support
**Priority: CRITICAL**

Current implementation only supports stdio (command-line) MCP servers. STAX deployment uses HTTP-based MCP servers.

Need to implement:
```typescript
// HTTP transport for remote MCP servers
import { HttpClientTransport } from "@modelcontextprotocol/sdk/client/http.js";

if (config.url) {
  const transport = new HttpClientTransport({
    url: config.url,
    headers: config.headers,
  });
  await client.connect(transport);
}
```

Check MCP SDK documentation for correct HTTP transport implementation.

### 2. Server Integration
**Priority: HIGH**

Add to `server/src/index.ts`:
```typescript
import { initializeMCPServers, shutdownMCP, isMCPConfigured } from "./services/mcp/index.js";

// On startup
if (isMCPConfigured()) {
  initializeMCPServers();
  console.log("MCP tools enabled");
}

// On shutdown
process.on("SIGTERM", async () => {
  await shutdownMCP();
  process.exit(0);
});
```

### 3. Agent Execution Integration
**Priority: HIGH**

Provide MCP tools to agents during execution:

```typescript
// In agent execution context
import { getMCPManager, getAllowedMCPServers } from "../services/mcp/index.js";

const manager = getMCPManager();
const allowedServers = getAllowedMCPServers(agent.role);

// Discover available tools
const availableTools = [];
for (const serverName of allowedServers) {
  const tools = await manager.listTools(serverName);
  availableTools.push(...tools.map(t => ({
    ...t,
    server: serverName,
    call: (args) => manager.callTool(serverName, t.name, args),
  })));
}

// Pass tools to agent in prompt or tool registry
const toolDescriptions = availableTools
  .map(t => `${t.server}.${t.name}: ${t.description}`)
  .join("\n");

const promptWithTools = `
Available tools:
${toolDescriptions}

To call a tool, use: TOOL_CALL(server, tool_name, {args})
`;
```

### 4. Tool Call Logging
**Priority: MEDIUM**

Log all MCP tool calls for audit:

```typescript
// In database schema
export const mcpToolCalls = pgTable("mcp_tool_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  agentId: uuid("agent_id").notNull(),
  serverName: text("server_name").notNull(),
  toolName: text("tool_name").notNull(),
  args: jsonb("args").notNull(),
  result: jsonb("result"),
  isError: boolean("is_error").notNull().default(false),
  issueId: uuid("issue_id"),
  heartbeatRunId: uuid("heartbeat_run_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Log every tool call
await db.insert(mcpToolCalls).values({
  companyId,
  agentId,
  serverName,
  toolName,
  args,
  result,
  isError: result.isError,
  issueId,
  heartbeatRunId,
});
```

### 5. UI for Tool Calls
**Priority: MEDIUM**

Add UI to:
- Browse tool call history
- View tool call details
- Retry failed tool calls
- Manage agent permissions

### 6. Tool Call Retry Logic
**Priority: LOW**

Implement automatic retry for transient failures:
```typescript
async function callToolWithRetry(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  maxRetries = 3,
): Promise<MCPToolResult | null> {
  for (let i = 0; i < maxRetries; i++) {
    const result = await manager.callTool(serverName, toolName, args);
    if (result && !result.isError) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
  }
  return null;
}
```

### 7. Tool Result Validation
**Priority: LOW**

Validate tool results against schema:
```typescript
import Ajv from "ajv";

const ajv = new Ajv();

function validateToolResult(tool: MCPTool, result: unknown): boolean {
  // Define result schema based on tool
  const schema = {
    type: "object",
    properties: {
      content: { type: "array" },
    },
    required: ["content"],
  };

  const validate = ajv.compile(schema);
  return validate(result);
}
```

### 8. Rate Limiting
**Priority: LOW**

Prevent tool call abuse:
```typescript
// Per-agent rate limiting
const toolCallLimits = {
  github: { calls: 100, window: 3600 }, // 100 calls per hour
  kubernetes: { calls: 1000, window: 3600 },
  postgres: { calls: 50, window: 3600 },
};

// Check before calling
const recent = await db
  .select()
  .from(mcpToolCalls)
  .where(and(
    eq(mcpToolCalls.agentId, agentId),
    eq(mcpToolCalls.serverName, serverName),
    gte(mcpToolCalls.createdAt, new Date(Date.now() - window * 1000))
  ));

if (recent.length >= limit) {
  throw new Error("Rate limit exceeded");
}
```

### 9. Approval Workflow for Write Operations
**Priority: MEDIUM**

Require human approval for destructive operations:

```typescript
const WRITE_TOOLS = [
  "github.create_issue",
  "github.merge_pr",
  "kubernetes.delete_pod",
  "postgres.execute",
];

async function requireApproval(
  toolCall: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  if (!WRITE_TOOLS.includes(toolCall)) {
    return true; // Read-only, auto-approve
  }

  // Create approval request
  const approval = await db.insert(approvals).values({
    type: "mcp_tool_call",
    data: { tool: toolCall, args },
    status: "pending",
  });

  // Wait for approval (webhook or polling)
  // ...
}
```

## Testing

### Unit Tests
- [ ] MCP client connection
- [ ] Tool discovery
- [ ] Tool execution
- [ ] Permission checking
- [ ] Error handling

### Integration Tests
- [ ] Connect to real MCP server
- [ ] List tools from server
- [ ] Call tools with args
- [ ] Handle tool errors
- [ ] Multi-server management

### E2E Tests
- [ ] Agent uses MCP tools
- [ ] Permission enforcement works
- [ ] Tool calls are logged
- [ ] Approval workflow functions

## Documentation

- [x] README for MCP service
- [ ] Agent integration guide
- [ ] Tool development guide
- [ ] Security best practices
- [ ] Troubleshooting guide

## Security

- [x] Permission system by agent role
- [ ] Audit logging for all tool calls
- [ ] Rate limiting
- [ ] Approval workflow for write operations
- [ ] Secret sanitization in logs
- [ ] Network isolation for MCP servers

## Performance

- [ ] Tool call caching (same args = cached result)
- [ ] Connection pooling
- [ ] Async tool execution
- [ ] Batch tool calls

## Known Limitations

1. **No HTTP transport**: Only stdio-based servers supported
   - Blocks STAX integration (HTTP-based MCP servers)
   - Need to implement HTTP/WebSocket transport

2. **Synchronous only**: No streaming tool calls
   - Long-running tools block execution
   - Need async execution support

3. **No connection pooling**: New connection per call
   - Inefficient for frequent tool calls
   - Need connection reuse

4. **No result caching**: Same tool call executes twice
   - Wastes resources
   - Need caching layer
