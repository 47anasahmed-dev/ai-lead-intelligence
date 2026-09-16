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
  /** Per-request timeout for OpenRouter chat completions (ms) */
  openRouterTimeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS ?? 25000),
  /** Per-request timeout for OpenAI chat completions (ms) */
  openAiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 25000),
  /** Delay between catalog batch enrichments (ms) */
  enrichBatchDelayMs: Number(process.env.ENRICH_BATCH_DELAY_MS ?? 500),
  /** Overall timeout for one batch run (ms) */
  enrichBatchTimeoutMs: Number(process.env.ENRICH_BATCH_TIMEOUT_MS ?? 600_000),
  /** Default chunk size for POST /enrichment/batch */
  enrichBatchLimit: Number(process.env.ENRICH_BATCH_LIMIT ?? 50),
  /**
   * If true, search run may still website-enrich a few unstamped candidates.
   * Default false — catalog batch / manual refresh is the source of truth.
   */
  enrichOnSearch: (process.env.ENRICH_ON_SEARCH ?? 'false').toLowerCase() === 'true',
};

