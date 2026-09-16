'use client';

import { AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResultRow } from '@/lib/api';
import { companyDnaChips, aiRiskHint, leadAiOneLiner } from '@/lib/aiSurfaces';
import { MetricRing, QualifyScore } from './MetricRing';

const AVATAR = [
  'bg-violet-500/30 text-violet-200',
  'bg-sky-500/30 text-sky-200',
  'bg-emerald-500/30 text-emerald-200',
  'bg-amber-500/30 text-amber-200',
  'bg-rose-500/30 text-rose-200',
  'bg-teal-500/30 text-teal-200',
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

function recStyle(rec: string): { label: string; className: string } {
  switch (rec) {
    case 'CONTACT_NOW':
      return {
        label: 'CONTACT NOW',
        className: 'bg-teal-500 text-teal-950 font-bold',
      };
    case 'RESEARCH_MORE':
      return {
        label: 'RESEARCH MORE',
        className: 'bg-amber-400/90 text-amber-950 font-bold',
      };
    case 'MONITOR':
      return {
        label: 'MONITOR',
        className: 'bg-slate-600 text-slate-100 font-semibold',
      };
    case 'REJECT':
      return {
        label: 'REJECT',
        className: 'bg-rose-500/80 text-white font-semibold',
      };
    default:
      return { label: rec, className: 'bg-slate-700 text-slate-200' };
  }
}

type Props = {
  row: ResultRow;
  rank: number;
  selected: boolean;
  onSelect: () => void;
};

export function LeadCard({ row, rank, selected, onSelect }: Props) {
  const tone = AVATAR[hash(row.company.name) % AVATAR.length];
  const chips = companyDnaChips(row.company);
  const risksForHint = [
    ...(row.risks ?? []),
    ...((row.redFlags ?? []).map((f) => `AI red flag: ${f}`)),
  ];
  if (
    row.researchStatus &&
    ['empty', 'fetch_failed', 'invalid_url', 'ai_error'].includes(row.researchStatus) &&
    !risksForHint.some((r) => /no usable|fetch failed|invalid or missing|enrichment error/i.test(r))
  ) {
    risksForHint.push(`AI research status: ${row.researchStatus}`);
  }
  const hint = aiRiskHint(risksForHint);
  const oneLiner = leadAiOneLiner(row);
  const rec = recStyle(row.recommendation);
  const evidenceCount = row.evidence?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-3.5 text-left transition-all',
        'bg-[#1A2236] hover:bg-[#1f2940]',
        selected
          ? 'border-teal-400 shadow-[0_0_0_1px_rgba(45,212,191,0.45)]'
          : 'border-slate-700/80 hover:border-slate-600',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
              tone,
            )}
          >
            {initials(row.company.name)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-500">#{rank}</span>
              <span className="truncate text-sm font-semibold text-white">{row.company.name}</span>
            </div>
            <div className="truncate text-[11px] text-slate-400">
              {[row.company.industry, row.company.geography].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        </div>
        <QualifyScore
          score={row.qualificationScore}
          businessFit={row.businessFit}
          strategicFit={row.strategicFit}
        />
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex gap-3">
          <MetricRing
            label="Similarity"
            value={row.similarityScore}
            accent="teal"
            tooltip="How closely this lead matches Ideal DNA across weighted dimensions."
          />
          <MetricRing
            label="Confidence"
            value={row.confidence}
            accent="blue"
            tooltip="Scoring confidence = field completeness of company DNA. Not AI research confidence."
          />
          <MetricRing
            label="Evidence"
            value={Math.min(100, evidenceCount * 12)}
            accent="amber"
            tooltip={`${evidenceCount} evidence row${evidenceCount === 1 ? '' : 's'} from CSV / website research.`}
          />
        </div>
        <span className={cn('rounded-md px-2 py-1 text-[10px] tracking-wide', rec.className)}>
          {rec.label}
        </span>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.slice(0, 6).map((c) => (
            <span
              key={`${c.label}-${c.value}`}
              className="rounded-full border border-slate-600/80 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300"
            >
              <span className="text-slate-500">{c.label}</span> {c.value}
            </span>
          ))}
        </div>
      )}

      <div
        className={cn(
          'flex items-start gap-1.5 text-[11px] leading-snug',
          oneLiner.thin ? 'text-slate-500 italic' : 'text-teal-200/90',
        )}
      >
        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
        <span className="line-clamp-2">{oneLiner.text}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {hint && (
          <span
            title={hint.title}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
              hint.kind === 'no_web'
                ? 'bg-slate-700/80 text-slate-300'
                : 'bg-rose-500/15 text-rose-300',
            )}
          >
            <AlertTriangle className="h-3 w-3" />
            {hint.label}
          </span>
        )}
        {(row.missingInformation?.length ?? 0) > 0 && !hint && (
          <span className="rounded-md bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">
            AI: missing info ({row.missingInformation.length})
          </span>
        )}
      </div>
    </button>
  );
}
