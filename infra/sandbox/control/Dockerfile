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
RUN npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund --workspaces=false

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212

LABEL org.opencontainers.image.title="Clervo private Sandbox control"
LABEL org.opencontainers.image.source="https://github.com/clervo/clervo"
LABEL org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --chown=65532:65532 --from=build /app/package.json ./package.json
COPY --chown=65532:65532 --from=runtime-dependencies /app/node_modules ./node_modules
COPY --chown=65532:65532 --from=build /app/dist ./dist
COPY --chown=65532:65532 apps/api/src/sandbox-control-main.mjs ./apps/api/src/sandbox-control-main.mjs
USER 65532:65532
EXPOSE 8080
STOPSIGNAL SIGTERM
CMD ["./apps/api/src/sandbox-control-main.mjs"]
