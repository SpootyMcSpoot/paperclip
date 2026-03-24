import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn } from "child_process";

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP tool call result
 */
export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
}

/**
 * MCP client manager
 */
export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private serverConfigs: Map<string, MCPServerConfig> = new Map();

  /**
   * Register an MCP server
   */
  registerServer(config: MCPServerConfig): void {
    this.serverConfigs.set(config.name, config);
  }

  /**
   * Get or create MCP client for a server
   */
  private async getClient(serverName: string): Promise<Client | null> {
    // Check if client already exists
    if (this.clients.has(serverName)) {
      return this.clients.get(serverName)!;
    }

    // Get server config
    const config = this.serverConfigs.get(serverName);
    if (!config) {
      console.error(`MCP server not found: ${serverName}`);
      return null;
    }

    try {
      // Create client
      const client = new Client({
        name: "staple-client",
        version: "1.0.0",
      });

      // Connect via HTTP (remote MCP servers)
      if (config.url) {
        const url = new URL(config.url);
        const transport = new StreamableHTTPClientTransport(url, {
          requestInit: {
            // Add any custom headers if needed
            headers: config.env ? config.env : {},
          },
        });

        await client.connect(transport);
        this.clients.set(serverName, client);
        return client;
      }

      // Connect via stdio (command-based MCP servers)
      if (config.command) {
        const childProcess = spawn(config.command, config.args || [], {
          env: { ...process.env, ...config.env },
          stdio: ["pipe", "pipe", "pipe"],
        });

        const transport = new StdioClientTransport({
          reader: childProcess.stdout,
          writer: childProcess.stdin,
        } as any);

        await client.connect(transport);
        this.clients.set(serverName, client);
        return client;
      }

      console.error(
        `MCP server ${serverName} has no supported transport (command or url)`,
      );
      return null;
    } catch (err) {
      console.error(`Failed to connect to MCP server ${serverName}:`, err);
      return null;
    }
  }

  /**
   * List available tools from a server
   */
  async listTools(serverName: string): Promise<MCPTool[]> {
    const client = await this.getClient(serverName);
    if (!client) {
      return [];
    }

    try {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as MCPTool["inputSchema"],
      }));
    } catch (err) {
      console.error(`Failed to list tools from ${serverName}:`, err);
      return [];
    }
  }

  /**
   * Call an MCP tool
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult | null> {
    const client = await this.getClient(serverName);
    if (!client) {
      return null;
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      return result as MCPToolResult;
    } catch (err) {
      console.error(`Failed to call tool ${toolName} on ${serverName}:`, err);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Close all MCP clients
   */
  async closeAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
      } catch (err) {
        console.error(`Failed to close MCP client ${name}:`, err);
      }
    }
    this.clients.clear();
  }
}

/**
 * Global MCP client manager instance
 */
let mcpManager: MCPClientManager | null = null;

/**
 * Get or create global MCP client manager
 */
export function getMCPManager(): MCPClientManager {
  if (!mcpManager) {
    mcpManager = new MCPClientManager();
  }
  return mcpManager;
}

/**
 * Initialize MCP servers from environment configuration
 */
export function initializeMCPServers(): void {
  const manager = getMCPManager();

  // Parse MCP server configuration from environment
  // Format: MCP_SERVERS=github:http://mcp-github.mcp-services.svc.cluster.local,kubernetes:http://...
  const serversConfig = process.env.MCP_SERVERS;
  if (serversConfig) {
    const servers = serversConfig.split(",");
    for (const serverDef of servers) {
      const [name, url] = serverDef.split(":");
      if (name && url) {
        manager.registerServer({ name, url });
      }
    }
  }

  // Individual server environment variables
  // Format: MCP_SERVER_GITHUB_URL=http://...
  const envVars = Object.keys(process.env);
  for (const key of envVars) {
    if (key.startsWith("MCP_SERVER_") && key.endsWith("_URL")) {
      const serverName = key
        .replace("MCP_SERVER_", "")
        .replace("_URL", "")
        .toLowerCase();
      const url = process.env[key];
      if (url) {
        manager.registerServer({ name: serverName, url });
      }
    }
  }
}

/**
 * Check if MCP is configured
 */
export function isMCPConfigured(): boolean {
  return !!(
    process.env.MCP_SERVERS ||
    Object.keys(process.env).some((key) => key.startsWith("MCP_SERVER_"))
  );
}

/**
 * Shutdown MCP manager
 */
export async function shutdownMCP(): Promise<void> {
  if (mcpManager) {
    await mcpManager.closeAll();
    mcpManager = null;
  }
}
