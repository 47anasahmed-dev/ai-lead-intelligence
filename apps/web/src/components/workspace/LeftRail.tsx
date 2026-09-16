'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { client, type CompanyListItem, type SearchRefCompany, type SearchSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

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

type Props = {
  references: SearchRefCompany[];
  onReferencesChange: (refs: SearchRefCompany[]) => void;
  onSelectReference: (c: SearchRefCompany) => void;
  selectedRefId: string | null;
  recent: SearchSummary[];
  activeSearchId: string | null;
  onLoadSearch: (id: string) => void;
  sessionLabel: string;
};

export function LeftRail({
  references,
  onReferencesChange,
  onSelectReference,
  selectedRefId,
  recent,
  activeSearchId,
  onLoadSearch,
  sessionLabel,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!adding) return;
    let cancelled = false;
    setLoading(true);
    client
      .listCompanies(q, 30)
      .then((res) => {
        if (!cancelled) setHits(res.data);
      })
      .catch(() => {
        if (!cancelled) setHits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, adding]);

  const selectedIds = new Set(references.map((r) => r.id));

  function addCompany(c: CompanyListItem) {
    if (selectedIds.has(c.id) || references.length >= 5) return;
    onReferencesChange([
      ...references,
      {
        id: c.id,
        name: c.name,
        industry: c.industry,
        website: c.website,
        linkedinUrl: c.linkedinUrl,
      },
    ]);
    setAdding(false);
    setQ('');
  }

  function remove(id: string) {
    onReferencesChange(references.filter((r) => r.id !== id));
  }

  return (
    <aside className="flex h-full flex-col border-r border-slate-700/60 bg-[#1A2236] overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <section className="border-b border-slate-700/60 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Reference companies
            </h2>
            <span className="text-[10px] text-slate-500">{references.length}/5</span>
          </div>

          <div className="mt-2 space-y-1.5">
            {references.map((c) => {
              const tone = AVATAR[hash(c.name) % AVATAR.length];
              const selected = selectedRefId === c.id;
              return (
                <div
                  key={c.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
                    selected
                      ? 'border-blue-400/60 bg-blue-500/10'
                      : 'border-transparent hover:border-slate-600 hover:bg-slate-800/50',
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onSelectReference(c)}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
                        tone,
                      )}
                    >
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-white">{c.name}</span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {c.industry ?? '—'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-slate-600 opacity-0 hover:text-rose-400 group-hover:opacity-100"
                    onClick={() => remove(c.id)}
                    aria-label={`Remove ${c.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {adding ? (
            <div className="mt-2 space-y-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search companies…"
                  className="w-full rounded-md border border-slate-600 bg-[#121826] py-1.5 pl-7 pr-2 text-xs text-white placeholder:text-slate-600"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border border-slate-700 bg-[#121826]">
                {loading ? (
                  <p className="px-2 py-2 text-[11px] text-slate-500">Loading…</p>
                ) : hits.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-slate-500">No matches</p>
                ) : (
                  hits.map((c) => {
                    const disabled = selectedIds.has(c.id) || references.length >= 5;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => addCompany(c)}
                        className="flex w-full flex-col px-2 py-1.5 text-left hover:bg-slate-800 disabled:opacity-40"
                      >
                        <span className="truncate text-xs text-white">{c.name}</span>
                        <span className="truncate text-[10px] text-slate-500">
                          {c.industry ?? '—'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                className="text-[11px] text-slate-500 hover:text-slate-300"
                onClick={() => {
                  setAdding(false);
                  setQ('');
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={references.length >= 5}
              onClick={() => setAdding(true)}
              className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-600 py-1.5 text-[11px] text-slate-400 hover:border-teal-500/50 hover:text-teal-300 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add reference
            </button>
          )}
        </section>

        <section className="p-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Recent searches
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recent.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">No searches yet</p>
            ) : (
              recent.slice(0, 12).map((s) => {
                const label =
                  s.references.map((r) => r.company.name).filter(Boolean).slice(0, 2).join(' + ') ||
                  (s.type === 'criteria' ? 'Criteria search' : 'Search');
                const active = s.id === activeSearchId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onLoadSearch(s.id)}
                    title={`${label} · ${s.status} · ${new Date(s.createdAt).toLocaleString()}`}
                    className={cn(
                      'max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                      active
                        ? 'border-teal-400/60 bg-teal-500/15 text-teal-200'
                        : 'border-teal-500/30 text-teal-300/90 hover:bg-teal-500/10',
                    )}
                  >
                    {label}
                    {s._count != null ? ` · ${s._count.qualifications}` : ''}
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="border-t border-slate-700/60 px-3 py-2 text-[10px] text-slate-500">
        {sessionLabel}
      </div>
    </aside>
  );
}
