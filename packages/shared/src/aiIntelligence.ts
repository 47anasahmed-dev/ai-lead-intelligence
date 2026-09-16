/**
 * AI Lead Intelligence surfaces — typed fields + parsers for DNA inference stamps.
 * Narrative/prose is additive; never used to change deterministic scores.
 */

export type AiResearchStatus =
  | 'ok'
  | 'empty'
  | 'fetch_failed'
  | 'invalid_url'
  | 'ai_error'
  | 'pending'
  | 'thin';

/** Distinct from scoring confidence (field completeness). */
export type AiResearchConfidence = number | null; // 0–100, or null when unknown/pending

export const AI_STATUS_PREFIX = 'AI research status:';
export const AI_RESEARCH_PREFIX = 'AI research:';
export const AI_RED_FLAG_PREFIX = 'AI red flag:';
export const AI_NARRATIVE_PREFIX = 'AI narrative:';
export const AI_IDEAL_SUMMARY_PREFIX = 'AI Ideal DNA summary:';

export interface AiResearchFields {
  researchStatus: AiResearchStatus | string | null;
  researchNote: string | null;
  redFlags: string[];
  /** Non-stamp inferences (website inferences, narratives, etc.) */
  otherInferences: string[];
  /** Full inference list including stamps (for backward-compatible payloads) */
  inferences: string[];
}

export interface FitNarrativePayload {
  /** Short 2–4 sentence why-this-lead vs Ideal DNA (additive intelligence) */
  aiFitNarrative: string | null;
  /** True when prose is an honest thin/awaiting stub, not invented fit copy */
  aiFitNarrativeThin: boolean;
}

/**
 * Pull labeled AI research stamps from DNA inferences.
 */
export function extractAiResearchFromInferences(
  inferences: string[] | undefined | null,
): AiResearchFields {
  const list = inferences ?? [];
  let researchStatus: string | null = null;
  let researchNote: string | null = null;
  const redFlags: string[] = [];
  const otherInferences: string[] = [];
  for (const i of list) {
    if (i.startsWith(AI_STATUS_PREFIX)) {
      researchStatus = i.slice(AI_STATUS_PREFIX.length).trim();
    } else if (i.startsWith(AI_RESEARCH_PREFIX)) {
      researchNote = i.slice(AI_RESEARCH_PREFIX.length).trim();
    } else if (i.startsWith(AI_RED_FLAG_PREFIX)) {
      const t = i.slice(AI_RED_FLAG_PREFIX.length).trim();
      if (t) redFlags.push(t);
    } else if (i.startsWith(AI_IDEAL_SUMMARY_PREFIX)) {
      // Ideal DNA summary lives on idealDna.idealDnaSummary; skip stamp form here
      otherInferences.push(i);
    } else {
      otherInferences.push(i);
    }
  }
  return {
    researchStatus,
    researchNote,
    redFlags,
    otherInferences,
    inferences: list,
  };
}

/** Pull labeled AI narrative bullets from similarity explanation lines. */
export function extractAiNarratives(
  similarityExplanation: string[] | undefined | null,
): string[] {
  if (!similarityExplanation?.length) return [];
  return similarityExplanation
    .filter((e) => e.startsWith(AI_NARRATIVE_PREFIX) || /^AI narrative:/i.test(e))
    .map((e) => e.replace(/^AI narrative:\s*/i, '').trim())
    .filter(Boolean);
}

/** Join narrative bullets into a single fit narrative string. */
export function joinAiFitNarrative(narratives: string[]): string | null {
  if (!narratives.length) return null;
  return narratives.join(' ').trim() || null;
}

/**
 * AI research confidence (0–100) — distinct from scoring confidence.
 * Reflects research outcome quality, not DNA field completeness.
 */
export function computeAiResearchConfidence(
  researchStatus: string | null | undefined,
  opts?: { redFlagCount?: number; hasResearchNote?: boolean; hasWebsiteFindings?: boolean },
): AiResearchConfidence {
  if (researchStatus == null || researchStatus === '' || researchStatus === 'pending') {
    return null;
  }
  const redFlags = opts?.redFlagCount ?? 0;
  let base: number;
  switch (researchStatus) {
    case 'ok':
      base = opts?.hasWebsiteFindings === false ? 55 : 85;
      if (opts?.hasResearchNote) base = Math.min(90, base + 5);
      break;
    case 'thin':
      base = 40;
      break;
    case 'empty':
      base = 25;
      break;
    case 'ai_error':
      base = 20;
      break;
    case 'fetch_failed':
      base = 15;
      break;
    case 'invalid_url':
      base = 10;
      break;
    default:
      base = 30;
  }
  const penalty = Math.min(30, redFlags * 8);
  return Math.max(0, Math.min(100, base - penalty));
}

/** Honest thin-status fit copy when research is empty / failed — never invent prose. */
export function thinFitNarrativeMessage(researchStatus: string | null | undefined): string {
  switch (researchStatus) {
    case 'fetch_failed':
      return 'AI fit narrative thin: website research failed, so no evidence-backed why-this-lead prose is available yet. Deterministic scores still apply.';
    case 'invalid_url':
      return 'AI fit narrative thin: no valid website on file for research. Scores reflect CSV/DNA fields only.';
    case 'ai_error':
      return 'AI fit narrative thin: enrichment error prevented an evidence-locked fit narrative.';
    case 'empty':
      return 'AI fit narrative thin: website research returned no usable findings after quote filtering. No invented fit story.';
    case 'thin':
      return 'AI fit narrative thin: limited evidence available to explain fit vs Ideal DNA.';
    case 'pending':
    case null:
    case undefined:
    case '':
      return 'AI fit narrative thin: awaiting AI research. Deterministic similarity and qualification scores are already available.';
    default:
      return 'AI fit narrative thin: insufficient grounded evidence for a full fit narrative.';
  }
}

export function isThinResearchStatus(status: string | null | undefined): boolean {
  return (
    status == null ||
    status === '' ||
    status === 'pending' ||
    status === 'empty' ||
    status === 'fetch_failed' ||
    status === 'invalid_url' ||
    status === 'ai_error' ||
    status === 'thin'
  );
}

/** Zod-friendly schema docs for fit narrative structured generate. */
export const FIT_NARRATIVE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fitNarrative: { type: 'string' },
    narrativeBullets: { type: 'array', items: { type: 'string' } },
    thin: { type: 'boolean' },
  },
  required: ['fitNarrative', 'thin'],
} as const;

export const IDEAL_DNA_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    idealDnaSummary: { type: 'string' },
    thin: { type: 'boolean' },
  },
  required: ['idealDnaSummary', 'thin'],
} as const;
