/**
 * Lightweight website research: fetch → strip → structured AI → quote filter.
 * Never invents facts; evidenceQuote must be a verbatim substring of SOURCE TEXT.
 */

import {
  ENRICHMENT_JSON_SCHEMA,
  sanitizeEnrichment,
  type AiProvider,
  type EnrichmentResult,
  type EvidenceItem,
} from '@ali/shared';
import { env } from '../../lib/env.js';

const MAX_HTML_BYTES = 200_000;
const MAX_TEXT_CHARS = 10_000;

const ANTI_HALLUCINATION_SYSTEM = `You are a careful company research assistant.
RULES (mandatory):
1. Use ONLY the provided SOURCE TEXT. Do not use outside knowledge.
2. Prefer unknown over guess. If a field is not clearly supported, leave it unknown.
3. Every inference and filledUnknown MUST include evidenceQuote that is a VERBATIM substring of SOURCE TEXT.
4. Never invent company facts, numbers, ownership, funding, or customers.
5. demo_fit and similar demo labels must be ignored if present.
6. Return JSON only matching the schema.`;

export interface WebsiteResearchInput {
  companyId: string;
  websiteUrl: string;
  unknowns: string[];
  existingFacts: string[];
}

export interface WebsiteResearchOutput {
  enrichment: EnrichmentResult;
  evidence: EvidenceItem[];
  sourceTextLength: number;
  skipped?: string;
}

function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Strip scripts/styles and tags → plain text. */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

async function fetchWebsiteText(url: string): Promise<{ text: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.enrichFetchTimeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Lead-Intelligence/0.1 (+research; respectful bot)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    const text = htmlToText(html).slice(0, MAX_TEXT_CHARS);
    if (text.length < 40) return null;
    return { text, finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function researchWebsite(
  ai: AiProvider,
  input: WebsiteResearchInput,
): Promise<WebsiteResearchOutput> {
  const url = normalizeUrl(input.websiteUrl);
  if (!url) {
    return {
      enrichment: {
        inferences: [],
        filledUnknowns: [],
        narrativeBullets: [],
        unknownsRemaining: input.unknowns,
      },
      evidence: [],
      sourceTextLength: 0,
      skipped: 'invalid_url',
    };
  }

  // Noop / disabled AI: skip network + model (deterministic path)
  if (ai.name === 'noop') {
    return {
      enrichment: {
        inferences: [],
        filledUnknowns: [],
        narrativeBullets: [],
        unknownsRemaining: input.unknowns,
      },
      evidence: [],
      sourceTextLength: 0,
      skipped: 'ai_noop',
    };
  }

  const fetched = await fetchWebsiteText(url);
  if (!fetched) {
    return {
      enrichment: {
        inferences: [],
        filledUnknowns: [],
        narrativeBullets: [],
        unknownsRemaining: input.unknowns,
      },
      evidence: [],
      sourceTextLength: 0,
      skipped: 'fetch_failed',
    };
  }

  const { text: sourceText, finalUrl } = fetched;

  const userPrompt = `Company ID: ${input.companyId}
Website: ${finalUrl}

Known facts (do not contradict; do not overwrite):
${input.existingFacts.slice(0, 40).join('\n') || '(none)'}

Unknown fields to try to fill (only if SOURCE TEXT clearly supports):
${input.unknowns.join('\n') || '(none listed)'}

SOURCE TEXT:
"""
${sourceText}
"""

Return JSON with inferences, filledUnknowns (field/value/evidenceQuote), narrativeBullets, unknownsRemaining.
evidenceQuote MUST be copied verbatim from SOURCE TEXT.`;

  let raw: unknown;
  try {
    raw = await ai.generateStructured({
      systemPrompt: ANTI_HALLUCINATION_SYSTEM,
      userPrompt,
      schema: ENRICHMENT_JSON_SCHEMA,
    });
  } catch {
    return {
      enrichment: {
        inferences: [],
        filledUnknowns: [],
        narrativeBullets: [],
        unknownsRemaining: input.unknowns,
      },
      evidence: [],
      sourceTextLength: sourceText.length,
      skipped: 'ai_error',
    };
  }

  const enrichment = sanitizeEnrichment(raw, sourceText);

  const evidence: EvidenceItem[] = enrichment.filledUnknowns.map((f) => ({
    field: f.field,
    value: f.value,
    source: 'website' as const,
    url: finalUrl,
    evidenceQuote: f.evidenceQuote,
  }));

  for (const inf of enrichment.inferences) {
    evidence.push({
      field: inf.field ?? 'inference',
      value: inf.text,
      source: 'website',
      url: finalUrl,
      evidenceQuote: inf.evidenceQuote,
    });
  }

  return {
    enrichment,
    evidence,
    sourceTextLength: sourceText.length,
  };
}
