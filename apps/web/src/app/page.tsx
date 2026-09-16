'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { Loader2 } from 'lucide-react';

function WorkspaceFromParams() {
  const params = useSearchParams();
  const searchId = params.get('searchId');
  return <WorkspaceShell initialSearchId={searchId} />;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#121826] text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        </div>
      }
    >
      <WorkspaceFromParams />
    </Suspense>
  );
}
