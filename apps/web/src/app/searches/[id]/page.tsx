import Link from 'next/link';
import { client, type ResultRow } from '@/lib/api';

export const dynamic = 'force-dynamic';

function badge(rec: string) {
  const map: Record<string, string> = {
    CONTACT_NOW: 'bg-emerald-100 text-emerald-800',
    RESEARCH_MORE: 'bg-sky-100 text-sky-800',
    MONITOR: 'bg-amber-100 text-amber-800',
    REJECT: 'bg-slate-200 text-slate-700',
  };
  return map[rec] ?? 'bg-slate-100 text-slate-700';
}

export default async function SearchResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let search: Awaited<ReturnType<typeof client.getSearch>>['data'] | null = null;
  let results: ResultRow[] = [];
  let error: string | null = null;

  try {
    const [s, r] = await Promise.all([client.getSearch(id), client.getResults(id)]);
    search = s.data;
    results = r.data;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Search results</p>
          <h1 className="text-2xl font-semibold">{search?.status ?? '…'}</h1>
          {search && (
            <p className="mt-1 text-sm text-slate-600">
              References:{' '}
              {search.references.map((r) => r.company.name).join(', ')} · {results.length}{' '}
              ranked leads
            </p>
          )}
        </div>
        <Link href="/searches/new" className="text-sm text-brand-600 hover:underline">
          New search
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Qualification</th>
              <th className="px-3 py-2">Similarity</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Recommendation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.slice(0, 50).map((row) => (
              <tr key={row.companyId} className="hover:bg-slate-50">
                <td className="px-3 py-3">
                  <Link
                    href={`/companies/${row.companyId}?searchId=${id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {row.company.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {row.company.industry ?? '—'} · {row.company.geography ?? '—'}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="font-semibold">{row.qualificationScore}</div>
                  <div className="text-xs text-slate-500">
                    B{row.businessFit} / S{row.strategicFit}
                  </div>
                </td>
                <td className="px-3 py-3">{row.similarityScore ?? '—'}</td>
                <td className="px-3 py-3">{row.confidence}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge(row.recommendation)}`}
                  >
                    {row.recommendation}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.length === 0 && !error && (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No results yet. Run analysis from a new search.
          </div>
        )}
      </div>

      {results[0] && (
        <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <summary className="cursor-pointer font-medium text-slate-700">
            Progressive disclosure — why top lead scored well
          </summary>
          <div className="mt-3 space-y-2 text-slate-600">
            <p>
              <span className="font-medium text-slate-800">Positive:</span>{' '}
              {results[0].positiveSignals.join('; ') || '—'}
            </p>
            <p>
              <span className="font-medium text-slate-800">Risks:</span>{' '}
              {results[0].risks.join('; ') || '—'}
            </p>
            <p>
              <span className="font-medium text-slate-800">Similarity:</span>{' '}
              {(results[0].similarityExplanation ?? []).slice(0, 4).join(' · ')}
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
