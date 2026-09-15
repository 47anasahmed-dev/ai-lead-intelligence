import type { CompanyDna, SimilarityDimensions, SimilarityResult } from './types.js';
import { SIMILARITY_WEIGHTS } from './types.js';
import {
  jaccardScore,
  normalizeText,
  sizeProximityScore,
  textMatchScore,
  tokenize,
} from './normalize.js';

function dimScore(ideal: CompanyDna, candidate: CompanyDna): SimilarityDimensions {
  const industry = textMatchScore(
    normalizeText(ideal.identity.industry),
    normalizeText(candidate.identity.industry),
  );

  const services = Math.round(
    (jaccardScore(
      tokenize(ideal.identity.primaryService),
      tokenize(candidate.identity.primaryService),
    ) +
      jaccardScore(
        tokenize(
          [ideal.identity.primaryService, ideal.technology.stack].filter(Boolean).join(';'),
        ),
        tokenize(
          [candidate.identity.primaryService, candidate.technology.stack]
            .filter(Boolean)
            .join(';'),
        ),
      )) /
      2,
  );

  const customers = textMatchScore(
    normalizeText(ideal.customers.profile),
    normalizeText(candidate.customers.profile),
  );

  const businessModel = Math.round(
    (textMatchScore(
      normalizeText(ideal.businessModel.model),
      normalizeText(candidate.businessModel.model),
    ) +
      textMatchScore(
        normalizeText(ideal.businessModel.revenueModel),
        normalizeText(candidate.businessModel.revenueModel),
      )) /
      2,
  );

  const size = sizeProximityScore(ideal.size.employeeRange, candidate.size.employeeRange);

  const ownership = textMatchScore(
    normalizeText(ideal.ownership.type),
    normalizeText(candidate.ownership.type),
  );

  const geography = Math.max(
    textMatchScore(
      normalizeText(ideal.geography.region),
      normalizeText(candidate.geography.region),
    ),
    textMatchScore(
      normalizeText(ideal.geography.country),
      normalizeText(candidate.geography.country),
    ),
  );

  const growth = textMatchScore(
    normalizeText(ideal.growth.signal),
    normalizeText(candidate.growth.signal),
  );

  return {
    industry,
    services,
    customers,
    businessModel,
    size,
    ownership,
    geography,
    growth,
  };
}

export function similarityScore(ideal: CompanyDna, candidate: CompanyDna): SimilarityResult {
  const dimensions = dimScore(ideal, candidate);

  let weighted = 0;
  for (const key of Object.keys(SIMILARITY_WEIGHTS) as Array<keyof SimilarityDimensions>) {
    weighted += dimensions[key] * SIMILARITY_WEIGHTS[key];
  }
  const overallScore = Math.round(Math.min(100, Math.max(0, weighted)));

  const explanation: string[] = [];
  const ranked = (Object.keys(dimensions) as Array<keyof SimilarityDimensions>)
    .map((k) => ({ k, score: dimensions[k], weight: SIMILARITY_WEIGHTS[k] }))
    .sort((a, b) => b.score * b.weight - a.score * a.weight);

  for (const { k, score, weight } of ranked) {
    if (score >= 70) {
      explanation.push(
        `Strong ${k} match (${score}/100, weight ${(weight * 100).toFixed(0)}%)`,
      );
    } else if (score >= 40) {
      explanation.push(
        `Partial ${k} overlap (${score}/100, weight ${(weight * 100).toFixed(0)}%)`,
      );
    } else if (score > 0) {
      explanation.push(`Weak ${k} alignment (${score}/100)`);
    } else {
      explanation.push(`No usable ${k} signal for comparison`);
    }
  }

  explanation.push(`Weighted overall similarity: ${overallScore}/100`);
  return { overallScore, dimensions, explanation };
}
