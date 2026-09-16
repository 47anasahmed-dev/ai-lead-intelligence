import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    return { status: 'ok', db, service: 'ali-api' };
  });
}
