---
title: LiteLLM Gateway
summary: LiteLLM proxy gateway adapter for unified multi-provider access
---

The `litellm_gateway` adapter connects to a LiteLLM proxy server, enabling unified access to multiple LLM providers (OpenAI, Anthropic, Cohere, etc.) through a single gateway endpoint.

## When to Use

- Centralized LLM provider management via LiteLLM proxy
- Load balancing across multiple LLM providers
- Cost tracking and fallback routing via LiteLLM
- Need to switch between providers without changing agent config

## When Not to Use

- Direct provider access is available and preferred (use `claude_local`, `codex_local`, etc.)
- WebSocket streaming is required (LiteLLM uses HTTP/SSE)
- Running agents that need local CLI tools

## Prerequisites

- LiteLLM proxy server running and accessible
- LiteLLM configured with desired model mappings
- API key for LiteLLM proxy (if authentication is enabled)

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `baseUrl` | string | Yes | LiteLLM proxy base URL (e.g., `http://localhost:4000`) |
| `model` | string | Yes | Model identifier as configured in LiteLLM |
| `apiKey` | string | No | API key for LiteLLM proxy (or use `LITELLM_API_KEY` env var) |
| `promptTemplate` | string | No | Prompt template for all runs (default: `You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.`) |
| `temperature` | number | No | Sampling temperature 0.0-2.0 (default: 0.7) |
| `maxTokens` | number | No | Maximum output tokens (default: 4096) |
| `timeoutSec` | number | No | Request timeout in seconds (default: 300) |
| `headers` | object | No | Additional HTTP headers for requests |

## How It Works

1. Paperclip renders the `promptTemplate` with context variables (agent, run, task info)
2. The rendered prompt is sent to LiteLLM via OpenAI-compatible `/v1/chat/completions` API
3. LiteLLM routes the request to the configured provider
4. Responses stream back via SSE with real-time output
5. Token usage is tracked and returned in the result

## Prompt Templates

Templates support `{{variable}}` substitution:

| Variable | Value |
|----------|-------|
| `{{agentId}}` | Agent's ID |
| `{{companyId}}` | Company ID |
| `{{runId}}` | Current run ID |
| `{{agent.name}}` | Agent's name |
| `{{agent.id}}` | Agent's ID |
| `{{context.taskId}}` | Current task/issue ID |
| `{{context.wakeReason}}` | Wake reason (e.g., `issue_assigned`) |

Example:
```json
{
  "promptTemplate": "You are {{agent.name}}, working on task {{context.taskId}}. Wake reason: {{context.wakeReason}}."
}
```

## Model Discovery

The adapter automatically fetches available models from `GET {baseUrl}/v1/models` and caches them for 60 seconds. Models appear in the UI dropdown when creating or editing agents.

If discovery fails, the adapter falls back to cached results or an empty list.

## API Key Resolution

The adapter resolves API keys in this order:
1. `LITELLM_API_KEY` environment variable (highest priority)
2. `apiKey` field in agent config
3. No authentication (if LiteLLM proxy doesn't require auth)

## LiteLLM Configuration Example

LiteLLM proxy `config.yaml`:
```yaml
model_list:
  - model_name: gpt-4
    litellm_params:
      model: openai/gpt-4
      api_key: os.environ/OPENAI_API_KEY

  - model_name: claude-3-opus
    litellm_params:
      model: anthropic/claude-3-opus-20240229
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: command-r-plus
    litellm_params:
      model: cohere/command-r-plus
      api_key: os.environ/COHERE_API_KEY
```

Start LiteLLM:
```bash
litellm --config config.yaml --port 4000
```

## Paperclip Agent Configuration

```json
{
  "type": "litellm_gateway",
  "baseUrl": "http://localhost:4000",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 4096,
  "promptTemplate": "You are {{agent.name}}. Continue your Paperclip work."
}
```

## Environment Test

Use the "Test Environment" button in the UI to validate the adapter config. It checks:

- `baseUrl` is a valid HTTP/HTTPS URL
- API key configuration (env var or config field)
- Model specified in config
- Connectivity probe to `/v1/models` endpoint
- Shows status: ready, degraded, or not ready

## Token Usage Tracking

The adapter tracks token usage from the LiteLLM response:
- Input tokens (prompt)
- Output tokens (completion)
- Cached input tokens (if supported by provider)

Usage appears in run logs and billing reports.

## Limitations

- No session persistence (each run is stateless)
- Single-turn interaction per run (no conversation history)
- Requires LiteLLM proxy deployment
- HTTP/SSE only (no WebSocket streaming)
