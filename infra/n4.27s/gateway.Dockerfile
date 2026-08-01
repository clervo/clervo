FROM node:24.18.1-bookworm-slim
WORKDIR /app
COPY infra/n4.27s/retrieval-gateway.mjs ./gateway.mjs
USER node
EXPOSE 8080
CMD ["node", "./gateway.mjs"]
