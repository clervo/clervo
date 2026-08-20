FROM node:24.18.1-alpine3.23@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110

LABEL org.opencontainers.image.title="Clervo production AI gateway"
LABEL org.opencontainers.image.source="https://github.com/clervo/clervo"
LABEL org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --chown=node:node package.json *.mjs ./

USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["node"]
CMD ["server-v2.mjs"]
