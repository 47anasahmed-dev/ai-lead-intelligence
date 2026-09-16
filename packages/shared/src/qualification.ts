import type { CompanyDna, QualificationResult, Recommendation, SimilarityResult } from './types.js';
import { normalizeText, textMatchScore } from './normalize.js';

const HARD_EXCLUSION_OWNERSHIP = new Set(['nonprofit', 'non-profit', 'government', 'public sector']);

const AI_STATUS_PREFIX = 'AI research status:';
const AI_RED_FLAG_PREFIX = 'AI red flag:';

const AI_STATUS_MESSAGES: Record<string, { risk: string; missing?: string }> = {
  fetch_failed: {
    risk: 'AI web research failed to fetch the company website',
    missing: 'Website research unavailable (fetch failed)',
  },
  invalid_url: {
    risk: 'AI web research skipped: invalid or missing website URL',
    missing: 'Website research unavailable (invalid URL)',
  },
  ai_error: {
    risk: 'AI web research encountered an enrichment error',
    missing: 'Website research unavailable (AI error)',
  },
  empty: {
    risk: 'AI web research found no usable company information',
    missing: 'No usable findings from website research',
  },
};

/**
 * Business fit (60%) + strategic fit (40%).
 * Confidence is separate and driven by field completeness (not blended into score).
 * demo_fit is NEVER consulted.
 * AI DNA inference stamps can adjust score/confidence and surface risks.
 */
export function qualificationScore(
  ideal: CompanyDna,
  candidate: CompanyDna,
  similarity: SimilarityResult,
): QualificationResult {
  const positiveSignals: string[] = [];
  const risks: string[] = [];
  const missingInformation = [...candidate.unknowns];

  // Hard exclusions (override weights)
  const ownershipNorm = normalizeText(candidate.ownership.type) ?? '';
  let hardExclusion = false;
  for (const bad of HARD_EXCLUSION_OWNERSHIP) {
    if (ownershipNorm.includes(bad)) {
      hardExclusion = true;
      risks.push(`Hard exclusion: ownership type "${candidate.ownership.type}"`);
    }
  }

  // Business fit: industry + services + customers + business model (from similarity dims)
  const businessFit = Math.round(
    similarity.dimensions.industry * 0.3 +
      similarity.dimensions.services * 0.3 +
      similarity.dimensions.customers * 0.2 +
      similarity.dimensions.businessModel * 0.2,
  );

  // Strategic fit: size + geography + growth + ownership
  const strategicFit = Math.round(
    similarity.dimensions.size * 0.35 +
      similarity.dimensions.geography * 0.3 +
      similarity.dimensions.growth * 0.2 +
      similarity.dimensions.ownership * 0.15,
  );

  let qualificationScoreValue = Math.round(businessFit * 0.6 + strategicFit * 0.4);

  // Confidence from candidate field completeness (DNA confidence) blended lightly with ideal
  let confidence = Math.round(candidate.confidence * 0.7 + ideal.confidence * 0.3);

  if (similarity.dimensions.industry >= 70) {
    positiveSignals.push('Industry aligns with ideal DNA');
  }
  if (similarity.dimensions.services >= 70) {
    positiveSignals.push('Services overlap strongly with references');
  }
  if (similarity.dimensions.customers >= 60) {
    positiveSignals.push('Customer profile resembles ideal buyers');
  }
  if (similarity.dimensions.businessModel >= 70) {
    positiveSignals.push('Business model matches ICP motion');
  }
  if (similarity.dimensions.geography >= 70) {
    positiveSignals.push('Geography matches target region');
  }

  if (similarity.dimensions.industry < 30) {
    risks.push('Industry mismatch vs ideal DNA');
  }
  if (similarity.dimensions.size < 30) {
    risks.push('Company size far from ideal band');
  }
  if (candidate.unknowns.length >= 4) {
    risks.push('High missing-information count reduces trust in scoring');
  }
  if (!candidate.identity.website) {
    risks.push('No website on file');
  }

  // Extra strategic check: ownership alignment signal (not hard exclusion)
  const ownershipAlign = textMatchScore(
    normalizeText(ideal.ownership.type),
    normalizeText(candidate.ownership.type),
  );
  if (ownershipAlign >= 80) {
    positiveSignals.push('Ownership type matches ideal');
  }

  // ── AI research stamps from enrichCompanyDna ──────────────────────────────
  const inferences = candidate.inferences ?? [];
  let aiStatus: string | null = null;
  const redFlags: string[] = [];
  for (const inf of inferences) {
    if (inf.startsWith(AI_STATUS_PREFIX)) {
      aiStatus = inf.slice(AI_STATUS_PREFIX.length).trim();
    } else if (inf.startsWith(AI_RED_FLAG_PREFIX)) {
      const text = inf.slice(AI_RED_FLAG_PREFIX.length).trim();
      if (text) redFlags.push(text);
    }
  }

  const emptyOrFetchFailure =
    aiStatus === 'fetch_failed' ||
    aiStatus === 'invalid_url' ||
    aiStatus === 'ai_error' ||
    aiStatus === 'empty';

  if (aiStatus && AI_STATUS_MESSAGES[aiStatus]) {
    const msg = AI_STATUS_MESSAGES[aiStatus];
    risks.push(msg.risk);
    if (msg.missing && !missingInformation.includes(msg.missing)) {
      missingInformation.push(msg.missing);
    }
  }

  for (const flag of redFlags) {
    risks.push(`AI red flag: ${flag}`);
  }

  if (redFlags.length > 0) {
    qualificationScoreValue = Math.max(
      0,
      qualificationScoreValue - Math.min(25, redFlags.length * 8),
    );
    confidence = Math.max(0, confidence - Math.min(20, redFlags.length * 5));
  }

  if (emptyOrFetchFailure) {
    qualificationScoreValue = Math.max(0, qualificationScoreValue - 8);
  }

  // Bias recommendation down when many red flags or empty research would otherwise CONTACT_NOW
  let riskCountForRecommend = risks.length;
  if (redFlags.length >= 2) {
    riskCountForRecommend = Math.max(riskCountForRecommend, 3);
  }
  if (emptyOrFetchFailure && !hardExclusion) {
    // Ensure CONTACT_NOW threshold (riskCount <= 2) fails when research empty
    riskCountForRecommend = Math.max(riskCountForRecommend, 3);
  }

  const recommendation = recommend({
    qualificationScore: qualificationScoreValue,
    confidence,
    hardExclusion,
    riskCount: riskCountForRecommend,
  });

  if (hardExclusion) {
    return {
      businessFit,
      strategicFit,
      qualificationScore: qualificationScoreValue,
      confidence,
      positiveSignals,
      risks,
      missingInformation,
      recommendation: 'REJECT',
      hardExclusion: true,
    };
  }

  return {
    businessFit,
    strategicFit,
    qualificationScore: qualificationScoreValue,
    confidence,
    positiveSignals,
    risks,
    missingInformation,
    recommendation,
    hardExclusion: false,
  };
}

export function recommend(input: {
  qualificationScore: number;
  confidence: number;
  hardExclusion: boolean;
  riskCount: number;
}): Recommendation {
  if (input.hardExclusion) return 'REJECT';
  if (input.qualificationScore < 35) return 'REJECT';
  if (input.qualificationScore >= 75 && input.confidence >= 60 && input.riskCount <= 2) {
    return 'CONTACT_NOW';
  }
  if (input.qualificationScore >= 55) return 'RESEARCH_MORE';
  return 'MONITOR';
}
