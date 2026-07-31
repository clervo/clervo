FROM node:24.18.1-bookworm-slim
WORKDIR /app
COPY infra/n4.27/fixture-server.mjs ./fixture-server.mjs
USER node
EXPOSE 8080
CMD ["node", "./fixture-server.mjs"]
