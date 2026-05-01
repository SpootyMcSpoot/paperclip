# @stapleai/db

Drizzle ORM schema, migrations, and query helpers for Staple. Backs both the embedded Postgres (dev) and external Postgres (prod).

## Develop

```bash
pnpm --filter @stapleai/db generate   # create migration from schema diff
pnpm --filter @stapleai/db migrate    # apply migrations
pnpm --filter @stapleai/db build
pnpm --filter @stapleai/db test
```

Config lives in `drizzle.config.ts`. See `doc/DATABASE.md` for schema notes.
