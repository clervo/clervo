FROM node:24.18.1-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY scripts/verify-runtime.mjs ./scripts/verify-runtime.mjs
COPY packages ./packages
COPY services ./services
RUN npm run build

FROM node:24.18.1-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY apps/api/src/search-server.mjs apps/api/src/staging-search-main.mjs ./apps/api/src/

USER node
EXPOSE 8080
CMD ["node", "./apps/api/src/staging-search-main.mjs"]