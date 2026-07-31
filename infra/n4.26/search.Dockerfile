FROM node:24.18.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json .nvmrc .node-version .tool-versions ./
COPY infra/stack-versions.env ./infra/stack-versions.env
COPY scripts/verify-runtime.mjs ./scripts/verify-runtime.mjs
COPY packages ./packages
COPY services ./services
COPY adapters ./adapters
RUN npm run build

FROM node:24.18.1-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY apps/api/src/n426-staging-main.mjs ./apps/api/src/n426-staging-main.mjs
USER node
EXPOSE 8080
CMD ["node", "./apps/api/src/n426-staging-main.mjs"]
