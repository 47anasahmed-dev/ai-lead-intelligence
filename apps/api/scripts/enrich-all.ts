/**
 * Weekly / full-catalog AI enrichment job.
 *
 * Walks every company with a website (stale-first), chunked + rate-limited.
 * Usage:
 *   pnpm --filter @ali/api exec tsx scripts/enrich-all.ts
 *   pnpm --filter @ali/api exec tsx scripts/enrich-all.ts --limit=100 --offset=0
 *   pnpm --filter @ali/api exec tsx scripts/enrich-all.ts --include-no-website
 *
 * Safe to re-run; prefer stale / unstamped companies first.
 */
import { runBatchEnrichment } from '../src/services/research/batchEnrich.js';
import { env } from '../src/lib/env.js';

function arg(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const limit = Number(arg('limit') ?? env.enrichBatchLimit ?? 50);
  const offset = Number(arg('offset') ?? 0);
  const onlyWithWebsite = !flag('include-no-website');
  const delayMs = Number(arg('delayMs') ?? env.enrichBatchDelayMs);

  console.log('[enrich-all] starting', {
    limit,
    offset,
    onlyWithWebsite,
    delayMs,
    aiProvider: env.aiProvider,
  });

  const result = await runBatchEnrichment({
    limit,
    offset,
    staleFirst: true,
    onlyWithWebsite,
    delayMs,
    onProgress: (p) => {
      if (p.processed === 0 || p.processed % 5 === 0 || p.done) {
        console.log(
          `[enrich-all] ${p.processed}/${p.totalTarget} ok=${p.succeeded} fail=${p.failed} current=${p.currentCompanyId ?? '-'}`,
        );
      }
    },
  });

  console.log('[enrich-all] done', {
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    error: result.error ?? null,
  });

  if (result.failed > 0 && result.succeeded === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[enrich-all] fatal', err);
  process.exit(1);
});
