import type { FastifyInstance } from 'fastify';
import type { CompanyDna } from '@ali/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { resolveEvidence } from '../lib/evidence.js';
import {
  buildResultAiFields,
  extractIdealDnaSummary,
} from '../lib/resultAiFields.js';
import { createServerAiProvider } from '../services/ai/createProvider.js';
import {
  buildIdealDnaFallbackSummary,
  suggestRankingThresholds,
} from '../services/ai/intelligence.js';
import { companyToDna } from '../services/companyMapper.js';
import { runSearchAnalysis } from '../services/analysis.js';

const thresholdValuesSchema = z.object({
  minQualification: z.number().int().min(0).max(100),
  minSimilarity: z.number().int().min(0).max(100),
  minEvidenceCount: z.number().int().min(0).max(50),
});

const storedThresholdsSchema = thresholdValuesSchema.extend({
  source: z.enum(['ai', 'heuristic', 'manual']),
  rationale: z.string(),
  message: z.string().optional(),
  updatedAt: z.string(),
  algorithmVersion: z.number().int().optional(),
});

type StoredThresholds = z.infer<typeof storedThresholdsSchema>;

function parseStoredThresholds(value: unknown): StoredThresholds | null {
  const parsed = storedThresholdsSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.source !== 'manual' && parsed.data.algorithmVersion !== 2) return null;
  return parsed.data;
}

async function getDemoUserId() {
  const user = await prisma.user.findUnique({
    where: { email: env.demoUserEmail },
  });
  if (!user) throw new Error('Demo user missing — run seed');
  return user.id;
}

async function ensurePersistedIdealDnaSummary(
  searchId: string,
  idealDna: unknown,
): Promise<{ idealDna: unknown; summary: string | null }> {
  const existing = extractIdealDnaSummary(idealDna);
  if (existing) return { idealDna, summary: existing };
  if (!idealDna || typeof idealDna !== 'object' || Array.isArray(idealDna)) {
    return { idealDna, summary: null };
  }

  const summary = buildIdealDnaFallbackSummary(idealDna as CompanyDna);
  const repaired = { ...idealDna, idealDnaSummary: summary };
  await prisma.search.update({
    where: { id: searchId },
    data: { idealDna: repaired as Prisma.InputJsonValue },
  });
  return { idealDna: repaired, summary };
}

export async function searchRoutes(app: FastifyInstance) {
  app.get('/searches', async () => {
    const userId = await getDemoUserId();
    const searches = await prisma.search.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        references: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                industry: true,
                website: true,
                linkedinUrl: true,
              },
            },
          },
        },
        _count: { select: { qualifications: true } },
      },
    });
    return { data: searches };
  });

  app.post('/searches', async (req, reply) => {
    const criteriaFields = z.object({
      industry: z.string().trim().min(1).optional(),
      geography: z.string().trim().min(1).optional(),
      country: z.string().trim().min(1).optional(),
      employeeRange: z.string().trim().min(1).optional(),
      ownership: z.string().trim().min(1).optional(),
      businessModel: z.string().trim().min(1).optional(),
      notes: z.string().trim().min(1).optional(),
    });

    const body = z
      .discriminatedUnion('type', [
        z.object({
          type: z.literal('reference'),
          companyIds: z.array(z.string()).min(1).max(5),
        }),
        z.object({
          type: z.literal('criteria'),
          criteria: criteriaFields.refine(
            (c) =>
              Boolean(
                c.industry ||
                  c.geography ||
                  c.country ||
                  c.employeeRange ||
                  c.ownership ||
                  c.businessModel,
              ),
            { message: 'At least one filter field is required (notes alone is not enough)' },
          ),
        }),
      ])
      .parse(req.body);

    const userId = await getDemoUserId();

    if (body.type === 'reference') {
      const unique = Array.from(new Set(body.companyIds));
      const found = await prisma.company.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      });
      if (found.length !== unique.length) {
        return reply.code(400).send({ error: 'Invalid companyIds' });
      }

      const search = await prisma.search.create({
        data: {
          userId,
          type: 'reference',
          status: 'draft',
          references: {
            create: unique.map((companyId) => ({ companyId })),
          },
        },
        include: {
          references: { include: { company: { select: { id: true, name: true } } } },
        },
      });
      return reply.code(201).send({ data: search });
    }

    const search = await prisma.search.create({
      data: {
        userId,
        type: 'criteria',
        status: 'draft',
        criteria: body.criteria,
      },
    });
    return reply.code(201).send({ data: search });
  });

  app.post('/searches/:id/run', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return reply.code(404).send({ error: 'Search not found' });

    if (search.type !== 'reference' && search.type !== 'criteria') {
      return reply.code(400).send({ error: `Unsupported search type: ${search.type}` });
    }

    if (search.status === 'running') {
      return reply.code(202).send({
        data: { searchId: id, status: 'running', started: false },
      });
    }

    void runSearchAnalysis(id).catch((err) => {
      console.error(`[searches] runSearchAnalysis(${id}) failed:`, err);
    });

    return reply.code(202).send({
      data: { searchId: id, status: 'running', started: true },
    });
  });

  app.get('/searches/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const search = await prisma.search.findUnique({
      where: { id },
      include: {
        references: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                industry: true,
                website: true,
                linkedinUrl: true,
              },
            },
          },
        },
      },
    });
    if (!search) return reply.code(404).send({ error: 'Search not found' });
    const repaired = await ensurePersistedIdealDnaSummary(search.id, search.idealDna);
    return {
      data: {
        ...search,
        idealDna: repaired.idealDna,
        idealDnaSummary: repaired.summary,
      },
    };
  });

  app.get('/searches/:id/results', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(500).default(5),
        recommendation: z
          .enum(['CONTACT_NOW', 'RESEARCH_MORE', 'MONITOR', 'REJECT'])
          .optional(),
      })
      .parse(req.query);
    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return reply.code(404).send({ error: 'Search not found' });

    const whereQual = {
      searchId: id,
      ...(query.recommendation ? { recommendation: query.recommendation } : {}),
    };
    const totalCount = await prisma.qualification.count({ where: whereQual });
    const quals = await prisma.qualification.findMany({
      where: whereQual,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            industry: true,
            primaryService: true,
            geography: true,
            employeeRange: true,
            ownership: true,
            website: true,
            linkedinUrl: true,
          },
        },
      },
      orderBy: [{ qualificationScore: 'desc' }, { confidence: 'desc' }],
      take: query.limit,
    });

    const sims = await prisma.similarityResult.findMany({
      where: { searchId: id },
    });
    const simByCompany = new Map<string, import('@prisma/client').SimilarityResult>(
      sims.map((s) => [s.companyId, s]),
    );

    const companyIds = quals.map((q) => q.companyId);
    const [profiles, tableEvidenceRows, fullCompanies] = await Promise.all([
      prisma.companyProfile.findMany({ where: { companyId: { in: companyIds } } }),
      prisma.evidence.findMany({
        where: { companyId: { in: companyIds } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.company.findMany({ where: { id: { in: companyIds } } }),
    ]);
    const profileById = new Map(profiles.map((p) => [p.companyId, p]));
    const evidenceById = new Map<string, typeof tableEvidenceRows>();
    for (const row of tableEvidenceRows) {
      const list = evidenceById.get(row.companyId) ?? [];
      if (list.length < 50) list.push(row);
      evidenceById.set(row.companyId, list);
    }
    const fullById = new Map(fullCompanies.map((c) => [c.id, c]));

    const data = quals.map((q) => {
      const sim = simByCompany.get(q.companyId);
      const full = fullById.get(q.companyId);
      const liveDna = full ? companyToDna(full) : null;
      const profile = profileById.get(q.companyId);
      const dna = (profile?.dna as CompanyDna | undefined) ?? liveDna;
      const evidence = resolveEvidence(
        evidenceById.get(q.companyId) ?? [],
        dna as {
          evidence?: Array<{
            field: string;
            value: string;
            source: string;
            url?: string;
            evidenceQuote?: string;
          }>;
        } | null,
        liveDna?.evidence,
      );
      const explanation = sim?.explanation ?? [];
      const aiFields = buildResultAiFields(dna ?? null, explanation);
      return {
        companyId: q.companyId,
        company: q.company,
        qualificationScore: q.qualificationScore,
        businessFit: q.businessFit,
        strategicFit: q.strategicFit,
        confidence: q.confidence,
        recommendation: q.recommendation,
        hardExclusion: q.hardExclusion,
        positiveSignals: q.positiveSignals,
        risks: q.risks,
        missingInformation: q.missingInformation,
        similarityScore: sim?.overallScore ?? null,
        similarityDimensions: sim?.dimensions ?? null,
        similarityExplanation: explanation,
        evidence,
        // AI Lead Intelligence (additive — does not replace deterministic scores)
        aiFitNarrative: aiFields.aiFitNarrative,
        aiFitNarrativeThin: aiFields.aiFitNarrativeThin,
        inferences: aiFields.inferences,
        researchNote: aiFields.researchNote,
        researchStatus: aiFields.researchStatus,
        redFlags: aiFields.redFlags,
        aiResearchConfidence: aiFields.aiResearchConfidence,
      };
    });

    const idealDnaSummary = extractIdealDnaSummary(search.idealDna);

    return {
      data,
      meta: {
        searchId: id,
        status: search.status,
        count: data.length,
        totalCount,
        limit: query.limit,
        idealDna: search.idealDna,
        idealDnaSummary,
      },
    };
  });

  /** Progressive disclosure: scores for one company inside a completed search */
  app.get('/searches/:id/companies/:companyId', async (req, reply) => {
    const params = z
      .object({ id: z.string(), companyId: z.string() })
      .parse(req.params);

    const search = await prisma.search.findUnique({ where: { id: params.id } });
    if (!search) return reply.code(404).send({ error: 'Search not found' });

    const company = await prisma.company.findUnique({ where: { id: params.companyId } });
    if (!company) return reply.code(404).send({ error: 'Company not found' });

    const [qualification, similarity, profile, tableEvidence] = await Promise.all([
      prisma.qualification.findUnique({
        where: {
          searchId_companyId: { searchId: params.id, companyId: params.companyId },
        },
      }),
      prisma.similarityResult.findUnique({
        where: {
          searchId_companyId: { searchId: params.id, companyId: params.companyId },
        },
      }),
      prisma.companyProfile.findUnique({ where: { companyId: params.companyId } }),
      prisma.evidence.findMany({
        where: { companyId: params.companyId },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const liveDna = companyToDna(company);
    const dna = profile?.dna ?? liveDna;
    const evidence = resolveEvidence(
      tableEvidence,
      dna as {
        evidence?: Array<{
          field: string;
          value: string;
          source: string;
          url?: string;
          evidenceQuote?: string;
        }>;
      },
      liveDna.evidence,
    );

    const { demoFit: _demoFit, rawData: _raw, ...publicCompany } = company;

    const explanation = similarity?.explanation ?? [];
    const aiFields = buildResultAiFields(
      dna as CompanyDna,
      explanation,
    );

    return {
      data: {
        searchId: params.id,
        searchStatus: search.status,
        idealDna: search.idealDna,
        idealDnaSummary: extractIdealDnaSummary(search.idealDna),
        company: publicCompany,
        dna,
        evidence,
        qualification,
        similarity: similarity
          ? {
              overallScore: similarity.overallScore,
              dimensions: similarity.dimensions,
              explanation: similarity.explanation,
            }
          : null,
        aiFitNarrative: aiFields.aiFitNarrative,
        aiFitNarrativeThin: aiFields.aiFitNarrativeThin,
        inferences: aiFields.inferences,
        researchNote: aiFields.researchNote,
        researchStatus: aiFields.researchStatus,
        redFlags: aiFields.redFlags,
        aiResearchConfidence: aiFields.aiResearchConfidence,
      },
    };
  });


  /**
   * AI (or heuristic) ranking-threshold suggest for a search.
   * Uses score/evidence stats + Ideal DNA summary only — never invents company facts.
   */
  app.post('/searches/:id/suggest-thresholds', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return reply.code(404).send({ error: 'Search not found' });

    const stored = parseStoredThresholds(search.rankingThresholds);
    if (stored) {
      return {
        data: {
          ...stored,
          searchId: id,
          cached: true,
        },
      };
    }

    const quals = await prisma.qualification.findMany({
      where: { searchId: id },
      select: {
        companyId: true,
        qualificationScore: true,
        hardExclusion: true,
      },
      orderBy: [{ qualificationScore: 'desc' }, { confidence: 'desc' }],
      take: 500,
    });

    const companyIds = quals.map((q) => q.companyId);
    const [sims, evidenceRows, profiles, companies] = await Promise.all([
      companyIds.length
        ? prisma.similarityResult.findMany({
            where: { searchId: id, companyId: { in: companyIds } },
            select: { companyId: true, overallScore: true },
          })
        : Promise.resolve([]),
      companyIds.length
        ? prisma.evidence.findMany({
            where: { companyId: { in: companyIds } },
            select: { companyId: true, field: true, value: true, source: true },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
      companyIds.length
        ? prisma.companyProfile.findMany({
            where: { companyId: { in: companyIds } },
            select: { companyId: true, dna: true },
          })
        : Promise.resolve([]),
      companyIds.length
        ? prisma.company.findMany({ where: { id: { in: companyIds } } })
        : Promise.resolve([]),
    ]);

    const simByCompany = new Map(sims.map((s) => [s.companyId, s.overallScore]));
    const evidenceById = new Map<string, Array<{ field: string; value: string; source: string }>>();
    for (const row of evidenceRows) {
      const list = evidenceById.get(row.companyId) ?? [];
      if (list.length < 50) list.push(row);
      evidenceById.set(row.companyId, list);
    }
    const profileById = new Map(profiles.map((p) => [p.companyId, p]));
    const companyById = new Map(companies.map((company) => [company.id, company]));

    const rows = quals
      .filter((q) => !q.hardExclusion)
      .map((q) => {
        const profile = profileById.get(q.companyId);
        const company = companyById.get(q.companyId);
        const liveDna = company ? companyToDna(company) : null;
        const evidenceCount = resolveEvidence(
          evidenceById.get(q.companyId) ?? [],
          profile?.dna as {
            evidence?: Array<{ field: string; value: string; source: string }>;
          } | null,
          liveDna?.evidence,
        ).length;
        return {
          qualificationScore: q.qualificationScore,
          similarityScore: simByCompany.get(q.companyId) ?? null,
          evidenceCount,
        };
      });

    const idealDnaSummary = extractIdealDnaSummary(search.idealDna);
    const ai = createServerAiProvider();
    const suggestion = await suggestRankingThresholds(ai, {
      rows,
      idealDnaSummary,
      searchStatus: search.status,
    });

    const saved: StoredThresholds = {
      minQualification: suggestion.minQualification,
      minSimilarity: suggestion.minSimilarity,
      minEvidenceCount: suggestion.minEvidenceCount,
      source: suggestion.source,
      rationale: suggestion.rationale,
      ...(suggestion.message ? { message: suggestion.message } : {}),
      updatedAt: new Date().toISOString(),
      algorithmVersion: 2,
    };

    await prisma.search.update({
      where: { id },
      data: { rankingThresholds: saved as Prisma.InputJsonValue },
    });

    return {
      data: {
        ...saved,
        searchId: id,
        resultCount: rows.length,
        cached: false,
      },
    };
  });

  /** Save user-adjusted or deterministic fallback thresholds for one search. */
  app.put('/searches/:id/thresholds', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = thresholdValuesSchema
      .extend({
        source: z.enum(['manual', 'heuristic']).default('manual'),
        rationale: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    const search = await prisma.search.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!search) return reply.code(404).send({ error: 'Search not found' });

    const saved: StoredThresholds = {
      minQualification: body.minQualification,
      minSimilarity: body.minSimilarity,
      minEvidenceCount: body.minEvidenceCount,
      source: body.source,
      rationale:
        body.rationale ??
        (body.source === 'manual'
          ? 'Saved by the user for this search.'
          : 'Saved local heuristic fallback for this search.'),
      updatedAt: new Date().toISOString(),
      algorithmVersion: 2,
    };

    await prisma.search.update({
      where: { id },
      data: { rankingThresholds: saved as Prisma.InputJsonValue },
    });

    return { data: { ...saved, searchId: id } };
  });

}
