export const type = "litellm_gateway";
export const label = "LiteLLM Gateway";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# litellm_gateway agent configuration

Adapter: litellm_gateway

Use when:
- You want Paperclip to use a LiteLLM proxy as a unified gateway to multiple LLM providers.
- You need to access models through a centralized LiteLLM deployment.
- You want to leverage LiteLLM's load balancing, fallback, and cost tracking features.

Don't use when:
- You have direct API access to the provider (use provider-specific adapters instead).
- You need WebSocket streaming (LiteLLM uses HTTP/SSE).

Core fields:
- baseUrl (string, required): LiteLLM proxy base URL (e.g., http://localhost:4000)
- apiKey (string, optional): API key for LiteLLM proxy (can also use LITELLM_API_KEY env var)
- model (string, required): Model identifier as configured in LiteLLM (e.g., gpt-4, claude-3-opus)

Request behavior fields:
- timeoutSec (number, optional): Request timeout in seconds (default 300)
- maxTokens (number, optional): Maximum output tokens (default 4096)
- temperature (number, optional): Sampling temperature 0.0-2.0 (default 0.7)
- headers (object, optional): Additional HTTP headers to send with requests

Environment variables:
- LITELLM_API_KEY: API key for LiteLLM proxy (overridden by config.apiKey if set)

Model discovery:
- The adapter automatically fetches available models from \`GET {baseUrl}/v1/models\`
- Models are cached for 60 seconds per baseUrl
- If discovery fails, falls back to cached or empty list

LiteLLM configuration example:
\`\`\`yaml
# config.yaml for LiteLLM proxy
model_list:
  - model_name: gpt-4
    litellm_params:
      model: openai/gpt-4
      api_key: os.environ/OPENAI_API_KEY
  - model_name: claude-3-opus
    litellm_params:
      model: anthropic/claude-3-opus-20240229
      api_key: os.environ/ANTHROPIC_API_KEY
\`\`\`

Paperclip agent adapterConfig example:
\`\`\`json
{
  "baseUrl": "http://localhost:4000",
  "apiKey": "sk-litellm-...",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 4096
}
\`\`\`
`;
