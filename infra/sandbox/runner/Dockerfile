FROM alpine@sha256:25109184c71bdad752c8312a8623239686a9a2071e8825f20acb8f2198c3f659 AS native
WORKDIR /src
RUN apk add --no-cache build-base
COPY sandbox-init.c .
RUN gcc -O2 -Wall -Wextra -Werror -pthread -o /sandbox-init sandbox-init.c && strip /sandbox-init

FROM node@sha256:c2cc26d8f991c2db236ad51a61efee843c482372d6d22570787309d511694110
LABEL org.opencontainers.image.title="Clervo sandbox runner" org.opencontainers.image.source="https://clervo.dev" org.opencontainers.image.licenses="UNLICENSED"
RUN rm -rf /usr/local/lib/node_modules/npm && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=native --chown=65532:65532 /sandbox-init /opt/clervo/sandbox-init
COPY --chown=65532:65532 runner.mjs session.mjs /opt/clervo/
USER 65532:65532
WORKDIR /workspace
ENV HOME=/workspace NODE_ENV=production
ENTRYPOINT ["node", "/opt/clervo/session.mjs"]
