import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { resolveEvidence } from '../lib/evidence.js';
import { companyToDna } from '../services/companyMapper.js';

export async function companyRoutes(app: FastifyInstance) {
  app.get('/companies', async (req) => {
    const q = z
      .object({
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(req.query);

    const where = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { industry: { contains: q.q, mode: 'insensitive' as const } },
            { id: { contains: q.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const companies = await prisma.company.findMany({
      where,
      take: q.limit,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        website: true,
        linkedinUrl: true,
        industry: true,
        primaryService: true,
        employeeRange: true,
        ownership: true,
        geography: true,
        country: true,
        businessModel: true,
        // intentionally omit demoFit from list API responses used for selection
      },
    });

    return { data: companies, count: companies.length };
  });

  app.get('/companies/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) return reply.code(404).send({ error: 'Company not found' });

    const profile = await prisma.companyProfile.findUnique({
      where: { companyId: id },
    });
    const liveDna = companyToDna(company);
    const dna = profile?.dna ?? liveDna;
    const tableEvidence = await prisma.evidence.findMany({
      where: { companyId: id },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    const evidence = resolveEvidence(
      tableEvidence,
      dna as { evidence?: Array<{ field: string; value: string; source: string; url?: string; evidenceQuote?: string }> },
      liveDna.evidence,
    );

    // Strip demoFit from public detail payload (metadata only in DB)
    const { demoFit: _demoFit, rawData: _raw, ...publicCompany } = company;

    return {
      data: {
        ...publicCompany,
        dna,
        evidence,
      },
    };
  });
}
