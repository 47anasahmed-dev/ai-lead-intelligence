# Build on target arch (Oracle Ampere = arm64)
FROM node:22-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @ali/api... --filter @ali/shared...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# COPY above can drop pnpm workspace symlinks under apps/*/node_modules — restore them
RUN pnpm install --frozen-lockfile --filter @ali/api... --filter @ali/shared... \
  && pnpm --filter @ali/shared build \
  && test -f packages/shared/dist/index.js \
  && test -e apps/api/node_modules/@ali/shared \
  && pnpm --filter @ali/api exec prisma generate \
  && pnpm --filter @ali/api build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
