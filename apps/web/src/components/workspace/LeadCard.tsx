'use client';

import type { CSSProperties } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResultRow } from '@/lib/api';
import { companyDnaChips, compactDnaChips, aiRiskHint, leadAiOneLiner } from '@/lib/aiSurfaces';
import { MetricRing, QualifyScore } from './MetricRing';

const AVATAR = [
  'bg-gradient-to-br from-indigo-500 to-violet-500 text-white',
  'bg-gradient-to-br from-red-500 to-orange-500 text-white',
  'bg-gradient-to-br from-sky-500 to-cyan-500 text-white',
  'bg-gradient-to-br from-emerald-500 to-teal-500 text-white',
  'bg-gradient-to-br from-purple-500 to-pink-500 text-white',
  'bg-gradient-to-br from-amber-500 to-yellow-500 text-white',
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

function recStyle(rec: string): { label: string; style: CSSProperties } {
  switch (rec) {
    case 'CONTACT_NOW':
      return {
        label: 'CONTACT NOW',
        style: {
          background: 'rgba(52,211,153,0.15)',
          color: '#34d399',
          border: '1px solid rgba(52,211,153,0.35)',
        },
      };
    case 'RESEARCH_MORE':
      return {
        label: 'RESEARCH MORE',
        style: {
          background: 'rgba(251,191,36,0.12)',
          color: '#fbbf24',
          border: '1px solid rgba(251,191,36,0.35)',
        },
      };
    case 'MONITOR':
      return {
        label: 'MONITOR',
        style: {
          background: 'rgba(59,130,246,0.15)',
          color: '#93c5fd',
          border: '1px solid rgba(59,130,246,0.35)',
        },
      };
    case 'REJECT':
      return {
        label: 'REJECT',
        style: {
          background: 'rgba(248,113,113,0.12)',
          color: '#f87171',
          border: '1px solid rgba(248,113,113,0.3)',
        },
      };
    default:
      return {
        label: rec,
        style: {
          background: 'rgba(45,55,72,0.6)',
          color: '#D1D5DB',
          border: '1px solid #2d3748',
        },
      };
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
  const chips = compactDnaChips(companyDnaChips(row.company), {
    maxChips: 5,
    maxLen: 28,
    maxSegments: 1,
  });
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
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'relative flex flex-col rounded-xl border p-3.5 text-left transition-all cursor-pointer outline-none',
        'focus-visible:ring-2 focus-visible:ring-teal-400/60',
        'bg-[#1A2236] hover:bg-[#1f2940]',
        selected
          ? 'border-teal-400/70 bg-gradient-to-br from-teal-500/14 to-[#1A2236] shadow-[inset_3px_0_0_#2DD4BF,0_0_0_1px_rgba(45,212,191,0.35),0_0_28px_rgba(20,184,166,0.18)]'
          : 'border-[#2d3748] hover:border-teal-500/45 hover:shadow-[0_0_0_1px_rgba(20,184,166,0.2),0_12px_28px_rgba(0,0,0,0.35)]',
      )}
    >
      {selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-teal-400 animate-live-pulse"
        />
      )}
      {/* Left: name + rings; right: Qualify then rec — never share one cell */}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
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
                <span className="text-xs font-mono font-semibold text-[#D1D5DB]">#{rank}</span>
                <span className="truncate text-sm font-semibold text-white">{row.company.name}</span>
              </div>
              <div className="truncate text-[11px] text-slate-400">
                {[row.company.industry, row.company.geography].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
          </div>

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
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <QualifyScore
            score={row.qualificationScore}
            businessFit={row.businessFit}
            strategicFit={row.strategicFit}
          />
          <span
            className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.04em] shrink-0"
            style={rec.style}
          >
            {rec.label}
          </span>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={`${c.label}-${c.full}`}
              title={c.full !== c.value ? c.full : undefined}
              className="max-w-[11rem] truncate rounded-full border border-slate-600/80 bg-slate-800/60 px-2.5 py-1 text-[10px] text-slate-300"
            >
              <span className="text-slate-500">{c.label}</span> {c.value}
            </span>
          ))}
        </div>
      )}

      <div
        className={cn(
          'mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug',
          oneLiner.thin ? 'text-slate-500 italic' : 'text-teal-200/90',
        )}
      >
        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
        <span className="line-clamp-2">{oneLiner.text}</span>
      </div>

      {(hint || (row.missingInformation?.length ?? 0) > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {hint && (
            <span
              title={hint.title}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                hint.kind === 'no_web'
                  ? 'bg-slate-700/80 text-slate-300'
                  : 'bg-[rgba(248,113,113,0.18)] text-[#f87171]',
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
      )}
    </div>
  );
}
