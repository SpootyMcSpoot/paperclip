# docker

Ancillary Docker build contexts used alongside the root `Dockerfile`.

- `openclaw-smoke/` — image used by the OpenClaw smoke tests in `scripts/smoke/`
- `untrusted-review/` — sandboxed image for the untrusted PR review flow (see `doc/UNTRUSTED-PR-REVIEW.md`)

Root compose files:

- `docker-compose.yml` — full stack (Postgres + server)
- `docker-compose.quickstart.yml` — minimal quickstart
- `docker-compose.untrusted-review.yml` — untrusted review sandbox

See `doc/DOCKER.md` for build and run notes.
