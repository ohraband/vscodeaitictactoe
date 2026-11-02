# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@12.15.0

FROM base AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm prisma:generate && pnpm build

FROM base AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /app ./

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]
