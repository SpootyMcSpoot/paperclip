# @stapleai/server

Node.js / Express API that hosts the Staple control plane: companies, agents, goals, tickets, heartbeats, costs, governance, and realtime events. Bundles the built UI when `SERVE_UI=true`.

## Layout

- `src/routes/` — HTTP route modules (agents, companies, goals, issues, approvals, costs, plugins, etc.)
- `src/services/` — domain services (activity log, permissions, cost tracking, heartbeats)
- `src/adapters/` — agent runtime adapters registry (process and HTTP)
- `src/realtime/` — WebSocket / SSE fan-out
- `src/auth/` — better-auth integration and JWT session glue
- `src/storage/` — attachment / object storage
- `src/secrets/` — secret handling and redaction
- `src/__tests__/` — vitest unit + integration tests

## Develop

```bash
pnpm --filter @stapleai/server dev
pnpm --filter @stapleai/server typecheck
pnpm --filter @stapleai/server test
```

Starts on `PORT=3100` with embedded Postgres unless `DATABASE_URL` is set.
