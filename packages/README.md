# packages

pnpm workspace packages consumed by `server`, `ui`, and `cli`.

## Contents

- [`shared/`](shared/) — cross-cutting types, zod schemas, utilities (`@stapleai/shared`)
- [`db/`](db/) — Drizzle ORM schema and migrations (`@stapleai/db`)
- [`adapter-utils/`](adapter-utils/) — shared helpers for agent adapters (`@stapleai/adapter-utils`)
- [`adapters/`](adapters/README.md) — agent runtime adapters (Claude, Codex, Cursor, Gemini, OpenClaw, LiteLLM, etc.)
- [`plugins/`](plugins/README.md) — plugin SDK, scaffolder, and example plugins

All packages are referenced via `workspace:*` and built with `pnpm -r build`.
