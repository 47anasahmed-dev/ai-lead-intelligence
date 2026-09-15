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
};

export type SearchSummary = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  references: Array<{ company: { id: string; name: string } }>;
  _count?: { qualifications: number };
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
  similarityExplanation: string[];
};

export const client = {
  health: () => api<{ status: string; db: string }>('/health'),
  listCompanies: (q?: string, limit = 40) =>
    api<{ data: CompanyListItem[] }>(
      `/companies?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    ),
  getCompany: (id: string) => api<{ data: Record<string, unknown> }>(`/companies/${id}`),
  listSearches: () => api<{ data: SearchSummary[] }>('/searches'),
  createSearch: (companyIds: string[]) =>
    api<{ data: { id: string } }>('/searches', {
      method: 'POST',
      body: JSON.stringify({ type: 'reference', companyIds }),
    }),
  runSearch: (id: string) =>
    api<{ data: { filteredCount: number; topResults: unknown[] } }>(
      `/searches/${id}/run`,
      { method: 'POST' },
    ),
  getSearch: (id: string) => api<{ data: SearchSummary & { idealDna?: unknown } }>(`/searches/${id}`),
  getResults: (id: string) =>
    api<{ data: ResultRow[]; meta: { status: string; count: number } }>(
      `/searches/${id}/results`,
    ),
};
