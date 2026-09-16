import type { CompanyDna } from './types.js';
import { normalizeText } from './normalize.js';

/**
 * Deterministic pre-filter before full similarity.
 * Keeps candidates that share industry OR geography OR business model with ideal.
 * Always excludes the reference company IDs themselves.
 */
export function deterministicFilter(
  ideal: CompanyDna,
  candidates: CompanyDna[],
  excludeIds: Set<string>,
): CompanyDna[] {
  const idealIndustry = normalizeText(ideal.identity.industry);
  const idealGeo = normalizeText(ideal.geography.region);
  const idealCountry = normalizeText(ideal.geography.country);
  const idealModel = normalizeText(ideal.businessModel.model);

  return candidates.filter((c) => {
    if (excludeIds.has(c.companyId)) return false;
    if (c.companyId === 'IDEAL') return false;

    const ind = normalizeText(c.identity.industry);
    const geo = normalizeText(c.geography.region);
    const country = normalizeText(c.geography.country);
    const model = normalizeText(c.businessModel.model);

    const industryHit =
      !!idealIndustry &&
      !!ind &&
      (ind === idealIndustry || ind.includes(idealIndustry) || idealIndustry.includes(ind));
    const geoHit =
      (!!idealGeo && !!geo && (geo === idealGeo || geo.includes(idealGeo))) ||
      (!!idealCountry && !!country && country === idealCountry);
    const modelHit = !!idealModel && !!model && model === idealModel;

    // If ideal has almost no signals, keep everyone (except refs)
    if (!idealIndustry && !idealGeo && !idealCountry && !idealModel) return true;

    return industryHit || geoHit || modelHit;
  });
}
