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
}): { text: string; thin: boolean } {
  const narratives = extractAiNarratives(row.similarityExplanation);
  if (narratives[0]) return { text: truncate(narratives[0], 110), thin: false };

  const signal = row.positiveSignals?.find((s) => s.trim().length > 0);
  if (signal) return { text: truncate(signal, 110), thin: false };

  const hint = aiRiskHint(row.risks ?? []);
  if (hint?.kind === 'no_web') return { text: 'AI: no web data', thin: true };
  if (hint?.kind === 'risk') return { text: 'AI: risk flagged', thin: true };

  if ((row.missingInformation?.length ?? 0) > 0) {
    return { text: 'Awaiting AI research…', thin: true };
  }
  return { text: 'Awaiting AI research…', thin: true };
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
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
