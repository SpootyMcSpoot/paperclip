import { readFileSync } from "fs";

/**
 * AI Firewall configuration
 */
export interface AIFirewallConfig {
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
}

/**
 * Firewall check request
 */
export interface FirewallCheckRequest {
  prompt: string;
  model?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Firewall check response
 */
export interface FirewallCheckResponse {
  allowed: boolean;
  blocked: boolean;
  reason?: string;
  detections?: Array<{
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    confidence: number;
  }>;
  sanitizedPrompt?: string;
  requestId?: string;
}

/**
 * Firewall response validation
 */
export interface FirewallResponseCheck {
  allowed: boolean;
  blocked: boolean;
  reason?: string;
  detections?: Array<{
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
  }>;
}

let firewallConfig: AIFirewallConfig | null = null;

/**
 * Get AI Firewall configuration from environment
 */
function getFirewallConfig(): AIFirewallConfig {
  if (firewallConfig) {
    return firewallConfig;
  }

  const baseUrl = process.env.AI_FIREWALL_URL || "http://localhost:8000";
  const enabled = process.env.AI_FIREWALL_ENABLED !== "false"; // Enabled by default if URL is set

  // Try to read API key from secret file or environment
  let apiKey: string | undefined;

  const apiKeyPath = process.env.AI_FIREWALL_API_KEY_PATH;
  if (apiKeyPath) {
    try {
      apiKey = readFileSync(apiKeyPath, "utf-8").trim();
    } catch (err) {
      // Ignore - will fall back to environment variable
    }
  }

  if (!apiKey) {
    apiKey = process.env.AI_FIREWALL_API_KEY;
  }

  firewallConfig = {
    baseUrl,
    apiKey,
    enabled: enabled && isAIFirewallConfigured(),
  };

  return firewallConfig;
}

/**
 * Check if AI Firewall is configured
 *
 * @returns true if AI_FIREWALL_URL is set
 */
export function isAIFirewallConfigured(): boolean {
  return !!process.env.AI_FIREWALL_URL;
}

/**
 * Check if AI Firewall is enabled
 *
 * @returns true if configured and not explicitly disabled
 */
export function isAIFirewallEnabled(): boolean {
  const config = getFirewallConfig();
  return config.enabled;
}

/**
 * Check prompt with AI Firewall before sending to LLM
 *
 * @param request - Firewall check request
 * @returns Firewall check response
 */
export async function checkPrompt(
  request: FirewallCheckRequest,
): Promise<FirewallCheckResponse> {
  const config = getFirewallConfig();

  if (!config.enabled) {
    // Firewall disabled - allow all
    return {
      allowed: true,
      blocked: false,
    };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.baseUrl}/api/check/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.error(`AI Firewall check failed: ${response.status} ${response.statusText}`);
      // On firewall error, allow by default (fail-open)
      return {
        allowed: true,
        blocked: false,
        reason: "Firewall unavailable",
      };
    }

    const result = await response.json();
    return result as FirewallCheckResponse;
  } catch (err) {
    console.error("AI Firewall check error:", err);
    // On error, allow by default (fail-open)
    return {
      allowed: true,
      blocked: false,
      reason: "Firewall error",
    };
  }
}

/**
 * Check LLM response with AI Firewall before returning to agent
 *
 * @param response - LLM response text
 * @param metadata - Additional context
 * @returns Firewall check response
 */
export async function checkResponse(
  response: string,
  metadata?: Record<string, unknown>,
): Promise<FirewallResponseCheck> {
  const config = getFirewallConfig();

  if (!config.enabled) {
    // Firewall disabled - allow all
    return {
      allowed: true,
      blocked: false,
    };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const result = await fetch(`${config.baseUrl}/api/check/response`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        response,
        metadata,
      }),
    });

    if (!result.ok) {
      console.error(`AI Firewall response check failed: ${result.status} ${result.statusText}`);
      // On firewall error, allow by default (fail-open)
      return {
        allowed: true,
        blocked: false,
        reason: "Firewall unavailable",
      };
    }

    const data = await result.json();
    return data as FirewallResponseCheck;
  } catch (err) {
    console.error("AI Firewall response check error:", err);
    // On error, allow by default (fail-open)
    return {
      allowed: true,
      blocked: false,
      reason: "Firewall error",
    };
  }
}

/**
 * Health check for AI Firewall
 *
 * @returns true if firewall is accessible, false otherwise
 */
export async function checkAIFirewallHealth(): Promise<boolean> {
  const config = getFirewallConfig();

  try {
    const response = await fetch(`${config.baseUrl}/health`);
    return response.ok;
  } catch (err) {
    console.error("AI Firewall health check failed:", err);
    return false;
  }
}

/**
 * Get firewall statistics
 *
 * @param companyId - Company ID for filtering
 * @param agentId - Agent ID for filtering
 * @returns Firewall statistics
 */
export async function getFirewallStats(
  companyId?: string,
  agentId?: string,
): Promise<{
  totalChecks: number;
  blocked: number;
  allowed: number;
  detectionsByType: Record<string, number>;
} | null> {
  const config = getFirewallConfig();

  if (!config.enabled) {
    return null;
  }

  try {
    const params = new URLSearchParams();
    if (companyId) params.set("companyId", companyId);
    if (agentId) params.set("agentId", agentId);

    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.baseUrl}/api/stats?${params}`, {
      headers,
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error("Failed to get firewall stats:", err);
    return null;
  }
}
