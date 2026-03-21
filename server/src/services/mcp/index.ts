export {
  getMCPManager,
  initializeMCPServers,
  isMCPConfigured,
  shutdownMCP,
} from "./mcp-client.js";

export type {
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
} from "./mcp-client.js";

export {
  getAllowedMCPServers,
  canAccessMCPServer,
  AGENT_MCP_PERMISSIONS,
} from "./agent-permissions.js";
