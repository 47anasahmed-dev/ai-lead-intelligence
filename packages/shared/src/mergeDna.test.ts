import { describe, expect, it } from 'vitest';
import {
  evidenceItemKey,
  evidenceTableRowKey,
  mashEvidenceValue,
  mergeCompanyDna,
  preferFilled,
  unionEvidence,
  unionStrings,
} from './mergeDna.js';
import type { CompanyDna, EvidenceItem } from './types.js';

function baseDna(over: Partial<CompanyDna> & { companyId?: string } = {}): CompanyDna {
  const companyId = over.companyId ?? 'C001';
  const { identity: identityOver, companyId: _cid, ...rest } = over;
  return {
    customers: { profile: null },
    businessModel: { model: null, revenueModel: null },
    size: { employeeRange: '11-50', estimatedRevenueUsd: null },
    ownership: { type: 'private' },
    growth: { signal: null, foundedYear: 2015 },
    reputation: { signal: null },
    technology: { stack: null },
    geography: { region: 'US', country: 'US', city: null, state: null },
    facts: ['Name: Acme'],
    inferences: [],
    unknowns: ['Unknown: primary_service', 'Unknown: customer_profile'],
    evidence: [
      {
        field: 'company_name',
        value: 'Acme',
        source: 'csv',
      },
    ],
    confidence: 40,
    ...rest,
    companyId,
    identity: {
      name: 'Acme',
      website: 'https://acme.example',
      industry: 'SaaS',
      primaryService: null,
      description: null,
      ...(identityOver ?? {}),
    },
  };
}

describe('preferFilled / union helpers', () => {
  it('never overwrites good values with empty/unknown', () => {
    expect(preferFilled('SaaS', null)).toBe('SaaS');
    expect(preferFilled('SaaS', '')).toBe('SaaS');
    expect(preferFilled('SaaS', 'unknown')).toBe('SaaS');
    expect(preferFilled(null, 'B2B')).toBe('B2B');
    expect(preferFilled('', 'B2B')).toBe('B2B');
  });

  it('unions strings uniquely preserving order', () => {
    expect(unionStrings(['a', 'b'], ['b', 'c'], ['a'])).toEqual(['a', 'b', 'c']);
  });

  it('dedupes evidence by companyId+source+field+value+quote', () => {
    const a: EvidenceItem = {
      field: 'industry',
      value: 'SaaS',
      source: 'website',
      evidenceQuote: 'We sell SaaS',
    };
    const dup = { ...a };
    const other: EvidenceItem = {
      field: 'industry',
      value: 'SaaS',
      source: 'website',
      evidenceQuote: 'Different quote',
    };
    expect(unionEvidence('C1', [a], [dup, other])).toHaveLength(2);
    expect(evidenceItemKey('C1', a)).toBe(evidenceItemKey('C1', dup));
  });

  it('matches table row keys after mash', () => {
    const e: EvidenceItem = {
      field: 'growth',
      value: 'hiring',
      source: 'about',
      evidenceQuote: 'we are hiring',
    };
    const mashed = mashEvidenceValue(e);
    expect(
      evidenceTableRowKey('C1', { source: e.source, field: e.field, value: mashed }),
    ).toBe(evidenceItemKey('C1', e));
  });
});

describe('mergeCompanyDna', () => {
  it('keeps existing facts and appends new inferences/evidence', () => {
    const existing = baseDna({
      facts: ['Name: Acme', 'Industry: SaaS'],
      inferences: ['AI red flag: lawsuit rumor', 'Prior finding: niche B2B'],
      evidence: [
        { field: 'industry', value: 'SaaS', source: 'csv' },
        {
          field: 'growth_signal',
          value: 'hiring',
          source: 'website',
          evidenceQuote: 'hiring engineers',
        },
      ],
      confidence: 55,
    });
    const incoming = baseDna({
      identity: {
        name: 'Acme',
        website: 'https://acme.example',
        industry: '', // must not wipe SaaS
        primaryService: 'Analytics',
        description: null,
      },
      facts: ['Primary service (website): Analytics'],
      inferences: [
        'AI research status: ok',
        'AI research: deep multi-source enrich',
        'Inference (website): strong ICP',
      ],
      unknowns: ['Unknown: customer_profile'],
      evidence: [
        {
          field: 'primary_service',
          value: 'Analytics',
          source: 'website',
          evidenceQuote: 'product analytics',
        },
      ],
      confidence: 70,
    });

    const merged = mergeCompanyDna(existing, incoming);

    expect(merged.identity.industry).toBe('SaaS');
    expect(merged.identity.primaryService).toBe('Analytics');
    expect(merged.facts).toEqual(
      expect.arrayContaining([
        'Name: Acme',
        'Industry: SaaS',
        'Primary service (website): Analytics',
      ]),
    );
    expect(merged.inferences).toEqual(
      expect.arrayContaining([
        'AI red flag: lawsuit rumor',
        'Prior finding: niche B2B',
        'AI research status: ok',
        'Inference (website): strong ICP',
      ]),
    );
    expect(merged.evidence.length).toBeGreaterThanOrEqual(3);
    expect(merged.confidence).toBe(70);
    expect(merged.unknowns.some((u) => /primary_service/i.test(u))).toBe(false);
  });

  it('drops stale AI research status from existing but keeps red flags', () => {
    const existing = baseDna({
      inferences: [
        'AI research status: empty',
        'AI research: No usable findings',
        'AI red flag: nonprofit-only',
      ],
    });
    const incoming = baseDna({
      inferences: ['AI research status: ok', 'AI research: deep multi-source enrich'],
    });
    const merged = mergeCompanyDna(existing, incoming);
    const statuses = merged.inferences.filter((i) =>
      i.startsWith('AI research status:'),
    );
    expect(statuses).toEqual(['AI research status: ok']);
    expect(merged.inferences).toContain('AI red flag: nonprofit-only');
    expect(merged.inferences).toContain('AI research: No usable findings');
  });

  it('AI assist cannot drop prior points — deterministic union wins', () => {
    const existing = baseDna({
      facts: ['Keep me'],
      inferences: ['Important prior inference'],
    });
    const incoming = baseDna({
      facts: ['New fact'],
      inferences: ['AI research status: ok'],
    });
    const merged = mergeCompanyDna(existing, incoming, {
      facts: ['Only assist fact'],
      inferences: ['Only assist inference'],
    });
    expect(merged.facts).toEqual(
      expect.arrayContaining(['Keep me', 'New fact', 'Only assist fact']),
    );
    expect(merged.inferences).toEqual(
      expect.arrayContaining([
        'Important prior inference',
        'AI research status: ok',
        'Only assist inference',
      ]),
    );
  });

  it('returns incoming clone when no existing profile', () => {
    const incoming = baseDna({ facts: ['Only new'] });
    const merged = mergeCompanyDna(null, incoming);
    expect(merged.facts).toEqual(['Only new']);
    expect(merged).not.toBe(incoming);
  });
});
