import Link from 'next/link';
import { client } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let searches: Awaited<ReturnType<typeof client.listSearches>>['data'] = [];
  let error: string | null = null;
  try {
    const res = await client.listSearches();
    searches = res.data;
  } catch (e) {
    error = e instanceof Error ? e.message : 'API unavailable';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Reference-company vertical slice: select 1–5 peers → Ideal DNA → similarity →
            qualification → ranked leads.
          </p>
        </div>
        <Link
          href="/searches/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New reference search
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          API not reachable yet ({error}). Start the API on port 3001, then refresh.
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
          Recent searches
        </div>
        {searches.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No searches yet. Create a reference search to run the demo path.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {searches.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <Link
                    href={`/searches/${s.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {s.type} · {s.status}
                  </Link>
                  <p className="text-xs text-slate-500">
                    Refs:{' '}
                    {s.references.map((r) => r.company.name).join(', ') || '—'} ·{' '}
                    {new Date(s.createdAt).toLocaleString()}
                    {s._count ? ` · ${s._count.qualifications} results` : ''}
                  </p>
                </div>
                <Link
                  href={`/searches/${s.id}`}
                  className="text-sm text-slate-600 hover:text-brand-600"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
