/** Normalize Evidence table rows + DNA.evidence into a public payload. */

export type PublicEvidence = {
  field: string;
  value: string;
  source: string;
  url?: string;
  evidenceQuote?: string;
};

type TableRow = { field: string; value: string; source: string };
type DnaLike = { evidence?: PublicEvidence[] } | null | undefined;

function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\//i.test(t) || /^www\./i.test(t) || /^[a-z0-9.-]+\.[a-z]{2,}([/:].*)?$/i.test(t);
}

function normalizeUrlLoose(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) return `https://${t}`;
  return undefined;
}

/** Split "value | quote: …" that persistEnrichedDna may have mashed into the table. */
function parseMashedValue(raw: string): { value: string; evidenceQuote?: string } {
  const m = raw.match(/^(.*?)\s*\|\s*quote:\s*(.*)$/s);
  if (!m) return { value: raw };
  return { value: m[1].trim(), evidenceQuote: m[2].trim() || undefined };
}

function fromTableRow(row: TableRow): PublicEvidence {
  const { value, evidenceQuote } = parseMashedValue(row.value);
  const url =
    row.field === 'website' || row.field === 'linkedin_url' || looksLikeUrl(value)
      ? normalizeUrlLoose(value)
      : undefined;
  return {
    field: row.field,
    value,
    source: row.source,
    ...(url ? { url } : {}),
    ...(evidenceQuote ? { evidenceQuote } : {}),
  };
}

function fromDnaItem(e: PublicEvidence): PublicEvidence {
  const value = e.value ?? '';
  const url =
    e.url ??
    (e.field === 'website' || e.field === 'linkedin_url' || looksLikeUrl(value)
      ? normalizeUrlLoose(value)
      : undefined);
  return {
    field: e.field,
    value,
    source: e.source ?? 'csv',
    ...(url ? { url } : {}),
    ...(e.evidenceQuote ? { evidenceQuote: e.evidenceQuote } : {}),
  };
}

/**
 * Prefer DNA.evidence (richer: url + quote) when present; else Evidence table;
 * else empty. Callers should pass live companyToDna().evidence as dnaFallback
 * when the profile is missing.
 */
export function resolveEvidence(
  tableRows: TableRow[],
  dna: DnaLike,
  dnaFallback?: PublicEvidence[],
): PublicEvidence[] {
  const fromDna = Array.isArray(dna?.evidence) ? dna!.evidence! : [];
  if (fromDna.length > 0) return fromDna.map(fromDnaItem);
  if (tableRows.length > 0) return tableRows.map(fromTableRow);
  if (Array.isArray(dnaFallback) && dnaFallback.length > 0) {
    return dnaFallback.map(fromDnaItem);
  }
  return [];
}
