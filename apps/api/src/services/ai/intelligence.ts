/**
 * Evidence-locked AI Lead Intelligence layer.
 * Generates fit narratives + Ideal DNA summaries without changing deterministic scores.
 */

import {
  AI_NARRATIVE_PREFIX,
  FIT_NARRATIVE_JSON_SCHEMA,
  IDEAL_DNA_SUMMARY_JSON_SCHEMA,
  THRESHOLD_SUGGEST_JSON_SCHEMA,
  clampThresholdSuggest,
  extractAiResearchFromInferences,
  heuristicSuggestThresholds,
  isThinResearchStatus,
  thinFitNarrativeMessage,
  type AiProvider,
  type CompanyDna,
  type QualificationResult,
  type ScoreEvidenceRow,
  type SimilarityResult,
  type ThresholdSuggestResult,
} from '@ali/shared';

export interface FitNarrativeResult {
  narrative: string;
  thin: boolean;
  bullets: string[];
}

function candidateEvidenceSnippet(dna: CompanyDna, max = 12): string {
  const lines: string[] = [];
  for (const f of dna.facts.slice(0, 8)) lines.push(`FACT: ${f}`);
  for (const e of dna.evidence.slice(0, max)) {
    const quote = e.evidenceQuote ? ` quote="${e.evidenceQuote.slice(0, 120)}"` : '';
    lines.push(`EVIDENCE[${e.source}] ${e.field}=${e.value}${quote}`);
  }
  const research = extractAiResearchFromInferences(dna.inferences);
  if (research.researchStatus) lines.push(`RESEARCH_STATUS: ${research.researchStatus}`);
  if (research.researchNote) lines.push(`RESEARCH_NOTE: ${research.researchNote}`);
  for (const flag of research.redFlags.slice(0, 5)) lines.push(`RED_FLAG: ${flag}`);
  return lines.join('\n');
}

function idealEvidenceSnippet(ideal: CompanyDna): string {
  const lines: string[] = [
    `IDEAL name=${ideal.identity.name}`,
    `industry=${ideal.identity.industry ?? 'unknown'}`,
    `services=${ideal.identity.primaryService ?? 'unknown'}`,
    `customers=${ideal.customers.profile ?? 'unknown'}`,
    `model=${ideal.businessModel.model ?? 'unknown'}`,
    `ownership=${ideal.ownership.type ?? 'unknown'}`,
    `geo=${ideal.geography.region ?? ideal.geography.country ?? 'unknown'}`,
    `size=${ideal.size.employeeRange ?? 'unknown'}`,
    `growth=${ideal.growth.signal ?? 'unknown'}`,
  ];
  for (const f of ideal.facts.slice(0, 10)) lines.push(`FACT: ${f}`);
  for (const e of ideal.evidence.slice(0, 8)) {
    lines.push(`EVIDENCE[${e.source}] ${e.field}=${e.value}`);
  }
  return lines.join('\n');
}

/**
 * Generate a short fit narrative vs Ideal DNA.
 * If research is thin/empty, returns honest thin status — never invented prose.
 */
export async function generateFitNarrative(
  ai: AiProvider,
  idealDna: CompanyDna,
  candidate: CompanyDna,
  similarity: SimilarityResult,
  qualification: QualificationResult,
): Promise<FitNarrativeResult> {
  const research = extractAiResearchFromInferences(candidate.inferences);
  if (isThinResearchStatus(research.researchStatus) && research.researchStatus !== 'ok') {
    // pending/null without any stamp: still allow narrative from CSV facts if AI live,
    // but if we have an explicit failure/empty stamp → honest thin.
    if (
      research.researchStatus === 'empty' ||
      research.researchStatus === 'fetch_failed' ||
      research.researchStatus === 'invalid_url' ||
      research.researchStatus === 'ai_error' ||
      research.researchStatus === 'thin'
    ) {
      const msg = thinFitNarrativeMessage(research.researchStatus);
      return { narrative: msg, thin: true, bullets: [msg] };
    }
  }

  if (ai.name === 'noop') {
    const msg = thinFitNarrativeMessage(research.researchStatus ?? 'pending');
    return { narrative: msg, thin: true, bullets: [msg] };
  }

  try {
    const raw = await ai.generateStructured<{
      fitNarrative?: string;
      narrativeBullets?: string[];
      thin?: boolean;
    }>({
      systemPrompt: `You write short AI Lead Intelligence fit narratives for B2B sales.
Rules:
- Use ONLY the Ideal DNA fields, candidate facts/evidence, scores, and research stamps provided.
- Do NOT invent company facts, customers, funding, or products not in the evidence.
- Prefer "unknown" / thin status over guessing.
- Write 2–4 short sentences explaining why this lead fits (or does not) the Ideal DNA.
- Mention concrete overlapping dimensions when scores support them.
- If evidence is too thin, set thin=true and say so honestly.
- Return JSON matching the schema.`,
      userPrompt: `IDEAL DNA:
${idealEvidenceSnippet(idealDna)}

CANDIDATE: ${candidate.identity.name} (${candidate.companyId})
${candidateEvidenceSnippet(candidate)}

SCORES (do not change these — only explain):
similarity.overall=${similarity.overallScore}
dimensions=${JSON.stringify(similarity.dimensions)}
qualification.businessFit=${qualification.businessFit}
qualification.strategicFit=${qualification.strategicFit}
qualification.score=${qualification.qualificationScore}
qualification.confidence=${qualification.confidence} (data completeness — not AI research confidence)
recommendation=${qualification.recommendation}
positiveSignals=${qualification.positiveSignals.join('; ') || 'none'}
risks=${qualification.risks.join('; ') || 'none'}
missing=${qualification.missingInformation.join('; ') || 'none'}`,
      schema: FIT_NARRATIVE_JSON_SCHEMA,
    });

    const thin = Boolean(raw?.thin);
    const bullets = Array.isArray(raw?.narrativeBullets)
      ? raw.narrativeBullets
          .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
          .map((b) => b.trim())
          .slice(0, 4)
      : [];
    let narrative =
      typeof raw?.fitNarrative === 'string' ? raw.fitNarrative.trim() : '';
    if (!narrative && bullets.length) narrative = bullets.join(' ');
    if (!narrative || thin) {
      const msg =
        narrative ||
        thinFitNarrativeMessage(research.researchStatus ?? 'thin');
      return { narrative: msg, thin: true, bullets: bullets.length ? bullets : [msg] };
    }
    // Cap length — keep 2–4 sentences worth
    if (narrative.length > 900) narrative = `${narrative.slice(0, 897)}…`;
    return {
      narrative,
      thin: false,
      bullets: bullets.length ? bullets : [narrative],
    };
  } catch {
    const msg = thinFitNarrativeMessage(research.researchStatus ?? 'ai_error');
    return { narrative: msg, thin: true, bullets: [msg] };
  }
}

/**
 * Append fit narrative onto similarity.explanation as labeled AI narrative lines.
 * Does not mutate scores.
 */
export function attachFitNarrativeToSimilarity(
  similarity: SimilarityResult,
  fit: FitNarrativeResult,
): SimilarityResult {
  const withoutPrior = similarity.explanation.filter(
    (e) => !e.startsWith(AI_NARRATIVE_PREFIX) && !/^AI narrative:/i.test(e),
  );
  const bullets =
    fit.bullets.length > 0
      ? fit.bullets.slice(0, 4).map((b) => `${AI_NARRATIVE_PREFIX} ${b}`)
      : [`${AI_NARRATIVE_PREFIX} ${fit.narrative}`];
  return {
    ...similarity,
    explanation: [...withoutPrior, ...bullets],
  };
}

/**
 * Synthesize Ideal DNA prose from reference DNAs / centroid fields.
 * Evidence-locked — never invent attributes not present in refs or ideal facts.
 */
export async function generateIdealDnaSummary(
  ai: AiProvider,
  idealDna: CompanyDna,
  referenceDnas?: CompanyDna[],
): Promise<{ summary: string | null; thin: boolean }> {
  if (ai.name === 'noop') {
    return { summary: null, thin: true };
  }

  const refBlock =
    referenceDnas?.length
      ? referenceDnas
          .map((r) => {
            const research = extractAiResearchFromInferences(r.inferences);
            return [
              `REF ${r.identity.name} (${r.companyId})`,
              `industry=${r.identity.industry ?? '?'} service=${r.identity.primaryService ?? '?'}`,
              `customers=${r.customers.profile ?? '?'} model=${r.businessModel.model ?? '?'}`,
              `ownership=${r.ownership.type ?? '?'} geo=${r.geography.region ?? r.geography.country ?? '?'}`,
              `size=${r.size.employeeRange ?? '?'} growth=${r.growth.signal ?? '?'}`,
              `facts: ${r.facts.slice(0, 6).join(' | ')}`,
              research.researchNote ? `researchNote: ${research.researchNote}` : null,
            ]
              .filter(Boolean)
              .join('\n');
          })
          .join('\n---\n')
      : '(criteria-derived Ideal DNA — no company references)';

  try {
    const raw = await ai.generateStructured<{
      idealDnaSummary?: string;
      thin?: boolean;
    }>({
      systemPrompt: `You write a short Ideal DNA summary for an AI Lead Intelligence product.
Rules:
- Use ONLY the Ideal DNA centroid/mode fields and reference DNA facts provided.
- Do NOT invent industries, geographies, customers, or ownership not present in the inputs.
- 2–4 sentences describing the Ideal Customer Profile pattern.
- If inputs are too sparse, set thin=true and say what is known vs unknown.
- Return JSON matching the schema.`,
      userPrompt: `IDEAL DNA (centroid/mode):
${idealEvidenceSnippet(idealDna)}

REFERENCE DNAs:
${refBlock}`,
      schema: IDEAL_DNA_SUMMARY_JSON_SCHEMA,
    });

    const thin = Boolean(raw?.thin);
    let summary =
      typeof raw?.idealDnaSummary === 'string' ? raw.idealDnaSummary.trim() : '';
    if (!summary) return { summary: null, thin: true };
    if (summary.length > 900) summary = `${summary.slice(0, 897)}…`;
    return { summary, thin };
  } catch {
    return { summary: null, thin: true };
  }
}

export type ThresholdSuggestInput = {
  rows: ScoreEvidenceRow[];
  idealDnaSummary?: string | null;
  searchStatus?: string | null;
};

/**
 * Suggest ranking floors (AND) so the ranked list stays useful — not empty, not everything.
 * Evidence-locked: only uses provided score/evidence stats + Ideal DNA prose.
 * Falls back to 25th-percentile heuristic when AI is noop / missing / invalid / times out.
 */
export async function suggestRankingThresholds(
  ai: AiProvider,
  input: ThresholdSuggestInput,
): Promise<ThresholdSuggestResult> {
  const heuristic = heuristicSuggestThresholds(input.rows);
  const fallback = (
    message: string,
  ): ThresholdSuggestResult => ({
    ...heuristic,
    source: 'heuristic',
    message,
  });

  if (input.rows.length === 0) {
    return fallback('No scored results for this search — using defaults/heuristic.');
  }

  if (ai.name === 'noop') {
    return fallback('AI provider is noop or missing a key — using local heuristic.');
  }

  const quals = input.rows.map((r) => r.qualificationScore).sort((a, b) => a - b);
  const sims = input.rows
    .map((r) => r.similarityScore)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const evCounts = input.rows.map((r) => r.evidenceCount).sort((a, b) => a - b);

  const stats = (arr: number[]) => {
    if (!arr.length) return { min: null, p25: null, median: null, p75: null, max: null };
    const at = (p: number) => arr[Math.floor((arr.length - 1) * p)]!;
    return {
      min: arr[0]!,
      p25: at(0.25),
      median: at(0.5),
      p75: at(0.75),
      max: arr[arr.length - 1]!,
    };
  };

  const summary =
    typeof input.idealDnaSummary === 'string' && input.idealDnaSummary.trim()
      ? input.idealDnaSummary.trim().slice(0, 800)
      : '(none provided)';

  try {
    const raw = await ai.generateStructured<{
      minQualification?: number;
      minSimilarity?: number;
      minEvidenceCount?: number;
      rationale?: string;
    }>({
      systemPrompt: `You suggest ranking threshold floors for an AI Lead Intelligence workspace.
Rules:
- Leads must pass ALL floors (AND): minQualification, minSimilarity, minEvidenceCount.
- Suggest floors so the ranked list stays useful: not empty, not everything — typically surface a focused shortlist for B2B outreach.
- Use ONLY the provided score/evidence distribution stats and Ideal DNA prose. Never invent company facts, customers, funding, or products.
- Clamp: qualification and similarity 0–100; evidence count 0–50 (integers).
- Prefer floors near the lower quartile / mid band unless the distribution is very tight or sparse.
- Return JSON matching the schema with a short rationale (1–3 sentences) explaining the floors from the stats.`,
      userPrompt: `SEARCH STATUS: ${input.searchStatus ?? 'unknown'}
RESULT COUNT: ${input.rows.length}

QUALIFICATION SCORE STATS: ${JSON.stringify(stats(quals))}
SIMILARITY SCORE STATS: ${JSON.stringify(stats(sims))}
EVIDENCE COUNT STATS: ${JSON.stringify(stats(evCounts))}

IDEAL DNA SUMMARY (prose only — do not invent beyond this):
${summary}

HEURISTIC BASELINE (25th percentile — you may adjust thoughtfully):
${JSON.stringify(heuristic)}`,
      schema: THRESHOLD_SUGGEST_JSON_SCHEMA,
    });

    const clamped = clampThresholdSuggest(raw ?? {});
    if (!clamped) {
      return fallback('AI returned invalid threshold JSON — using local heuristic.');
    }
    return { ...clamped, source: 'ai' };
  } catch (err) {
    const msg =
      err instanceof Error && /timed out/i.test(err.message)
        ? 'AI request timed out — using local heuristic.'
        : 'AI suggest failed — using local heuristic.';
    return fallback(msg);
  }
}
