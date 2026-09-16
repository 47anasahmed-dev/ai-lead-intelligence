'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { client, type ResultRow } from '@/lib/api';
import { linkForCompany } from '@/lib/links';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CheckCircle,
  CircleIcon,
  AlertTriangle,
  HelpCircle,
  Target,
  Gauge,
  Sparkles,
  ChevronRight,
  Loader2,
} from 'lucide-react';

function recBadge(rec: string, hardExclusion?: boolean) {
  const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    CONTACT_NOW: 'default',
    RESEARCH_MORE: 'secondary',
    MONITOR: 'outline',
    REJECT: 'destructive',
  };
  const labels: Record<string, string> = {
    CONTACT_NOW: 'Contact now',
    RESEARCH_MORE: 'Research more',
    MONITOR: 'Monitor',
    REJECT: hardExclusion ? 'Hard exclude' : 'Reject',
  };
  const v = variants[rec] ?? 'outline';
  const label = labels[rec] ?? rec;
  return <Badge variant={v}>{label}</Badge>;
}


function aiRiskHint(risks: string[]): { label: string; title: string } | null {
  if (!risks.length) return null;
  const joined = risks.join(' ');
  if (/no usable company information|fetch failed|invalid or missing website|enrichment error/i.test(joined)) {
    return { label: 'AI: no web data', title: risks[0] };
  }
  if (/AI red flag/i.test(joined)) {
    return { label: 'AI: risk', title: risks.find((r) => /AI red flag/i.test(r)) ?? risks[0] };
  }
  return { label: risks[0].length > 48 ? `${risks[0].slice(0, 45)}…` : risks[0], title: risks[0] };
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{value}</span>
    </div>
  );
}

const SIMILARITY_LABEL: Record<string, string> = {
  industry: 'Industry',
  services: 'Services',
  customers: 'Customers',
  businessModel: 'Business model',
  size: 'Size',
  ownership: 'Ownership',
  geography: 'Geography',
  growth: 'Growth',
};

function DimensionTable({ dims }: { dims: ResultRow['similarityDimensions'] }) {
  if (!dims) return null;
  const rows = Object.entries(dims) as [keyof NonNullable<typeof dims>, number][];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dimension</TableHead>
          <TableHead>Weight</TableHead>
          <TableHead className="text-right">Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell className="capitalize">{SIMILARITY_LABEL[k] ?? k}</TableCell>
            <TableCell className="text-muted-foreground">
              {(() => {
                const weights: Record<string, number> = {
                  industry: 20,
                  services: 20,
                  customers: 15,
                  businessModel: 15,
                  size: 10,
                  ownership: 5,
                  geography: 10,
                  growth: 5,
                };
                return `${weights[k] ?? 0}%`;
              })()}
            </TableCell>
            <TableCell className="text-right">
              <ScoreBar value={v} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

type SearchMeta = {
  status: string;
  references: Array<{ company: { name: string } }>;
};

export function SearchResultsLive({ searchId }: { searchId: string }) {
  const [search, setSearch] = useState<SearchMeta | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const status = search?.status ?? '';
  const isRunning = status === 'running';
  const isDraftEmpty = status === 'draft' && totalCount === 0;
  const shouldPoll = isRunning || isDraftEmpty;

  const fetchLive = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        client.getSearch(searchId),
        client.getResults(searchId),
      ]);
      setSearch({
        status: s.data.status,
        references: s.data.references ?? [],
      });
      setResults(Array.isArray(r.data) ? r.data : []);
      setTotalCount(r.meta?.totalCount ?? r.meta?.count ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setInitialLoading(false);
    }
  }, [searchId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      await fetchLive();
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchLive]);

  useEffect(() => {
    if (!shouldPoll) return;
    const id = setInterval(() => {
      void fetchLive();
    }, 1500);
    return () => clearInterval(id);
  }, [shouldPoll, fetchLive]);

  const title =
    status === 'completed'
      ? 'Analysis complete'
      : status === 'running'
        ? 'Analysis running'
        : status === 'failed'
          ? 'Analysis failed'
          : status || (initialLoading ? '…' : '…');

  const showTable = results.length > 0 || (!isRunning && !isDraftEmpty && !initialLoading);
  const showEmptySpinner = initialLoading || (shouldPoll && results.length === 0 && !error);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Search results</p>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          {search && (
            <p className="mt-1 text-sm text-muted-foreground">
              References: {search.references.map((r) => r.company.name).join(', ') || '—'} ·{' '}
              {totalCount} {totalCount === 1 ? 'match' : 'matches'} found
              {results.length > 0 && totalCount > results.length
                ? ` · showing top ${results.length}`
                : ''}
            </p>
          )}
        </div>
        <Link href="/searches/new">
          <Button type="button" variant="outline" size="sm" className="gap-2">
            New search
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Could not load results</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        </div>
      )}

      {(isRunning || isDraftEmpty) && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <span>
            Scoring… {totalCount} {totalCount === 1 ? 'match' : 'matches'} so far
          </span>
        </div>
      )}

      {showEmptySpinner && results.length === 0 && !error && (
        <Card>
          <CardContent className="pt-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin" />
            <p className="mt-3 text-sm text-muted-foreground">
              Waiting for the first scored matches…
            </p>
          </CardContent>
        </Card>
      )}

      {showTable && results.length === 0 && !shouldPoll && !error && !initialLoading && (
        <Card>
          <CardContent className="pt-12 text-center text-sm text-muted-foreground">
            No results yet. Run analysis from a new search.
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Tabs defaultValue="results" className="space-y-4">
          <TabsList>
            <TabsTrigger value="results">Ranked leads</TabsTrigger>
            {results[0] && (
              <TabsTrigger value="top">Why top lead scored well</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="results" className="space-y-4">
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                Sorted by qualification score, then similarity. Recommendation is the summary action.
                {isRunning ? ' Live — updating as scores land.' : ''}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[240px]">Company</TableHead>
                    <TableHead className="text-center">Qualification</TableHead>
                    <TableHead className="text-center">Similarity</TableHead>
                    <TableHead className="text-center">Confidence</TableHead>
                    <TableHead className="text-center">Recommendation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.slice(0, 5).map((row) => (
                    <TableRow key={row.companyId} className="group">
                      <TableCell>
                        {(() => {
                          const external = linkForCompany(
                            row.company.website,
                            row.company.linkedinUrl,
                          );
                          return external ? (
                            <a
                              href={external}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-primary hover:underline inline-block"
                            >
                              {row.company.name}
                            </a>
                          ) : (
                            <span className="font-medium">{row.company.name}</span>
                          );
                        })()}
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {row.company.industry ?? '—'}{' '}
                          {row.company.geography ? `· ${row.company.geography}` : ''}
                          {' · '}
                          <Link
                            href={`/companies/${row.companyId}?searchId=${searchId}`}
                            className="text-primary hover:underline"
                          >
                            Detail
                          </Link>
                        </div>
                        {row.hardExclusion && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            Hard exclusion
                          </div>
                        )}
                        {!row.hardExclusion && row.risks?.length > 0 && (() => {
                          const hint = aiRiskHint(row.risks);
                          if (!hint) return null;
                          return (
                            <div
                              className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
                              title={hint.title}
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[200px]">{hint.label}</span>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="cursor-default">
                              <div className="text-lg font-semibold">{row.qualificationScore}</div>
                              <div className="text-xs text-muted-foreground">
                                B{row.businessFit} / S{row.strategicFit}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            Business fit{' '}
                            <Gauge className="h-3 w-3 inline -mt-0.5 mr-0.5" />
                            {row.businessFit}/100 · Strategic fit{' '}
                            <Target className="h-3 w-3 inline -mt-0.5 mr-0.5" />
                            {row.strategicFit}/100
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-center">
                        {row.similarityScore != null ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="cursor-default">
                                <div className="text-lg font-semibold">{row.similarityScore}</div>
                                <div className="text-xs text-muted-foreground">overall</div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-1">
                                {Object.entries(row.similarityDimensions ?? {}).map(([k, v]) => (
                                  <div key={k} className="flex justify-between gap-2">
                                    <span className="capitalize">{SIMILARITY_LABEL[k] ?? k}</span>
                                    <span>{Math.round(v as number)}</span>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="cursor-default">
                              <Gauge className="h-4 w-4 mx-auto text-muted-foreground" />
                              <div className="text-sm font-medium">{row.confidence}</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            Field completeness, separate from fit score.
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-center">
                        {recBadge(row.recommendation, row.hardExclusion)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {results[0] && (
            <TabsContent value="top" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Why{' '}
                    {linkForCompany(results[0].company.website, results[0].company.linkedinUrl) ? (
                      <a
                        href={linkForCompany(results[0].company.website, results[0].company.linkedinUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {results[0].company.name}
                      </a>
                    ) : (
                      results[0].company.name
                    )}{' '}
                    scored well
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
                      <div className="text-xs text-muted-foreground">Qualification</div>
                      <div className="text-xl font-semibold">{results[0].qualificationScore}</div>
                      <div className="text-xs text-muted-foreground">
                        B{results[0].businessFit} / S{results[0].strategicFit}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
                      <div className="text-xs text-muted-foreground">Similarity</div>
                      <div className="text-xl font-semibold">
                        {results[0].similarityScore ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">overall</div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
                      <div className="text-xs text-muted-foreground">Confidence</div>
                      <div className="text-xl font-semibold">{results[0].confidence}</div>
                      <div className="text-xs text-muted-foreground">field completeness</div>
                    </div>
                  </div>

                  {results[0].similarityDimensions && (
                    <div>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Similarity dimensions
                      </h3>
                      <DimensionTable dims={results[0].similarityDimensions} />
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Card className="bg-muted/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                          <HelpCircle className="h-3.5 w-3.5" />
                          Strongest signals
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        {Object.entries(results[0].similarityDimensions ?? {})
                          .sort(([, a], [, b]) => (b as number) - (a as number))
                          .slice(0, 3)
                          .map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between text-sm">
                              <span className="capitalize text-muted-foreground">
                                {SIMILARITY_LABEL[k] ?? k}
                              </span>
                              <span className="font-mono">{Math.round(v as number)}</span>
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Positive signals
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                          {results[0].positiveSignals.length === 0 ? (
                            <li>None flagged</li>
                          ) : (
                            results[0].positiveSignals.map((s) => <li key={s}>{s}</li>)
                          )}
                        </ul>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                          <CircleIcon className="h-3.5 w-3.5 text-destructive" />
                          Risks
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                          {results[0].risks.length === 0 ? (
                            <li>None flagged</li>
                          ) : (
                            results[0].risks.map((r) => <li key={r}>{r}</li>)
                          )}
                        </ul>
                      </CardContent>
                    </Card>
                  </div>

                  {results[0].similarityExplanation.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Similarity explanation
                      </h3>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {results[0].similarityExplanation.slice(0, 6).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <Link
                      href={`/companies/${results[0].companyId}?searchId=${searchId}`}
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      Open company detail
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
