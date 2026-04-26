import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StapleApiClient } from "./client.js";
import { readConfigFromEnv, type StapleMcpConfig } from "./config.js";
import { createToolDefinitions } from "./tools.js";

export function createStapleMcpServer(config: StapleMcpConfig = readConfigFromEnv()) {
  const server = new McpServer({
    name: "staple",
    version: "0.1.0",
  });

  const client = new StapleApiClient(config);
  const tools = createToolDefinitions(client);
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema.shape, tool.execute);
  }

  return {
    server,
    tools,
    client,
  };
}

export async function runServer(config: StapleMcpConfig = readConfigFromEnv()) {
  const { server } = createStapleMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
