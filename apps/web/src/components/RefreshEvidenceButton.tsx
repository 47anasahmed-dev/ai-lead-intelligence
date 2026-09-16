'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function RefreshEvidenceButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/companies/${companyId}/refresh-evidence`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Refresh failed (${res.status})`);
      const d = json.data as {
        didEnrich?: boolean;
        status?: string | null;
        evidenceCount?: number;
      };
      setMsg(
        `Evidence refreshed · ${d.evidenceCount ?? 0} rows` +
          (d.status ? ` · status: ${d.status}` : d.didEnrich === false ? ' · AI off' : ''),
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={busy}
        onClick={() => void onClick()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Refresh evidence
      </Button>
      {msg ? <p className="text-xs text-muted-foreground max-w-[240px] text-right">{msg}</p> : null}
    </div>
  );
}
