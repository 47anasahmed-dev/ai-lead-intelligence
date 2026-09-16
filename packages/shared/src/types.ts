/** Frozen Phase-0 contracts — do not redesign. */

export type Recommendation =
  | 'CONTACT_NOW'
  | 'RESEARCH_MORE'
  | 'MONITOR'
  | 'REJECT';

export type EvidenceSource = 'csv' | 'criteria' | 'website' | 'linkedin' | 'about' | 'news' | 'mention';

export interface EvidenceItem {
  field: string;
  value: string;
  source: EvidenceSource;
  /** Present for website (and future) research evidence */
  url?: string;
  /** Verbatim quote from source text when available */
  evidenceQuote?: string;
}

export interface CompanyDna {
  companyId: string;
  identity: {
    name: string;
    website: string | null;
    industry: string | null;
    primaryService: string | null;
    description: string | null;
  };
  customers: {
    profile: string | null;
  };
  businessModel: {
    model: string | null;
    revenueModel: string | null;
  };
  size: {
    employeeRange: string | null;
    estimatedRevenueUsd: number | null;
  };
  ownership: {
    type: string | null;
  };
  growth: {
    signal: string | null;
    foundedYear: number | null;
  };
  reputation: {
    signal: string | null;
  };
  technology: {
    stack: string | null;
  };
  geography: {
    region: string | null;
    country: string | null;
    city: string | null;
    state: string | null;
  };
  facts: string[];
  inferences: string[];
  unknowns: string[];
  evidence: EvidenceItem[];
  confidence: number;
  /**
   * Optional LLM prose summarizing Ideal DNA from reference evidence.
   * Additive intelligence only — NEVER used in scoring / similarity.
   */
  idealDnaSummary?: string;
  /** Stored for audit only — NEVER used in scoring */
  _meta?: {
    demoFit?: string | null;
  };
}

export interface SimilarityDimensions {
  industry: number;
  services: number;
  customers: number;
  businessModel: number;
  size: number;
  ownership: number;
  geography: number;
  growth: number;
}

export const SIMILARITY_WEIGHTS: SimilarityDimensions = {
  industry: 0.2,
  services: 0.2,
  customers: 0.15,
  businessModel: 0.15,
  size: 0.1,
  ownership: 0.05,
  geography: 0.1,
  growth: 0.05,
};

export interface SimilarityResult {
  overallScore: number;
  dimensions: SimilarityDimensions;
  explanation: string[];
}

export interface QualificationResult {
  businessFit: number;
  strategicFit: number;
  qualificationScore: number;
  confidence: number;
  positiveSignals: string[];
  risks: string[];
  missingInformation: string[];
  recommendation: Recommendation;
  hardExclusion: boolean;
}

export interface CsvCompanyRow {
  company_id: string;
  company_name: string;
  website: string;
  industry: string;
  primary_service: string;
  country: string;
  city: string;
  state: string;
  employee_range: string;
  estimated_revenue_usd: string;
  founded_year: string;
  ownership: string;
  customer_profile: string;
  business_model: string;
  revenue_model: string;
  geography: string;
  key_services: string;
  growth_signal: string;
  reputation_signal: string;
  technology_stack: string;
  linkedin_url: string;
  company_description: string;
  demo_fit: string;
}

export type SearchType = 'reference' | 'criteria';

/** Criteria-search filter prefs (Phase 7 lite). At least one filter field required at API. */
export interface CriteriaPayload {
  industry?: string;
  geography?: string;
  country?: string;
  employeeRange?: string;
  ownership?: string;
  businessModel?: string;
  /** Free-text notes — stored as labeled inference, never invented company facts */
  notes?: string;
}
