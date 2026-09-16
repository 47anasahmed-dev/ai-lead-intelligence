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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import Link from 'next/link';
import {
  ChevronRight,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  CircleIcon,
  Gauge,
  Lightbulb,
  Hash,
} from 'lucide-react';
import {
  hrefFromValue,
  linkForCompany,
  looksLikeUrl,
  normalizeUrl,
} from '@/lib/links';
import { RefreshEvidenceButton } from '@/components/RefreshEvidenceButton';

type EvidenceRow = {
  field: string;
  value: string;
  source: string;
  url?: string;
  evidenceQuote?: string;
};

type DnaSection = {
  facts?: string[];
  inferences?: string[];
  unknowns?: string[];
  evidence?: EvidenceRow[];
  confidence?: number;
  identity?: {
    name?: string;
    industry?: string;
    primaryService?: string;
  };
  customers?: { profile?: string };
  businessModel?: { model?: string; revenueModel?: string };
  size?: { employeeRange?: string; estimatedRevenueUsd?: number };
  ownership?: { type?: string };
  growth?: { signal?: string; foundedYear?: number };
  reputation?: { signal?: string };
  technology?: { stack?: string };
  geography?: {
    region?: string;
    country?: string;
    city?: string;
    state?: string;
  };
};

type CompanyData = {
  id: string;
  name: string;
  industry: string | null;
  geography: string | null;
  employeeRange: string | null;
  ownership: string | null;
  website: string | null;
  linkedinUrl?: string | null;
  businessModel: string | null;
  primaryService: string | null;
  dna: DnaSection | null;
  evidence?: EvidenceRow[];
};

function EvidenceValue({ value, url }: { value: string; url?: string }) {
  const href = url ? normalizeUrl(url) : hrefFromValue(value);
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline break-all"
      >
        {value}
      </a>
    );
  }
  if (looksLikeUrl(value)) {
    const n = normalizeUrl(value);
    if (n) {
      return (
        <a
          href={n}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {value}
        </a>
      );
    }
  }
  return <span className="break-words">{value}</span>;
}

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ searchId?: string }>;
}) {
  const { id } = await params;
  const { searchId } = await searchParams;

  let data: CompanyData | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/companies/${id}`,
    ).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Company not found'))));
    data = res.data as CompanyData;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load';
  }

  const nameHref = data
    ? linkForCompany(data.website, data.linkedinUrl)
    : null;
  const websiteHref = data?.website ? normalizeUrl(data.website) : null;
  const linkedinHref = data?.linkedinUrl ? normalizeUrl(data.linkedinUrl) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        {searchId && (
          <Link href={`/searches/${searchId}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3 rotate-180" />
            Back to results
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Could not load company</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                {nameHref ? (
                  <a
                    href={nameHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-2xl font-semibold text-primary hover:underline inline-flex items-center gap-2"
                  >
                    {data.name}
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </a>
                ) : (
                  <h1 className="text-2xl font-semibold">{data.name}</h1>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.industry ?? '—'} · {data.geography ?? '—'} ·{' '}
                  {data.employeeRange ?? '—'} · {data.ownership ?? '—'}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {websiteHref ? (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {data.website}
                    </a>
                  ) : null}
                  {linkedinHref ? (
                    <a
                      href={linkedinHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      LinkedIn
                    </a>
                  ) : null}
                </div>
              </div>
              <RefreshEvidenceButton companyId={data.id} />
            </div>
          </div>

          <Tabs defaultValue="scores" className="space-y-4">
            <TabsList>
              <TabsTrigger value="scores">Scores</TabsTrigger>
              <TabsTrigger value="dna">DNA facts</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
            </TabsList>

            <TabsContent value="scores" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Gauge className="mx-auto h-5 w-5 text-muted-foreground" />
                    <div className="mt-2 text-xs text-muted-foreground">Confidence</div>
                    <div className="text-3xl font-semibold">
                      {data.dna?.confidence ?? '—'}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Field completeness — separate from fit
                    </p>
                  </CardContent>
                </Card>

                {data.dna?.identity?.industry && (
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <span className="text-xs text-muted-foreground">Industry</span>
                      <div className="mt-2 text-lg font-semibold">
                        {data.dna.identity.industry}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {data.dna?.identity?.primaryService && (
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <span className="text-xs text-muted-foreground">Primary service</span>
                      <div className="mt-2 text-lg font-semibold">
                        {data.dna.identity.primaryService}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Lightbulb className="h-4 w-4" />
                    Business profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Customers</span>
                      <span className="text-right">{data.dna?.customers?.profile ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Business model</span>
                      <span className="text-right">{data.dna?.businessModel?.model ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Revenue model</span>
                      <span className="text-right">{data.dna?.businessModel?.revenueModel ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Size</span>
                      <span className="text-right">
                        {data.dna?.size?.employeeRange ??
                          data.employeeRange ??
                          '—'}{' '}
                        {data.dna?.size?.estimatedRevenueUsd != null
                          ? `· $${(data.dna.size.estimatedRevenueUsd / 1_000_000).toFixed(0)}M`
                          : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Ownership</span>
                      <span className="text-right">{data.dna?.ownership?.type ?? data.ownership ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Growth signal</span>
                      <span className="text-right">{data.dna?.growth?.signal ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Geography (region)</span>
                      <span className="text-right">{data.dna?.geography?.region ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Technology stack</span>
                      <span className="max-w-[200px] truncate text-right">{data.dna?.technology?.stack ?? '—'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dna" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    Facts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(data.dna?.facts ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No facts recorded.</p>
                  ) : (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {data.dna!.facts!.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {data.dna?.inferences && data.dna.inferences.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      Inferences <span className="text-xs text-muted-foreground">(labeled, not hard facts)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {data.dna!.inferences!.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {data.dna?.unknowns && data.dna.unknowns.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CircleIcon className="h-4 w-4 text-muted-foreground" />
                      Unknowns
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {data.dna!.unknowns!.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {data.dna?.unknowns && data.dna.unknowns.length === 0 && data.dna?.inferences?.length === 0 && (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No inferences or unknowns recorded for this company.
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="evidence" className="space-y-4">
              {(data.evidence?.length ?? 0) > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Hash className="h-4 w-4" />
                      Evidence
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Quote</TableHead>
                          <TableHead>URL</TableHead>
                          <TableHead className="w-24">Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.evidence!.map((e, i) => {
                          const rowUrl = e.url ? normalizeUrl(e.url) : hrefFromValue(e.value);
                          return (
                            <TableRow key={`${e.field}-${e.value}-${i}`}>
                              <TableCell className="font-medium text-foreground whitespace-nowrap">
                                {e.field}
                              </TableCell>
                              <TableCell className="text-muted-foreground max-w-[280px]">
                                <EvidenceValue value={e.value} url={e.url} />
                              </TableCell>
                              <TableCell className="text-muted-foreground max-w-[220px] text-xs">
                                {e.evidenceQuote ? (
                                  <span className="italic break-words">“{e.evidenceQuote}”</span>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                              <TableCell className="max-w-[160px]">
                                {rowUrl ? (
                                  <a
                                    href={rowUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline break-all inline-flex items-center gap-1"
                                  >
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    Open
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{e.source}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No evidence recorded for this company.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
