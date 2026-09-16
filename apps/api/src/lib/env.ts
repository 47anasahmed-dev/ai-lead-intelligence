import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Prefer apps/api/.env, then monorepo root .env
config({ path: path.resolve(__dirname, '../.env') });
config({ path: path.resolve(__dirname, '../../../../.env') });

export const env = {
  port: Number(process.env.API_PORT ?? 3001),
  host: process.env.API_HOST ?? '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL ?? '',
  demoUserEmail: process.env.DEMO_USER_EMAIL ?? 'demo@saasquatch.local',
  /** LLM enrichment: noop | openai | openrouter */
  aiProvider: process.env.AI_PROVIDER ?? 'noop',
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openRouterModel: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  enrichMaxCandidates: Number(process.env.ENRICH_MAX_CANDIDATES ?? 15),
  enrichFetchTimeoutMs: Number(process.env.ENRICH_FETCH_TIMEOUT_MS ?? 8000),
};
