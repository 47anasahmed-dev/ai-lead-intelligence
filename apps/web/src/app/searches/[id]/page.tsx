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
import Link from 'next/link';
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

type ResultRow = {
  companyId: string;
  company: {
    id: string;
    name: string;
    industry: string | null;
    primaryService: string | null;
    geography: string | null;
    employeeRange: string | null;
    ownership: string | null;
    website: string | null;
  };
  qualificationScore: number;
  businessFit: number;
  strategicFit: number;
  confidence: number;
  recommendation: string;
  hardExclusion: boolean;
  positiveSignals: string[];
  risks: string[];
  missingInformation: string[];
  similarityScore: number | null;
  similarityDimensions: {
    industry: number;
    services: number;
    customers: number;
    businessModel: number;
    size: number;
    ownership: number;
    geography: number;
    growth: number;
  } | null;
  similarityExplanation: string[];
};

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
  const rows = Object.entries(dims) as [keyof typeof dims, number][];
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

export default async function SearchResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let search: { status: string; references: Array<{ company: { name: string } }> } | null = null;
  let results: ResultRow[] = [];
  let error: string | null = null;

  try {
    const [s, r] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/searches/${id}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error('Search not found')),
      ),
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/searches/${id}/results`).then(
        (r) => (r.ok ? r.json() : Promise.reject(new Error('Results not found'))),
      ),
    ]);
    search = s.data ?? s;
    results =
      Array.isArray(r.data)
        ? (r.data as ResultRow[])
        : Array.isArray((r as { data?: unknown }).data)
          ? (r.data as ResultRow[])
          : [];
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Search results</p>
          <h1 className="mt-1 text-2xl font-semibold">
            {search?.status === 'completed'
              ? 'Analysis complete'
              : search?.status === 'running'
                ? 'Analysis running'
                : search?.status ?? '…'}
          </h1>
          {search && (
            <p className="mt-1 text-sm text-muted-foreground">
              References: {search.references.map((r) => r.company.name).join(', ')} ·{' '}
              {results.length} ranked leads
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

      {search?.status === 'running' && (
        <Card>
          <CardContent className="pt-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin" />
            <p className="mt-3 text-sm text-muted-foreground">
              Scoring candidates — this usually takes a few seconds for the demo dataset.
            </p>
          </CardContent>
        </Card>
      )}

      {!error && search?.status !== 'running' && (
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
                  {results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                        No results yet. Run analysis from a new search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    results.slice(0, 50).map((row) => (
                      <TableRow key={row.companyId} className="group">
                        <TableCell>
                          <Link
                            href={`/companies/${row.companyId}?searchId=${id}`}
                            className="font-medium text-primary hover:underline inline-block"
                          >
                            {row.company.name}
                          </Link>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {row.company.industry ?? '—'}{' '}
                            {row.company.geography ? `· ${row.company.geography}` : ''}
                          </div>
                          {row.hardExclusion && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              Hard exclusion
                            </div>
                          )}
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
                                      <span>{Math.round(v)}</span>
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
                        <TableCell className="text-center">{recBadge(row.recommendation, row.hardExclusion)}</TableCell>
                      </TableRow>
                    ))
                  )}
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
                    Why {results[0].company.name} scored well
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
                        {Object.entries(results[0].similarityDimensions ?? {}).sort(
                          ([, a], [, b]) => (b as number) - (a as number),
                        ).slice(0, 3).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between text-sm">
                            <span className="capitalize text-muted-foreground">{SIMILARITY_LABEL[k] ?? k}</span>
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
                      href={`/companies/${results[0].companyId}?searchId=${id}`}
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
