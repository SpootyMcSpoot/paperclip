# @paperclipai/adapter-litellm-gateway

LiteLLM Gateway adapter for Paperclip.

## Features

- OpenAI-compatible streaming via `/v1/chat/completions`
- Automatic model discovery from `/v1/models`
- Environment variable or config-based API key authentication
- 60-second model cache per baseUrl
- Token usage tracking

## Configuration

```json
{
  "baseUrl": "http://localhost:4000",
  "apiKey": "sk-litellm-...",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

Or use `LITELLM_API_KEY` environment variable.

## Usage

Add to agent `adapterConfig`:

```typescript
{
  type: "litellm_gateway",
  baseUrl: "http://localhost:4000",
  model: "gpt-4"
}
```
