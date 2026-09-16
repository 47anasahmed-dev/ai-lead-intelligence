import {
  buildIdealDna,
  buildIdealDnaFromCriteria,
  deterministicFilter,
  qualificationScore,
  similarityScore,
  type CompanyDna,
  type CriteriaPayload,
  type QualificationResult,
  type SimilarityResult,
} from '@ali/shared';
import { Prisma } from '@prisma/client';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { createServerAiProvider, isLiveAiEnabled } from './ai/createProvider.js';
import { companyToDna } from './companyMapper.js';
import { loadDnasForCompanies } from './research/batchEnrich.js';
import { enrichCompanies } from './research/enrichCompany.js';

export interface RankedResult {
  companyId: string;
  name: string;
  industry: string | null;
  similarity: SimilarityResult;
  qualification: QualificationResult;
}

export interface AnalysisOutcome {
  idealDna: CompanyDna;
  results: RankedResult[];
  candidateCount: number;
  filteredCount: number;
}

async function upsertScoreRows(
  searchId: string,
  candidate: CompanyDna,
  similarity: SimilarityResult,
  qualification: QualificationResult,
): Promise<void> {
  await prisma.similarityResult.upsert({
    where: {
      searchId_companyId: { searchId, companyId: candidate.companyId },
    },
    create: {
      searchId,
      companyId: candidate.companyId,
      overallScore: similarity.overallScore,
      dimensions: similarity.dimensions as unknown as Prisma.InputJsonValue,
      explanation: similarity.explanation as unknown as Prisma.InputJsonValue,
    },
    update: {
      overallScore: similarity.overallScore,
      dimensions: similarity.dimensions as unknown as Prisma.InputJsonValue,
      explanation: similarity.explanation as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.qualification.upsert({
    where: {
      searchId_companyId: { searchId, companyId: candidate.companyId },
    },
    create: {
      searchId,
      companyId: candidate.companyId,
      businessFit: qualification.businessFit,
      strategicFit: qualification.strategicFit,
      qualificationScore: qualification.qualificationScore,
      confidence: qualification.confidence,
      positiveSignals: qualification.positiveSignals,
      risks: qualification.risks,
      missingInformation: qualification.missingInformation,
      recommendation: qualification.recommendation,
      hardExclusion: qualification.hardExclusion,
    },
    update: {
      businessFit: qualification.businessFit,
      strategicFit: qualification.strategicFit,
      qualificationScore: qualification.qualificationScore,
      confidence: qualification.confidence,
      positiveSignals: qualification.positiveSignals,
      risks: qualification.risks,
      missingInformation: qualification.missingInformation,
      recommendation: qualification.recommendation,
      hardExclusion: qualification.hardExclusion,
    },
  });
}

/**
 * Optional AI narrative: explain already-computed scores without changing them.
 * Narratives are appended to similarity.explanation as labeled strings.
 */
async function maybeAttachScoreNarrative(
  ai: ReturnType<typeof createServerAiProvider>,
  similarity: SimilarityResult,
  qualification: QualificationResult,
): Promise<SimilarityResult> {
  if (ai.name === 'noop') return similarity;
  try {
    const raw = await ai.generateStructured<{ narrativeBullets?: string[] }>({
      systemPrompt:
        'Explain lead scores using ONLY the provided numeric dimensions and signals. Do not invent company facts. Do not change or suggest different scores. Return JSON { "narrativeBullets": string[] }.',
      userPrompt: `Similarity overall=${similarity.overallScore} dimensions=${JSON.stringify(similarity.dimensions)}
Qualification businessFit=${qualification.businessFit} strategicFit=${qualification.strategicFit} score=${qualification.qualificationScore} confidence=${qualification.confidence} recommendation=${qualification.recommendation}
Positive: ${qualification.positiveSignals.join('; ')}
Risks: ${qualification.risks.join('; ')}
Missing: ${qualification.missingInformation.join('; ')}`,
      schema: {
        type: 'object',
        properties: { narrativeBullets: { type: 'array', items: { type: 'string' } } },
      },
    });
    const bullets = Array.isArray(raw?.narrativeBullets)
      ? raw.narrativeBullets
          .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
          .slice(0, 5)
          .map((b) => `AI narrative: ${b.trim()}`)
      : [];
    if (!bullets.length) return similarity;
    return {
      ...similarity,
      explanation: [...similarity.explanation, ...bullets],
    };
  } catch {
    return similarity;
  }
}

async function scoreAndPersist(
  searchId: string,
  idealDna: CompanyDna,
  allCompanies: Awaited<ReturnType<typeof prisma.company.findMany>>,
  excludeIds: Set<string>,
  options?: { referenceDnas?: CompanyDna[] },
): Promise<AnalysisOutcome> {
  // Prefer persisted (batch-enriched) DNA so AI status/red flags/evidence apply to ALL candidates
  const dnaMap = await loadDnasForCompanies(allCompanies);
  const allDnas = allCompanies.map(
    (c: import('@prisma/client').Company) => dnaMap.get(c.id) ?? companyToDna(c),
  );
  const filtered = deterministicFilter(idealDna, allDnas, excludeIds);

  await prisma.similarityResult.deleteMany({ where: { searchId } });
  await prisma.qualification.deleteMany({ where: { searchId } });

  const ranked: RankedResult[] = [];
  const dnaById = new Map(filtered.map((d) => [d.companyId, d]));

  // 1) Deterministic first pass — scores are the numeric source of truth
  for (const candidate of filtered) {
    const similarity = similarityScore(idealDna, candidate);
    const qualification = qualificationScore(idealDna, candidate, similarity);
    await upsertScoreRows(searchId, candidate, similarity, qualification);

    const company = allCompanies.find(
      (c: import('@prisma/client').Company) => c.id === candidate.companyId,
    )!;
    ranked.push({
      companyId: candidate.companyId,
      name: company.name,
      industry: company.industry,
      similarity,
      qualification,
    });
  }

  ranked.sort((a, b) => {
    const q =
      b.qualification.qualificationScore - a.qualification.qualificationScore;
    if (q !== 0) return q;
    return b.similarity.overallScore - a.similarity.overallScore;
  });

  // Mark completed immediately after deterministic pass so UI never stays on Running
  // if enrichment hangs or the process restarts mid-enrichment.
  await prisma.search.update({
    where: { id: searchId },
    data: {
      status: 'completed',
      idealDna: idealDna as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });

  // 2) Optional search-time enrichment (OFF by default).
  // Catalog batch (POST /enrichment/batch) + manual refresh are the source of truth
  // for AI website evidence / empty / redFlags across the full company list.
  // When ENRICH_ON_SEARCH=true, only fill a few *unstamped* candidates (not top-N only).
  const ENRICHMENT_OVERALL_TIMEOUT_MS = 90_000;
  if (isLiveAiEnabled() && env.enrichOnSearch) {
    const ai = createServerAiProvider();
    const maxN = Math.max(0, env.enrichMaxCandidates);
    const needsStamp = (d: CompanyDna) =>
      !(d.inferences ?? []).some((i) => i.startsWith('AI research status:'));

    const toEnrich: CompanyDna[] = [];
    if (options?.referenceDnas?.length) {
      for (const ref of options.referenceDnas) {
        if (needsStamp(ref)) toEnrich.push(ref);
      }
    }
    for (const r of ranked) {
      if (toEnrich.length >= maxN) break;
      const d = dnaById.get(r.companyId);
      if (d && needsStamp(d)) toEnrich.push(d);
    }

    const seen = new Set<string>();
    const unique = toEnrich.filter((d) => {
      if (seen.has(d.companyId)) return false;
      seen.add(d.companyId);
      return true;
    });

    const runEnrichment = async (): Promise<void> => {
      if (!unique.length) return;
      const enrichedMap = await enrichCompanies(unique, ai, { persist: true });

      for (const [companyId, enrichedDna] of enrichedMap) {
        if (excludeIds.has(companyId)) continue;

        let similarity = similarityScore(idealDna, enrichedDna);
        const qualification = qualificationScore(idealDna, enrichedDna, similarity);
        similarity = await maybeAttachScoreNarrative(ai, similarity, qualification);
        await upsertScoreRows(searchId, enrichedDna, similarity, qualification);

        const row = ranked.find((r) => r.companyId === companyId);
        if (row) {
          row.similarity = similarity;
          row.qualification = qualification;
        }
        dnaById.set(companyId, enrichedDna);
      }

      ranked.sort((a, b) => {
        const q =
          b.qualification.qualificationScore - a.qualification.qualificationScore;
        if (q !== 0) return q;
        return b.similarity.overallScore - a.similarity.overallScore;
      });
    };

    try {
      await Promise.race([
        runEnrichment(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `Enrichment overall timeout after ${ENRICHMENT_OVERALL_TIMEOUT_MS}ms`,
                ),
              ),
            ENRICHMENT_OVERALL_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err) {
      console.warn(
        '[ai] optional search enrichment failed; keeping persisted-DNA scores',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    idealDna,
    results: ranked,
    candidateCount: allCompanies.length - excludeIds.size,
    filteredCount: filtered.length,
  };
}

export async function runReferenceAnalysis(searchId: string): Promise<AnalysisOutcome> {
  const search = await prisma.search.findUniqueOrThrow({
    where: { id: searchId },
    include: { references: true },
  });

  if (search.references.length < 1 || search.references.length > 5) {
    throw new Error('Reference search requires 1–5 companies');
  }

  await prisma.search.update({
    where: { id: searchId },
    data: { status: 'running', error: null },
  });

  try {
    const refIds = search.references.map(
      (r: import('@prisma/client').ReferenceCompany) => r.companyId,
    );
    const refCompanies = await prisma.company.findMany({
      where: { id: { in: refIds } },
    });
    if (refCompanies.length !== refIds.length) {
      throw new Error('One or more reference companies not found');
    }

    const refDnaMap = await loadDnasForCompanies(refCompanies);
    const refDnas = refCompanies.map(
      (c: import('@prisma/client').Company) => refDnaMap.get(c.id) ?? companyToDna(c),
    );
    const idealDna = buildIdealDna(refDnas);

    // Persist / upsert DNA profiles for references (replace evidence — no dupes on re-run)
    await prisma.evidence.deleteMany({ where: { companyId: { in: refIds } } });
    for (const dna of refDnas) {
      await prisma.companyProfile.upsert({
        where: { companyId: dna.companyId },
        create: { companyId: dna.companyId, dna: dna as unknown as Prisma.InputJsonValue },
        update: { dna: dna as unknown as Prisma.InputJsonValue },
      });
      if (dna.evidence.length) {
        await prisma.evidence.createMany({
          data: dna.evidence.map((e) => ({
            companyId: dna.companyId,
            field: e.field,
            value: e.value,
            source: e.source,
          })),
        });
      }
    }

    const allCompanies = await prisma.company.findMany();
    return await scoreAndPersist(searchId, idealDna, allCompanies, new Set(refIds), {
      referenceDnas: refDnas,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    await prisma.search.update({
      where: { id: searchId },
      data: { status: 'failed', error: message },
    });
    throw err;
  }
}

export async function runCriteriaAnalysis(searchId: string): Promise<AnalysisOutcome> {
  const search = await prisma.search.findUniqueOrThrow({
    where: { id: searchId },
  });

  if (search.type !== 'criteria') {
    throw new Error('runCriteriaAnalysis requires search.type=criteria');
  }
  if (!search.criteria || typeof search.criteria !== 'object') {
    throw new Error('Criteria search missing criteria payload');
  }

  await prisma.search.update({
    where: { id: searchId },
    data: { status: 'running', error: null },
  });

  try {
    const idealDna = buildIdealDnaFromCriteria(search.criteria as CriteriaPayload);
    const allCompanies = await prisma.company.findMany();
    // No reference companies to exclude for criteria searches
    return await scoreAndPersist(searchId, idealDna, allCompanies, new Set());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    await prisma.search.update({
      where: { id: searchId },
      data: { status: 'failed', error: message },
    });
    throw err;
  }
}

/** Dispatch on search.type (reference | criteria). */
export async function runSearchAnalysis(searchId: string): Promise<AnalysisOutcome> {
  const search = await prisma.search.findUniqueOrThrow({ where: { id: searchId } });
  if (search.type === 'criteria') return runCriteriaAnalysis(searchId);
  if (search.type === 'reference') return runReferenceAnalysis(searchId);
  throw new Error(`Unsupported search type: ${search.type}`);
}
