/**
 * Map persisted DNA + similarity explanation → typed AI Lead Intelligence fields
 * for /searches/:id/results (so UI does not need a second getCompany).
 */

import {
  computeAiResearchConfidence,
  extractAiNarratives,
  extractAiResearchFromInferences,
  joinAiFitNarrative,
  type CompanyDna,
} from '@ali/shared';

export interface ResultAiFields {
  aiFitNarrative: string | null;
  aiFitNarrativeThin: boolean;
  inferences: string[];
  researchNote: string | null;
  researchStatus: string | null;
  redFlags: string[];
  aiResearchConfidence: number | null;
}

export function buildResultAiFields(
  dna: CompanyDna | null | undefined,
  similarityExplanation: unknown,
): ResultAiFields {
  const explanation = Array.isArray(similarityExplanation)
    ? (similarityExplanation as string[])
    : [];
  const narratives = extractAiNarratives(explanation);
  const aiFitNarrative = joinAiFitNarrative(narratives);
  const thin =
    aiFitNarrative == null || /AI fit narrative thin:/i.test(aiFitNarrative);

  const research = extractAiResearchFromInferences(dna?.inferences);
  const hasWebsiteFindings = (dna?.inferences ?? []).some(
    (i) =>
      i.startsWith('Inference (website') ||
      i.startsWith('Narrative (website):') ||
      i.startsWith('Industry (website):') ||
      i.includes('(website):'),
  );

  return {
    aiFitNarrative,
    aiFitNarrativeThin: thin,
    inferences: research.inferences,
    researchNote: research.researchNote,
    researchStatus: research.researchStatus,
    redFlags: research.redFlags,
    aiResearchConfidence: computeAiResearchConfidence(research.researchStatus, {
      redFlagCount: research.redFlags.length,
      hasResearchNote: Boolean(research.researchNote),
      hasWebsiteFindings,
    }),
  };
}

export function extractIdealDnaSummary(
  idealDna: unknown,
): string | null {
  if (!idealDna || typeof idealDna !== 'object') return null;
  const d = idealDna as { idealDnaSummary?: unknown; inferences?: unknown };
  if (typeof d.idealDnaSummary === 'string' && d.idealDnaSummary.trim()) {
    return d.idealDnaSummary.trim();
  }
  // Fallback: stamped inference form
  if (Array.isArray(d.inferences)) {
    for (const i of d.inferences) {
      if (typeof i === 'string' && i.startsWith('AI Ideal DNA summary:')) {
        const t = i.replace(/^AI Ideal DNA summary:\s*/i, '').trim();
        if (t) return t;
      }
    }
  }
  return null;
}
