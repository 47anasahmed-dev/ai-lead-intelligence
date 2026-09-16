/** Client-side ranking floors (Settings). Persist in localStorage. */

export type RankingThresholds = {
  minQualification: number;
  minSimilarity: number;
  minEvidenceCount: number;
};

export const DEFAULT_THRESHOLDS: RankingThresholds = {
  minQualification: 55,
  minSimilarity: 60,
  minEvidenceCount: 2,
};

const STORAGE_KEY = 'ali.rankingThresholds.v1';

export function loadThresholds(): RankingThresholds {
  if (typeof window === 'undefined') return { ...DEFAULT_THRESHOLDS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THRESHOLDS };
    const parsed = JSON.parse(raw) as Partial<RankingThresholds>;
    return {
      minQualification: clamp(
        Number(parsed.minQualification ?? DEFAULT_THRESHOLDS.minQualification),
        0,
        100,
      ),
      minSimilarity: clamp(
        Number(parsed.minSimilarity ?? DEFAULT_THRESHOLDS.minSimilarity),
        0,
        100,
      ),
      minEvidenceCount: clamp(
        Number(parsed.minEvidenceCount ?? DEFAULT_THRESHOLDS.minEvidenceCount),
        0,
        50,
      ),
    };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export function saveThresholds(t: RankingThresholds): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Heuristic “AI suggest” from current result distribution (fallback when API/AI unavailable). */
export function suggestThresholdsFromResults(
  rows: Array<{
    qualificationScore: number;
    similarityScore: number | null;
    evidence?: unknown[];
  }>,
): RankingThresholds {
  if (rows.length === 0) return { ...DEFAULT_THRESHOLDS };
  const quals = rows.map((r) => r.qualificationScore).sort((a, b) => a - b);
  const sims = rows
    .map((r) => r.similarityScore)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const evCounts = rows
    .map((r) => (Array.isArray(r.evidence) ? r.evidence.length : 0))
    .sort((a, b) => a - b);

  const p25 = (arr: number[]) =>
    arr.length ? arr[Math.floor((arr.length - 1) * 0.25)] : 0;

  return {
    minQualification: clamp(p25(quals), 0, 100),
    minSimilarity: clamp(sims.length ? p25(sims) : DEFAULT_THRESHOLDS.minSimilarity, 0, 100),
    minEvidenceCount: clamp(
      evCounts.length ? Math.max(1, p25(evCounts)) : DEFAULT_THRESHOLDS.minEvidenceCount,
      0,
      50,
    ),
  };
}

export function passesThresholds(
  row: {
    qualificationScore: number;
    similarityScore: number | null;
    evidence?: unknown[];
  },
  t: RankingThresholds,
): boolean {
  const evidenceCount = Array.isArray(row.evidence) ? row.evidence.length : 0;
  const sim = row.similarityScore ?? 0;
  return (
    row.qualificationScore >= t.minQualification &&
    sim >= t.minSimilarity &&
    evidenceCount >= t.minEvidenceCount
  );
}

export function thresholdChipsLabel(t: RankingThresholds): string {
  return `Qualify ≥${t.minQualification} · Similarity ≥${t.minSimilarity} · Evidence ≥${t.minEvidenceCount}`;
}
