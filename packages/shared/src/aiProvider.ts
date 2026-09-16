/**
 * Optional LLM enrichment abstraction.
 * MVP defaults to NoopAiProvider — never invents company facts.
 * Real providers must only fill labeled inferences / narrative strings
 * behind schema-validated structured JSON; never overwrite CSV facts.
 */

import { z } from 'zod';

// ── Enrichment schemas (structured AI outputs) ──────────────────────────────

export const EnrichmentInferenceSchema = z.object({
  text: z.string().min(1),
  field: z.string().optional(),
  evidenceQuote: z.string().min(1),
});

export const EnrichmentFilledUnknownSchema = z.object({
  field: z.string().min(1),
  value: z.string().min(1),
  evidenceQuote: z.string().min(1),
});

export const EnrichmentResultSchema = z.object({
  inferences: z.array(EnrichmentInferenceSchema).default([]),
  filledUnknowns: z.array(EnrichmentFilledUnknownSchema).default([]),
  narrativeBullets: z.array(z.string()).default([]),
  unknownsRemaining: z.array(z.string()).default([]),
});

export type EnrichmentInference = z.infer<typeof EnrichmentInferenceSchema>;
export type EnrichmentFilledUnknown = z.infer<typeof EnrichmentFilledUnknownSchema>;
export type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;

/** JSON Schema description passed to providers (documentation for the model). */
export const ENRICHMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    inferences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          field: { type: 'string' },
          evidenceQuote: { type: 'string' },
        },
        required: ['text', 'evidenceQuote'],
      },
    },
    filledUnknowns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          value: { type: 'string' },
          evidenceQuote: { type: 'string' },
        },
        required: ['field', 'value', 'evidenceQuote'],
      },
    },
    narrativeBullets: { type: 'array', items: { type: 'string' } },
    unknownsRemaining: { type: 'array', items: { type: 'string' } },
  },
  required: ['inferences', 'filledUnknowns', 'narrativeBullets', 'unknownsRemaining'],
} as const;

export const EMPTY_ENRICHMENT: EnrichmentResult = {
  inferences: [],
  filledUnknowns: [],
  narrativeBullets: [],
  unknownsRemaining: [],
};

// ── Quote filter (anti-hallucination) ───────────────────────────────────────

/**
 * Drop any claim whose evidenceQuote is not a verbatim substring of sourceText.
 * Case-insensitive match. Empty quotes are rejected.
 */
export function filterByEvidenceQuote<T extends { evidenceQuote: string }>(
  items: T[],
  sourceText: string,
): T[] {
  if (!sourceText) return [];
  const haystack = sourceText.toLowerCase();
  return items.filter((item) => {
    const quote = (item.evidenceQuote ?? '').trim();
    if (!quote) return false;
    return haystack.includes(quote.toLowerCase());
  });
}

/** Validate + quote-filter a raw enrichment payload against source text. */
export function sanitizeEnrichment(
  raw: unknown,
  sourceText: string,
): EnrichmentResult {
  const parsed = EnrichmentResultSchema.safeParse(raw);
  if (!parsed.success) return { ...EMPTY_ENRICHMENT };

  const data = parsed.data;
  return {
    inferences: filterByEvidenceQuote(data.inferences, sourceText),
    filledUnknowns: filterByEvidenceQuote(data.filledUnknowns, sourceText),
    // Narratives must not invent facts; keep only short bullets (no quote check —
    // they explain existing evidence, but drop if empty)
    narrativeBullets: data.narrativeBullets
      .map((b) => b.trim())
      .filter((b) => b.length > 0)
      .slice(0, 8),
    unknownsRemaining: data.unknownsRemaining
      .map((u) => u.trim())
      .filter((u) => u.length > 0),
  };
}

// ── Provider interface ──────────────────────────────────────────────────────

export interface AiEnrichmentRequest {
  companyId: string;
  /** Existing DNA facts (immutable inputs) */
  facts: string[];
  unknowns: string[];
}

export interface AiEnrichmentResult extends EnrichmentResult {
  provider: string;
}

export interface GenerateStructuredParams {
  systemPrompt: string;
  userPrompt: string;
  /** JSON schema description for the model */
  schema: unknown;
  model?: string;
}

export interface AiProvider {
  readonly name: string;
  generateStructured<T>(params: GenerateStructuredParams): Promise<T>;
  /** Thin wrapper around generateStructured for enrichment-shaped outputs */
  enrich(req: AiEnrichmentRequest): Promise<AiEnrichmentResult>;
}

/** Default: deterministic no-op so MVP needs no API keys. Never invents. */
export class NoopAiProvider implements AiProvider {
  readonly name = 'noop';

  async generateStructured<T>(_params: GenerateStructuredParams): Promise<T> {
    return { ...EMPTY_ENRICHMENT } as T;
  }

  async enrich(_req: AiEnrichmentRequest): Promise<AiEnrichmentResult> {
    return {
      ...EMPTY_ENRICHMENT,
      provider: this.name,
    };
  }
}

/**
 * Factory. Pass `kind` from API env (AI_PROVIDER) or leave unset.
 * Shared package only ships Noop; live OpenRouter lives in apps/api.
 * Unknown / unset / openrouter-without-wiring → NoopAiProvider.
 */
export function createAiProvider(kind?: string | null): AiProvider {
  const resolved = (
    kind ??
    (typeof process !== 'undefined' ? process.env?.AI_PROVIDER : undefined) ??
    'noop'
  )
    .toString()
    .trim()
    .toLowerCase();
  void resolved; // reserved for future shared providers
  return new NoopAiProvider();
}
