# scripts

Repo automation: dev runner, release pipeline, smoke tests, backups, and guard checks.

## Highlights

- `dev-runner.mjs` — orchestrates `pnpm dev` (server + UI watch)
- `build-npm.sh` — builds publishable npm artifacts
- `release.sh`, `create-github-release.sh`, `rollback-latest.sh` — release pipeline
- `backup-db.sh` — Postgres backup helper
- `check-forbidden-tokens.mjs` — guard against secrets / banned strings
- `clean-onboard-*.sh` — reset scripts for onboarding smoke tests
- `smoke/` — end-to-end smoke scripts (`openclaw-join`, `openclaw-docker-ui`, `openclaw-sse-standalone`)
- `migrate-inline-env-secrets.ts` — one-shot secrets migration
- `prepare-server-ui-dist.sh` — stages built UI into the server package before publish

Invoke via root `package.json` scripts where available.
