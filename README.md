# AI Lead Intelligence Engine

SaaSquatch Leads 5-hour assessment MVP: reference-company search → DNA → similarity → qualification → ranked results.

## Stack

- `apps/web` — Next.js + TypeScript + Tailwind
- `apps/api` — Node.js + TypeScript REST API + Prisma
- `packages/shared` — DNA / similarity / qualification contracts
- PostgreSQL via `docker-compose.yml` (no Redis/BullMQ)

## Quick start

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:import
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/health

Demo CSV lives at `data/demo-companies.csv`. Scoring never uses `demo_fit`.

Contracts: `docs/PHASE0-CONTRACTS.md` and `PHASE0-CONTRACTS.md`.

## Demo path

1. Open the web app → pick 1–3 reference companies
2. Run search → view ranked shortlist with similarity + qualification + recommendation
