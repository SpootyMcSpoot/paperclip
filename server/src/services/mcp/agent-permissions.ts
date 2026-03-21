/**
 * Agent role to MCP server permissions
 *
 * Defines which MCP servers each agent role can access
 */
export const AGENT_MCP_PERMISSIONS: Record<string, string[]> = {
  // CEO: Read-only access to metrics and status
  ceo: ["prometheus", "github"],

  // CTO: Strategic oversight
  cto: ["github", "prometheus"],

  // SRE: Infrastructure operations
  sre: ["kubernetes", "prometheus"],

  // DevOps: CI/CD and deployments
  devops: ["github", "kubernetes"],

  // DBA: Database operations
  dba: ["postgres"],

  // Security: Audit and compliance
  security: ["kubernetes", "prometheus", "postgres"],

  // Developer: Read-only for context
  developer: ["github"],

  // Default: No MCP access
  default: [],
};

/**
 * Get allowed MCP servers for an agent role
 */
export function getAllowedMCPServers(role: string | null): string[] {
  if (!role) {
    return AGENT_MCP_PERMISSIONS.default;
  }

  return AGENT_MCP_PERMISSIONS[role] || AGENT_MCP_PERMISSIONS.default;
}

/**
 * Check if agent can access an MCP server
 */
export function canAccessMCPServer(role: string | null, serverName: string): boolean {
  const allowed = getAllowedMCPServers(role);
  return allowed.includes(serverName);
}
