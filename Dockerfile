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

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212 AS runtime

LABEL org.opencontainers.image.title="Clervo API distribution candidate"
LABEL org.opencontainers.image.source="https://github.com/clervo/clervo"
LABEL org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --chown=65532:65532 --from=build /app/package.json ./package.json
COPY --chown=65532:65532 --from=runtime-dependencies /app/node_modules ./node_modules
COPY --chown=65532:65532 --from=build /app/dist ./dist
COPY --chown=65532:65532 packages/catalog/ai-model-catalog.v1.json packages/catalog/ai-launch-pricing.v1.json packages/catalog/ai-credit-backed-pricing.v1.json packages/catalog/ai-speech-pricing.v1.json packages/catalog/ai-free-tier-pricing.v1.json packages/catalog/ai-edge-free-pricing.v1.json packages/catalog/ai-product-pricing-policy.v1.json packages/catalog/ai-competitor-price-evidence.v1.json packages/catalog/ai-b7-qualified-supply.v1.json packages/catalog/ai-b7-customer-identity-registry.v1.json packages/catalog/ai-b7-commercial-permission.v1.json packages/catalog/ai-b7-strategic-pricing-overrides.v1.json packages/catalog/ai-b7-commercial-pricing.v1.json packages/catalog/prediction-product-pricing.v1.json ./packages/catalog/
COPY --chown=65532:65532 infra/prediction/source-routes.v1.json ./infra/prediction/
COPY --chown=65532:65532 apps/api/src/ai-artifact-runtime.mjs apps/api/src/ai-dynamic-production-runtime.mjs apps/api/src/ai-free-operation.mjs apps/api/src/ai-production-runtime.mjs apps/api/src/ai-public-pricing.mjs apps/api/src/crypto-production-runtime.mjs apps/api/src/monitoring-exporter.mjs apps/api/src/prediction-market-store.mjs apps/api/src/prediction-production-runtime.mjs apps/api/src/prediction-public-policy.mjs apps/api/src/rpc-production-runtime.mjs apps/api/src/sandbox-operation-store.mjs apps/api/src/sandbox-private-gateway.mjs apps/api/src/search-server.mjs apps/api/src/search-state-store.mjs apps/api/src/staging-search-main.mjs apps/api/src/traffic-control.mjs apps/api/src/x402-operation-store.mjs apps/api/src/x402-paid-ai.mjs apps/api/src/x402-paid-crypto.mjs apps/api/src/x402-paid-operation.mjs apps/api/src/x402-paid-prediction.mjs apps/api/src/x402-paid-rpc.mjs apps/api/src/x402-paid-sandbox.mjs apps/api/src/x402-paid-search.mjs apps/api/src/x402-resource.mjs ./apps/api/src/

USER 65532:65532
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "const response = await fetch('http://127.0.0.1:8080/v1/health', { signal: AbortSignal.timeout(2000) }); if (!response.ok) process.exit(1)"]
CMD ["./apps/api/src/staging-search-main.mjs"]
