import Link from 'next/link';
import { client } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ searchId?: string }>;
}) {
  const { id } = await params;
  const { searchId } = await searchParams;

  let data: Record<string, unknown> | null = null;
  let error: string | null = null;
  try {
    const res = await client.getCompany(id);
    data = res.data;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed';
  }

  const dna = (data?.dna ?? null) as
    | {
        facts?: string[];
        inferences?: string[];
        unknowns?: string[];
        confidence?: number;
        identity?: { name?: string; industry?: string; primaryService?: string };
      }
    | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        {searchId && (
          <Link href={`/searches/${searchId}`} className="text-brand-600 hover:underline">
            ← Back to results
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {data && (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{String(data.name)}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {String(data.industry ?? '—')} · {String(data.geography ?? '—')} ·{' '}
              {String(data.employeeRange ?? '—')} · {String(data.ownership ?? '—')}
            </p>
            {data.website ? (
              <a
                href={String(data.website)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-brand-600 hover:underline"
              >
                {String(data.website)}
              </a>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
              <h2 className="text-sm font-semibold text-slate-800">Company DNA — facts</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {(dna?.facts ?? []).slice(0, 20).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
            <section className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold">Confidence</h2>
                <p className="mt-1 text-3xl font-semibold text-brand-700">
                  {dna?.confidence ?? '—'}
                </p>
                <p className="text-xs text-slate-500">From field completeness (not blended into fit)</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold">Inferences (labeled)</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {(dna?.inferences ?? []).length ? (
                    dna!.inferences!.map((f) => <li key={f}>{f}</li>)
                  ) : (
                    <li>None</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold">Unknowns</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {(dna?.unknowns ?? []).length ? (
                    dna!.unknowns!.map((f) => <li key={f}>{f}</li>)
                  ) : (
                    <li>None</li>
                  )}
                </ul>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
