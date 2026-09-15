import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../.env') });

const API = process.env.API_URL ?? 'http://127.0.0.1:3001';

async function main() {
  const health = await fetch(`${API}/health`).then((r) => r.json());
  console.log('health', health);

  const companies = await fetch(`${API}/companies?q=SaaS&limit=5`).then((r) =>
    r.json(),
  );
  const ids = (companies.data as Array<{ id: string; name: string }>)
    .slice(0, 3)
    .map((c) => c.id);
  console.log('refs', ids);

  if (ids.length < 1) throw new Error('No companies to reference');

  const created = await fetch(`${API}/searches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'reference', companyIds: ids }),
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    return j;
  });

  const searchId = created.data.id as string;
  console.log('search', searchId);

  const run = await fetch(`${API}/searches/${searchId}/run`, {
    method: 'POST',
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    return j;
  });

  console.log('run meta', {
    filteredCount: run.data.filteredCount,
    top: run.data.topResults?.slice(0, 3).map((r: {
      companyId: string;
      name: string;
      qualification: { qualificationScore: number; recommendation: string };
      similarity: { overallScore: number };
    }) => ({
      id: r.companyId,
      name: r.name,
      q: r.qualification.qualificationScore,
      s: r.similarity.overallScore,
      rec: r.qualification.recommendation,
    })),
  });

  const results = await fetch(`${API}/searches/${searchId}/results`).then((r) =>
    r.json(),
  );
  console.log('results count', results.data?.length);
  console.log('SMOKE_OK');
}

main().catch((e) => {
  console.error('SMOKE_FAIL', e);
  process.exit(1);
});
