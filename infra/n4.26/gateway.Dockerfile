FROM node:24.18.1-bookworm-slim
WORKDIR /app
COPY apps/api/src/n426-retrieval-gateway.mjs ./gateway.mjs
USER node
EXPOSE 8080
CMD ["node", "./gateway.mjs"]
