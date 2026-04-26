---
title: Environment Variables
summary: Full environment variable reference
---

All environment variables that Staple uses for server configuration.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `STAPLE_BIND` | `loopback` | Reachability preset: `loopback`, `lan`, `tailnet`, or `custom` |
| `STAPLE_BIND_HOST` | (unset) | Required when `STAPLE_BIND=custom` |
| `HOST` | `127.0.0.1` | Legacy host override; prefer `STAPLE_BIND` for new setups |
| `DATABASE_URL` | (embedded) | PostgreSQL connection string |
| `STAPLE_HOME` | `~/.staple` | Base directory for all Staple data |
| `STAPLE_INSTANCE_ID` | `default` | Instance identifier (for multiple local instances) |
| `STAPLE_DEPLOYMENT_MODE` | `local_trusted` | Runtime mode override |
| `STAPLE_DEPLOYMENT_EXPOSURE` | `private` | Exposure policy when deployment mode is `authenticated` |
| `STAPLE_API_URL` | (auto-derived) | Staple API base URL. When set externally (e.g., via Kubernetes ConfigMap, load balancer, or reverse proxy), the server preserves the value instead of deriving it from the listen host and port. Useful for deployments where the public-facing URL differs from the local bind address. |

## Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `STAPLE_SECRETS_MASTER_KEY` | (from file) | 32-byte encryption key (base64/hex/raw) |
| `STAPLE_SECRETS_MASTER_KEY_FILE` | `~/.staple/.../secrets/master.key` | Path to key file |
| `STAPLE_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive env vars |

## Agent Runtime (Injected into agent processes)

These are set automatically by the server when invoking agents:

| Variable | Description |
|----------|-------------|
| `STAPLE_AGENT_ID` | Agent's unique ID |
| `STAPLE_COMPANY_ID` | Company ID |
| `STAPLE_API_URL` | Staple API base URL (inherits the server-level value; see Server Configuration above) |
| `STAPLE_API_KEY` | Short-lived JWT for API auth |
| `STAPLE_RUN_ID` | Current heartbeat run ID |
| `STAPLE_TASK_ID` | Issue that triggered this wake |
| `STAPLE_WAKE_REASON` | Wake trigger reason |
| `STAPLE_WAKE_COMMENT_ID` | Comment that triggered this wake |
| `STAPLE_APPROVAL_ID` | Resolved approval ID |
| `STAPLE_APPROVAL_STATUS` | Approval decision |
| `STAPLE_LINKED_ISSUE_IDS` | Comma-separated linked issue IDs |

## LLM Provider Keys (for adapters)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |
