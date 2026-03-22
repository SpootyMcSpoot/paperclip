export function buildConfig(v?: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  // Default to localhost LiteLLM gateway (override with baseUrl parameter)
  config.baseUrl = v?.baseUrl || "http://localhost:4000";

  // Model defaults to empty - user must select from available models
  if (v?.model) config.model = v.model;

  // Optional API key - defaults to environment variable if not provided
  if (v?.apiKey) config.apiKey = v.apiKey;

  // Request parameters with sensible defaults
  config.maxTokens = v?.maxTokens || 4096;
  config.temperature = v?.temperature !== undefined ? v.temperature : 0.7;
  config.timeoutSec = v?.timeoutSec || 300;

  // Optional custom headers
  if (v?.headers && typeof v.headers === "object") {
    config.headers = v.headers;
  }

  return config;
}
