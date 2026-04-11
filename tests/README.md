# tests

Top-level end-to-end tests. Unit and integration tests live next to code in `server/src/__tests__/`, `cli/src/__tests__/`, and per-package `vitest.config.ts` suites.

## Layout

- `e2e/` — Playwright E2E specs
  - `onboarding.spec.ts` — first-run onboarding flow
  - `playwright.config.ts` — Playwright config (consumed via root scripts)

## Run

```bash
pnpm test:run         # all vitest suites
pnpm test:e2e         # Playwright headless
pnpm test:e2e:headed  # Playwright with browser
```
