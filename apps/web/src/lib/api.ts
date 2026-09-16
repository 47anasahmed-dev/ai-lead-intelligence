const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json as T;
}

export type CompanyListItem = {
  id: string;
  name: string;
  industry: string | null;
  primaryService: string | null;
  geography: string | null;
  employeeRange: string | null;
  ownership: string | null;
  businessModel: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
};

export type SearchRefCompany = {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
};

export type SearchSummary = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  idealDna?: unknown;
  references: Array<{ company: SearchRefCompany }>;
  _count?: { qualifications: number };
};

export type EvidenceItem = {
  field: string;
  value: string;
  source: string;
  url?: string;
  evidenceQuote?: string;
};

export type ResultRow = {
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
    linkedinUrl?: string | null;
    businessModel?: string | null;
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
  evidence?: EvidenceItem[];
  /** First-class AI fit narrative (2–4 sentences); additive to scores */
  aiFitNarrative?: string | null;
  aiFitNarrativeThin?: boolean;
  /** DNA inference stamps (incl. AI research status / notes / red flags) */
  inferences?: string[];
  researchNote?: string | null;
  researchStatus?: string | null;
  redFlags?: string[];
  /** Distinct from scoring confidence (data completeness) */
  aiResearchConfidence?: number | null;
};

export type CompanyDnaPayload = {
  companyId?: string;
  identity?: {
    name?: string;
    website?: string | null;
    industry?: string | null;
    primaryService?: string | null;
    description?: string | null;
  };
  customers?: { profile?: string | null };
  businessModel?: { model?: string | null; revenueModel?: string | null };
  size?: { employeeRange?: string | null; estimatedRevenueUsd?: number | null };
  ownership?: { type?: string | null };
  growth?: { signal?: string | null; foundedYear?: number | null };
  reputation?: { signal?: string | null };
  technology?: { stack?: string | null };
  geography?: {
    region?: string | null;
    country?: string | null;
    city?: string | null;
    state?: string | null;
  };
  facts?: string[];
  inferences?: string[];
  unknowns?: string[];
  evidence?: EvidenceItem[];
  confidence?: number;
  /** LLM Ideal DNA prose — never used in scoring */
  idealDnaSummary?: string;
};

export type CompanyDetail = {
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
  dna: CompanyDnaPayload | null;
  evidence?: EvidenceItem[];
};


export type ThresholdSuggestResponse = {
  minQualification: number;
  minSimilarity: number;
  minEvidenceCount: number;
  rationale: string;
  source: 'ai' | 'heuristic';
  message?: string;
  searchId?: string;
  resultCount?: number;
};

export const client = {
  health: () => api<{ status: string; db: string }>('/health'),
  listCompanies: (q?: string, limit = 40) =>
    api<{ data: CompanyListItem[] }>(
      `/companies?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    ),
  getCompany: (id: string) => api<{ data: CompanyDetail }>(`/companies/${id}`),
  listSearches: () => api<{ data: SearchSummary[] }>('/searches'),
  createSearch: (companyIds: string[]) =>
    api<{ data: { id: string } }>('/searches', {
      method: 'POST',
      body: JSON.stringify({ type: 'reference', companyIds }),
    }),
  runSearch: (id: string) =>
    api<{ data: { searchId: string; status: string; started?: boolean } }>(
      `/searches/${id}/run`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  getSearch: (id: string) =>
    api<{
      data: SearchSummary & {
        idealDna?: CompanyDnaPayload | null;
        idealDnaSummary?: string | null;
        references: Array<{
          company: SearchRefCompany & { industry?: string | null };
        }>;
      };
    }>(`/searches/${id}`),
  getResults: (id: string, limit = 100) =>
    api<{
      data: ResultRow[];
      meta: {
        status: string;
        count: number;
        totalCount: number;
        limit: number;
        idealDna?: CompanyDnaPayload | null;
        idealDnaSummary?: string | null;
      };
    }>(`/searches/${id}/results?limit=${limit}`),
  refreshEvidence: (companyId: string) =>
    api<{
      data: {
        didEnrich?: boolean;
        status?: string | null;
        evidenceCount?: number;
      };
    }>(`/companies/${companyId}/refresh-evidence`, {
      method: 'POST',
      body: '{}',
    }),
  /** Used by Settings AI suggest and WorkspaceShell auto-apply on completed. */
  suggestThresholds: (searchId: string) =>
    api<{ data: ThresholdSuggestResponse }>(
      `/searches/${searchId}/suggest-thresholds`,
      { method: 'POST', body: '{}' },
    ),
};

