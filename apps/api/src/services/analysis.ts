import {
  buildIdealDna,
  deterministicFilter,
  qualificationScore,
  similarityScore,
  type CompanyDna,
  type QualificationResult,
  type SimilarityResult,
} from '@ali/shared';
import { prisma } from '../lib/prisma.js';
import { companyToDna } from './companyMapper.js';

export interface RankedResult {
  companyId: string;
  name: string;
  industry: string | null;
  similarity: SimilarityResult;
  qualification: QualificationResult;
}

export async function runReferenceAnalysis(searchId: string): Promise<{
  idealDna: CompanyDna;
  results: RankedResult[];
  candidateCount: number;
  filteredCount: number;
}> {
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
    const refIds = search.references.map((r) => r.companyId);
    const refCompanies = await prisma.company.findMany({
      where: { id: { in: refIds } },
    });
    if (refCompanies.length !== refIds.length) {
      throw new Error('One or more reference companies not found');
    }

    const refDnas = refCompanies.map(companyToDna);
    const idealDna = buildIdealDna(refDnas);

    // Persist / upsert DNA profiles for references
    for (const dna of refDnas) {
      await prisma.companyProfile.upsert({
        where: { companyId: dna.companyId },
        create: { companyId: dna.companyId, dna },
        update: { dna },
      });
      for (const e of dna.evidence) {
        await prisma.evidence.create({
          data: {
            companyId: dna.companyId,
            field: e.field,
            value: e.value,
            source: e.source,
          },
        });
      }
    }

    const allCompanies = await prisma.company.findMany();
    const allDnas = allCompanies.map(companyToDna);
    const exclude = new Set(refIds);
    const filtered = deterministicFilter(idealDna, allDnas, exclude);

    // Clear previous results for re-runs
    await prisma.similarityResult.deleteMany({ where: { searchId } });
    await prisma.qualification.deleteMany({ where: { searchId } });

    const ranked: RankedResult[] = [];

    for (const candidate of filtered) {
      const similarity = similarityScore(idealDna, candidate);
      const qualification = qualificationScore(idealDna, candidate, similarity);

      await prisma.similarityResult.create({
        data: {
          searchId,
          companyId: candidate.companyId,
          overallScore: similarity.overallScore,
          dimensions: similarity.dimensions,
          explanation: similarity.explanation,
        },
      });

      await prisma.qualification.create({
        data: {
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
      });

      const company = allCompanies.find((c) => c.id === candidate.companyId)!;
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

    await prisma.search.update({
      where: { id: searchId },
      data: {
        status: 'completed',
        idealDna,
        completedAt: new Date(),
      },
    });

    return {
      idealDna,
      results: ranked,
      candidateCount: allCompanies.length - refIds.length,
      filteredCount: filtered.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    await prisma.search.update({
      where: { id: searchId },
      data: { status: 'failed', error: message },
    });
    throw err;
  }
}
