import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { runReferenceAnalysis } from '../services/analysis.js';

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
        references: { include: { company: { select: { id: true, name: true } } } },
        _count: { select: { qualifications: true } },
      },
    });
    return { data: searches };
  });

  app.post('/searches', async (req, reply) => {
    const body = z
      .object({
        type: z.literal('reference'),
        companyIds: z.array(z.string()).min(1).max(5),
      })
      .parse(req.body);

    const unique = Array.from(new Set(body.companyIds));
    const found = await prisma.company.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      return reply.code(400).send({ error: 'Invalid companyIds' });
    }

    const userId = await getDemoUserId();
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
  });

  app.post('/searches/:id/run', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return reply.code(404).send({ error: 'Search not found' });

    const result = await runReferenceAnalysis(id);
    return {
      data: {
        searchId: id,
        status: 'completed',
        idealDna: result.idealDna,
        candidateCount: result.candidateCount,
        filteredCount: result.filteredCount,
        topResults: result.results.slice(0, 25),
      },
    };
  });

  app.get('/searches/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const search = await prisma.search.findUnique({
      where: { id },
      include: {
        references: { include: { company: { select: { id: true, name: true, industry: true } } } },
      },
    });
    if (!search) return reply.code(404).send({ error: 'Search not found' });
    return { data: search };
  });

  app.get('/searches/:id/results', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return reply.code(404).send({ error: 'Search not found' });

    const quals = await prisma.qualification.findMany({
      where: { searchId: id },
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
          },
        },
      },
      orderBy: [{ qualificationScore: 'desc' }, { confidence: 'desc' }],
    });

    const sims = await prisma.similarityResult.findMany({
      where: { searchId: id },
    });
    const simByCompany = new Map(sims.map((s) => [s.companyId, s]));

    const data = quals.map((q) => {
      const sim = simByCompany.get(q.companyId);
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
      };
    });

    return {
      data,
      meta: {
        searchId: id,
        status: search.status,
        count: data.length,
        idealDna: search.idealDna,
      },
    };
  });
}
