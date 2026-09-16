import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { peerCompanyHref } from '@/lib/links';
import type { SearchRefCompany } from '@/lib/api';

const AVATAR_TONES = [
  'bg-sky-100 text-sky-700 ring-sky-200',
  'bg-violet-100 text-violet-700 ring-violet-200',
  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'bg-amber-100 text-amber-800 ring-amber-200',
  'bg-rose-100 text-rose-700 ring-rose-200',
  'bg-teal-100 text-teal-700 ring-teal-200',
  'bg-indigo-100 text-indigo-700 ring-indigo-200',
  'bg-orange-100 text-orange-800 ring-orange-200',
  'bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200',
  'bg-cyan-100 text-cyan-700 ring-cyan-200',
] as const;

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PeerMiniCard({ company }: { company: SearchRefCompany }) {
  const tone = AVATAR_TONES[hashName(company.name) % AVATAR_TONES.length];
  const { href, external } = peerCompanyHref(company);
  const hasWebsite = Boolean(company.website?.trim());

  const inner = (
    <>
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1',
          tone,
        )}
        aria-hidden
      >
        {initials(company.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-sm font-medium text-foreground">{company.name}</span>
          {hasWebsite && (
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
          )}
        </span>
        {company.industry ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {company.industry}
          </span>
        ) : (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground/50">—</span>
        )}
      </span>
    </>
  );

  const shellClass =
    'flex min-w-[140px] max-w-[180px] flex-1 items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-muted/50';

  if (external) {
    return (
      <Card size="sm" className="overflow-hidden p-0 shadow-none">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={shellClass}
          title={company.name}
        >
          {inner}
        </a>
      </Card>
    );
  }

  return (
    <Card size="sm" className="overflow-hidden p-0 shadow-none">
      <Link href={href} className={shellClass} title={company.name}>
        {inner}
      </Link>
    </Card>
  );
}
