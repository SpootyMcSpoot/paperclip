# adapters

Runtime adapters that let Staple drive heterogeneous agents through one interface. Each adapter implements the contract defined in `@stapleai/adapter-utils` and is registered with the server at startup.

## Adapters

| Package                                 | Target                               |
| ---------------------------------------- | ------------------------------------ |
| `claude-local/`                          | Local Claude Code CLI                |
| `codex-local/`                           | Local OpenAI Codex CLI               |
| `cursor-local/`                          | Local Cursor agent                   |
| `gemini-local/`                          | Local Gemini CLI                     |
| `opencode-local/`                        | Local opencode runtime               |
| `libai-local/`                           | Local libai runtime                  |
| `pi-local/`                              | Local "pi" runtime                   |
| `openclaw-gateway/`                      | Remote OpenClaw over HTTP gateway    |
| `devcontroller-gateway/`                 | Dev-controller gateway               |
| `litellm-gateway/`                       | LiteLLM proxy for provider fan-out   |
| `stax-orchestrator/`                     | stax orchestrator backend            |

## Develop

```bash
pnpm -r --filter "@stapleai/adapter-*" build
pnpm -r --filter "@stapleai/adapter-*" typecheck
```
