# API reference (MVP)

Base: `http://localhost:3001`

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ status, db }` |
| GET | `/companies?q=&limit=` | List/search; includes `website`, `linkedinUrl`; no `demoFit` |
| GET | `/companies/:id` | Company + DNA + evidence (DNA.evidence fallback when Evidence table empty); `demoFit` stripped |
| POST | `/companies/:id/refresh-evidence` | Manual AI website enrichment for one company (sync) |
| POST | `/enrichment/batch` | Start catalog chunk job (async 202); body: `limit`, `offset`, `staleFirst`, `onlyWithWebsite`, `delayMs` |
| GET | `/enrichment/jobs` | Recent batch jobs |
| GET | `/enrichment/jobs/:id` | Batch job progress |
| GET | `/searches` | Recent searches for demo user |
| POST | `/searches` | Create search — see bodies below |
| POST | `/searches/:id/run` | Async analysis; dispatches on `search.type` (`reference` \| `criteria`) |
| GET | `/searches/:id` | Search + references/criteria + idealDna when completed |
| GET | `/searches/:id/results?limit=5&recommendation=` | Ranked rows + `evidence`; `meta.totalCount` |
| GET | `/searches/:id/companies/:companyId` | Search-scoped detail for progressive UI |
| POST | `/searches/:id/suggest-thresholds` | AI/heuristic ranking floors from score+evidence stats + Ideal DNA summary |

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

## AI enrichment (catalog-wide)

**Source of truth:** catalog batch + manual refresh persist DNA (AI research status, red flags, website evidence) for every company. Search scoring **reads persisted DNA** for all candidates so negatives/empty stamps are not limited to top-N.

```bash
# Weekly / full catalog (chunked; re-run with rising --offset until done)
pnpm --filter @ali/api enrich:all
pnpm --filter @ali/api enrich:all -- --limit=100 --offset=100

# Or via API
curl -X POST http://localhost:3001/enrichment/batch -H 'content-type: application/json' \
  -d '{"limit":50,"offset":0,"staleFirst":true}'
curl http://localhost:3001/enrichment/jobs/<jobId>

# One company
curl -X POST http://localhost:3001/companies/C319/refresh-evidence
```

Env:

```bash
AI_PROVIDER=openai   # or openrouter; default noop
OPENAI_API_KEY=...
ENRICH_ON_SEARCH=false          # keep false; batch is source of truth
ENRICH_MAX_CANDIDATES=15        # only if ENRICH_ON_SEARCH=true (unstamped fills)
ENRICH_FETCH_TIMEOUT_MS=8000
ENRICH_BATCH_LIMIT=50
ENRICH_BATCH_DELAY_MS=500
ENRICH_BATCH_TIMEOUT_MS=600000
```

When `ENRICH_ON_SEARCH=true`, search may website-enrich a small set of **unstamped** candidates (not “top 5 only”). Prefer leaving it false and running `enrich:all` weekly.

Default `AI_PROVIDER=noop` — no network/LLM calls; batch still persists CSV DNA/evidence so the Evidence UI is never empty. Missing API key for `openai` / `openrouter` falls back to noop (warns once).


## POST `/searches/:id/suggest-thresholds`

Suggests AND ranking floors (`minQualification`, `minSimilarity`, `minEvidenceCount`) for the Settings panel.

- Loads up to 500 scored results (qualification + similarity + evidence counts) and Ideal DNA summary when present.
- Calls OpenRouter/OpenAI `generateStructured` when `AI_PROVIDER` is live; otherwise returns the 25th-percentile **heuristic**.
- Never invents company facts — only score/evidence distribution stats + Ideal DNA prose.
- Clamps: scores 0–100, evidence 0–50.

**Example success (AI):**

```json
{
  "data": {
    "minQualification": 62,
    "minSimilarity": 58,
    "minEvidenceCount": 2,
    "rationale": "Floors near the lower quartile keep a focused shortlist without emptying the ranked view.",
    "source": "ai",
    "searchId": "clx…",
    "resultCount": 120
  }
}
```

**Example fallback (noop / timeout / invalid JSON):**

```json
{
  "data": {
    "minQualification": 55,
    "minSimilarity": 51,
    "minEvidenceCount": 1,
    "rationale": "Local 25th-percentile floors from the current score/evidence distribution so roughly the stronger three-quarters of leads remain visible.",
    "source": "heuristic",
    "message": "AI provider is noop or missing a key — using local heuristic.",
    "searchId": "clx…",
    "resultCount": 120
  }
}
```

## Evidence in responses

Company detail and search results return `evidence[]` with `field`, `value`, `source`, optional `url` / `evidenceQuote`. Resolution order: DNA.evidence (rich) → Evidence table → live CSV DNA rebuild.

## AI Lead Intelligence fields (additive)

After deterministic scoring marks the search `completed`, a timed AI intelligence pass (when `AI_PROVIDER` is live) may attach:

| Field | Where | Notes |
|---|---|---|
| `aiFitNarrative` | each `/results` row | 2–4 sentence why-this-lead vs Ideal DNA; evidence-locked. Thin/empty research → honest thin status, not invented prose. Also mirrored as `AI narrative:` lines in `similarityExplanation`. |
| `aiFitNarrativeThin` | each `/results` row | `true` when narrative is a thin/awaiting stub |
| `inferences` | each `/results` row | DNA inference stamps (incl. `AI research status:`, `AI research:`, `AI red flag:`) so UI does not need a second `getCompany` |
| `researchNote` / `researchStatus` / `redFlags` | each `/results` row | Typed parses of the stamps above |
| `aiResearchConfidence` | each `/results` row | 0–100 or `null` — **distinct** from scoring `confidence` (data completeness) |
| `idealDnaSummary` | `meta` on `/results`, also on `GET /searches/:id` | LLM Ideal DNA prose from reference DNAs + centroid; also stored on `idealDna.idealDnaSummary` |

Deterministic `similarityScore` / `qualificationScore` / `confidence` are unchanged. `demo_fit` is never used for scoring.
