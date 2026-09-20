/** Client-side ranking-floor helpers. Threshold persistence is search-specific in PostgreSQL. */

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

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Default K — mirrors @ali/shared suggestTopKThresholds (web has no shared dep). */
const THRESHOLD_TOP_K = 5;

/**
 * Top-K floors so roughly the top 5 leads pass all AND filters.
 * Mirrors packages/shared suggestTopKThresholds (web does not depend on @ali/shared).
 */
export function suggestThresholdsFromResults(
  rows: Array<{
    qualificationScore: number;
    similarityScore: number | null;
    evidence?: unknown[];
  }>,
): RankingThresholds {
  if (rows.length === 0) return { ...DEFAULT_THRESHOLDS };

  const shortlist = rows.slice(0, THRESHOLD_TOP_K);
  const qFloor = Math.min(...shortlist.map((r) => r.qualificationScore));
  const sFloor = Math.min(...shortlist.map((r) => r.similarityScore ?? 0));
  const eFloor = Math.min(
    ...shortlist.map((r) => (Array.isArray(r.evidence) ? r.evidence.length : 0)),
  );

  return {
    minQualification: clamp(Math.max(0, qFloor - 1), 0, 100),
    minSimilarity: clamp(Math.max(0, sFloor - 1), 0, 100),
    minEvidenceCount: clamp(Math.max(0, eFloor - 1), 0, 50),
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
