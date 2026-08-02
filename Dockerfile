FROM node:24.18.1-bookworm-slim@sha256:235600a8101ab264e117b1768e925532262668dc9b581ef1dd7d96ced463b8e7 AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/site/package.json ./apps/site/package.json
COPY packages/mcp/package.json ./packages/mcp/package.json
COPY packages/sdk-typescript/package.json ./packages/sdk-typescript/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY .nvmrc .node-version .tool-versions ./
COPY infra/stack-versions.env ./infra/stack-versions.env
COPY scripts/verify-runtime.mjs ./scripts/verify-runtime.mjs
COPY packages ./packages
COPY services ./services
COPY adapters ./adapters
RUN npm run build

FROM node:24.18.1-bookworm-slim@sha256:235600a8101ab264e117b1768e925532262668dc9b581ef1dd7d96ced463b8e7 AS runtime-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/site/package.json ./apps/site/package.json
COPY packages/mcp/package.json ./packages/mcp/package.json
COPY packages/sdk-typescript/package.json ./packages/sdk-typescript/package.json
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspaces=false

FROM node:24.18.1-bookworm-slim@sha256:235600a8101ab264e117b1768e925532262668dc9b581ef1dd7d96ced463b8e7 AS runtime

LABEL org.opencontainers.image.title="Clervo API distribution candidate"
LABEL org.opencontainers.image.source="https://github.com/clervo/clervo"
LABEL org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --chown=1000:1000 --from=build /app/package.json ./package.json
COPY --chown=1000:1000 --from=runtime-dependencies /app/node_modules ./node_modules
COPY --chown=1000:1000 --from=build /app/dist ./dist
COPY --chown=1000:1000 apps/api/src/search-server.mjs apps/api/src/search-state-store.mjs apps/api/src/staging-search-main.mjs ./apps/api/src/

USER 1000:1000
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "const response = await fetch('http://127.0.0.1:8080/v1/health', { signal: AbortSignal.timeout(2000) }); if (!response.ok) process.exit(1)"]
CMD ["node", "./apps/api/src/staging-search-main.mjs"]
