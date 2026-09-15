'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { client, type CompanyListItem } from '@/lib/api';

export default function NewSearchPage() {
  const router = useRouter();
  const [q, setQ] = useState('SaaS');
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client
      .listCompanies(q, 50)
      .then((res) => {
        if (!cancelled) setCompanies(res.data);
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
  }, [q]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  async function onRun() {
    if (selected.length < 1) return;
    setRunning(true);
    setError(null);
    try {
      const created = await client.createSearch(selected);
      await client.runSearch(created.data.id);
      router.push(`/searches/${created.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reference company search</h1>
        <p className="mt-1 text-sm text-slate-600">
          Select 1–5 reference companies. We build Ideal DNA, filter candidates, score
          similarity & qualification (demo_fit is never used).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search companies…"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <span className="text-sm text-slate-500">{selected.length}/5 selected</span>
        <button
          type="button"
          disabled={selected.length < 1 || running}
          onClick={onRun}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-brand-700 disabled:opacity-50"
        >
          {running ? 'Running analysis…' : 'Create & run'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Select</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Industry</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Geo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {c.name}
                    <div className="text-xs font-normal text-slate-400">{c.id}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{c.industry ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{c.employeeRange ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{c.geography ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
