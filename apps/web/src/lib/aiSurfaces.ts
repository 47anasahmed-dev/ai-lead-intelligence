/**
 * Extract AI-facing copy ONLY from real API / enrichment fields.
 * Never invent narrative client-side.
 */

export type AiRiskHint = { label: string; title: string; kind: 'no_web' | 'risk' | 'other' };

export function aiRiskHint(risks: string[]): AiRiskHint | null {
  if (!risks?.length) return null;
  const joined = risks.join(' ');
  if (
    /no usable company information|fetch failed|invalid or missing website|enrichment error|no web data/i.test(
      joined,
    )
  ) {
    return { label: 'AI: no web data', title: risks[0], kind: 'no_web' };
  }
  if (/AI red flag/i.test(joined)) {
    return {
      label: 'AI: risk',
      title: risks.find((r) => /AI red flag/i.test(r)) ?? risks[0],
      kind: 'risk',
    };
  }
  return {
    label: risks[0].length > 48 ? `${risks[0].slice(0, 45)}…` : risks[0],
    title: risks[0],
    kind: 'other',
  };
}

/** Pull labeled AI narrative bullets from similarityExplanation. */
export function extractAiNarratives(similarityExplanation: string[] | undefined): string[] {
  if (!similarityExplanation?.length) return [];
  return similarityExplanation
    .filter((e) => /^AI narrative:/i.test(e))
    .map((e) => e.replace(/^AI narrative:\s*/i, '').trim())
    .filter(Boolean);
}

/** Non-AI similarity explanation lines (dimensional / rule explanations). */
export function extractWhyRanked(similarityExplanation: string[] | undefined): string[] {
  if (!similarityExplanation?.length) return [];
  return similarityExplanation
    .filter((e) => !/^AI narrative:/i.test(e))
    .map((e) => e.trim())
    .filter(Boolean);
}

export function extractAiResearchFromInferences(inferences: string[] | undefined): {
  status: string | null;
  researchNote: string | null;
  redFlags: string[];
  otherInferences: string[];
} {
  const list = inferences ?? [];
  let status: string | null = null;
  let researchNote: string | null = null;
  const redFlags: string[] = [];
  const otherInferences: string[] = [];
  for (const i of list) {
    if (i.startsWith('AI research status:')) {
      status = i.replace(/^AI research status:\s*/i, '').trim();
    } else if (i.startsWith('AI research:')) {
      researchNote = i.replace(/^AI research:\s*/i, '').trim();
    } else if (i.startsWith('AI red flag:')) {
      redFlags.push(i.replace(/^AI red flag:\s*/i, '').trim());
    } else {
      otherInferences.push(i);
    }
  }
  return { status, researchNote, redFlags, otherInferences };
}

/**
 * Short card one-liner from real fields only.
 * Priority: AI narrative → positive signal → risk hint → thin/awaiting state.
 */
export function leadAiOneLiner(row: {
  positiveSignals?: string[];
  risks?: string[];
  similarityExplanation?: string[];
  missingInformation?: string[];
  aiFitNarrative?: string | null;
  aiFitNarrativeThin?: boolean;
  researchStatus?: string | null;
  researchNote?: string | null;
}): { text: string; thin: boolean } {
  if (row.aiFitNarrative?.trim()) {
    const thin =
      row.aiFitNarrativeThin === true ||
      /AI fit narrative thin:/i.test(row.aiFitNarrative);
    return { text: truncate(row.aiFitNarrative, 110), thin };
  }

  const narratives = extractAiNarratives(row.similarityExplanation);
  if (narratives[0]) {
    const thin = /AI fit narrative thin:/i.test(narratives[0]);
    return { text: truncate(narratives[0], 110), thin };
  }

  const signal = row.positiveSignals?.find((s) => s.trim().length > 0);
  if (signal) return { text: truncate(signal, 110), thin: false };

  const hint = aiRiskHint(row.risks ?? []);
  if (hint?.kind === 'no_web') return { text: 'AI: no web data', thin: true };
  if (hint?.kind === 'risk') return { text: 'AI: risk flagged', thin: true };

  if (row.researchStatus && row.researchStatus !== 'ok') {
    return { text: `AI research: ${row.researchStatus}`, thin: true };
  }

  if ((row.missingInformation?.length ?? 0) > 0) {
    return { text: 'Awaiting AI research…', thin: true };
  }
  return { text: 'Awaiting AI research…', thin: true };
}

/** Prefer typed result fields, fall back to parsing inference stamps. */
export function resolveAiResearch(row: {
  inferences?: string[];
  researchNote?: string | null;
  researchStatus?: string | null;
  redFlags?: string[];
}): {
  status: string | null;
  researchNote: string | null;
  redFlags: string[];
  otherInferences: string[];
} {
  const parsed = extractAiResearchFromInferences(row.inferences);
  return {
    status: row.researchStatus ?? parsed.status,
    researchNote: row.researchNote ?? parsed.researchNote,
    redFlags:
      row.redFlags && row.redFlags.length > 0 ? row.redFlags : parsed.redFlags,
    otherInferences: parsed.otherInferences,
  };
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * One punchy line for Ideal DNA / summaries — first sentence, capped.
 * Does not invent copy; only trims/splits real text.
 */
export function firstSentence(text: string | null | undefined, max = 110): string {
  if (!text?.trim()) return '';
  const t = text.trim().replace(/\s+/g, ' ');
  // Prefer first sentence-like clause
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const head = (m?.[1] ?? t).trim();
  return truncate(head, max);
}

/** Split multi-value AI dumps into list-like segments (`;` / `,`). */
export function splitChipSegments(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];
  if (raw.includes(';')) {
    return raw
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Comma lists: only when it looks like a list (2+ commas or long dump)
  const commas = (raw.match(/,/g) ?? []).length;
  if (commas >= 2 || (commas >= 1 && raw.length > 48)) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [raw];
}

/**
 * Compact a single chip value for display; keep full original for hover title.
 * Prefers first clause(s) before `;` / list separators.
 */
export function compactChipValue(
  value: string,
  maxLen = 32,
  maxSegments = 1,
): { display: string; full: string } {
  const full = value.trim();
  if (!full) return { display: '', full: '' };
  const segments = splitChipSegments(full);
  const take = Math.max(1, maxSegments);
  const primary = segments.slice(0, take).join(' · ') || full;
  return { display: truncate(primary, maxLen), full };
}

export type CompactDnaChip = {
  label: string;
  /** Short display phrase */
  value: string;
  /** Original value for title / tooltip */
  full: string;
};

export type CompactDnaOpts = {
  /** Max chips to keep (default: all) */
  maxChips?: number;
  /** Max chars per chip display (default 32) */
  maxLen?: number;
  /** Segments to keep from list-like values (1 default; 2 for Ideal strip) */
  maxSegments?: number;
};

/** Wrap raw DNA chips into compact display chips (scoring APIs unchanged). */
export function compactDnaChips(
  chips: DnaChip[],
  opts: CompactDnaOpts = {},
): CompactDnaChip[] {
  const maxLen = opts.maxLen ?? 32;
  const maxSegments = opts.maxSegments ?? 1;
  const sliced = opts.maxChips != null ? chips.slice(0, opts.maxChips) : chips;
  return sliced.map((c) => {
    const { display, full } = compactChipValue(c.value, maxLen, maxSegments);
    return { label: c.label, value: display, full };
  });
}

export type IdealDnaLike = {
  identity?: {
    industry?: string | null;
    primaryService?: string | null;
    description?: string | null;
  };
  ownership?: { type?: string | null };
  growth?: { signal?: string | null };
  geography?: { region?: string | null; country?: string | null };
  size?: { employeeRange?: string | null };
  customers?: { profile?: string | null };
  businessModel?: { model?: string | null; revenueModel?: string | null };
  inferences?: string[];
  facts?: string[];
  confidence?: number;
  idealDnaSummary?: string | null;
};

export type DnaChip = { label: string; value: string };

export function idealDnaChips(dna: IdealDnaLike | null | undefined): DnaChip[] {
  if (!dna) return [];
  const chips: DnaChip[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value?.trim()) chips.push({ label, value: value.trim() });
  };
  push('Industry', dna.identity?.industry);
  push('Service', dna.identity?.primaryService);
  push('Ownership', dna.ownership?.type);
  push('Growth', dna.growth?.signal);
  push('Geo', dna.geography?.region ?? dna.geography?.country);
  push('Size', dna.size?.employeeRange);
  push('Customers', dna.customers?.profile);
  push('Model', dna.businessModel?.model);
  return chips;
}

export function companyDnaChips(company: {
  industry?: string | null;
  primaryService?: string | null;
  ownership?: string | null;
  geography?: string | null;
  employeeRange?: string | null;
  businessModel?: string | null;
}): DnaChip[] {
  const chips: DnaChip[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value?.trim()) chips.push({ label, value: value.trim() });
  };
  push('Industry', company.industry);
  push('Service', company.primaryService);
  push('Ownership', company.ownership);
  push('Geo', company.geography);
  push('Size', company.employeeRange);
  push('Model', company.businessModel);
  return chips;
}
