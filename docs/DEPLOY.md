# Thin deploy notes

## Default (submission): local demo
1. `./scripts/demo-up.sh` (or manual docker compose + migrate/seed/import)
2. Run API + Web with `pnpm --filter @ali/api|@ali/web dev`
3. Postgres on **5433** when host 5432 is already used

## Optional public path (only if time)
- Web: Vercel (`NEXT_PUBLIC_API_URL`)
- API + Postgres: existing Oracle VM / Railway / Render
- No Kubernetes, no new microservice splits
- Redis/BullMQ: document as future work if not implemented

## Honesty
Ship a working local vertical slice over a half-broken cloud demo.
