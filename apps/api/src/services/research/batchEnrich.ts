/**
 * Catalog-wide AI website enrichment: chunked, rate-limited, stale-first.
 * Source of truth for AI research status / red flags / website evidence.
 */

import type { CompanyDna } from '@ali/shared';
import { env } from '../../lib/env.js';
import { prisma } from '../../lib/prisma.js';
import { createServerAiProvider, isLiveAiEnabled } from '../ai/createProvider.js';
import { companyToDna } from '../companyMapper.js';
import { enrichCompanyDna, persistEnrichedDna } from './enrichCompany.js';

export type BatchEnrichOptions = {
  /** Max companies to process in this run (default 50). */
  limit?: number;
  /** Skip this many after ordering (pagination). */
  offset?: number;
  /** Prefer companies with no/oldest profile (default true). */
  staleFirst?: boolean;
  /** Only companies with a non-empty website (default true). */
  onlyWithWebsite?: boolean;
  /** Pause between companies (ms). */
  delayMs?: number;
  /** Abort after this many ms (default 10 min). */
  overallTimeoutMs?: number;
  onProgress?: (p: BatchEnrichProgress) => void;
};

export type BatchEnrichProgress = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalTarget: number;
  currentCompanyId?: string;
  done: boolean;
  error?: string;
};

export type BatchEnrichResult = BatchEnrichProgress & {
  companyIds: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hasAiResearchStamp(dna: CompanyDna | null | undefined): boolean {
  if (!dna?.inferences?.length) return false;
  return dna.inferences.some((i) => i.startsWith('AI research status:'));
}

/** Load DNA preferring persisted profile (enriched) over CSV rebuild. */
export async function loadDnaForCompany(
  company: import('@prisma/client').Company,
): Promise<CompanyDna> {
  const profile = await prisma.companyProfile.findUnique({
    where: { companyId: company.id },
  });
  if (profile?.dna && typeof profile.dna === 'object') {
    const d = profile.dna as unknown as CompanyDna;
    if (d.companyId) return d;
  }
  return companyToDna(company);
}

export async function loadDnasForCompanies(
  companies: import('@prisma/client').Company[],
): Promise<Map<string, CompanyDna>> {
  const ids = companies.map((c) => c.id);
  const profiles = await prisma.companyProfile.findMany({
    where: { companyId: { in: ids } },
  });
  const byId = new Map(profiles.map((p) => [p.companyId, p.dna as unknown as CompanyDna]));
  const out = new Map<string, CompanyDna>();
  for (const c of companies) {
    const stored = byId.get(c.id);
    if (stored && typeof stored === 'object' && stored.companyId) {
      out.set(c.id, stored);
    } else {
      out.set(c.id, companyToDna(c));
    }
  }
  return out;
}

/** Enrich + persist a single company (manual refresh or batch unit). */
export async function refreshCompanyEvidence(companyId: string): Promise<{
  companyId: string;
  didEnrich: boolean;
  status: string | null;
  evidenceCount: number;
}> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw Object.assign(new Error('Company not found'), { statusCode: 404 });

  const base = await loadDnaForCompany(company);
  if (!isLiveAiEnabled()) {
    // Still persist baseline CSV DNA/evidence so UI is never empty (merge-only)
    await persistEnrichedDna(base);
    return {
      companyId,
      didEnrich: false,
      status: 'ai_disabled',
      evidenceCount: base.evidence.length,
    };
  }

  const ai = createServerAiProvider();
  const { dna, didEnrich } = await enrichCompanyDna(base, ai);
  await persistEnrichedDna(dna, { ai });
  const statusInf = dna.inferences.find((i) => i.startsWith('AI research status:'));
  return {
    companyId,
    didEnrich,
    status: statusInf ? statusInf.replace('AI research status:', '').trim() : null,
    evidenceCount: dna.evidence.length,
  };
}

/**
 * Walk catalog (chunk), enrich each, persist DNA + Evidence rows.
 * Stale-first: companies without AI stamp / oldest profiles first.
 */
export async function runBatchEnrichment(
  opts: BatchEnrichOptions = {},
): Promise<BatchEnrichResult> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const staleFirst = opts.staleFirst !== false;
  const onlyWithWebsite = opts.onlyWithWebsite !== false;
  const delayMs = Math.max(0, opts.delayMs ?? env.enrichBatchDelayMs);
  const overallTimeoutMs = opts.overallTimeoutMs ?? env.enrichBatchTimeoutMs;

  const where = onlyWithWebsite
    ? { website: { not: null }, NOT: { website: '' } }
    : {};

  // Fetch a window; stale-first sorts in memory by profile age / missing stamp
  const companies = await prisma.company.findMany({
    where,
    include: { profile: true },
    orderBy: { id: 'asc' },
  });

  type Row = (typeof companies)[number];
  const scored = companies.map((c: Row) => {
    const dna = c.profile?.dna as unknown as CompanyDna | undefined;
    const stamped = hasAiResearchStamp(dna);
    const updatedAt = c.profile?.updatedAt?.getTime() ?? 0;
    return { c, stamped, updatedAt };
  });

  if (staleFirst) {
    scored.sort((a, b) => {
      if (a.stamped !== b.stamped) return a.stamped ? 1 : -1;
      return a.updatedAt - b.updatedAt;
    });
  }

  const slice = scored.slice(offset, offset + limit).map((s) => s.c);
  const progress: BatchEnrichResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    totalTarget: slice.length,
    done: false,
    companyIds: slice.map((c) => c.id),
  };

  const started = Date.now();
  const emit = () => opts.onProgress?.({ ...progress });

  if (!isLiveAiEnabled()) {
    // Persist CSV DNA/evidence for the slice so evidence UI works without AI
    for (const company of slice) {
      if (Date.now() - started > overallTimeoutMs) break;
      progress.currentCompanyId = company.id;
      try {
        const dna = companyToDna(company);
        await persistEnrichedDna(dna);  // merge-only; no AI when disabled
        progress.succeeded += 1;
      } catch {
        progress.failed += 1;
      }
      progress.processed += 1;
      emit();
      if (delayMs) await sleep(delayMs);
    }
    progress.done = true;
    progress.currentCompanyId = undefined;
    emit();
    return progress;
  }

  const ai = createServerAiProvider();

  for (const company of slice) {
    if (Date.now() - started > overallTimeoutMs) {
      progress.error = `Overall timeout after ${overallTimeoutMs}ms`;
      break;
    }
    progress.currentCompanyId = company.id;
    emit();
    try {
      const base =
        company.profile?.dna &&
        typeof company.profile.dna === 'object' &&
        (company.profile.dna as unknown as CompanyDna).companyId
          ? (company.profile.dna as unknown as CompanyDna)
          : companyToDna(company);
      const { dna } = await enrichCompanyDna(base, ai);
      await persistEnrichedDna(dna, { ai });
      progress.succeeded += 1;
    } catch (err) {
      progress.failed += 1;
      console.warn(
        '[enrich-batch] failed',
        company.id,
        err instanceof Error ? err.message : err,
      );
    }
    progress.processed += 1;
    emit();
    if (delayMs) await sleep(delayMs);
  }

  progress.done = true;
  progress.currentCompanyId = undefined;
  emit();
  return progress;
}

/** In-memory job registry for async batch runs. */
type JobRecord = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  progress: BatchEnrichProgress;
  startedAt: string;
  finishedAt?: string;
};

const jobs = new Map<string, JobRecord>();

export function getEnrichmentJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

export function listEnrichmentJobs(limit = 10): JobRecord[] {
  return Array.from(jobs.values())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

export function startBatchEnrichmentJob(opts: BatchEnrichOptions = {}): string {
  const id = `enb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record: JobRecord = {
    id,
    status: 'running',
    startedAt: new Date().toISOString(),
    progress: {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      totalTarget: 0,
      done: false,
    },
  };
  jobs.set(id, record);

  void runBatchEnrichment({
    ...opts,
    onProgress: (p) => {
      record.progress = p;
    },
  })
    .then((result) => {
      record.progress = result;
      record.status = result.error ? 'failed' : 'completed';
      record.finishedAt = new Date().toISOString();
    })
    .catch((err) => {
      record.status = 'failed';
      record.progress = {
        ...record.progress,
        done: true,
        error: err instanceof Error ? err.message : 'Batch failed',
      };
      record.finishedAt = new Date().toISOString();
    });

  return id;
}
