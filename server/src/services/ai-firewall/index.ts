export {
  checkPrompt,
  checkResponse,
  isAIFirewallConfigured,
  isAIFirewallEnabled,
  checkAIFirewallHealth,
  getFirewallStats,
} from "./firewall-client.js";

export type {
  FirewallCheckRequest,
  FirewallCheckResponse,
  FirewallResponseCheck,
  AIFirewallConfig,
} from "./firewall-client.js";
