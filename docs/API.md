# API reference (MVP)

Base: `http://localhost:3001`

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ status, db }` |
| GET | `/companies?q=&limit=` | List/search; no `demoFit` |
| GET | `/companies/:id` | Company + DNA + evidence; `demoFit` stripped |
| GET | `/searches` | Recent searches for demo user |
| POST | `/searches` | Create search — see bodies below |
| POST | `/searches/:id/run` | Sync analysis; dispatches on `search.type` (`reference` \| `criteria`) |
| GET | `/searches/:id` | Search + references/criteria + idealDna when completed |
| GET | `/searches/:id/results?limit=100&recommendation=` | Ranked rows; `meta.totalCount` |
| GET | `/searches/:id/companies/:companyId` | Search-scoped detail for progressive UI |

## POST `/searches` bodies

**Reference** (1–5 company IDs):

```json
{ "type": "reference", "companyIds": ["C001", "C002"] }
```

**Criteria** (at least one filter field; `notes` alone is not enough):

```json
{
  "type": "criteria",
  "criteria": {
    "industry": "B2B SaaS",
    "geography": "North America",
    "country": "United States",
    "employeeRange": "51-100",
    "ownership": "Private",
    "businessModel": "B2B SaaS",
    "notes": "optional labeled inference only"
  }
}
```

Criteria run builds Ideal DNA from provided fields only (unknowns for the rest; no invented facts), then reuses the same filter → similarity → qualification path. `excludeIds` is empty.

Postgres default on crowded hosts: `localhost:5433` (see `docker-compose.yml`).

## AI enrichment (optional)

Deterministic similarity/qualification scores remain the numeric source of truth. When enabled, analysis:

1. Scores all filtered candidates deterministically.
2. Enriches reference companies + top `ENRICH_MAX_CANDIDATES` via website fetch + structured LLM JSON.
3. Re-scores only those enriched rows (CSV facts never overwritten; claims need verbatim `evidenceQuote`).

```bash
# apps/api/.env or monorepo root .env
# Prefer OpenAI directly, or OpenRouter as a router:
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Or:
# AI_PROVIDER=openrouter
# OPENROUTER_API_KEY=sk-or-...
# OPENROUTER_MODEL=openai/gpt-4o-mini

ENRICH_MAX_CANDIDATES=15
ENRICH_FETCH_TIMEOUT_MS=8000
```

Default `AI_PROVIDER=noop` — no network/LLM calls; enrichment stub never invents facts. Missing API key for `openai` / `openrouter` falls back to noop (warns once).
