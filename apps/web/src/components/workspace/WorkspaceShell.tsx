'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play, Settings } from 'lucide-react';
import {
  client,
  type CompanyDnaPayload,
  type ResultRow,
  type SearchRefCompany,
  type SearchSummary,
} from '@/lib/api';
import {
  loadThresholds,
  passesThresholds,
  saveThresholds,
  type RankingThresholds,
} from '@/lib/thresholds';
import { LeftRail } from './LeftRail';
import { IdealDnaStrip } from './IdealDnaStrip';
import { LeadCard } from './LeadCard';
import { DetailDrawer, type DrawerSelection } from './DetailDrawer';
import { SettingsModal } from './SettingsModal';
import { cn } from '@/lib/utils';

type PageSize = 4 | 6 | 'all';

type Props = {
  initialSearchId?: string | null;
};

export function WorkspaceShell({ initialSearchId = null }: Props) {
  const router = useRouter();
  const [searchId, setSearchId] = useState<string | null>(initialSearchId);
  const [status, setStatus] = useState<string>('');
  const [idealDna, setIdealDna] = useState<CompanyDnaPayload | null>(null);
  const [idealDnaSummary, setIdealDnaSummary] = useState<string | null>(null);
  const [references, setReferences] = useState<SearchRefCompany[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [recent, setRecent] = useState<SearchSummary[]>([]);
  const [selection, setSelection] = useState<DrawerSelection>(null);
  const [thresholds, setThresholds] = useState<RankingThresholds>(DEFAULT_CLIENT);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pageSize, setPageSize] = useState<PageSize>(4);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(Boolean(initialSearchId));

  // hydrate thresholds from localStorage
  useEffect(() => {
    setThresholds(loadThresholds());
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const res = await client.listSearches();
      setRecent(res.data);
    } catch {
      /* ignore — workspace still usable */
    }
  }, []);

  useEffect(() => {
    void loadRecent();
    const id = setInterval(() => void loadRecent(), 8000);
    return () => clearInterval(id);
  }, [loadRecent]);

  const fetchLive = useCallback(async (id: string) => {
    const [s, r] = await Promise.all([client.getSearch(id), client.getResults(id, 200)]);
    setStatus(s.data.status);
    const dna =
      (s.data.idealDna as CompanyDnaPayload | null | undefined) ??
      (r.meta.idealDna as CompanyDnaPayload | null | undefined) ??
      null;
    const summary =
      s.data.idealDnaSummary ??
      r.meta.idealDnaSummary ??
      dna?.idealDnaSummary ??
      null;
    setIdealDna(
      dna && summary && !dna.idealDnaSummary
        ? { ...dna, idealDnaSummary: summary }
        : dna,
    );
    setIdealDnaSummary(summary);
    const refs = (s.data.references ?? []).map((x) => ({
      id: x.company.id,
      name: x.company.name,
      industry: x.company.industry,
      website: x.company.website,
      linkedinUrl: x.company.linkedinUrl,
    }));
    setReferences(refs);
    setResults(Array.isArray(r.data) ? r.data : []);
    setTotalCount(r.meta?.totalCount ?? r.meta?.count ?? 0);
    setError(null);
    setInitialLoading(false);
  }, []);

  // Sync initialSearchId / deep-link
  useEffect(() => {
    if (!initialSearchId) {
      setInitialLoading(false);
      return;
    }
    setSearchId(initialSearchId);
    let cancelled = false;
    (async () => {
      try {
        await fetchLive(initialSearchId);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load search');
          setInitialLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSearchId, fetchLive]);

  const isRunning = status === 'running';
  const isDraftEmpty = status === 'draft' && totalCount === 0;
  const shouldPoll = Boolean(searchId) && (isRunning || isDraftEmpty || running);

  useEffect(() => {
    if (!searchId || !shouldPoll) return;
    const id = setInterval(() => {
      void fetchLive(searchId).catch(() => undefined);
    }, 1500);
    return () => clearInterval(id);
  }, [searchId, shouldPoll, fetchLive]);

  // Auto-select first ranked lead when results arrive and nothing selected
  const ranked = useMemo(
    () => results.filter((row) => passesThresholds(row, thresholds) && !row.hardExclusion),
    [results, thresholds],
  );

  useEffect(() => {
    if (selection) return;
    if (ranked.length > 0) {
      setSelection({ mode: 'lead', row: ranked[0] });
    }
  }, [ranked, selection]);

  // Keep lead selection row fresh when polling updates scores
  useEffect(() => {
    if (selection?.mode !== 'lead') return;
    const fresh = results.find((r) => r.companyId === selection.row.companyId);
    if (fresh && fresh !== selection.row) {
      setSelection({ mode: 'lead', row: fresh });
    }
  }, [results, selection]);

  const visible = useMemo(() => {
    if (pageSize === 'all') return ranked;
    return ranked.slice(0, pageSize);
  }, [ranked, pageSize]);

  async function onRun() {
    if (references.length < 1 || running) return;
    setRunning(true);
    setError(null);
    setSelection(null);
    try {
      const created = await client.createSearch(references.map((r) => r.id));
      const id = created.data.id;
      setSearchId(id);
      setStatus('running');
      setResults([]);
      setTotalCount(0);
      setIdealDna(null);
      await client.runSearch(id);
      router.replace(`/?searchId=${id}`, { scroll: false });
      await fetchLive(id);
      void loadRecent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  }

  async function onLoadSearch(id: string) {
    setError(null);
    setSelection(null);
    setSearchId(id);
    setInitialLoading(true);
    router.replace(`/?searchId=${id}`, { scroll: false });
    try {
      await fetchLive(id);
      void loadRecent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load search');
      setInitialLoading(false);
    }
  }

  function onThresholdsChange(next: RankingThresholds) {
    setThresholds(next);
    saveThresholds(next);
    setSelection(null);
  }

  const selectedLeadId = selection?.mode === 'lead' ? selection.row.companyId : null;
  const selectedRefId = selection?.mode === 'reference' ? selection.company.id : null;

  const sessionLabel = [
    `${ranked.length} ranked`,
    `${references.length} refs`,
    searchId ? `search ${searchId.slice(0, 8)}…` : 'no search',
    'CSV catalog',
  ].join(' · ');

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#121826] text-slate-100">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-700/80 bg-gradient-to-b from-[#1A1F2E] to-[#0A0F1C] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400 to-sky-500 text-[11px] font-extrabold text-teal-950">
            LI
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white">Lead Intelligence</div>
            <div className="text-[10px] text-slate-500 -mt-0.5">AI-powered lead qualification</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-slate-600 p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Settings"
            title="Ranking thresholds"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={references.length < 1 || running}
            onClick={() => void onRun()}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all',
              'bg-gradient-to-br from-teal-400 to-teal-600 text-teal-950',
              'shadow-[0_0_0_1px_rgba(45,212,191,0.3),0_4px_14px_rgba(13,148,136,0.35)]',
              'hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100',
            )}
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            Run
          </button>
        </div>
      </header>

      {/* Workspace grid */}
      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_340px]">
        <LeftRail
          references={references}
          onReferencesChange={(refs) => {
            setReferences(refs);
          }}
          onSelectReference={(c) => setSelection({ mode: 'reference', company: c })}
          selectedRefId={selectedRefId}
          recent={recent}
          activeSearchId={searchId}
          onLoadSearch={(id) => void onLoadSearch(id)}
          sessionLabel={sessionLabel}
        />

        <main className="flex min-h-0 flex-col overflow-hidden bg-[#121826]">
          <IdealDnaStrip
            idealDna={idealDna}
            idealDnaSummary={idealDnaSummary}
            thresholds={thresholds}
            status={status}
          />

          <div className="flex items-center justify-between gap-3 border-b border-slate-700/40 px-5 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Ranked leads · {visible.length} of {ranked.length}
              {totalCount > ranked.length ? (
                <span className="ml-1 font-normal text-slate-600">
                  ({totalCount} scored before thresholds)
                </span>
              ) : null}
              {(isRunning || running) && (
                <span className="ml-2 inline-flex items-center gap-1 font-normal normal-case text-teal-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  AI scoring…
                </span>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              Show
              <select
                value={pageSize === 'all' ? 'all' : String(pageSize)}
                onChange={(e) => {
                  const v = e.target.value;
                  setPageSize(v === 'all' ? 'all' : (Number(v) as 4 | 6));
                }}
                className="rounded-md border border-slate-600 bg-[#1A2236] px-2 py-1 text-xs text-white"
              >
                <option value="4">4</option>
                <option value="6">6</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {initialLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
                <p className="mt-3 text-sm">Loading workspace…</p>
              </div>
            ) : visible.length === 0 ? (
              <EmptyCenter
                hasRefs={references.length > 0}
                isRunning={isRunning || running}
                hasRaw={results.length > 0}
                rankedZero={ranked.length === 0 && results.length > 0}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {visible.map((row, i) => (
                  <LeadCard
                    key={row.companyId}
                    row={row}
                    rank={i + 1}
                    selected={selectedLeadId === row.companyId}
                    onSelect={() => setSelection({ mode: 'lead', row })}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <DetailDrawer selection={selection} searchId={searchId} />
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={thresholds}
        onChange={onThresholdsChange}
        results={results}
      />
    </div>
  );
}

const DEFAULT_CLIENT: RankingThresholds = {
  minQualification: 55,
  minSimilarity: 60,
  minEvidenceCount: 2,
};

function EmptyCenter({
  hasRefs,
  isRunning,
  hasRaw,
  rankedZero,
}: {
  hasRefs: boolean;
  isRunning: boolean;
  hasRaw: boolean;
  rankedZero: boolean;
}) {
  if (isRunning) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        <p className="mt-3 text-sm">AI is synthesizing Ideal DNA and scoring leads…</p>
      </div>
    );
  }
  if (rankedZero) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-slate-300">No leads pass current ranking thresholds</p>
        <p className="mt-2 text-xs text-slate-500">
          {hasRaw
            ? 'Open Settings (gear) to lower floors, or use AI suggest from the result distribution.'
            : ''}
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm font-medium text-slate-300">AI Lead Intelligence workspace</p>
      <p className="mt-2 text-xs text-slate-500 leading-relaxed">
        {hasRefs
          ? 'Press Run to synthesize Ideal DNA from your references, then AI ranks lookalike leads with evidence.'
          : 'Add 1–5 reference companies in the left rail, then Run. Or click a recent search to reload a prior session.'}
      </p>
    </div>
  );
}
