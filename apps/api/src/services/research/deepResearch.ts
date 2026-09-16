/**
 * Multi-source deep research for top-K leads after analysis completes.
 * Sources: homepage, LinkedIn (if present), same-site about pages, optional news/mention HTML.
 * Never invents facts; evidenceQuote must be a verbatim substring of concatenated SOURCE TEXT.
 * No CAPTCHA scrapers / Hermes / Dropcommerce.
 */

import {
  ENRICHMENT_JSON_SCHEMA,
  sanitizeEnrichment,
  type AiProvider,
  type EnrichmentResult,
  type EvidenceItem,
  type EvidenceSource,
} from '@ali/shared';
import {
  fetchWebsiteText,
  htmlToText,
  normalizeUrl,
} from './websiteResearch.js';

const MAX_SECTION_CHARS = 4_000;
const MAX_TOTAL_CHARS = 14_000;
/** Prefer About over thin JS homepage shells. */
const THIN_HOMEPAGE_CHARS = 400;

/** Wired system prompt for deep enrich AI calls (per product spec). */
export const DEEP_ENRICH_SYSTEM_PROMPT = `You are a careful company research assistant. Use ONLY provided SOURCE TEXT. Prefer unknown over guess. evidenceQuote must be VERBATIM substring of SOURCE TEXT. Never invent LinkedIn/funding/facts from memory. Ignore demo_fit. Label findings by source (website|linkedin|about|news|mention). Return JSON matching ENRICHMENT_JSON_SCHEMA.`;

export interface DeepResearchInput {
  companyId: string;
  companyName?: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  unknowns: string[];
  existingFacts: string[];
}

export interface SourceSection {
  source: EvidenceSource;
  url: string;
  text: string;
  note?: string;
}

export interface DeepResearchOutput {
  enrichment: EnrichmentResult;
  evidence: EvidenceItem[];
  sourceTextLength: number;
  sections: SourceSection[];
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

function looksLikeLinkedInWall(text: string, finalUrl: string): boolean {
  const hay = `${finalUrl}\n${text}`.toLowerCase();
  return (
    /authwall|signup|sign.in|join linkedin|login|challenge|sessionredirect|uas\/login/.test(
      hay,
    ) && text.length < 2_500
  );
}

function originFromWebsite(websiteUrl: string): string | null {
  const u = normalizeUrl(websiteUrl);
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

async function fetchLabeled(
  source: EvidenceSource,
  url: string,
): Promise<SourceSection | null> {
  const fetched = await fetchWebsiteText(url);
  if (!fetched) return null;
  const text = fetched.text.slice(0, MAX_SECTION_CHARS);
  if (text.length < 40) return null;
  return { source, url: fetched.finalUrl || url, text };
}

/**
 * Map a verbatim evidenceQuote back to the labeled source section it came from.
 */
export function resolveSourceForQuote(
  quote: string,
  sections: SourceSection[],
  fallback: EvidenceSource = 'website',
): { source: EvidenceSource; url?: string } {
  const q = (quote ?? '').trim().toLowerCase();
  if (!q || !sections.length) {
    return { source: fallback, url: sections[0]?.url };
  }
  for (const s of sections) {
    if (s.text.toLowerCase().includes(q)) {
      return { source: s.source, url: s.url };
    }
  }
  return { source: fallback, url: sections[0]?.url };
}

function buildConcatenatedSource(sections: SourceSection[]): string {
  const parts: string[] = [];
  let total = 0;
  for (const s of sections) {
    const header = `=== SOURCE: ${s.source} (${s.url}) ===\n`;
    const body = s.text;
    const chunk = header + body;
    if (total + chunk.length > MAX_TOTAL_CHARS) {
      const remain = Math.max(0, MAX_TOTAL_CHARS - total - header.length);
      if (remain < 80) break;
      parts.push(header + body.slice(0, remain));
      total += header.length + remain;
      break;
    }
    parts.push(chunk);
    total += chunk.length;
  }
  return parts.join('\n\n');
}

/**
 * Collect multi-source public HTML only (homepage, LinkedIn, about, news/mention).
 */
export async function collectDeepSourceSections(
  input: DeepResearchInput,
): Promise<{ sections: SourceSection[]; notes: string[] }> {
  const sections: SourceSection[] = [];
  const notes: string[] = [];
  const origin = input.websiteUrl ? originFromWebsite(input.websiteUrl) : null;

  // 1) Homepage (may be deferred if thin — About prose preferred for JS shells)
  let homeSection: SourceSection | null = null;
  if (input.websiteUrl) {
    const homeUrl = normalizeUrl(input.websiteUrl);
    if (homeUrl) {
      homeSection = await fetchLabeled('website', homeUrl);
      if (!homeSection) notes.push('Homepage fetch failed or returned too little text');
    } else {
      notes.push('Invalid or missing website URL');
    }
  } else {
    notes.push('Invalid or missing website URL');
  }

  // 2) LinkedIn (if present) — login wall → research note, no invented facts
  let linkedinSection: SourceSection | null = null;
  if (input.linkedinUrl) {
    const liUrl = normalizeUrl(input.linkedinUrl);
    if (liUrl) {
      const fetched = await fetchWebsiteText(liUrl);
      if (!fetched) {
        notes.push('LinkedIn fetch failed — no LinkedIn facts invented');
      } else if (looksLikeLinkedInWall(fetched.text, fetched.finalUrl)) {
        notes.push(
          'LinkedIn returned a login/auth wall — no LinkedIn facts invented from memory',
        );
      } else {
        const text = fetched.text.slice(0, MAX_SECTION_CHARS);
        if (text.length >= 40) {
          linkedinSection = {
            source: 'linkedin',
            url: fetched.finalUrl || liUrl,
            text,
          };
        } else {
          notes.push('LinkedIn page had too little usable text');
        }
      }
    }
  }

  // 3) Same-site about pages — prefer before thin homepage so Apple-style shells still get prose
  const aboutSections: SourceSection[] = [];
  if (origin) {
    const aboutPaths = ['/about', '/about-us', '/company', '/our-story'];
    for (const path of aboutPaths) {
      const about = await fetchLabeled('about', `${origin}${path}`);
      if (about) {
        const already = aboutSections.some(
          (s) => s.text.slice(0, 200) === about.text.slice(0, 200),
        );
        if (!already) aboutSections.push(about);
      }
    }
  }

  const homeThin =
    !homeSection || homeSection.text.length < THIN_HOMEPAGE_CHARS;
  if (homeThin && aboutSections.length) {
    sections.push(...aboutSections);
    if (homeSection) sections.push(homeSection);
  } else {
    if (homeSection) sections.push(homeSection);
    sections.push(...aboutSections);
  }
  if (linkedinSection) sections.push(linkedinSection);

  // 4) Optional lightweight same-site news / mention HTML (no CAPTCHA scrapers)
  if (origin) {
    for (const path of ['/news', '/press', '/blog']) {
      const news = await fetchLabeled('news', `${origin}${path}`);
      if (news) {
        sections.push(news);
        break; // one news-ish page is enough
      }
    }
    // Lightweight public HTML mention: DuckDuckGo HTML (no JS/CAPTCHA path)
    const name = (input.companyName ?? '').trim();
    if (name && sections.length < 6) {
      try {
        const q = encodeURIComponent(`"${name}" company`);
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${q}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6_000);
        try {
          const res = await fetch(ddgUrl, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
              'User-Agent': 'AI-Lead-Intelligence/0.1 (+research; respectful bot)',
              Accept: 'text/html',
            },
          });
          if (res.ok) {
            const html = await res.text();
            const text = htmlToText(html).slice(0, MAX_SECTION_CHARS);
            if (text.length >= 80 && !/captcha|challenge|unusual traffic/i.test(text)) {
              sections.push({
                source: 'mention',
                url: ddgUrl,
                text,
              });
            }
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // optional — ignore
      }
    }
  }

  return { sections, notes };
}

/**
 * Deep multi-source research → AI enrich → quote-sanitize → source-mapped evidence.
 */
export async function researchDeep(
  ai: AiProvider,
  input: DeepResearchInput,
): Promise<DeepResearchOutput> {
  if (ai.name === 'noop') {
    return {
      enrichment: emptyEnrichment(input.unknowns, 'AI provider disabled (noop)'),
      evidence: [],
      sourceTextLength: 0,
      sections: [],
      skipped: 'ai_noop',
    };
  }

  const { sections, notes } = await collectDeepSourceSections(input);

  if (!sections.length) {
    const note =
      notes.join('; ') ||
      'No usable public HTML sources for deep research';
    return {
      enrichment: emptyEnrichment(input.unknowns, note),
      evidence: [],
      sourceTextLength: 0,
      sections: [],
      skipped: notes.some((n) => /invalid or missing website/i.test(n))
        ? 'invalid_url'
        : 'fetch_failed',
    };
  }

  const sourceText = buildConcatenatedSource(sections);
  const sourceNotesBlock = notes.length
    ? `Source notes (informational, not facts):\n${notes.map((n) => `- ${n}`).join('\n')}\n`
    : '';

  const userPrompt = `Company ID: ${input.companyId}
Company name: ${input.companyName ?? '(unknown)'}
Website: ${input.websiteUrl ?? '(none)'}
LinkedIn: ${input.linkedinUrl ?? '(none)'}

Known facts (do not contradict; do not overwrite):
${input.existingFacts.slice(0, 40).join('\n') || '(none)'}

Unknown fields to try to fill (only if SOURCE TEXT clearly supports):
${input.unknowns.join('\n') || '(none listed)'}

${sourceNotesBlock}
SOURCE TEXT (labeled sections — quote must be verbatim from these):
"""
${sourceText}
"""

Return JSON with inferences, filledUnknowns (field/value/evidenceQuote), narrativeBullets, unknownsRemaining, redFlags, and optional researchNote.
Label which source supports each finding via evidenceQuote taken from that section.
evidenceQuote MUST be copied verbatim from SOURCE TEXT.`;

  let raw: unknown;
  try {
    raw = await ai.generateStructured({
      systemPrompt: DEEP_ENRICH_SYSTEM_PROMPT,
      userPrompt,
      schema: ENRICHMENT_JSON_SCHEMA,
    });
  } catch {
    return {
      enrichment: emptyEnrichment(
        input.unknowns,
        notes.concat(['AI enrichment error']).join('; '),
      ),
      evidence: [],
      sourceTextLength: sourceText.length,
      sections,
      skipped: 'ai_error',
    };
  }

  const enrichment = sanitizeEnrichment(raw, sourceText);

  // Merge fetch notes into researchNote when useful
  if (notes.length) {
    const existing = enrichment.researchNote?.trim();
    const joined = notes.join('; ');
    enrichment.researchNote = existing ? `${existing} | ${joined}` : joined;
  }

  const hasFindings =
    enrichment.filledUnknowns.length > 0 ||
    enrichment.inferences.length > 0 ||
    enrichment.narrativeBullets.length > 0 ||
    enrichment.redFlags.length > 0;

  if (!hasFindings && !enrichment.researchNote) {
    enrichment.researchNote = 'No usable findings after quote filter (deep research)';
  }

  const evidence: EvidenceItem[] = [];
  for (const f of enrichment.filledUnknowns) {
    const mapped = resolveSourceForQuote(f.evidenceQuote, sections);
    evidence.push({
      field: f.field,
      value: f.value,
      source: mapped.source,
      url: mapped.url,
      evidenceQuote: f.evidenceQuote,
    });
  }
  for (const inf of enrichment.inferences) {
    const mapped = resolveSourceForQuote(inf.evidenceQuote, sections);
    evidence.push({
      field: inf.field ?? 'inference',
      value: inf.text,
      source: mapped.source,
      url: mapped.url,
      evidenceQuote: inf.evidenceQuote,
    });
  }

  return {
    enrichment,
    evidence,
    sourceTextLength: sourceText.length,
    sections,
  };
}
