import { describe, expect, it } from 'vitest';
import { buildCompanyDnaFromCsvRow, buildIdealDna, buildIdealDnaFromCriteria } from './dna.js';
import { similarityScore } from './similarity.js';
import { qualificationScore, recommend } from './qualification.js';
import { deterministicFilter } from './filter.js';
import type { CsvCompanyRow } from './types.js';
import {
  computeAiResearchConfidence,
  extractAiNarratives,
  extractAiResearchFromInferences,
  isThinResearchStatus,
  joinAiFitNarrative,
  thinFitNarrativeMessage,
} from './aiIntelligence.js';

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

describe('normalize helpers', () => {
  it('parses revenue suffixes and blanks', async () => {
    const { parseRevenue, blankToNull, parseYear, sizeProximityScore } = await import(
      './normalize.js'
    );
    expect(parseRevenue('10M')).toBe(10_000_000);
    expect(parseRevenue('$1,250')).toBe(1250);
    expect(parseRevenue('')).toBeNull();
    expect(blankToNull(' n/a ')).toBeNull();
    expect(parseYear('2019')).toBe(2019);
    expect(parseYear('99')).toBeNull();
    expect(sizeProximityScore('51-100', '51-100')).toBe(100);
    expect(sizeProximityScore('1-10', '5001-10000')).toBeLessThan(20);
  });
});

describe('buildIdealDnaFromCriteria', () => {
  it('builds facts from provided fields and unknowns for the rest', () => {
    const ideal = buildIdealDnaFromCriteria({
      industry: 'B2B SaaS',
      geography: 'North America',
      businessModel: 'B2B SaaS',
      notes: 'Prefer mid-market data teams',
    });
    expect(ideal.companyId).toBe('IDEAL');
    expect(ideal.identity.industry).toBe('B2B SaaS');
    expect(ideal.geography.region).toBe('North America');
    expect(ideal.businessModel.model).toBe('B2B SaaS');
    expect(ideal.size.employeeRange).toBeNull();
    expect(ideal.ownership.type).toBeNull();
    expect(ideal.facts.some((f) => /Industry: B2B SaaS/.test(f))).toBe(true);
    expect(ideal.unknowns.some((u) => u.includes('employee_range'))).toBe(true);
    expect(ideal.unknowns.some((u) => u.includes('ownership'))).toBe(true);
    expect(ideal.unknowns.some((u) => u.includes('primary_service'))).toBe(true);
    expect(ideal.inferences.some((i) => /user notes/.test(i))).toBe(true);
    expect(ideal.evidence.every((e) => e.source === 'criteria')).toBe(true);
    // Does not invent services / customers
    expect(ideal.identity.primaryService).toBeNull();
    expect(ideal.customers.profile).toBeNull();
  });

  it('ignores blank strings and does not invent geography from notes', () => {
    const ideal = buildIdealDnaFromCriteria({
      industry: '  ',
      ownership: 'Private',
      notes: 'Must be in Europe',
    });
    expect(ideal.identity.industry).toBeNull();
    expect(ideal.ownership.type).toBe('Private');
    expect(ideal.geography.region).toBeNull();
    expect(ideal.geography.country).toBeNull();
    expect(ideal.facts.join(' ')).not.toMatch(/Europe/);
  });
});

describe('criteria filter behavior', () => {
  it('keeps industry peers when ideal comes from criteria', () => {
    const ideal = buildIdealDnaFromCriteria({
      industry: 'B2B SaaS',
      geography: 'North America',
    });
    const pool = [
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
    const filtered = deterministicFilter(ideal, pool, new Set());
    expect(filtered.find((c) => c.companyId === 'C1')).toBeTruthy();
    expect(filtered.find((c) => c.companyId === 'C2')).toBeUndefined();
  });

  it('scores criteria ideal against peers without excluding anyone by default', () => {
    const ideal = buildIdealDnaFromCriteria({
      industry: 'B2B SaaS',
      businessModel: 'B2B SaaS',
      employeeRange: '51-100',
    });
    const peer = buildCompanyDnaFromCsvRow(row({ company_id: 'C10', company_name: 'Peer' }));
    const far = buildCompanyDnaFromCsvRow(
      row({
        company_id: 'C99',
        company_name: 'Far',
        industry: 'Food & Beverage',
        business_model: 'B2C Manufacturing',
        geography: 'Europe',
        country: 'Germany',
        employee_range: '5001-10000',
      }),
    );
    const filtered = deterministicFilter(ideal, [peer, far], new Set());
    expect(filtered.map((c) => c.companyId)).toEqual(['C10']);
    const sim = similarityScore(ideal, peer);
    const q = qualificationScore(ideal, peer, sim);
    expect(sim.overallScore).toBeGreaterThan(30);
    expect(q.recommendation).not.toBe('REJECT');
  });
});

describe('ai provider stub', () => {
  it('noop never invents inferences', async () => {
    const { createAiProvider } = await import('./aiProvider.js');
    const p = createAiProvider();
    const out = await p.enrich({
      companyId: 'x',
      facts: ['Name: Acme'],
      unknowns: ['ownership'],
    });
    expect(out.inferences).toEqual([]);
    expect(out.provider).toBe('noop');
  });
});

describe('enrichment quote filter', () => {
  it('rejects fabricated evidence quotes not in source', async () => {
    const { filterByEvidenceQuote, sanitizeEnrichment } = await import('./aiProvider.js');
    const source =
      'Acme provides commercial HVAC maintenance plans for hospitals and schools.';
    const kept = filterByEvidenceQuote(
      [
        {
          text: 'Serves institutional buyers',
          evidenceQuote: 'hospitals and schools',
        },
        {
          text: 'Invented IPO rumor',
          evidenceQuote: 'planning to IPO next year',
        },
      ],
      source,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].evidenceQuote).toBe('hospitals and schools');

    const sanitized = sanitizeEnrichment(
      {
        inferences: [
          { text: 'ok', evidenceQuote: 'HVAC maintenance' },
          { text: 'bad', evidenceQuote: 'series B funding' },
        ],
        filledUnknowns: [
          {
            field: 'business_model',
            value: 'maintenance contracts',
            evidenceQuote: 'commercial HVAC maintenance plans',
          },
          {
            field: 'ownership',
            value: 'Private',
            evidenceQuote: 'privately held since 1990',
          },
        ],
        narrativeBullets: ['Strong commercial focus'],
        unknownsRemaining: ['ownership'],
      },
      source,
    );
    expect(sanitized.inferences).toHaveLength(1);
    expect(sanitized.filledUnknowns).toHaveLength(1);
    expect(sanitized.filledUnknowns[0].field).toBe('business_model');
    expect(sanitized.narrativeBullets).toEqual(['Strong commercial focus']);
  });

  it('noop generateStructured returns empty safe defaults', async () => {
    const { createAiProvider, EMPTY_ENRICHMENT } = await import('./aiProvider.js');
    const p = createAiProvider('openrouter');
    const structured = await p.generateStructured({
      systemPrompt: 'x',
      userPrompt: 'y',
      schema: {},
    });
    expect(structured).toEqual(EMPTY_ENRICHMENT);
    expect(p.name).toBe('noop');
  });
});

describe('AI research stamps affect qualification', () => {
  it('empty AI research status adds risk and lowers score/confidence vs twin', () => {
    const ideal = buildCompanyDnaFromCsvRow(row({ company_id: 'R1', company_name: 'Ref' }));
    const base = buildCompanyDnaFromCsvRow(row({ company_id: 'C1', company_name: 'Twin' }));
    const emptyTwin = structuredClone(base);
    emptyTwin.inferences = [
      ...emptyTwin.inferences,
      'AI research status: empty',
      'AI research: No usable findings after quote filter',
    ];
    // DNA confidence already lowered by enrich path; mirror a modest drop
    emptyTwin.confidence = Math.max(10, base.confidence - 10);

    const simBase = similarityScore(ideal, base);
    const simEmpty = similarityScore(ideal, emptyTwin);
    const qBase = qualificationScore(ideal, base, simBase);
    const qEmpty = qualificationScore(ideal, emptyTwin, simEmpty);

    expect(qEmpty.risks.some((r) => /no usable company information/i.test(r))).toBe(true);
    expect(qEmpty.missingInformation.some((m) => /No usable findings/i.test(m))).toBe(true);
    expect(qEmpty.qualificationScore).toBeLessThan(qBase.qualificationScore);
    expect(qEmpty.qualificationScore).toBe(qBase.qualificationScore - 8);
    expect(qEmpty.confidence).toBeLessThan(qBase.confidence);
  });

  it('AI red flag adds risk and lowers qualificationScore', () => {
    const ideal = buildCompanyDnaFromCsvRow(row({ company_id: 'R1', company_name: 'Ref' }));
    const base = buildCompanyDnaFromCsvRow(row({ company_id: 'C1', company_name: 'Twin' }));
    const flagged = structuredClone(base);
    flagged.inferences = [
      ...flagged.inferences,
      'AI research status: ok',
      'AI red flag: Company announced shutdown of commercial product',
    ];

    const simBase = similarityScore(ideal, base);
    const simFlag = similarityScore(ideal, flagged);
    const qBase = qualificationScore(ideal, base, simBase);
    const qFlag = qualificationScore(ideal, flagged, simFlag);

    expect(qFlag.risks.some((r) => /AI red flag:.*shutdown/i.test(r))).toBe(true);
    expect(qFlag.qualificationScore).toBe(qBase.qualificationScore - 8);
    expect(qFlag.confidence).toBeLessThanOrEqual(qBase.confidence - 5);
  });

  it('sanitizeEnrichment keeps redFlags and researchNote', async () => {
    const { sanitizeEnrichment } = await import('./aiProvider.js');
    const source = 'Acme HVAC serves hospitals. The firm faces a pending lawsuit over contracts.';
    const sanitized = sanitizeEnrichment(
      {
        inferences: [],
        filledUnknowns: [],
        narrativeBullets: [],
        unknownsRemaining: [],
        redFlags: [' pending lawsuit over contracts ', '', 'x'.repeat(5)],
        researchNote: ' Limited product detail on homepage ',
      },
      source,
    );
    expect(sanitized.redFlags).toEqual(['pending lawsuit over contracts', 'xxxxx']);
    expect(sanitized.researchNote).toBe('Limited product detail on homepage');
  });
});

describe('AI intelligence surfaces', () => {
  it('extracts research stamps from inferences', () => {
    const r = extractAiResearchFromInferences([
      'AI research status: empty',
      'AI research: No usable findings after quote filter',
      'AI red flag: Shutdown rumored',
      'Inference: mid-market band',
    ]);
    expect(r.researchStatus).toBe('empty');
    expect(r.researchNote).toBe('No usable findings after quote filter');
    expect(r.redFlags).toEqual(['Shutdown rumored']);
    expect(r.otherInferences).toEqual(['Inference: mid-market band']);
  });

  it('joins AI narrative lines into fit narrative', () => {
    const bullets = extractAiNarratives([
      'Industry alignment high',
      'AI narrative: Strong service overlap with Ideal DNA.',
      'AI narrative: Geography matches target region.',
    ]);
    expect(bullets).toHaveLength(2);
    expect(joinAiFitNarrative(bullets)).toContain('Strong service overlap');
  });

  it('computes aiResearchConfidence distinct from scoring confidence', () => {
    expect(computeAiResearchConfidence(null)).toBeNull();
    expect(computeAiResearchConfidence('ok', { hasWebsiteFindings: true })).toBeGreaterThan(70);
    expect(computeAiResearchConfidence('empty')).toBeLessThan(40);
    expect(
      computeAiResearchConfidence('ok', { redFlagCount: 2, hasWebsiteFindings: true }),
    ).toBeLessThan(computeAiResearchConfidence('ok', { hasWebsiteFindings: true })!);
  });

  it('thin research statuses get honest thin messages', () => {
    expect(isThinResearchStatus('empty')).toBe(true);
    expect(isThinResearchStatus('ok')).toBe(false);
    expect(thinFitNarrativeMessage('empty')).toMatch(/no usable findings/i);
    expect(thinFitNarrativeMessage('pending')).toMatch(/awaiting AI research/i);
  });
});
