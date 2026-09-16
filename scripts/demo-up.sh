#!/usr/bin/env bash
# Local demo bring-up (thin). Postgres maps host 5433 → container 5432.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

docker compose up -d
echo "Waiting for Postgres..."
sleep 3

pnpm install
pnpm db:migrate
pnpm db:seed
pnpm db:import || pnpm --filter @ali/api exec tsx scripts/import-csv.ts

echo ""
echo "Start API:  pnpm --filter @ali/api dev"
echo "Start Web:  pnpm --filter @ali/web dev"
echo "Smoke:      pnpm --filter @ali/api smoke"
echo "API http://localhost:3001  Web http://localhost:3000  DB localhost:5433"
