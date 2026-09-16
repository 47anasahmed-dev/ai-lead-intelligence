'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** New search is now in-workspace (left rail + Run). Redirect home. */
export default function NewSearchRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return (
    <div className="flex h-screen items-center justify-center bg-[#121826] text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
    </div>
  );
}
