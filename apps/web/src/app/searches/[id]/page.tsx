'use client';

import { use } from 'react';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

export default function SearchDeepLinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <WorkspaceShell initialSearchId={id} />;
}
