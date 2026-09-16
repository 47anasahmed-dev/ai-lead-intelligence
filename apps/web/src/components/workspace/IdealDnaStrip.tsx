'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import type { CompanyDnaPayload } from '@/lib/api';
import { compactDnaChips, idealDnaChips } from '@/lib/aiSurfaces';
import { thresholdChipsLabel, type RankingThresholds } from '@/lib/thresholds';
import { cn } from '@/lib/utils';

type Props = {
  idealDna: CompanyDnaPayload | null | undefined;
  idealDnaSummary?: string | null;
  thresholds: RankingThresholds;
  status?: string;
};

export function IdealDnaStrip({ idealDna, idealDnaSummary, thresholds, status }: Props) {
  const [expanded, setExpanded] = useState(false);
  const chips = compactDnaChips(idealDnaChips(idealDna), {
    maxLen: 36,
    maxSegments: 1,
  });
  const summary =
    idealDnaSummary?.trim() ||
    idealDna?.idealDnaSummary?.trim() ||
    null;

  const empty = chips.length === 0;
  const canToggle = !empty || Boolean(summary);

  function toggle() {
    if (canToggle) setExpanded((v) => !v);
  }

  return (
    <div
      role="button"
      tabIndex={canToggle ? 0 : -1}
      aria-expanded={expanded}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
      className={cn(
        'border-b border-slate-700/60 bg-gradient-to-r from-teal-500/[0.08] to-transparent px-5 py-3.5 outline-none',
        canToggle && 'cursor-pointer hover:from-teal-500/[0.11]',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400/50',
      )}
    >
      {/* Always one compact header row when collapsed */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-400">
          <Sparkles className="h-3.5 w-3.5" />
          Ideal DNA
        </span>

        {status === 'running' && (
          <span className="shrink-0 rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] text-teal-300">
            Scoring…
          </span>
        )}

        {empty ? (
          <p className="min-w-0 flex-1 truncate text-xs italic text-slate-500">
            Pick refs · Run — Ideal DNA appears here
          </p>
        ) : !expanded ? (
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-hidden">
            {chips.map((c) => (
              <DnaPill key={`${c.label}-${c.full}`} chip={c} />
            ))}
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
            {chips.length} traits · full summary
          </span>
        )}

        <span className="ml-auto shrink-0 rounded-full border border-slate-600/80 bg-slate-800/50 px-2.5 py-0.5 text-[11px] text-slate-300">
          {thresholdChipsLabel(thresholds)}
        </span>

        {canToggle && (
          <span className="shrink-0 text-slate-500" aria-hidden>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        )}
      </div>

      {expanded && !empty && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <DnaPill key={`x-${c.label}-${c.full}`} chip={c} />
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3">
          {summary ? (
            <p className="text-[12px] leading-relaxed text-teal-100/90 whitespace-pre-wrap">
              {summary}
            </p>
          ) : (
            <p className="text-[11px] italic text-slate-500">Awaiting Ideal DNA summary…</p>
          )}
        </div>
      )}
    </div>
  );
}

function DnaPill({
  chip,
}: {
  chip: { label: string; value: string; full: string };
}) {
  return (
    <span
      title={chip.full !== chip.value ? chip.full : undefined}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-600/90 bg-[#232B3E] px-2.5 py-1.5 text-[12px] font-medium text-slate-200"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {chip.label}
      </span>
      <span className="max-w-[12rem] truncate">{chip.value}</span>
    </span>
  );
}
