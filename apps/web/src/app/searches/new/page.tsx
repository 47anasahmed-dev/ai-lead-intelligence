'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { client, type CompanyListItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Search, AlertCircle, Loader2 } from 'lucide-react';

export default function NewSearchPage() {
  const router = useRouter();
  const [q, setQ] = useState('SaaS');
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .listCompanies(q, 50)
      .then((res) => {
        if (!cancelled) setCompanies(res.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load companies');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  const selectedSet = new Set(selected);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  async function onRun() {
    if (selected.length < 1 || running) return;
    setRunning(true);
    setLoadingCreate(true);
    setError(null);
    try {
      const created = await client.createSearch(selected);
      setCreatedId(created.data.id);
      await client.runSearch(created.data.id);
      router.push(`/searches/${created.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
      setRunning(false);
      setLoadingCreate(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reference company search</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select 1–5 reference companies. We build Ideal DNA, filter candidates, then score
          similarity & qualification. demo_fit is never used in scoring.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selected.length}/5 selected
          </span>
          <Button
            type="button"
            disabled={selected.length < 1 || running}
            onClick={onRun}
            className="min-w-[140px]"
          >
            {loadingCreate || running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {loadingCreate ? 'Creating…' : 'Running analysis…'}
              </>
            ) : (
              'Create & run'
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Something went wrong</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Companies</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5" />
              <span>{selected.length} selected</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          ) : companies.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No companies found for &ldquo;{q}&rdquo;.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Geo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id} className={selectedSet.has(c.id) ? 'bg-muted/60' : ''}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="h-4 w-4 rounded border-border text-primary shadow-sm accent-primary"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{c.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.id}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.industry ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.employeeRange ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.geography ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
