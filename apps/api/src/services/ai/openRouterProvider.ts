/**
 * OpenRouter-backed AiProvider — structured JSON only, schema-validated.
 * Falls back gracefully when responses are invalid (retry once).
 */

import {
  EMPTY_ENRICHMENT,
  EnrichmentResultSchema,
  type AiEnrichmentRequest,
  type AiEnrichmentResult,
  type AiProvider,
  type GenerateStructuredParams,
} from '@ali/shared';

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  siteUrl?: string;
  appName?: string;
}

export class OpenRouterProvider implements AiProvider {
  readonly name = 'openrouter';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly siteUrl: string;
  private readonly appName: string;

  constructor(cfg: OpenRouterConfig) {
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
    this.siteUrl = cfg.siteUrl ?? 'http://localhost';
    this.appName = cfg.appName ?? 'ai-lead-intelligence';
  }

  async generateStructured<T>(params: GenerateStructuredParams): Promise<T> {
    const model = params.model ?? this.model;
    const attempt = async (repair: boolean): Promise<unknown> => {
      const system = repair
        ? `${params.systemPrompt}\n\nIMPORTANT: Your previous reply was invalid JSON. Respond with ONLY a single valid JSON object matching the schema. No markdown.`
        : `${params.systemPrompt}\n\nRespond with ONLY a single valid JSON object. No markdown fences.`;

      const user = `${params.userPrompt}\n\nJSON schema (follow exactly):\n${JSON.stringify(params.schema, null, 2)}`;

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          ...(process.env.OPENROUTER_JSON_OBJECT === '1'
            ? { response_format: { type: 'json_object' as const } }
            : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      const stripped = content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
      return JSON.parse(stripped);
    };

    try {
      return (await attempt(false)) as T;
    } catch {
      try {
        return (await attempt(true)) as T;
      } catch {
        // Graceful empty — never invent
        return { ...EMPTY_ENRICHMENT } as T;
      }
    }
  }

  async enrich(req: AiEnrichmentRequest): Promise<AiEnrichmentResult> {
    const raw = await this.generateStructured({
      systemPrompt:
        'You extract company intelligence ONLY from provided facts. Prefer unknown over guess. Never invent.',
      userPrompt: `Company ${req.companyId}\nFacts:\n${req.facts.join('\n')}\nUnknowns:\n${req.unknowns.join('\n')}`,
      schema: {
        type: 'object',
        properties: {
          inferences: { type: 'array' },
          filledUnknowns: { type: 'array' },
          narrativeBullets: { type: 'array' },
          unknownsRemaining: { type: 'array' },
        },
      },
    });
    const parsed = EnrichmentResultSchema.safeParse(raw);
    return {
      ...(parsed.success ? parsed.data : EMPTY_ENRICHMENT),
      provider: this.name,
    };
  }
}
