# Phase 0 — Frozen Contracts (Hermes must not redesign)

## Protected vertical slice
Reference companies (1–5) → Company DNA → Ideal DNA → deterministic filter → similarity → qualification → confidence → recommendation → ranked results → company detail.

Criteria flow is secondary and reuses the same engines.

## CSV
- 392 rows, 23 columns including company_id through demo_fit
- Import all fields; store demo_fit as metadata only
- Never use demo_fit in scoring

## Company DNA JSON
companyId, identity, customers, businessModel, size, ownership, growth, reputation, technology, geography, facts[], inferences[], unknowns[], evidence[], confidence
Rules: facts from CSV only; inferences labeled; unknowns explicit; no invented facts.

## Similarity JSON
overallScore 0-100; dimensions industry/services/customers/businessModel/size/ownership/geography/growth; explanation[]; fixed weights industry.20 services.20 customers.15 businessModel.15 size.10 ownership.05 geography.10 growth.05

## Qualification JSON
businessFit, strategicFit, qualificationScore (business 60% + strategic 40%), confidence separate, positiveSignals[], risks[], missingInformation[], recommendation CONTACT_NOW|RESEARCH_MORE|MONITOR|REJECT, hardExclusion bool

## Infra MVP
Next.js + Node TS API + Prisma + PostgreSQL. Redis/BullMQ optional later. Sync batch OK.

## Non-goals
No scraper, CAPTCHA, CRM, billing, K8s, vector DB, auth beyond demo user.

