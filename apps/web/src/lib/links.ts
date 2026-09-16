/** URL helpers for company + evidence hyperlinks. */

export function normalizeUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  // bare domain / path without scheme
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:].*)?$/i.test(t)) return `https://${t}`;
  return null;
}

/** Prefer company website; else LinkedIn. */
export function linkForCompany(
  website: string | null | undefined,
  linkedin: string | null | undefined,
): string | null {
  return normalizeUrl(website) ?? normalizeUrl(linkedin);
}

export function looksLikeUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const t = value.trim();
  return (
    /^https?:\/\//i.test(t) ||
    /^www\./i.test(t) ||
    /^[a-z0-9.-]+\.[a-z]{2,}([/:].*)?$/i.test(t)
  );
}

/** If the string is (or contains) a URL, return a normalized href; else null. */
export function hrefFromValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim();
  const direct = normalizeUrl(t);
  if (direct) return direct;
  const m = t.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : null;
}

/** Dashboard peer card: website → LinkedIn → internal company page. */
export function peerCompanyHref(company: {
  id: string;
  website?: string | null;
  linkedinUrl?: string | null;
}): { href: string; external: boolean } {
  const external = linkForCompany(company.website, company.linkedinUrl);
  if (external) return { href: external, external: true };
  return { href: `/companies/${company.id}`, external: false };
}

