import { describe, expect, it } from 'vitest';
import { buildCompanyDnaFromCsvRow, buildIdealDna } from './dna.js';
import { similarityScore } from './similarity.js';
import { qualificationScore, recommend } from './qualification.js';
import { deterministicFilter } from './filter.js';
import type { CsvCompanyRow } from './types.js';

function row(partial: Partial<CsvCompanyRow> & Pick<CsvCompanyRow, 'company_id' | 'company_name'>): CsvCompanyRow {
  return {
    website: 'https://example.com',
    industry: 'B2B SaaS',
    primary_service: 'Analytics platform',
    country: 'United States',
    city: 'Austin',
    state: 'TX',
    employee_range: '51-100',
    estimated_revenue_usd: '10000000',
    founded_year: '2015',
    ownership: 'Private',
    customer_profile: 'Mid-market businesses; data teams',
    business_model: 'B2B SaaS',
    revenue_model: 'Subscription',
    geography: 'North America',
    key_services: 'BI; dashboards',
    growth_signal: 'Hiring data engineers',
    reputation_signal: 'Strong G2 reviews',
    technology_stack: 'AWS; Python',
    linkedin_url: '',
    company_description: 'A B2B analytics company',
    demo_fit: 'High',
    ...partial,
  };
}

describe('buildCompanyDnaFromCsvRow', () => {
  it('captures facts from CSV and keeps demo_fit out of facts', () => {
    const dna = buildCompanyDnaFromCsvRow(row({ company_id: 'C001', company_name: 'Alpha' }));
    expect(dna.companyId).toBe('C001');
    expect(dna.identity.industry).toBe('B2B SaaS');
    expect(dna.facts.some((f) => /Industry/.test(f))).toBe(true);
    expect(dna.facts.join(' ')).not.toMatch(/demo_fit|High/i);
    expect(dna._meta?.demoFit).toBe('High');
    expect(dna.confidence).toBeGreaterThan(50);
  });

  it('marks unknowns when fields are blank', () => {
    const dna = buildCompanyDnaFromCsvRow(
      row({
        company_id: 'C002',
        company_name: 'Beta',
        industry: '',
        growth_signal: '',
        technology_stack: '',
      }),
    );
    expect(dna.unknowns.some((u) => u.includes('industry'))).toBe(true);
    expect(dna.unknowns.some((u) => u.includes('growth_signal'))).toBe(true);
  });
});

describe('similarity + qualification', () => {
  it('scores similar companies higher than dissimilar ones', () => {
    const a = buildCompanyDnaFromCsvRow(row({ company_id: 'R1', company_name: 'Ref One' }));
    const b = buildCompanyDnaFromCsvRow(row({ company_id: 'R2', company_name: 'Ref Two' }));
    const ideal = buildIdealDna([a, b]);

    const similar = buildCompanyDnaFromCsvRow(
      row({ company_id: 'C10', company_name: 'Near Twin', primary_service: 'Analytics platform' }),
    );
    const dissimilar = buildCompanyDnaFromCsvRow(
      row({
        company_id: 'C99',
        company_name: 'Far Away',
        industry: 'Food & Beverage',
        primary_service: 'Snack manufacturing',
        business_model: 'B2C Manufacturing',
        customer_profile: 'Grocery retailers',
        geography: 'Europe',
        country: 'Germany',
        ownership: 'Public',
        employee_range: '5001-10000',
        growth_signal: 'Plant expansion',
      }),
    );

    const simNear = similarityScore(ideal, similar);
    const simFar = similarityScore(ideal, dissimilar);
    expect(simNear.overallScore).toBeGreaterThan(simFar.overallScore);
    expect(simNear.explanation.length).toBeGreaterThan(0);

    const qNear = qualificationScore(ideal, similar, simNear);
    const qFar = qualificationScore(ideal, dissimilar, simFar);
    expect(qNear.qualificationScore).toBeGreaterThan(qFar.qualificationScore);
    expect(qNear.recommendation).not.toBe('REJECT');
    // Ensure demo_fit never appears in outputs
    expect(JSON.stringify(qNear)).not.toMatch(/demo_fit/i);
  });

  it('hard-excludes government/nonprofit ownership', () => {
    const ideal = buildCompanyDnaFromCsvRow(row({ company_id: 'R1', company_name: 'Ref' }));
    const gov = buildCompanyDnaFromCsvRow(
      row({ company_id: 'G1', company_name: 'Agency', ownership: 'Government' }),
    );
    const sim = similarityScore(ideal, gov);
    const q = qualificationScore(ideal, gov, sim);
    expect(q.hardExclusion).toBe(true);
    expect(q.recommendation).toBe('REJECT');
  });
});

describe('recommend thresholds', () => {
  it('maps scores to recommendation bands', () => {
    expect(recommend({ qualificationScore: 80, confidence: 70, hardExclusion: false, riskCount: 1 })).toBe(
      'CONTACT_NOW',
    );
    expect(recommend({ qualificationScore: 60, confidence: 50, hardExclusion: false, riskCount: 3 })).toBe(
      'RESEARCH_MORE',
    );
    expect(recommend({ qualificationScore: 40, confidence: 50, hardExclusion: false, riskCount: 1 })).toBe(
      'MONITOR',
    );
    expect(recommend({ qualificationScore: 20, confidence: 80, hardExclusion: false, riskCount: 0 })).toBe(
      'REJECT',
    );
    expect(recommend({ qualificationScore: 90, confidence: 90, hardExclusion: true, riskCount: 0 })).toBe(
      'REJECT',
    );
  });
});

describe('deterministicFilter', () => {
  it('excludes reference ids and keeps industry peers', () => {
    const refs = [
      buildCompanyDnaFromCsvRow(row({ company_id: 'R1', company_name: 'Ref' })),
    ];
    const ideal = buildIdealDna(refs);
    const pool = [
      ...refs,
      buildCompanyDnaFromCsvRow(row({ company_id: 'C1', company_name: 'Peer' })),
      buildCompanyDnaFromCsvRow(
        row({
          company_id: 'C2',
          company_name: 'Other',
          industry: 'Mining',
          business_model: 'Extraction',
          geography: 'Africa',
          country: 'ZA',
        }),
      ),
    ];
    const filtered = deterministicFilter(ideal, pool, new Set(['R1']));
    expect(filtered.find((c) => c.companyId === 'R1')).toBeUndefined();
    expect(filtered.find((c) => c.companyId === 'C1')).toBeTruthy();
  });
});

describe('Phase0 contract invariants', () => {
  it('similarity weights sum to 1.0 with frozen Phase0 shares', async () => {
    const { SIMILARITY_WEIGHTS } = await import('./types.js');
    const sum = Object.values(SIMILARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 9);
    expect(SIMILARITY_WEIGHTS.industry).toBe(0.2);
    expect(SIMILARITY_WEIGHTS.services).toBe(0.2);
    expect(SIMILARITY_WEIGHTS.customers).toBe(0.15);
    expect(SIMILARITY_WEIGHTS.businessModel).toBe(0.15);
    expect(SIMILARITY_WEIGHTS.size).toBe(0.1);
    expect(SIMILARITY_WEIGHTS.ownership).toBe(0.05);
    expect(SIMILARITY_WEIGHTS.geography).toBe(0.1);
    expect(SIMILARITY_WEIGHTS.growth).toBe(0.05);
  });

  it('qualification uses 60% business + 40% strategic and ignores demo_fit poison', () => {
    const ideal = buildCompanyDnaFromCsvRow(
      row({ company_id: 'R1', company_name: 'Ref', demo_fit: 'reject' }),
    );
    const twinHigh = buildCompanyDnaFromCsvRow(
      row({ company_id: 'C1', company_name: 'Twin', demo_fit: 'reject' }),
    );
    const twinLow = buildCompanyDnaFromCsvRow(
      row({ company_id: 'C2', company_name: 'Twin2', demo_fit: 'high' }),
    );

    const s1 = similarityScore(ideal, twinHigh);
    const s2 = similarityScore(ideal, twinLow);
    expect(s1.overallScore).toBe(s2.overallScore);

    const q1 = qualificationScore(ideal, twinHigh, s1);
    const q2 = qualificationScore(ideal, twinLow, s2);
    expect(q1.qualificationScore).toBe(q2.qualificationScore);
    expect(q1.recommendation).toBe(q2.recommendation);

    // Reconstruct 60/40 blend
    expect(q1.qualificationScore).toBe(
      Math.round(q1.businessFit * 0.6 + q1.strategicFit * 0.4),
    );
    // Confidence is separate field, not blended into qualificationScore
    expect(q1.confidence).toBeGreaterThanOrEqual(0);
    expect(q1.confidence).toBeLessThanOrEqual(100);
  });

  it('ideal DNA averages references without inventing company facts', () => {
    const a = buildCompanyDnaFromCsvRow(
      row({ company_id: 'R1', company_name: 'A', industry: 'B2B SaaS' }),
    );
    const b = buildCompanyDnaFromCsvRow(
      row({ company_id: 'R2', company_name: 'B', industry: 'B2B SaaS' }),
    );
    const ideal = buildIdealDna([a, b]);
    expect(ideal.companyId).toBe('IDEAL');
    expect(ideal.identity.industry).toBe('B2B SaaS');
    expect(ideal.facts.some((f) => /2 reference/.test(f))).toBe(true);
    expect(ideal.identity.website).toBeNull();
  });
});
