import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './lib/env.js';
import { healthRoutes } from './routes/health.js';
import { companyRoutes } from './routes/companies.js';
import { searchRoutes } from './routes/searches.js';

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: env.corsOrigin });

  await app.register(healthRoutes);
  await app.register(companyRoutes);
  await app.register(searchRoutes);

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    const statusCode =
      (err && typeof err === 'object' && 'statusCode' in err
        ? (err as { statusCode: number }).statusCode
        : 500);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    reply.code(statusCode).send({ error: message });
  });

  await app.listen({ port: env.port, host: env.host });
  console.log(`API listening on http://${env.host}:${env.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
