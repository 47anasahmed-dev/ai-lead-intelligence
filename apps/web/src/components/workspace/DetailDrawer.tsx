'use client';

import type { CSSProperties, ReactNode } from 'react';

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
  const [liveFeed, setLiveFeed] = useState(false);

  const companyId =
    selection?.mode === 'lead'
      ? selection.row.companyId
      : selection?.mode === 'reference'
        ? selection.company.id
        : null;

  // Brief teal left inset when selection changes (mockup .drawer.live-feed)
  useEffect(() => {
    if (!companyId) {
      setLiveFeed(false);
      return;
    }
    setLiveFeed(true);
    const t = window.setTimeout(() => setLiveFeed(false), 900);
    return () => window.clearTimeout(t);
  }, [companyId, selection?.mode]);

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
      <aside className="flex h-full w-full min-w-0 flex-col border-l border-[#2d3748] bg-[#232B3E]">
        <EmptyState />
      </aside>
    );
  }

  if (selection.mode === 'lead') {
    return (
      <aside
        className={cn(
          'flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-[#2d3748] bg-[#232B3E] transition-[box-shadow] duration-350',
          liveFeed && 'shadow-[inset_3px_0_0_#2DD4BF]',
        )}
      >
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
    <aside
      className={cn(
        'flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-[#2d3748] bg-[#232B3E] transition-[box-shadow] duration-350',
        liveFeed && 'shadow-[inset_3px_0_0_#2DD4BF]',
      )}
    >
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
      <Sparkles className="h-8 w-8 text-[#9CA3AF]" />
      <p className="text-sm font-medium text-[#D1D5DB]">AI Lead Intelligence</p>
      <p className="text-xs text-[#9CA3AF]">
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
      <header className="sticky top-0 z-10 border-b border-[#2d3748] bg-[#232B3E]/95 px-3.5 py-3.5 backdrop-blur">
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
                  className="inline-flex max-w-full items-center gap-1.5 text-base font-bold tracking-tight text-white hover:text-[#2DD4BF]"
                >
                  <span className="truncate">{row.company.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#2DD4BF]" />
                </a>
              ) : (
                <h2 className="truncate text-base font-bold tracking-tight text-white">
                  {row.company.name}
                </h2>
              )}
              <p className="mt-0.5 truncate text-xs text-[#D1D5DB]">
                {[row.company.industry, row.company.geography].filter(Boolean).join(' · ') || '—'}
              </p>
              {(ai.risks.length > 0 || ai.redFlags.length > 0) && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#f87171] bg-[rgba(248,113,113,0.18)]">
                  <AlertTriangle className="h-3 w-3" /> Risk
                </span>
              )}
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#2DD4BF]">
                <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#2DD4BF] animate-live-pulse" />
                Live selection
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshBusy}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#2d3748] px-2 py-1 text-[11px] text-[#D1D5DB] hover:bg-[#1A2236] disabled:opacity-50"
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
        {refreshMsg && <p className="mt-1 text-[11px] text-[#9CA3AF]">{refreshMsg}</p>}
      </header>

      <div className="space-y-3.5 p-3.5">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Qualify">
            <span
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: scoreBandColor(row.qualificationScore) }}
            >
              {row.qualificationScore}
            </span>
          </StatCard>
          <StatCard label="Confidence">
            <span className="font-mono text-lg font-bold tabular-nums text-[#3B82F6]">
              {row.confidence}
            </span>
          </StatCard>
          <StatCard label="Action">
            <RecBadge rec={row.recommendation} hard={row.hardExclusion} />
          </StatCard>
        </div>

        <Section title="Company DNA">
          {chips.length === 0 ? (
            <span className="text-xs text-[#9CA3AF] italic">No DNA chips yet</span>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {chips.map((c) => (
                <DnaField key={`${c.label}-${c.full}`} label={c.label} value={c.value} />
              ))}
            </div>
          )}
        </Section>

        <RisksSection risks={[...ai.redFlags, ...ai.risks]} />

        <AiIntelligenceSection ai={ai} loading={loading} />

        <Section title="Evidence">
          {loading && !evidence.length ? (
            <p className="flex items-center gap-2 text-xs text-[#9CA3AF]">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </p>
          ) : evidence.length === 0 ? (
            <p className="text-xs italic text-[#9CA3AF]">No evidence rows yet</p>
          ) : (
            <ul className="space-y-2">
              {evidence.slice(0, 12).map((e, i) => (
                <EvidenceRow key={`${e.field}-${i}`} item={e} />
              ))}
            </ul>
          )}
        </Section>

        {error && (
          <p className="flex items-center gap-1 text-xs text-[#f87171]">
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
  const rawDna = companyDnaChips({
    industry: company.industry ?? detail?.industry ?? dna?.identity?.industry ?? null,
    primaryService: detail?.primaryService ?? dna?.identity?.primaryService ?? null,
    ownership: detail?.ownership ?? dna?.ownership?.type ?? null,
    geography: detail?.geography ?? dna?.geography?.region ?? null,
    employeeRange: detail?.employeeRange ?? dna?.size?.employeeRange ?? null,
    businessModel: detail?.businessModel ?? dna?.businessModel?.model ?? null,
  });
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
      : compactDnaChips(
          dna ? idealDnaChips(dna) : rawDna,
          { maxLen: 48, maxSegments: 2 },
        );
  const research = extractAiResearchFromInferences(dna?.inferences);
  const evidence = detail?.evidence ?? dna?.evidence ?? [];
  const risks = [
    ...research.redFlags,
    ...(dna?.unknowns ?? []).filter((u) => /risk|flag|acq|sparse|missing/i.test(u)).slice(0, 4),
  ];
  const dnaConf = dna?.confidence ?? null;
  const evidenceCount = evidence.length;
  const sub =
    [company.industry ?? detail?.industry, detail?.geography ?? dna?.geography?.region]
      .filter(Boolean)
      .join(' · ') || 'Reference company';

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-[#2d3748] bg-[#232B3E]/95 px-3.5 py-3.5 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold text-white shadow-sm',
                drawerAvatarTone(company.name),
              )}
            >
              {drawerInitials(company.name)}
            </span>
            <div className="min-w-0">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-base font-bold tracking-tight text-white hover:text-[#2DD4BF]"
                >
                  <span className="truncate">{company.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#2DD4BF]" />
                </a>
              ) : (
                <h2 className="truncate text-base font-bold tracking-tight text-white">
                  {company.name}
                </h2>
              )}
              <p className="mt-0.5 truncate text-xs text-[#D1D5DB]">{sub}</p>
              {risks.length > 0 && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#f87171] bg-[rgba(248,113,113,0.18)]">
                  <AlertTriangle className="h-3 w-3" /> Risk
                </span>
              )}
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#3B82F6]">
                <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#3B82F6] animate-live-pulse" />
                Reference
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshBusy}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#2d3748] px-2 py-1 text-[11px] text-[#D1D5DB] hover:bg-[#1A2236] disabled:opacity-50"
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
        {refreshMsg && <p className="mt-1 text-[11px] text-[#9CA3AF]">{refreshMsg}</p>}
      </header>

      <div className="space-y-3.5 p-3.5">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="DNA conf">
            <span
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: dnaConf == null ? '#9CA3AF' : scoreBandColor(dnaConf) }}
            >
              {dnaConf == null ? '—' : dnaConf}
            </span>
          </StatCard>
          <StatCard label="Evidence">
            <span className="font-mono text-lg font-bold tabular-nums text-[#3B82F6]">
              {evidenceCount}
            </span>
          </StatCard>
          <StatCard label="Role">
            <span
              className="inline-block rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em]"
              style={{
                background: 'rgba(59,130,246,0.15)',
                color: '#93c5fd',
                border: '1px solid rgba(59,130,246,0.35)',
              }}
            >
              REFERENCE
            </span>
          </StatCard>
        </div>

        <Section title="Company DNA">
          {loading && chips.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-[#9CA3AF]">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading DNA…
            </p>
          ) : chips.length === 0 ? (
            <span className="text-xs text-[#9CA3AF] italic">No DNA yet</span>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {chips.map((c) => (
                <DnaField key={`${c.label}-${c.full}`} label={c.label} value={c.value} />
              ))}
            </div>
          )}
        </Section>

        <RisksSection risks={risks} />

        <Section
          title="AI DNA summary"
          icon={<Sparkles className="h-3.5 w-3.5 text-[#2DD4BF]" />}
        >
          {research.researchNote ? (
            <ClampText text={research.researchNote} lines={3} />
          ) : research.status === 'ok' ? (
            <p className="text-xs italic text-[#9CA3AF]">
              AI research completed — no separate research note on this profile.
            </p>
          ) : research.status ? (
            <p className="text-xs text-[#fbbf24]">AI research status: {research.status}</p>
          ) : (
            <p className="text-xs italic text-[#9CA3AF]">
              Awaiting AI research… (structure ready for richer DNA narrative)
            </p>
          )}
          {research.otherInferences.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[#D1D5DB]">
              {research.otherInferences.slice(0, 6).map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Evidence">
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            {company.website && normalizeUrl(company.website) && (
              <a
                href={normalizeUrl(company.website)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2DD4BF] hover:underline"
              >
                Website ↗
              </a>
            )}
            {company.linkedinUrl && normalizeUrl(company.linkedinUrl) && (
              <a
                href={normalizeUrl(company.linkedinUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2DD4BF] hover:underline"
              >
                LinkedIn ↗
              </a>
            )}
          </div>
          {evidence.length === 0 ? (
            <p className="text-xs italic text-[#9CA3AF]">No evidence rows</p>
          ) : (
            <ul className="space-y-2">
              {evidence.slice(0, 10).map((e, i) => (
                <EvidenceRow key={`${e.field}-${i}`} item={e} />
              ))}
            </ul>
          )}
        </Section>

        {error && (
          <p className="flex items-center gap-1 text-xs text-[#f87171]">
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
      icon={<Sparkles className="h-3.5 w-3.5 text-[#2DD4BF]" />}
    >
      <div className="space-y-3 rounded-lg border border-[rgba(20,184,166,0.2)] bg-[rgba(20,184,166,0.05)] p-3">
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[#2DD4BF]/90">
            Fit narrative
          </h4>
          {ai.fitNarrative && !ai.fitThin ? (
            <div className="mt-1">
              <ClampText text={ai.fitNarrative} lines={3} className="text-xs text-[#D1D5DB] leading-relaxed" />
            </div>
          ) : ai.narratives.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {ai.narratives.map((n) => (
                <li key={n} className="text-xs text-[#D1D5DB] leading-relaxed">
                  {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-[#9CA3AF] italic">
              {loading
                ? 'Loading enrichment…'
                : 'No AI fit narrative on this lead yet — awaiting evidence-locked OpenRouter narrative.'}
            </p>
          )}
          {ai.fitPlaceholder && ai.positiveSignals[0] && (
            <p className="mt-1.5 text-xs text-[#9CA3AF]">
              <span className="text-[#9CA3AF]">Signal: </span>
              {ai.positiveSignals[0]}
            </p>
          )}
        </div>

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Why ranked
          </h4>
          {ai.whyRanked.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#D1D5DB]">
              {ai.whyRanked.slice(0, 6).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-[#9CA3AF] italic">No similarity explanation lines yet.</p>
          )}
        </div>

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Risks / red flags
          </h4>
          {hint && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#fbbf24]">
              <AlertTriangle className="h-3 w-3" />
              {hint.label}
            </p>
          )}
          {ai.risks.length === 0 && ai.redFlags.length === 0 ? (
            <p className="mt-1 text-xs italic text-[#9CA3AF]">None flagged</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1.5">
              {[...ai.redFlags.map((r) => `AI red flag: ${r}`), ...ai.risks]
                .slice(0, 8)
                .map((r) => (
                  <li
                    key={r}
                    className="rounded-lg px-2.5 py-2 text-xs text-[#fecaca]"
                    style={{
                      background: 'rgba(248,113,113,0.08)',
                      border: '1px solid rgba(248,113,113,0.25)',
                    }}
                  >
                    {r}
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Research notes
          </h4>
          {ai.researchNote ? (
            <div className="mt-1">
              <ClampText text={ai.researchNote} lines={3} className="text-xs text-[#D1D5DB]" />
            </div>
          ) : ai.researchStatus ? (
            <p className="mt-1 text-xs text-[#9CA3AF]">AI research status: {ai.researchStatus}</p>
          ) : (
            <p className="mt-1 text-xs text-[#9CA3AF] italic">Awaiting AI research…</p>
          )}
        </div>

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF] flex items-center gap-1">
            <HelpCircle className="h-3 w-3" />
            Missing information
          </h4>
          {ai.missing.length === 0 ? (
            <p className="mt-1 text-xs text-[#9CA3AF] italic">None listed</p>
          ) : (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#9CA3AF]">
              {ai.missing.slice(0, 8).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[10px] text-[#9CA3AF] border-t border-[#2d3748] pt-2">
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
      <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#9CA3AF]">
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
  className = 'text-xs text-[#D1D5DB]',
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
          className="mt-1 text-[10px] font-medium text-[#2DD4BF] hover:underline"
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
      className="max-w-full truncate rounded-lg border border-[#2d3748] bg-[#121826] px-2.5 py-1 text-[11px] text-white"
    >
      <span className="text-[#9CA3AF]">{label}</span> {value}
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
    <div className="rounded-lg border border-[#2d3748] bg-[#121826] p-2.5 text-center transition-[border-color,transform] duration-250">
      <div className="flex min-h-[28px] items-center justify-center">{children}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9CA3AF]">
        {label}
      </div>
    </div>
  );
}

function DnaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#252d3d] bg-[#121826] px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#9CA3AF]">
        {label}
      </div>
      <div className="mt-0.5 text-[12.5px] font-semibold leading-snug text-white">{value}</div>
    </div>
  );
}

/** Mockup score classes: hi ≥80 → ok, mid ≥65 → warn, else muted */
function scoreBandColor(score: number): string {
  if (score >= 80) return '#34d399';
  if (score >= 65) return '#fbbf24';
  return '#D1D5DB';
}

function RisksSection({ risks }: { risks: string[] }) {
  if (!risks.length) return null;
  return (
    <Section title="Risks">
      <ul className="flex flex-col gap-1.5">
        {risks.slice(0, 10).map((r) => (
          <li
            key={r}
            className="rounded-lg px-2.5 py-2 text-xs text-[#fecaca]"
            style={{
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.25)',
            }}
          >
            {r}
          </li>
        ))}
      </ul>
    </Section>
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
  // Soft mockup .rec-* — translucent fill + colored border + colored text (not solid mustard)
  const styles: Record<string, CSSProperties> = {
    CONTACT_NOW: {
      background: 'rgba(52,211,153,0.15)',
      color: '#34d399',
      border: '1px solid rgba(52,211,153,0.35)',
    },
    RESEARCH_MORE: {
      background: 'rgba(251,191,36,0.12)',
      color: '#fbbf24',
      border: '1px solid rgba(251,191,36,0.35)',
    },
    MONITOR: {
      background: 'rgba(59,130,246,0.15)',
      color: '#93c5fd',
      border: '1px solid rgba(59,130,246,0.35)',
    },
    REJECT: {
      background: 'rgba(248,113,113,0.12)',
      color: '#f87171',
      border: '1px solid rgba(248,113,113,0.3)',
    },
  };
  const labels: Record<string, string> = {
    CONTACT_NOW: 'CONTACT NOW',
    RESEARCH_MORE: 'RESEARCH MORE',
    MONITOR: 'MONITOR',
    REJECT: hard ? 'HARD EXCLUDE' : 'REJECT',
  };
  return (
    <span
      className="inline-block rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em]"
      style={
        styles[rec] ?? {
          background: 'rgba(45,55,72,0.6)',
          color: '#D1D5DB',
          border: '1px solid #2d3748',
        }
      }
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
    <li className="rounded-lg border border-[#2d3748] bg-[#121826] px-2.5 py-2.5 transition-[border-color] duration-200 hover:border-[rgba(20,184,166,0.4)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] leading-snug">
          {item.evidenceQuote ? (
            <span className="italic text-[#c5d0e6]">&ldquo;{item.evidenceQuote}&rdquo;</span>
          ) : (
            <span className="text-[#D1D5DB]">{item.value}</span>
          )}
        </p>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[11px] text-[#2DD4BF] hover:underline"
          >
            source ↗
          </a>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-1.5 text-[11px] text-[#D1D5DB]">
        <span>{item.field}</span>
        <span>{item.source}</span>
      </div>
    </li>
  );
}
