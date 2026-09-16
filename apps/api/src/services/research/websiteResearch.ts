/**
 * Lightweight website research: fetch → strip → structured AI → quote filter.
 * Never invents facts; evidenceQuote must be a verbatim substring of SOURCE TEXT.
 * When homepage text is thin (JS shells), also try same-origin About pages.
 */

import {
  ENRICHMENT_JSON_SCHEMA,
  sanitizeEnrichment,
  type AiProvider,
  type EnrichmentResult,
  type EvidenceItem,
  type EvidenceSource,
} from '@ali/shared';
import { env } from '../../lib/env.js';

const MAX_HTML_BYTES = 200_000;
const MAX_TEXT_CHARS = 10_000;
/** Homepage below this useful-char threshold → prefer About candidates. */
const THIN_HOMEPAGE_CHARS = 400;
const ABOUT_PATHS = ['/about', '/about-us', '/company', '/our-story'] as const;

const ANTI_HALLUCINATION_SYSTEM = `You are a careful company research assistant.
RULES (mandatory):
1. Use ONLY the provided SOURCE TEXT. Do not use outside knowledge.
2. Prefer unknown over guess. If a field is not clearly supported, leave it unknown.
3. Every inference and filledUnknown MUST include evidenceQuote that is a VERBATIM substring of SOURCE TEXT.
4. Never invent company facts, numbers, ownership, funding, or customers.
5. demo_fit and similar demo labels must be ignored if present.
6. Return redFlags ONLY when SOURCE TEXT clearly supports a negative finding (e.g. shutdown, lawsuit, nonprofit-only, no commercial product). Each redFlag must be grounded in SOURCE TEXT.
7. If the page has little or no useful company information, set researchNote to a short explanation and leave findings empty.
8. Return JSON only matching the schema.`;

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

function emptyEnrichment(unknowns: string[], researchNote?: string): EnrichmentResult {
  return {
    inferences: [],
    filledUnknowns: [],
    narrativeBullets: [],
    unknownsRemaining: unknowns,
    redFlags: [],
    ...(researchNote ? { researchNote } : {}),
  };
}

export function normalizeUrl(raw: string): string | null {
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

export async function fetchWebsiteText(url: string): Promise<{ text: string; finalUrl: string } | null> {
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

function originFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Best-effort same-origin About page with the most useful prose.
 * Bounded: stops after first solid hit; uses existing fetch timeouts.
 */
export async function fetchBestAboutText(
  websiteUrl: string,
): Promise<{ text: string; finalUrl: string } | null> {
  const origin = originFromUrl(websiteUrl);
  if (!origin) return null;
  let best: { text: string; finalUrl: string } | null = null;
  for (const path of ABOUT_PATHS) {
    const fetched = await fetchWebsiteText(`${origin}${path}`);
    if (!fetched) continue;
    // Skip near-duplicates of a thin shell
    if (!best || fetched.text.length > best.text.length + 80) {
      best = fetched;
    }
    // Good enough About prose — stop early
    if (fetched.text.length >= THIN_HOMEPAGE_CHARS) {
      return fetched;
    }
  }
  return best;
}

function enrichmentHasFindings(enrichment: EnrichmentResult): boolean {
  return (
    enrichment.filledUnknowns.length > 0 ||
    enrichment.inferences.length > 0 ||
    enrichment.narrativeBullets.length > 0 ||
    enrichment.redFlags.length > 0
  );
}

async function runAiOnSource(
  ai: AiProvider,
  input: WebsiteResearchInput,
  sourceText: string,
  finalUrl: string,
  sourceLabel: EvidenceSource,
): Promise<WebsiteResearchOutput> {
  const userPrompt = `Company ID: ${input.companyId}
Website: ${finalUrl}
Source label: ${sourceLabel}

Known facts (do not contradict; do not overwrite):
${input.existingFacts.slice(0, 40).join('\n') || '(none)'}

Unknown fields to try to fill (only if SOURCE TEXT clearly supports):
${input.unknowns.join('\n') || '(none listed)'}

SOURCE TEXT:
"""
${sourceText}
"""

Return JSON with inferences, filledUnknowns (field/value/evidenceQuote), narrativeBullets, unknownsRemaining, redFlags, and optional researchNote.
- redFlags: only negative findings with clear support in SOURCE TEXT (e.g. shutdown, lawsuit, nonprofit-only, no product).
- researchNote: short note when the page has little/no useful company info.
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
      enrichment: emptyEnrichment(input.unknowns, 'AI enrichment error'),
      evidence: [],
      sourceTextLength: sourceText.length,
      skipped: 'ai_error',
    };
  }

  const enrichment = sanitizeEnrichment(raw, sourceText);

  if (!enrichmentHasFindings(enrichment) && !enrichment.researchNote) {
    enrichment.researchNote = 'No usable findings after quote filter';
  }

  const evidence: EvidenceItem[] = enrichment.filledUnknowns.map((f) => ({
    field: f.field,
    value: f.value,
    source: sourceLabel,
    url: finalUrl,
    evidenceQuote: f.evidenceQuote,
  }));

  for (const inf of enrichment.inferences) {
    evidence.push({
      field: inf.field ?? 'inference',
      value: inf.text,
      source: sourceLabel,
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

export async function researchWebsite(
  ai: AiProvider,
  input: WebsiteResearchInput,
): Promise<WebsiteResearchOutput> {
  const url = normalizeUrl(input.websiteUrl);
  if (!url) {
    return {
      enrichment: emptyEnrichment(input.unknowns, 'Invalid or missing website URL'),
      evidence: [],
      sourceTextLength: 0,
      skipped: 'invalid_url',
    };
  }

  // Noop / disabled AI: skip network + model (deterministic path)
  if (ai.name === 'noop') {
    return {
      enrichment: emptyEnrichment(input.unknowns, 'AI provider disabled (noop)'),
      evidence: [],
      sourceTextLength: 0,
      skipped: 'ai_noop',
    };
  }

  const home = await fetchWebsiteText(url);
  const homeThin = !home || home.text.length < THIN_HOMEPAGE_CHARS;

  // Prefer About when homepage is missing/thin (Apple-style JS shells)
  let about: { text: string; finalUrl: string } | null = null;
  if (homeThin || !home) {
    about = await fetchBestAboutText(url);
  }

  let sourceText: string;
  let finalUrl: string;
  let sourceLabel: EvidenceSource;

  if (about && (!home || about.text.length > home.text.length)) {
    sourceText = about.text;
    finalUrl = about.finalUrl;
    sourceLabel = 'about';
  } else if (home) {
    sourceText = home.text;
    finalUrl = home.finalUrl;
    sourceLabel = 'website';
  } else {
    return {
      enrichment: emptyEnrichment(input.unknowns, 'Website fetch failed'),
      evidence: [],
      sourceTextLength: 0,
      skipped: 'fetch_failed',
    };
  }

  let result = await runAiOnSource(ai, input, sourceText, finalUrl, sourceLabel);

  // If homepage AI came back empty and we have not tried About yet, fetch About and retry
  if (
    sourceLabel === 'website' &&
    !enrichmentHasFindings(result.enrichment) &&
    result.skipped !== 'ai_error'
  ) {
    about = about ?? (await fetchBestAboutText(url));
    if (about && about.text.length >= 80) {
      result = await runAiOnSource(ai, input, about.text, about.finalUrl, 'about');
    }
  }

  return result;
}
