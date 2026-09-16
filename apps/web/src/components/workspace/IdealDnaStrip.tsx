'use client';

import { Sparkles } from 'lucide-react';
import type { CompanyDnaPayload } from '@/lib/api';
import { idealDnaChips } from '@/lib/aiSurfaces';
import { thresholdChipsLabel, type RankingThresholds } from '@/lib/thresholds';

type Props = {
  idealDna: CompanyDnaPayload | null | undefined;
  idealDnaSummary?: string | null;
  thresholds: RankingThresholds;
  status?: string;
};

export function IdealDnaStrip({ idealDna, idealDnaSummary, thresholds, status }: Props) {
  const chips = idealDnaChips(idealDna);
  const inferences = (idealDna?.inferences ?? []).filter(Boolean).slice(0, 2);
  const summary =
    idealDnaSummary?.trim() ||
    idealDna?.idealDnaSummary?.trim() ||
    null;

  return (
    <div className="space-y-2 border-b border-slate-700/60 bg-[#161d2e] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-400">
          <Sparkles className="h-3.5 w-3.5" />
          Ideal DNA · AI synthesized from refs
        </span>
        {status === 'running' && (
          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] text-teal-300">
            Scoring live…
          </span>
        )}
        <span className="ml-auto rounded-full border border-slate-600/80 bg-slate-800/50 px-2.5 py-0.5 text-[10px] text-slate-400">
          {thresholdChipsLabel(thresholds)}
        </span>
      </div>

      {chips.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          Select references and Run — Ideal DNA appears after synthesis.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={`${c.label}-${c.value}`}
              className="rounded-full border border-slate-600 bg-[#1A2236] px-2.5 py-1 text-[11px] text-slate-200"
            >
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {c.label}
              </span>
              {c.value}
            </span>
          ))}
        </div>
      )}

      {summary ? (
        <p className="text-[12px] leading-relaxed text-teal-100/85">{summary}</p>
      ) : (
        chips.length > 0 && (
          <p className="text-[11px] text-slate-500 italic">
            Awaiting AI Ideal DNA summary… (centroid chips above are deterministic)
          </p>
        )
      )}

      {inferences.length > 0 && (
        <div className="space-y-0.5">
          {inferences.map((inf) => (
            <p key={inf} className="text-[11px] text-teal-200/70 line-clamp-1">
              {inf}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
