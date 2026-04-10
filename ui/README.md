# @stapleai/ui

React 19 + Vite + Tailwind 4 dashboard for Staple. Org charts, ticket boards, agent configuration, cost dashboards, approvals, and plugin UIs.

## Layout

- `src/pages/` — route-level views (dashboard, companies, agents, issues, costs, settings)
- `src/components/` — shared components (radix-ui + shadcn style)
- `src/api/` — typed API client against `@stapleai/server`
- `src/hooks/` — TanStack Query hooks and local state
- `src/context/` — auth, theme, company scope providers
- `src/plugins/` — host for plugin-provided UI panels
- `src/adapters/` — UI-side adapter metadata

## Develop

```bash
pnpm --filter @stapleai/ui dev        # Vite dev server
pnpm --filter @stapleai/ui build      # tsc + vite build
pnpm --filter @stapleai/ui typecheck
```

In full-stack mode the server serves the built UI from `ui-dist/`.
