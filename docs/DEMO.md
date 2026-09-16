# Assessment demo script (5–7 min)

Keep this outside the git working tree until Hermes bootstrap finishes; then copy into README or `docs/DEMO.md`.

## Setup (once)
```bash
pnpm install
pnpm db:up
pnpm db:migrate && pnpm db:import
pnpm --filter @ali/shared test
pnpm dev
```
- Web http://localhost:3000 — API http://localhost:3001/health

## Live path
1. Open **New search** → pick 2–3 reference B2B SaaS companies from the demo CSV.
2. Run search → show Ideal DNA (facts / inferences / unknowns).
3. Scroll ranked results: similarity overall + dimensions, qualification (60/40), recommendation.
4. Open one company detail → evidence (CSV + enrichment when AI live); call out `demo_fit` is metadata, never scored. Refresh evidence merges — does not wipe prior findings.
5. Optional: re-run with a government/nonprofit ownership candidate → hard REJECT.

## Talking points
- Vertical slice first: reference → DNA → filter → similarity → qualification → recommend.
- Deterministic weights (Phase 0): industry/services 20% each; no vector DB.
- Sync batch OK; Redis/BullMQ out of MVP.
- 392-row CSV import; dirty `demo_fit` cells ignored for scoring.
