# stapleai (CLI)

Installable CLI (`npx stapleai`) for onboarding, running, and managing Staple deployments. Published to npm; bundled with esbuild.

## Layout

- `src/index.ts` — entry and command dispatch
- `src/commands/` — top-level commands (`onboard`, `dev`, `doctor`, etc.)
- `src/prompts/` — interactive flows via `@clack/prompts`
- `src/adapters/` — adapter discovery and install helpers
- `src/client/` — HTTP client against a running Staple server
- `src/checks/` — preflight environment checks
- `src/config/` — config file and env resolution
- `src/utils/` — shared helpers

## Develop

```bash
pnpm --filter stapleai dev -- onboard --yes
pnpm --filter stapleai build
pnpm --filter stapleai typecheck
```
