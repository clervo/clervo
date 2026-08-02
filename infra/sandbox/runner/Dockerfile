FROM gcc@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15 AS native
WORKDIR /src
COPY sandbox-init.c .
RUN gcc -O2 -Wall -Wextra -Werror -o /sandbox-init sandbox-init.c && strip /sandbox-init

FROM node@sha256:235600a8101ab264e117b1768e925532262668dc9b581ef1dd7d96ced463b8e7
LABEL org.opencontainers.image.title="Clervo sandbox runner" org.opencontainers.image.source="https://clervo.dev" org.opencontainers.image.licenses="UNLICENSED"
COPY --from=native --chown=65532:65532 /sandbox-init /opt/clervo/sandbox-init
COPY --chown=65532:65532 runner.mjs session.mjs /opt/clervo/
USER 65532:65532
WORKDIR /workspace
ENV HOME=/workspace NODE_ENV=production
ENTRYPOINT ["node", "/opt/clervo/session.mjs"]
