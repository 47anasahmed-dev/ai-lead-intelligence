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

function kthBestDescending(values: number[], k: number): number | null {
  if (!values.length || k < 1) return null;
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[Math.min(k - 1, sorted.length - 1)]!;
}

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

  const quals = rows.map((r) => r.qualificationScore);
  const sims = rows
    .map((r) => r.similarityScore)
    .filter((v): v is number => v != null);
  const evCounts = rows.map((r) =>
    Array.isArray(r.evidence) ? r.evidence.length : 0,
  );

  const qK = kthBestDescending(quals, THRESHOLD_TOP_K);
  const sK = kthBestDescending(sims, THRESHOLD_TOP_K);
  const eK = kthBestDescending(evCounts, THRESHOLD_TOP_K);

  return {
    minQualification: clamp(
      qK == null ? DEFAULT_THRESHOLDS.minQualification : Math.max(0, qK - 1),
      0,
      100,
    ),
    minSimilarity: clamp(
      sK == null ? DEFAULT_THRESHOLDS.minSimilarity : Math.max(0, sK - 1),
      0,
      100,
    ),
    minEvidenceCount: clamp(
      eK == null ? DEFAULT_THRESHOLDS.minEvidenceCount : Math.max(0, eK - 1),
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
