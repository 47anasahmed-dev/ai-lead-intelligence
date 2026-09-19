'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles, RotateCcw, Loader2 } from 'lucide-react';
import {
  DEFAULT_THRESHOLDS,
  type RankingThresholds,
  suggestThresholdsFromResults,
} from '@/lib/thresholds';
import { client, type ResultRow } from '@/lib/api';

type Props = {
  open: boolean;
  onClose: () => void;
  value: RankingThresholds;
  onChange: (next: RankingThresholds) => void;
  results: ResultRow[];
  /** When set, AI suggest calls the OpenRouter-backed API; otherwise local heuristic. */
  searchId?: string | null;
};

export function SettingsModal({
  open,
  onClose,
  value,
  onChange,
  results,
  searchId = null,
}: Props) {
  const [draft, setDraft] = useState(value);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setSuggestNote(null);
    }
  }, [open, value]);

  if (!open) return null;

  function apply() {
    onChange(draft);
    onClose();
  }

  function applyLocalHeuristic(note: string) {
    setDraft(suggestThresholdsFromResults(results));
    setSuggestNote(note);
  }

  async function onAiSuggest() {
    if (!searchId) {
      applyLocalHeuristic('Local heuristic (no active search).');
      return;
    }
    setSuggesting(true);
    setSuggestNote(null);
    try {
      const res = await client.suggestThresholds(searchId);
      const d = res.data;
      setDraft({
        minQualification: d.minQualification,
        minSimilarity: d.minSimilarity,
        minEvidenceCount: d.minEvidenceCount,
      });
      const bits = [d.rationale?.trim()].filter(Boolean) as string[];
      if (d.cached) {
        bits.push('Loaded from this search.');
      } else if (d.source === 'heuristic') {
        bits.push(d.message?.trim() || 'Local heuristic fallback.');
      } else if (d.message?.trim()) {
        bits.push(d.message.trim());
      }
      setSuggestNote(bits.join(' ') || (d.source === 'ai' ? 'AI suggest applied.' : 'Local heuristic.'));
    } catch {
      applyLocalHeuristic('API error — local heuristic applied.');
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="settings-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-slate-700 bg-[#1A2236] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="settings-title" className="text-base font-semibold text-white">
              Ranking thresholds
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Leads must pass <strong className="text-slate-300">all</strong> floors (AND) to appear
              in ranked list and tallies. Saved with the active search in the database. On Run,
              floors are suggested once; reopening the search reuses those saved values.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Field
            label="Min qualification"
            value={draft.minQualification}
            onChange={(n) => setDraft((d) => ({ ...d, minQualification: n }))}
          />
          <Field
            label="Min similarity"
            value={draft.minSimilarity}
            onChange={(n) => setDraft((d) => ({ ...d, minSimilarity: n }))}
          />
          <Field
            label="Min evidence count"
            value={draft.minEvidenceCount}
            max={50}
            onChange={(n) => setDraft((d) => ({ ...d, minEvidenceCount: n }))}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={suggesting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-500/20 disabled:opacity-60"
            onClick={() => void onAiSuggest()}
          >
            {suggesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {suggesting ? 'Suggesting…' : 'AI suggest'}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
            onClick={() => {
              setDraft({ ...DEFAULT_THRESHOLDS });
              setSuggestNote(null);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            System defaults
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-bold text-teal-950 hover:bg-teal-400"
              onClick={apply}
            >
              Save
            </button>
          </div>
        </div>

        {suggestNote ? (
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{suggestNote}</p>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      <div className="mt-1.5 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 flex-1 accent-teal-400"
        />
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 rounded-md border border-slate-600 bg-[#121826] px-2 py-1 text-sm tabular-nums text-white"
        />
      </div>
    </label>
  );
}
