/**
 * OpenAI-backed AiProvider — structured JSON only, schema-validated.
 * Same anti-hallucination contract as OpenRouter; retry once on invalid JSON.
 */

import {
  EMPTY_ENRICHMENT,
  EnrichmentResultSchema,
  type AiEnrichmentRequest,
  type AiEnrichmentResult,
  type AiProvider,
  type GenerateStructuredParams,
} from '@ali/shared';

export interface OpenAiConfig {
  apiKey: string;
  model: string;
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(cfg: OpenAiConfig) {
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
  }

  async generateStructured<T>(params: GenerateStructuredParams): Promise<T> {
    const model = params.model ?? this.model;
    const attempt = async (repair: boolean): Promise<unknown> => {
      const system = repair
        ? `${params.systemPrompt}\n\nIMPORTANT: Your previous reply was invalid JSON. Respond with ONLY a single valid JSON object matching the schema. No markdown.`
        : `${params.systemPrompt}\n\nRespond with ONLY a single valid JSON object. No markdown fences.`;

      const user = `${params.userPrompt}\n\nJSON schema (follow exactly):\n${JSON.stringify(params.schema, null, 2)}`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      return JSON.parse(content);
    };

    try {
      return (await attempt(false)) as T;
    } catch {
      try {
        return (await attempt(true)) as T;
      } catch {
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
