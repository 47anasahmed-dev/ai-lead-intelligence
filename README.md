# AI Lead Intelligence Engine

SaaSquatch 5-hour assessment MVP — **reference-company vertical slice**.

Select 1–5 reference companies → Company DNA → Ideal DNA → deterministic filter → similarity → qualification → confidence → recommendation → ranked results → company detail.

**Frozen contracts:** [`PHASE0-CONTRACTS.md`](./PHASE0-CONTRACTS.md) / [`docs/PHASE0-CONTRACTS.md`](./docs/PHASE0-CONTRACTS.md)

## Stack

| Layer | Tech |
|---|---|
| Monorepo | pnpm workspaces |
| API | Node.js + TypeScript + Fastify + Prisma |
| Web | Next.js App Router + TypeScript + Tailwind |
| Shared | Pure DNA / similarity / qualification (`packages/shared`) + Vitest |
| DB | PostgreSQL 16 (`docker compose`) |

## Repo layout

```text
apps/api          Fastify REST API + Prisma + CSV import CLI
apps/web          Next.js UI (dashboard, reference select, results, detail)
packages/shared   Types + deterministic scoring (no demo_fit)
data/             demo-companies.csv (392 rows)
docs/             Phase 0 contracts
```

## Quick start

### Prerequisites

- Node 20+
- pnpm 9+
- Docker (for Postgres)

### 1. Install

```bash
pnpm install
```

### 2. Environment

```bash
cp .env.example .env
# apps/api/.env is also provided for local API; keep secrets out of git
```

Default DB URL: `postgresql://ali:ali@localhost:5432/ali?schema=public`

### 3. Database

```bash
docker compose up -d
pnpm --filter @ali/api prisma:generate
pnpm --filter @ali/api prisma:migrate
pnpm --filter @ali/api prisma:seed
```

### 4. Import CSV

```bash
pnpm --filter @ali/api import:csv
# or: pnpm db:import
```

### 5. Run

```bash
# terminal A
pnpm --filter @ali/shared build
pnpm --filter @ali/api dev

# terminal B
pnpm --filter @ali/web dev
```

- API: http://localhost:3001/health  
- Web: http://localhost:3000  

### 6. Smoke test (reference path)

With API running:

```bash
pnpm --filter @ali/api smoke
```

Or UI: **New search** → pick 1–5 SaaS peers → **Create & run** → ranked results → open company detail.

## API routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + DB ping |
| GET | `/companies?q=&limit=` | Search/list companies |
| GET | `/companies/:id` | Detail + DNA (demo_fit stripped) |
| POST | `/searches` | `{ type: "reference", companyIds: string[] }` |
| POST | `/searches/:id/run` | Sync analysis batch |
| GET | `/searches/:id` | Search metadata |
| GET | `/searches/:id/results` | Ranked qualifications + similarity |

## Scoring (deterministic)

Weights (frozen): industry 20%, services 20%, customers 15%, businessModel 15%, size 10%, ownership 5%, geography 10%, growth 5%.

Qualification: **businessFit 60% + strategicFit 40%**. Confidence is **separate** (field completeness).

Recommendations: `CONTACT_NOW` | `RESEARCH_MORE` | `MONITOR` | `REJECT` (+ hard exclusions e.g. government/nonprofit).

**`demo_fit` is imported as metadata only and never used in scoring.**

## Tests

```bash
pnpm --filter @ali/shared test
```

## Design trade-offs

- Sync batch analysis (no Redis/BullMQ) for a reliable 5-hour demo.
- Facts from CSV only; inferences labeled; unknowns explicit.
- LLM enrichment intentionally stubbed / optional — MVP runs without API keys.
- Criteria workflow deferred; same engines can be reused later.

## Demo script (~90s)

1. Open dashboard → **New reference search**.
2. Filter “SaaS”, select 3 peers → **Create & run**.
3. Show ranked table (qualification, similarity, confidence, recommendation).
4. Open top lead → DNA facts / inferences / unknowns.
5. Call out: explainability + no `demo_fit` leakage.
