/** Pure helpers for CSV field normalization. */

export function blankToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'n/a') return null;
  return t;
}

export function parseRevenue(raw: string | null | undefined): number | null {
  const s = blankToNull(raw);
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, '').toUpperCase();
  const m = cleaned.match(/^([\d.]+)([KMB])?$/);
  if (!m) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult = m[2] === 'K' ? 1_000 : m[2] === 'M' ? 1_000_000 : m[2] === 'B' ? 1_000_000_000 : 1;
  return base * mult;
}

export function parseYear(raw: string | null | undefined): number | null {
  const s = blankToNull(raw);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1800 || n > 2100) return null;
  return n;
}

/** Tokenize multi-value CSV cells (semicolon / comma / pipe). */
export function tokenize(raw: string | null | undefined): string[] {
  const s = blankToNull(raw);
  if (!s) return [];
  return s
    .split(/[;|,]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeText(raw: string | null | undefined): string | null {
  const s = blankToNull(raw);
  return s ? s.toLowerCase().replace(/\s+/g, ' ') : null;
}

/** Jaccard similarity on token sets, 0–100. */
export function jaccardScore(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  if (union === 0) return 0;
  return Math.round((inter / union) * 100);
}

/** Exact / containment text match, 0–100. */
export function textMatchScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 75;
  const ta = a.split(/[\s/;,]+/).filter(Boolean);
  const tb = b.split(/[\s/;,]+/).filter(Boolean);
  return jaccardScore(ta, tb);
}

const EMPLOYEE_MID: Record<string, number> = {
  '1-10': 5,
  '11-50': 30,
  '51-100': 75,
  '101-250': 175,
  '251-500': 375,
  '501-1000': 750,
  '1001-5000': 3000,
  '5001-10000': 7500,
  '10000+': 15000,
  '10001+': 15000,
};

export function employeeMidpoint(range: string | null): number | null {
  if (!range) return null;
  const key = range.trim();
  if (EMPLOYEE_MID[key] != null) return EMPLOYEE_MID[key];
  const m = key.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const plus = key.match(/(\d+)\+/);
  if (plus) return Number(plus[1]) * 1.5;
  return null;
}

export function sizeProximityScore(a: string | null, b: string | null): number {
  const ma = employeeMidpoint(a);
  const mb = employeeMidpoint(b);
  if (ma == null || mb == null) return a && b && a === b ? 100 : 0;
  const ratio = Math.min(ma, mb) / Math.max(ma, mb);
  return Math.round(ratio * 100);
}
