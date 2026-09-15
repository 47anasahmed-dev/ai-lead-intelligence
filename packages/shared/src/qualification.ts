import type { CompanyDna, QualificationResult, Recommendation, SimilarityResult } from './types.js';
import { normalizeText, textMatchScore } from './normalize.js';

const HARD_EXCLUSION_OWNERSHIP = new Set(['nonprofit', 'non-profit', 'government', 'public sector']);

/**
 * Business fit (60%) + strategic fit (40%).
 * Confidence is separate and driven by field completeness (not blended into score).
 * demo_fit is NEVER consulted.
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

  const qualificationScoreValue = Math.round(businessFit * 0.6 + strategicFit * 0.4);

  // Confidence from candidate field completeness (DNA confidence) blended lightly with ideal
  const confidence = Math.round(candidate.confidence * 0.7 + ideal.confidence * 0.3);

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

  const recommendation = recommend({
    qualificationScore: qualificationScoreValue,
    confidence,
    hardExclusion,
    riskCount: risks.length,
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
