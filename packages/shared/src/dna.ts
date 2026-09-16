import type { CompanyDna, CriteriaPayload, CsvCompanyRow, EvidenceItem } from './types.js';
import { blankToNull, parseRevenue, parseYear } from './normalize.js';

function pushFact(
  facts: string[],
  evidence: EvidenceItem[],
  field: string,
  value: string | null,
  label: string,
  url?: string | null,
): void {
  if (!value) return;
  facts.push(label);
  evidence.push({
    field,
    value,
    source: 'csv',
    ...(url ? { url } : {}),
  });
}

/**
 * Build Company DNA from a CSV row.
 * Rules: facts from CSV only; inferences labeled; unknowns explicit; never invent.
 * demo_fit is stored in _meta only and MUST NOT be used for scoring.
 */
export function buildCompanyDnaFromCsvRow(row: CsvCompanyRow): CompanyDna {
  const companyId = blankToNull(row.company_id) ?? '';
  const name = blankToNull(row.company_name) ?? companyId;
  const website = blankToNull(row.website);
  const industry = blankToNull(row.industry);
  const primaryService = blankToNull(row.primary_service);
  const description = blankToNull(row.company_description);
  const customerProfile = blankToNull(row.customer_profile);
  const businessModel = blankToNull(row.business_model);
  const revenueModel = blankToNull(row.revenue_model);
  const employeeRange = blankToNull(row.employee_range);
  const estimatedRevenueUsd = parseRevenue(row.estimated_revenue_usd);
  const ownership = blankToNull(row.ownership);
  const growthSignal = blankToNull(row.growth_signal);
  const foundedYear = parseYear(row.founded_year);
  const reputationSignal = blankToNull(row.reputation_signal);
  const techStack = blankToNull(row.technology_stack);
  const geography = blankToNull(row.geography);
  const country = blankToNull(row.country);
  const city = blankToNull(row.city);
  const state = blankToNull(row.state);
  const keyServices = blankToNull(row.key_services);
  const demoFit = blankToNull(row.demo_fit);
  const linkedinUrl = blankToNull(row.linkedin_url);

  const facts: string[] = [];
  const inferences: string[] = [];
  const unknowns: string[] = [];
  const evidence: EvidenceItem[] = [];

  pushFact(facts, evidence, 'company_name', name, `Name: ${name}`);
  pushFact(facts, evidence, 'industry', industry, `Industry: ${industry}`);
  pushFact(facts, evidence, 'primary_service', primaryService, `Primary service: ${primaryService}`);
  pushFact(facts, evidence, 'key_services', keyServices, `Key services: ${keyServices}`);
  pushFact(facts, evidence, 'customer_profile', customerProfile, `Customers: ${customerProfile}`);
  pushFact(facts, evidence, 'business_model', businessModel, `Business model: ${businessModel}`);
  pushFact(facts, evidence, 'revenue_model', revenueModel, `Revenue model: ${revenueModel}`);
  pushFact(facts, evidence, 'employee_range', employeeRange, `Employees: ${employeeRange}`);
  if (estimatedRevenueUsd != null) {
    facts.push(`Estimated revenue (USD): ${estimatedRevenueUsd}`);
    evidence.push({
      field: 'estimated_revenue_usd',
      value: String(estimatedRevenueUsd),
      source: 'csv',
    });
  }
  pushFact(facts, evidence, 'ownership', ownership, `Ownership: ${ownership}`);
  pushFact(facts, evidence, 'geography', geography, `Geography: ${geography}`);
  pushFact(facts, evidence, 'country', country, `Country: ${country}`);
  pushFact(facts, evidence, 'growth_signal', growthSignal, `Growth signal: ${growthSignal}`);
  pushFact(facts, evidence, 'reputation_signal', reputationSignal, `Reputation: ${reputationSignal}`);
  pushFact(facts, evidence, 'technology_stack', techStack, `Technology: ${techStack}`);
  if (foundedYear != null) {
    facts.push(`Founded: ${foundedYear}`);
    evidence.push({ field: 'founded_year', value: String(foundedYear), source: 'csv' });
  }
  pushFact(facts, evidence, 'company_description', description, `Description present`);
  pushFact(facts, evidence, 'website', website, `Website: ${website}`, website);
  pushFact(
    facts,
    evidence,
    'linkedin_url',
    linkedinUrl,
    `LinkedIn: ${linkedinUrl}`,
    linkedinUrl,
  );

  // Labeled inferences only (derived from present facts — not invented attributes)
  if (businessModel && /saas/i.test(businessModel)) {
    inferences.push('Inference: business model suggests recurring SaaS revenue motion');
  }
  if (employeeRange && /101-250|251-500|501-1000/.test(employeeRange)) {
    inferences.push('Inference: mid-market employee band may indicate scale-up maturity');
  }
  if (growthSignal && /hir|expand|growth|funding|raising/i.test(growthSignal)) {
    inferences.push('Inference: growth signal language suggests active expansion');
  }

  const requiredFields: Array<[string, unknown]> = [
    ['industry', industry],
    ['primary_service', primaryService],
    ['customer_profile', customerProfile],
    ['business_model', businessModel],
    ['employee_range', employeeRange],
    ['ownership', ownership],
    ['geography', geography],
    ['growth_signal', growthSignal],
  ];
  for (const [field, val] of requiredFields) {
    if (val == null || val === '') unknowns.push(`Unknown: ${field}`);
  }
  if (estimatedRevenueUsd == null) unknowns.push('Unknown: estimated_revenue_usd');
  if (!techStack) unknowns.push('Unknown: technology_stack');
  if (!reputationSignal) unknowns.push('Unknown: reputation_signal');

  const presentCount = requiredFields.filter(([, v]) => v != null && v !== '').length;
  const confidence = Math.round((presentCount / requiredFields.length) * 100);

  return {
    companyId,
    identity: { name, website, industry, primaryService, description },
    customers: { profile: customerProfile },
    businessModel: { model: businessModel, revenueModel },
    size: { employeeRange, estimatedRevenueUsd },
    ownership: { type: ownership },
    growth: { signal: growthSignal, foundedYear },
    reputation: { signal: reputationSignal },
    technology: { stack: techStack },
    geography: { region: geography, country, city, state },
    facts,
    inferences,
    unknowns,
    evidence,
    confidence,
    _meta: { demoFit },
  };
}

/** Average DNA profiles into an Ideal DNA (centroid-ish for text fields). */
export function buildIdealDna(references: CompanyDna[]): CompanyDna {
  if (references.length === 0) {
    throw new Error('At least one reference company is required');
  }
  if (references.length === 1) return structuredClone(references[0]);

  const mode = (vals: Array<string | null>): string | null => {
    const counts = new Map<string, number>();
    for (const v of vals) {
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best: string | null = null;
    let n = 0;
    for (const [k, c] of counts) {
      if (c > n) {
        best = k;
        n = c;
      }
    }
    return best;
  };

  const joinUnique = (vals: Array<string | null>): string | null => {
    const parts = Array.from(new Set(vals.filter(Boolean) as string[]));
    return parts.length ? parts.join('; ') : null;
  };

  const avgConf = Math.round(
    references.reduce((s, r) => s + r.confidence, 0) / references.length,
  );

  return {
    companyId: 'IDEAL',
    identity: {
      name: 'Ideal Customer Profile',
      website: null,
      industry: mode(references.map((r) => r.identity.industry)),
      primaryService: joinUnique(references.map((r) => r.identity.primaryService)),
      description: null,
    },
    customers: {
      profile: joinUnique(references.map((r) => r.customers.profile)),
    },
    businessModel: {
      model: mode(references.map((r) => r.businessModel.model)),
      revenueModel: mode(references.map((r) => r.businessModel.revenueModel)),
    },
    size: {
      employeeRange: mode(references.map((r) => r.size.employeeRange)),
      estimatedRevenueUsd: null,
    },
    ownership: {
      type: mode(references.map((r) => r.ownership.type)),
    },
    growth: {
      signal: joinUnique(references.map((r) => r.growth.signal)),
      foundedYear: null,
    },
    reputation: {
      signal: joinUnique(references.map((r) => r.reputation.signal)),
    },
    technology: {
      stack: joinUnique(references.map((r) => r.technology.stack)),
    },
    geography: {
      region: mode(references.map((r) => r.geography.region)),
      country: mode(references.map((r) => r.geography.country)),
      city: null,
      state: null,
    },
    facts: [
      `Ideal DNA derived from ${references.length} reference companies`,
      ...references.map((r) => `Reference: ${r.identity.name} (${r.companyId})`),
    ],
    inferences: [
      'Inference: ideal profile uses modal industry/ownership/geography and unioned services/customers',
    ],
    unknowns: [],
    evidence: references.flatMap((r) =>
      r.evidence.slice(0, 3).map((e) => ({
        ...e,
        field: `${r.companyId}.${e.field}`,
      })),
    ),
    confidence: avgConf,
  };
}

/**
 * Build Ideal DNA / filter prefs from a criteria payload.
 * Facts only from provided fields; unknowns for the rest; never invent company attributes.
 * Notes become a labeled inference (not a fact).
 */
export function buildIdealDnaFromCriteria(criteria: CriteriaPayload): CompanyDna {
  const blank = (v: string | undefined): string | null => {
    if (v == null) return null;
    const t = v.trim();
    return t.length ? t : null;
  };

  const industry = blank(criteria.industry);
  const geography = blank(criteria.geography);
  const country = blank(criteria.country);
  const employeeRange = blank(criteria.employeeRange);
  const ownership = blank(criteria.ownership);
  const businessModel = blank(criteria.businessModel);
  const notes = blank(criteria.notes);

  const facts: string[] = ['Ideal DNA derived from criteria search prefs'];
  const inferences: string[] = [];
  const unknowns: string[] = [];
  const evidence: EvidenceItem[] = [];

  const push = (field: string, value: string | null, label: string) => {
    if (!value) return;
    facts.push(label);
    evidence.push({ field, value, source: 'criteria' });
  };

  push('industry', industry, `Industry: ${industry}`);
  push('geography', geography, `Geography: ${geography}`);
  push('country', country, `Country: ${country}`);
  push('employee_range', employeeRange, `Employees: ${employeeRange}`);
  push('ownership', ownership, `Ownership: ${ownership}`);
  push('business_model', businessModel, `Business model: ${businessModel}`);

  if (notes) {
    inferences.push(`Inference (user notes): ${notes}`);
  }

  const tracked: Array<[string, string | null]> = [
    ['industry', industry],
    ['geography', geography],
    ['country', country],
    ['employee_range', employeeRange],
    ['ownership', ownership],
    ['business_model', businessModel],
    ['primary_service', null],
    ['customer_profile', null],
    ['growth_signal', null],
  ];
  for (const [field, val] of tracked) {
    if (val == null) unknowns.push(`Unknown: ${field}`);
  }

  const provided = [industry, geography, country, employeeRange, ownership, businessModel].filter(
    Boolean,
  ).length;
  // Confidence reflects how many filter prefs were supplied (max 6)
  const confidence = Math.round((provided / 6) * 100);

  return {
    companyId: 'IDEAL',
    identity: {
      name: 'Ideal Customer Profile (criteria)',
      website: null,
      industry,
      primaryService: null,
      description: null,
    },
    customers: { profile: null },
    businessModel: { model: businessModel, revenueModel: null },
    size: { employeeRange, estimatedRevenueUsd: null },
    ownership: { type: ownership },
    growth: { signal: null, foundedYear: null },
    reputation: { signal: null },
    technology: { stack: null },
    geography: { region: geography, country, city: null, state: null },
    facts,
    inferences,
    unknowns,
    evidence,
    confidence,
  };
}
