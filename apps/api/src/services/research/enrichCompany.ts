/**
 * Enrichment orchestrator: CSV DNA → identify unknowns → website AI (optional) → merge.
 * NEVER overwrites existing non-null CSV facts. Quote-checked claims only.
 */

import type { CompanyDna, EvidenceItem } from '@ali/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { AiProvider } from '@ali/shared';
import { researchWebsite } from './websiteResearch.js';

/** Map enrichment field keys → DNA setters (only fill when currently null). */
const FILLABLE_FIELDS: Record<
  string,
  {
    get: (d: CompanyDna) => string | null | undefined;
    set: (d: CompanyDna, value: string) => void;
    factLabel: (value: string) => string;
  }
> = {
  industry: {
    get: (d) => d.identity.industry,
    set: (d, v) => {
      d.identity.industry = v;
    },
    factLabel: (v) => `Industry (website): ${v}`,
  },
  primary_service: {
    get: (d) => d.identity.primaryService,
    set: (d, v) => {
      d.identity.primaryService = v;
    },
    factLabel: (v) => `Primary service (website): ${v}`,
  },
  customer_profile: {
    get: (d) => d.customers.profile,
    set: (d, v) => {
      d.customers.profile = v;
    },
    factLabel: (v) => `Customers (website): ${v}`,
  },
  business_model: {
    get: (d) => d.businessModel.model,
    set: (d, v) => {
      d.businessModel.model = v;
    },
    factLabel: (v) => `Business model (website): ${v}`,
  },
  revenue_model: {
    get: (d) => d.businessModel.revenueModel,
    set: (d, v) => {
      d.businessModel.revenueModel = v;
    },
    factLabel: (v) => `Revenue model (website): ${v}`,
  },
  ownership: {
    get: (d) => d.ownership.type,
    set: (d, v) => {
      d.ownership.type = v;
    },
    factLabel: (v) => `Ownership (website): ${v}`,
  },
  growth_signal: {
    get: (d) => d.growth.signal,
    set: (d, v) => {
      d.growth.signal = v;
    },
    factLabel: (v) => `Growth signal (website): ${v}`,
  },
  reputation_signal: {
    get: (d) => d.reputation.signal,
    set: (d, v) => {
      d.reputation.signal = v;
    },
    factLabel: (v) => `Reputation (website): ${v}`,
  },
  technology_stack: {
    get: (d) => d.technology.stack,
    set: (d, v) => {
      d.technology.stack = v;
    },
    factLabel: (v) => `Technology (website): ${v}`,
  },
  geography: {
    get: (d) => d.geography.region,
    set: (d, v) => {
      d.geography.region = v;
    },
    factLabel: (v) => `Geography (website): ${v}`,
  },
  company_description: {
    get: (d) => d.identity.description,
    set: (d, v) => {
      d.identity.description = v;
    },
    factLabel: (v) => `Description (website): ${v}`,
  },
};

function listUnknowns(dna: CompanyDna): string[] {
  const keys: string[] = [];
  for (const [field, meta] of Object.entries(FILLABLE_FIELDS)) {
    const v = meta.get(dna);
    if (v == null || v === '') keys.push(field);
  }
  return keys;
}

function recomputeUnknownsAndConfidence(dna: CompanyDna): void {
  const required = [
    'industry',
    'primary_service',
    'customer_profile',
    'business_model',
    'ownership',
    'geography',
    'growth_signal',
  ] as const;
  const unknowns: string[] = [];
  let present = 0;
  for (const field of required) {
    const meta = FILLABLE_FIELDS[field];
    const v = meta?.get(dna);
    if (v == null || v === '') unknowns.push(`Unknown: ${field}`);
    else present += 1;
  }
  if (dna.size.estimatedRevenueUsd == null) unknowns.push('Unknown: estimated_revenue_usd');
  if (!dna.technology.stack) unknowns.push('Unknown: technology_stack');
  if (!dna.reputation.signal) unknowns.push('Unknown: reputation_signal');
  dna.unknowns = unknowns;
  // Light upward only when fields filled — cap at 95 (never claim certainty from web alone)
  const base = Math.round((present / required.length) * 100);
  dna.confidence = Math.min(95, Math.max(dna.confidence, base));
}

/**
 * Enrich a single CompanyDna via website research when AI is live.
 * Returns a new DNA object (does not mutate the input).
 */
export async function enrichCompanyDna(
  dna: CompanyDna,
  ai: AiProvider,
): Promise<{ dna: CompanyDna; didEnrich: boolean }> {
  const website = dna.identity.website;
  if (!website || ai.name === 'noop') {
    return { dna, didEnrich: false };
  }

  const unknowns = listUnknowns(dna);
  // Still useful to gather inferences even if few unknowns
  const result = await researchWebsite(ai, {
    companyId: dna.companyId,
    websiteUrl: website,
    unknowns: unknowns.length ? unknowns : ['customer_profile', 'business_model', 'growth_signal'],
    existingFacts: dna.facts,
  });

  if (result.skipped || (result.enrichment.filledUnknowns.length === 0 && result.enrichment.inferences.length === 0)) {
    // May still attach narrative if any
    if (result.enrichment.narrativeBullets.length === 0) {
      return { dna, didEnrich: false };
    }
  }

  const next: CompanyDna = structuredClone(dna);
  let filledCount = 0;

  for (const fill of result.enrichment.filledUnknowns) {
    const key = fill.field.trim().toLowerCase().replace(/\s+/g, '_');
    const meta = FILLABLE_FIELDS[key] ?? FILLABLE_FIELDS[fill.field];
    if (!meta) {
      // Unknown field key — keep as labeled inference only, never invent DNA slot
      next.inferences.push(
        `Inference (website): ${fill.field}=${fill.value} [quote: ${fill.evidenceQuote.slice(0, 80)}]`,
      );
      continue;
    }
    const current = meta.get(next);
    if (current != null && current !== '') {
      // NEVER overwrite existing non-null CSV facts
      continue;
    }
    meta.set(next, fill.value);
    next.facts.push(meta.factLabel(fill.value));
    filledCount += 1;
  }

  for (const inf of result.enrichment.inferences) {
    const label = inf.field
      ? `Inference (website/${inf.field}): ${inf.text}`
      : `Inference (website): ${inf.text}`;
    if (!next.inferences.includes(label)) next.inferences.push(label);
  }

  for (const bullet of result.enrichment.narrativeBullets) {
    const label = `Narrative (website): ${bullet}`;
    if (!next.inferences.includes(label)) next.inferences.push(label);
  }

  // Append website evidence (do not drop CSV evidence)
  const seen = new Set(
    next.evidence.map((e) => `${e.source}|${e.field}|${e.value}|${e.evidenceQuote ?? ''}`),
  );
  for (const e of result.evidence) {
    const k = `${e.source}|${e.field}|${e.value}|${e.evidenceQuote ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    next.evidence.push(e);
  }

  recomputeUnknownsAndConfidence(next);
  // Small bump when we filled at least one unknown
  if (filledCount > 0) {
    next.confidence = Math.min(95, next.confidence + Math.min(8, filledCount * 2));
  }

  return { dna: next, didEnrich: true };
}

/** Persist enriched DNA profile + evidence rows for a company. */
export async function persistEnrichedDna(dna: CompanyDna): Promise<void> {
  await prisma.companyProfile.upsert({
    where: { companyId: dna.companyId },
    create: { companyId: dna.companyId, dna: dna as unknown as Prisma.InputJsonValue },
    update: { dna: dna as unknown as Prisma.InputJsonValue },
  });

  // Replace evidence for this company (avoid dupes on re-run)
  await prisma.evidence.deleteMany({ where: { companyId: dna.companyId } });
  if (dna.evidence.length) {
    await prisma.evidence.createMany({
      data: dna.evidence.map((e: EvidenceItem) => ({
        companyId: dna.companyId,
        field: e.field,
        value: e.evidenceQuote ? `${e.value} | quote: ${e.evidenceQuote.slice(0, 240)}` : e.value,
        source: e.source,
      })),
    });
  }
}

/**
 * Enrich many companies sequentially (controlled N). Returns map companyId → DNA.
 */
export async function enrichCompanies(
  dnas: CompanyDna[],
  ai: AiProvider,
  opts?: { persist?: boolean },
): Promise<Map<string, CompanyDna>> {
  const out = new Map<string, CompanyDna>();
  for (const dna of dnas) {
    const { dna: enriched, didEnrich } = await enrichCompanyDna(dna, ai);
    out.set(enriched.companyId, enriched);
    if (opts?.persist && didEnrich) {
      await persistEnrichedDna(enriched);
    } else if (opts?.persist && !didEnrich) {
      // Still persist baseline DNA so profiles exist
      await persistEnrichedDna(enriched);
    }
  }
  return out;
}
