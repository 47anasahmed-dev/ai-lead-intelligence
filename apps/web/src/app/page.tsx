'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { client, type SearchSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Search, Loader2, ArrowRight } from 'lucide-react';

function typeLabel(type: string) {
  const map: Record<string, string> = {
    reference: 'Reference',
    criteria: 'Criteria',
  };
  return map[type] ?? type;
}

function statusBadge(status: string) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
    draft: { variant: 'outline', label: 'Draft' },
    running: { variant: 'secondary', label: 'Running' },
    completed: { variant: 'default', label: 'Completed' },
    failed: { variant: 'destructive', label: 'Failed' },
  };
  const s = map[status] ?? { variant: 'outline' as const, label: status };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export default function DashboardPage() {
  const [searches, setSearches] = useState<SearchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const fetch = async () => {
      try {
        const res = await client.listSearches();
        if (!cancelled) {
          setSearches(res.data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load searches');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    interval = setInterval(fetch, 4000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  const hasRunning = searches.some((s) => s.status === 'running');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reference-company vertical slice — select 1–5 peers, then we build Ideal DNA, filter,
            score, and rank leads.
          </p>
        </div>
        <Link href="/searches/new">
          <Button type="button" className="gap-2">
            <Search className="h-4 w-4" />
            New reference search
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Could not reach the API</p>
              <p className="mt-0.5">{error}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start the API on port 3001, then refresh.
              </p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Recent searches</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          </CardContent>
        </Card>
      ) : searches.length === 0 ? (
        <Card>
          <CardContent className="pt-12 text-center">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No searches yet. Create a reference search to run the demo path.
            </p>
            <Link href="/searches/new" className="mt-4 inline-block">
              <Button type="button" variant="outline" className="gap-2">
                <Search className="h-4 w-4" />
                New reference search
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Recent searches</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {hasRunning && (
              <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analysis in progress — results page auto-refreshes.
              </div>
            )}
            {searches.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {typeLabel(s.type)}
                    </span>
                    <span className="text-muted-foreground/40" aria-hidden>
                      ·
                    </span>
                    {statusBadge(s.status)}
                  </div>
                  <Link
                    href={`/searches/${s.id}`}
                    className="mt-1 font-medium text-foreground hover:underline"
                  >
                    {s.references.length === 1
                      ? `1 reference`
                      : `${s.references.length} references`}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.references.map((r) => r.company.name).join(', ') || '—'}{' '}
                    · {new Date(s.createdAt).toLocaleString()}
                    {s._count ? ` · ${s._count.qualifications} results` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/searches/${s.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    Open
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
