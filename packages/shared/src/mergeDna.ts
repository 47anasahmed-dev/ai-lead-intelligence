/**
 * Merge-only Company DNA / evidence helpers for re-enrich & deep enrich.
 * Deterministic union is the no-loss source of truth; optional AI assist may
 * propose ordering/phrasing but must never drop prior findings.
 */

import type { CompanyDna, EvidenceItem } from './types.js';

/** Stable dedupe key: companyId+source+field+value+quote */
export function evidenceStableKey(
  companyId: string,
  source: string,
  field: string,
  value: string,
  quote?: string | null,
): string {
  return [
    companyId,
    source ?? '',
    field ?? '',
    (value ?? '').trim(),
    (quote ?? '').trim(),
  ].join('\u0001');
}

export function evidenceItemKey(companyId: string, e: EvidenceItem): string {
  return evidenceStableKey(
    companyId,
    e.source,
    e.field,
    e.value,
    e.evidenceQuote,
  );
}

/** Parse "value | quote: …" mash used when persisting Evidence rows. */
export function parseEvidenceTableValue(raw: string): {
  value: string;
  evidenceQuote?: string;
} {
  const m = raw.match(/^(.*?)\s*\|\s*quote:\s*(.*)$/s);
  if (!m) return { value: raw };
  return { value: m[1].trim(), evidenceQuote: m[2].trim() || undefined };
}

export function evidenceTableRowKey(
  companyId: string,
  row: { source: string; field: string; value: string },
): string {
  const { value, evidenceQuote } = parseEvidenceTableValue(row.value);
  return evidenceStableKey(companyId, row.source, row.field, value, evidenceQuote);
}

/** Value column format matching historical persistEnrichedDna mash. */
export function mashEvidenceValue(e: EvidenceItem): string {
  return e.evidenceQuote
    ? `${e.value} | quote: ${e.evidenceQuote.slice(0, 240)}`
    : e.value;
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'number') return Number.isNaN(v);
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (!t) return true;
  return /^(unknown|n\/?a|none|null|undefined|-)$/i.test(t);
}

/** Keep a good existing value; never overwrite with empty/unknown. */
export function preferFilled<T>(existing: T, incoming: T): T {
  if (!isBlank(existing)) return existing;
  if (!isBlank(incoming)) return incoming;
  return existing ?? incoming;
}

export function unionStrings(
  ...lists: Array<string[] | null | undefined>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const raw of list) {
      const s = typeof raw === 'string' ? raw.trim() : '';
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function unionEvidence(
  companyId: string,
  ...lists: Array<EvidenceItem[] | null | undefined>
): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const e of list) {
      const k = evidenceItemKey(companyId, e);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
  }
  return out;
}

function isAiStatusInference(s: string): boolean {
  return s.startsWith('AI research status:');
}

/** Optional AI-proposed lists — always unioned under deterministic merge. */
export type DnaMergeAssist = {
  facts?: string[];
  inferences?: string[];
  notes?: string[];
};

/**
 * Deterministic no-loss merge of existing CompanyProfile DNA + new enrich result.
 * - Scalar facts: keep existing when good; fill from incoming only when blank
 * - Arrays: unique union (facts / inferences / evidence)
 * - Latest "AI research status:" from incoming wins; prior red flags & notes kept
 * - AI assist arrays are included then unioned so drops cannot erase either side
 */
export function mergeCompanyDna(
  existing: CompanyDna | null | undefined,
  incoming: CompanyDna,
  assist?: DnaMergeAssist | null,
): CompanyDna {
  if (!existing || existing.companyId !== incoming.companyId) {
    // Still apply assist union onto incoming for consistency
    if (!assist) return structuredClone(incoming);
    const base = structuredClone(incoming);
    base.facts = unionStrings(base.facts, assist.facts);
    const assistInferences = [
      ...(assist.inferences ?? []),
      ...(assist.notes ?? []).map((n) =>
        n.startsWith('AI research:') ? n : `AI research: ${n}`,
      ),
    ];
    base.inferences = unionStrings(base.inferences, assistInferences);
    base.evidence = unionEvidence(base.companyId, base.evidence);
    return base;
  }

  const companyId = incoming.companyId;
  const merged: CompanyDna = structuredClone(existing);

  // Identity
  merged.identity = {
    name: preferFilled(existing.identity.name, incoming.identity.name) || incoming.identity.name,
    website: preferFilled(existing.identity.website, incoming.identity.website),
    industry: preferFilled(existing.identity.industry, incoming.identity.industry),
    primaryService: preferFilled(
      existing.identity.primaryService,
      incoming.identity.primaryService,
    ),
    description: preferFilled(
      existing.identity.description,
      incoming.identity.description,
    ),
  };

  merged.customers = {
    profile: preferFilled(existing.customers.profile, incoming.customers.profile),
  };

  merged.businessModel = {
    model: preferFilled(existing.businessModel.model, incoming.businessModel.model),
    revenueModel: preferFilled(
      existing.businessModel.revenueModel,
      incoming.businessModel.revenueModel,
    ),
  };

  merged.size = {
    employeeRange: preferFilled(
      existing.size.employeeRange,
      incoming.size.employeeRange,
    ),
    estimatedRevenueUsd: preferFilled(
      existing.size.estimatedRevenueUsd,
      incoming.size.estimatedRevenueUsd,
    ),
  };

  merged.ownership = {
    type: preferFilled(existing.ownership.type, incoming.ownership.type),
  };

  merged.growth = {
    signal: preferFilled(existing.growth.signal, incoming.growth.signal),
    foundedYear: preferFilled(existing.growth.foundedYear, incoming.growth.foundedYear),
  };

  merged.reputation = {
    signal: preferFilled(existing.reputation.signal, incoming.reputation.signal),
  };

  merged.technology = {
    stack: preferFilled(existing.technology.stack, incoming.technology.stack),
  };

  merged.geography = {
    region: preferFilled(existing.geography.region, incoming.geography.region),
    country: preferFilled(existing.geography.country, incoming.geography.country),
    city: preferFilled(existing.geography.city, incoming.geography.city),
    state: preferFilled(existing.geography.state, incoming.geography.state),
  };

  const assistNotes = (assist?.notes ?? []).map((n) =>
    n.startsWith('AI research:') ? n : `AI research: ${n}`,
  );

  // Drop stale status lines from existing; keep red flags / research notes / other inferences
  const existingInferences = (existing.inferences ?? []).filter(
    (i) => !isAiStatusInference(i),
  );
  const incomingInferences = incoming.inferences ?? [];

  merged.facts = unionStrings(existing.facts, incoming.facts, assist?.facts);
  merged.inferences = unionStrings(
    existingInferences,
    incomingInferences,
    assist?.inferences,
    assistNotes,
  );
  merged.evidence = unionEvidence(
    companyId,
    existing.evidence,
    incoming.evidence,
  );

  // Unknowns: prefer incoming (post-enrich) but keep any existing still applicable
  // Drop "Unknown: X" style entries when the corresponding merged field is filled.
  const fieldFilled: Record<string, boolean> = {
    industry: !isBlank(merged.identity.industry),
    primary_service: !isBlank(merged.identity.primaryService),
    customer_profile: !isBlank(merged.customers.profile),
    business_model: !isBlank(merged.businessModel.model),
    ownership: !isBlank(merged.ownership.type),
    geography: !isBlank(merged.geography.region),
    growth_signal: !isBlank(merged.growth.signal),
    estimated_revenue_usd: !isBlank(merged.size.estimatedRevenueUsd),
    technology_stack: !isBlank(merged.technology.stack),
    reputation_signal: !isBlank(merged.reputation.signal),
  };

  const unknownCandidates = unionStrings(existing.unknowns, incoming.unknowns);
  merged.unknowns = unknownCandidates.filter((u) => {
    const m = u.match(/unknown:\s*(.+)$/i);
    if (!m) return true;
    const key = m[1].trim().toLowerCase().replace(/\s+/g, '_');
    if (key in fieldFilled && fieldFilled[key]) return false;
    return true;
  });

  merged.confidence = Math.max(
    existing.confidence ?? 0,
    incoming.confidence ?? 0,
  );

  merged.idealDnaSummary = preferFilled(
    existing.idealDnaSummary,
    incoming.idealDnaSummary,
  );

  if (existing._meta || incoming._meta) {
    merged._meta = {
      demoFit: preferFilled(existing._meta?.demoFit, incoming._meta?.demoFit),
    };
  }

  return merged;
}
