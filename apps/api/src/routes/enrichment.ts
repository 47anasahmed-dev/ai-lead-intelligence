import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../lib/env.js';
import {
  getEnrichmentJob,
  listEnrichmentJobs,
  refreshCompanyEvidence,
  startBatchEnrichmentJob,
} from '../services/research/batchEnrich.js';

export async function enrichmentRoutes(app: FastifyInstance) {
  /** Manual refresh for one company — sync. */
  app.post('/companies/:id/refresh-evidence', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    try {
      const result = await refreshCompanyEvidence(id);
      return { data: result };
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode: number }).statusCode)
          : 500;
      const message = err instanceof Error ? err.message : 'Refresh failed';
      return reply.code(status).send({ error: message });
    }
  });

  /**
   * Catalog batch enrichment (chunked). Starts async job; poll GET /enrichment/jobs/:id.
   * Weekly cron should call this repeatedly until the catalog is covered (raise offset).
   */
  app.post('/enrichment/batch', async (req, reply) => {
    const body = z
      .object({
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        staleFirst: z.boolean().optional(),
        onlyWithWebsite: z.boolean().optional(),
        delayMs: z.coerce.number().int().min(0).max(60_000).optional(),
      })
      .parse(req.body ?? {});

    const jobId = startBatchEnrichmentJob({
      limit: body.limit ?? env.enrichBatchLimit,
      offset: body.offset ?? 0,
      staleFirst: body.staleFirst,
      onlyWithWebsite: body.onlyWithWebsite,
      delayMs: body.delayMs,
    });

    return reply.code(202).send({
      data: {
        jobId,
        status: 'running',
        poll: `/enrichment/jobs/${jobId}`,
      },
    });
  });

  app.get('/enrichment/jobs', async () => {
    return { data: listEnrichmentJobs(20) };
  });

  app.get('/enrichment/jobs/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const job = getEnrichmentJob(id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return { data: job };
  });
}
