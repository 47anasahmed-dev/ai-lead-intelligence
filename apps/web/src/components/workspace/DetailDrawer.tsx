'use client';

import type { ReactNode } from 'react';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import {
  client,
  type CompanyDetail,
  type CompanyDnaPayload,
  type ResultRow,
  type SearchRefCompany,
} from '@/lib/api';
import { linkForCompany, normalizeUrl } from '@/lib/links';
import {
  companyDnaChips,
  compactDnaChips,
  extractAiNarratives,
  extractAiResearchFromInferences,
  extractWhyRanked,
  idealDnaChips,
  aiRiskHint,
  resolveAiResearch,
} from '@/lib/aiSurfaces';
import { cn } from '@/lib/utils';

export type DrawerSelection =
  | { mode: 'lead'; row: ResultRow }
  | { mode: 'reference'; company: SearchRefCompany }
  | null;

type Props = {
  selection: DrawerSelection;
  searchId: string | null;
};

export function DetailDrawer({ selection, searchId }: Props) {
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companyId =
    selection?.mode === 'lead'
      ? selection.row.companyId
      : selection?.mode === 'reference'
        ? selection.company.id
        : null;

  useEffect(() => {
    if (!companyId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRefreshMsg(null);
    client
      .getCompany(companyId)
      .then((res) => {
        if (!cancelled) setDetail(res.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function onRefresh() {
    if (!companyId || refreshBusy) return;
    setRefreshBusy(true);
    setRefreshMsg(null);
    try {
      const res = await client.refreshEvidence(companyId);
      const d = res.data;
      setRefreshMsg(
        `Evidence refreshed · ${d.evidenceCount ?? 0} rows` +
          (d.status ? ` · ${d.status}` : d.didEnrich === false ? ' · AI off' : ''),
      );
      const again = await client.getCompany(companyId);
      setDetail(again.data);
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshBusy(false);
    }
  }

  if (!selection) {
    return (
      <aside className="flex h-full flex-col border-l border-slate-700/60 bg-[#232B3E]">
        <EmptyState />
      </aside>
    );
  }

  if (selection.mode === 'lead') {
    return (
      <aside className="flex h-full flex-col overflow-hidden border-l border-slate-700/60 bg-[#232B3E]">
        <LeadPanel
          row={selection.row}
          detail={detail}
          loading={loading}
          error={error}
          searchId={searchId}
          refreshBusy={refreshBusy}
          refreshMsg={refreshMsg}
          onRefresh={() => void onRefresh()}
        />
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l border-slate-700/60 bg-[#232B3E]">
      <ReferencePanel
        company={selection.company}
        detail={detail}
        loading={loading}
        error={error}
        refreshBusy={refreshBusy}
        refreshMsg={refreshMsg}
        onRefresh={() => void onRefresh()}
      />
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <Sparkles className="h-8 w-8 text-slate-600" />
      <p className="text-sm font-medium text-slate-300">AI Lead Intelligence</p>
      <p className="text-xs text-slate-500">
        Select a ranked lead or reference company to open DNA, evidence, and AI intelligence.
      </p>
    </div>
  );
}

function LeadPanel({
  row,
  detail,
  loading,
  error,
  searchId: _searchId,
  refreshBusy,
  refreshMsg,
  onRefresh,
}: {
  row: ResultRow;
  detail: CompanyDetail | null;
  loading: boolean;
  error: string | null;
  searchId: string | null;
  refreshBusy: boolean;
  refreshMsg: string | null;
  onRefresh: () => void;
}) {
  const href = linkForCompany(row.company.website, row.company.linkedinUrl);
  const dna = detail?.dna ?? null;
  const rawDna = companyDnaChips({
    industry: row.company.industry ?? dna?.identity?.industry ?? null,
    primaryService: row.company.primaryService ?? dna?.identity?.primaryService ?? null,
    ownership: row.company.ownership ?? dna?.ownership?.type ?? null,
    geography: row.company.geography ?? dna?.geography?.region ?? null,
    employeeRange: row.company.employeeRange ?? dna?.size?.employeeRange ?? null,
    businessModel: row.company.businessModel ?? dna?.businessModel?.model ?? null,
  });
  // Prefer Ideal-DNA-style labels when enrichment present
  const fromIdeal = dna
    ? [
        { label: 'Industry', value: dna.identity?.industry },
        { label: 'Ownership', value: dna.ownership?.type },
        { label: 'Geo', value: dna.geography?.region ?? dna.geography?.country },
        { label: 'Growth', value: dna.growth?.signal },
        { label: 'Size', value: dna.size?.employeeRange },
        { label: 'Customers', value: dna.customers?.profile },
      ]
        .filter((x): x is { label: string; value: string } => Boolean(x.value?.trim()))
        .map((x) => ({ label: x.label, value: x.value!.trim(), full: x.value!.trim() }))
    : [];
  const chips =
    fromIdeal.length >= 3
      ? fromIdeal
      : compactDnaChips(rawDna, { maxLen: 48, maxSegments: 2 });
  const evidence = detail?.evidence ?? row.evidence ?? [];
  const ai = buildLeadAiBundle(row, dna);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-slate-700/60 bg-[#232B3E]/80 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold text-white shadow-sm',
                drawerAvatarTone(row.company.name),
              )}
            >
              {drawerInitials(row.company.name)}
            </span>
            <div className="min-w-0">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-base font-bold tracking-tight text-white hover:text-teal-300"
                >
                  <span className="truncate">{row.company.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-teal-400" />
                </a>
              ) : (
                <h2 className="truncate text-base font-bold tracking-tight text-white">
                  {row.company.name}
                </h2>
              )}
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {[row.company.industry, row.company.geography].filter(Boolean).join(' · ') || '—'}
              </p>
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-teal-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 animate-live-pulse" />
                Live selection
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshBusy}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            title="Refresh website evidence"
          >
            {refreshBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Evidence
          </button>
        </div>
        {refreshMsg && <p className="mt-1 text-[10px] text-slate-500">{refreshMsg}</p>}
      </header>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Qualify">
            <span className="text-lg font-bold tabular-nums text-teal-400">
              {row.qualificationScore}
            </span>
          </StatCard>
          <StatCard label="Confidence">
            <span className="text-lg font-bold tabular-nums text-blue-400">
              {row.confidence}
            </span>
          </StatCard>
          <StatCard label="Action">
            <RecBadge rec={row.recommendation} hard={row.hardExclusion} />
          </StatCard>
        </div>

        <Section title="Company DNA">
          {chips.length === 0 ? (
            <span className="text-xs text-slate-500 italic">No DNA chips yet</span>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {chips.map((c) => (
                <DnaField key={`${c.label}-${c.full}`} label={c.label} value={c.value} />
              ))}
            </div>
          )}
        </Section>

        <AiIntelligenceSection ai={ai} loading={loading} />

        <Section title="Evidence">
          {loading && !evidence.length ? (
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </p>
          ) : evidence.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No evidence rows yet</p>
          ) : (
            <ul className="space-y-2">
              {evidence.slice(0, 12).map((e, i) => (
                <EvidenceRow key={`${e.field}-${i}`} item={e} />
              ))}
            </ul>
          )}
        </Section>

        {error && (
          <p className="text-xs text-rose-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ReferencePanel({
  company,
  detail,
  loading,
  error,
  refreshBusy,
  refreshMsg,
  onRefresh,
}: {
  company: SearchRefCompany;
  detail: CompanyDetail | null;
  loading: boolean;
  error: string | null;
  refreshBusy: boolean;
  refreshMsg: string | null;
  onRefresh: () => void;
}) {
  const href = linkForCompany(company.website, company.linkedinUrl);
  const dna = detail?.dna ?? null;
  const chips = compactDnaChips(
    dna
      ? idealDnaChips(dna)
      : companyDnaChips({
          industry: company.industry ?? detail?.industry ?? null,
          primaryService: detail?.primaryService ?? null,
          ownership: detail?.ownership ?? null,
          geography: detail?.geography ?? null,
          employeeRange: detail?.employeeRange ?? null,
          businessModel: detail?.businessModel ?? null,
        }),
    { maxLen: 36, maxSegments: 1 },
  );
  const research = extractAiResearchFromInferences(dna?.inferences);
  const evidence = detail?.evidence ?? dna?.evidence ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-slate-700/60 bg-[#232B3E]/60 px-4 py-3 backdrop-blur">
        <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300">
          ● Reference mode
        </span>
        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-base font-semibold text-blue-300 hover:underline"
              >
                <span className="truncate">{company.name}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            ) : (
              <h2 className="truncate text-base font-semibold text-white">{company.name}</h2>
            )}
            <p className="mt-0.5 text-xs text-slate-400">
              {company.industry ?? detail?.industry ?? '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshBusy}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            {refreshBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Evidence
          </button>
        </div>
        {refreshMsg && <p className="mt-1 text-[10px] text-slate-500">{refreshMsg}</p>}
      </header>

      <div className="space-y-5 p-5">
        <Section title="Reference DNA">
          {loading && chips.length === 0 ? (
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading DNA…
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <Chip key={`${c.label}-${c.full}`} label={c.label} value={c.value} full={c.full} />
              ))}
              {chips.length === 0 && (
                <span className="text-xs text-slate-500 italic">No DNA yet</span>
              )}
            </div>
          )}
          {dna?.confidence != null && (
            <p className="mt-2 text-[11px] text-slate-400">
              DNA confidence (completeness): {dna.confidence}
            </p>
          )}
        </Section>

        <Section
          title="AI DNA summary"
          icon={<Sparkles className="h-3.5 w-3.5 text-teal-400" />}
        >
          {research.researchNote ? (
            <ClampText text={research.researchNote} lines={3} />
          ) : research.status === 'ok' ? (
            <p className="text-xs text-slate-400 italic">
              AI research completed — no separate research note on this profile.
            </p>
          ) : research.status ? (
            <p className="text-xs text-amber-300/90">AI research status: {research.status}</p>
          ) : (
            <p className="text-xs text-slate-500 italic">
              Awaiting AI research… (structure ready for richer DNA narrative)
            </p>
          )}
          {research.redFlags.length > 0 && (
            <ul className="mt-2 space-y-1">
              {research.redFlags.map((f) => (
                <li key={f} className="flex gap-1.5 text-xs text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          )}
          {research.otherInferences.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-400">
              {research.otherInferences.slice(0, 6).map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Links & evidence">
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            {company.website && normalizeUrl(company.website) && (
              <a
                href={normalizeUrl(company.website)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:underline"
              >
                Website ↗
              </a>
            )}
            {company.linkedinUrl && normalizeUrl(company.linkedinUrl) && (
              <a
                href={normalizeUrl(company.linkedinUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:underline"
              >
                LinkedIn ↗
              </a>
            )}
          </div>
          {evidence.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No evidence rows</p>
          ) : (
            <ul className="space-y-2">
              {evidence.slice(0, 10).map((e, i) => (
                <EvidenceRow key={`${e.field}-${i}`} item={e} />
              ))}
            </ul>
          )}
        </Section>

        {error && (
          <p className="text-xs text-rose-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}

type LeadAiBundle = {
  narratives: string[];
  fitNarrative: string | null;
  fitThin: boolean;
  whyRanked: string[];
  risks: string[];
  missing: string[];
  researchNote: string | null;
  researchStatus: string | null;
  redFlags: string[];
  positiveSignals: string[];
  fitPlaceholder: boolean;
  aiResearchConfidence: number | null;
};

function buildLeadAiBundle(row: ResultRow, dna: CompanyDnaPayload | null): LeadAiBundle {
  const fromExpl = extractAiNarratives(row.similarityExplanation);
  const fitNarrative =
    row.aiFitNarrative?.trim() ||
    (fromExpl.length ? fromExpl.join(' ') : null);
  const narratives = fitNarrative
    ? fitNarrative.split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean)
    : fromExpl;
  const whyRanked = extractWhyRanked(row.similarityExplanation);
  const fromDna = extractAiResearchFromInferences(dna?.inferences);
  const research = resolveAiResearch({
    inferences: row.inferences ?? dna?.inferences,
    researchNote: row.researchNote ?? fromDna.researchNote,
    researchStatus: row.researchStatus ?? fromDna.status,
    redFlags: row.redFlags ?? fromDna.redFlags,
  });
  const fitThin =
    row.aiFitNarrativeThin === true ||
    (fitNarrative != null && /AI fit narrative thin:/i.test(fitNarrative)) ||
    narratives.length === 0;
  return {
    narratives,
    fitNarrative,
    fitThin,
    whyRanked,
    risks: row.risks ?? [],
    missing: row.missingInformation ?? [],
    researchNote: research.researchNote,
    researchStatus: research.status,
    redFlags: research.redFlags,
    positiveSignals: row.positiveSignals ?? [],
    fitPlaceholder: narratives.length === 0 || fitThin,
    aiResearchConfidence: row.aiResearchConfidence ?? null,
  };
}

function AiIntelligenceSection({
  ai,
  loading,
}: {
  ai: LeadAiBundle;
  loading: boolean;
}) {
  const hint = aiRiskHint(ai.risks);

  return (
    <Section
      title="AI Intelligence"
      icon={<Sparkles className="h-3.5 w-3.5 text-teal-400" />}
    >
      <div className="space-y-3 rounded-lg border border-teal-500/20 bg-teal-500/5 p-3">
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-teal-400/90">
            Fit narrative
          </h4>
          {ai.fitNarrative && !ai.fitThin ? (
            <div className="mt-1">
              <ClampText text={ai.fitNarrative} lines={3} className="text-xs text-slate-200 leading-relaxed" />
            </div>
          ) : ai.narratives.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {ai.narratives.map((n) => (
                <li key={n} className="text-xs text-slate-200 leading-relaxed">
                  {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-500 italic">
              {loading
                ? 'Loading enrichment…'
                : 'No AI fit narrative on this lead yet — awaiting evidence-locked OpenRouter narrative.'}
            </p>
          )}
          {ai.fitPlaceholder && ai.positiveSignals[0] && (
            <p className="mt-1.5 text-xs text-slate-400">
              <span className="text-slate-500">Signal: </span>
              {ai.positiveSignals[0]}
            </p>
          )}
        </div>

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Why ranked
          </h4>
          {ai.whyRanked.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-300">
              {ai.whyRanked.slice(0, 6).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-500 italic">No similarity explanation lines yet.</p>
          )}
        </div>

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Risks / red flags
          </h4>
          {hint && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              {hint.label}
            </p>
          )}
          {ai.risks.length === 0 && ai.redFlags.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500 italic">None flagged</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {[...ai.redFlags.map((r) => `AI red flag: ${r}`), ...ai.risks]
                .slice(0, 8)
                .map((r) => (
                  <li key={r} className="flex gap-1.5 text-xs text-rose-300/90">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Research notes
          </h4>
          {ai.researchNote ? (
            <div className="mt-1">
              <ClampText text={ai.researchNote} lines={3} className="text-xs text-slate-300" />
            </div>
          ) : ai.researchStatus ? (
            <p className="mt-1 text-xs text-slate-400">AI research status: {ai.researchStatus}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500 italic">Awaiting AI research…</p>
          )}
        </div>

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1">
            <HelpCircle className="h-3 w-3" />
            Missing information
          </h4>
          {ai.missing.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500 italic">None listed</p>
          ) : (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-400">
              {ai.missing.slice(0, 8).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[10px] text-slate-600 border-t border-slate-700/50 pt-2">
          Scoring confidence (card rings) = data completeness.
          {ai.aiResearchConfidence != null
            ? ` AI research confidence = ${ai.aiResearchConfidence}/100 (separate).`
            : ' AI research confidence pending (separate from scoring).'}
        </p>
      </div>
    </Section>
  );
}

function Section({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function ClampText({
  text,
  lines = 3,
  className = 'text-xs text-slate-300',
}: {
  text: string;
  lines?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > 180 || text.includes('\n');
  return (
    <div>
      <p
        title={!open ? text : undefined}
        className={cn(className, !open && lines === 3 && 'line-clamp-3', !open && lines === 2 && 'line-clamp-2')}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="mt-1 text-[10px] font-medium text-teal-400 hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: string;
}) {
  const tip = full && full !== value ? full : undefined;
  return (
    <span
      title={tip}
      className="max-w-full truncate rounded-lg border border-slate-600 bg-[#1A2236] px-2.5 py-1 text-[11px] text-slate-200"
    >
      <span className="text-slate-500">{label}</span> {value}
    </span>
  );
}

function StatCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-[#121826] p-2.5 text-center">
      <div className="flex min-h-[28px] items-center justify-center">{children}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
        {label}
      </div>
    </div>
  );
}

function DnaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700/80 bg-[#121826] px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-[12.5px] font-semibold leading-snug text-white">{value}</div>
    </div>
  );
}

function drawerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function drawerAvatarTone(name: string): string {
  const tones = [
    'bg-gradient-to-br from-sky-500 to-cyan-500',
    'bg-gradient-to-br from-indigo-500 to-violet-500',
    'bg-gradient-to-br from-emerald-500 to-teal-500',
    'bg-gradient-to-br from-purple-500 to-pink-500',
    'bg-gradient-to-br from-amber-500 to-yellow-500',
    'bg-gradient-to-br from-red-500 to-orange-500',
  ] as const;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

function RecBadge({ rec, hard }: { rec: string; hard?: boolean }) {
  // Soft-but-lively mockup .rec-* : translucent fill + colored border + colored text
  const map: Record<string, string> = {
    CONTACT_NOW: 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/40',
    RESEARCH_MORE: 'bg-amber-400/15 text-amber-300 border border-amber-400/40',
    MONITOR: 'bg-blue-500/15 text-sky-300 border border-blue-400/40',
    REJECT: 'bg-rose-400/15 text-rose-300 border border-rose-400/35',
  };
  const labels: Record<string, string> = {
    CONTACT_NOW: 'CONTACT NOW',
    RESEARCH_MORE: 'RESEARCH MORE',
    MONITOR: 'MONITOR',
    REJECT: hard ? 'HARD EXCLUDE' : 'REJECT',
  };
  return (
    <span
      className={cn(
        'inline-block rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em]',
        map[rec] ?? 'bg-slate-700/60 text-slate-200 border border-slate-600',
      )}
    >
      {labels[rec] ?? rec}
    </span>
  );
}

function EvidenceRow({
  item,
}: {
  item: { field: string; value: string; source: string; url?: string; evidenceQuote?: string };
}) {
  const href = item.url ? normalizeUrl(item.url) : null;
  return (
    <li className="rounded-md border border-slate-700/80 bg-[#1A2236]/80 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-200 leading-snug">
          {item.evidenceQuote ? (
            <span className="italic">&ldquo;{item.evidenceQuote}&rdquo;</span>
          ) : (
            item.value
          )}
        </p>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[10px] text-teal-400 hover:underline"
          >
            source ↗
          </a>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
        <span className="rounded bg-slate-800 px-1.5 py-0.5">{item.field}</span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5">{item.source}</span>
      </div>
    </li>
  );
}
