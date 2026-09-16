import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { resolveEvidence } from '../lib/evidence.js';
import { companyToDna } from '../services/companyMapper.js';
import { runSearchAnalysis } from '../services/analysis.js';

async function getDemoUserId() {
  const user = await prisma.user.findUnique({
    where: { email: env.demoUserEmail },
  });
  if (!user) throw new Error('Demo user missing — run seed');
  return user.id;
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
    return { data: search };
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
      const dna = (profile?.dna as { evidence?: unknown } | undefined) ?? liveDna;
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
        similarityExplanation: sim?.explanation ?? [],
        evidence,
      };
    });

    return {
      data,
      meta: {
        searchId: id,
        status: search.status,
        count: data.length,
        totalCount,
        limit: query.limit,
        idealDna: search.idealDna,
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

    return {
      data: {
        searchId: params.id,
        searchStatus: search.status,
        idealDna: search.idealDna,
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
      },
    };
  });

}
