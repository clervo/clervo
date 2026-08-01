FROM node:24.18.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium chromium-sandbox curl ca-certificates openssl tini && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/clervo
COPY infra/n4.27r/browser-boundary.mjs ./infra/n4.27r/browser-boundary.mjs
COPY infra/stage4/browser-policy.mjs infra/stage4/browser-worker.mjs infra/stage4/synthetic-browser-smoke.mjs ./infra/stage4/
USER 65534:65534
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/bin/prlimit", "--nproc=128:128", "--nofile=256:256", "--fsize=67108864:67108864", "--", "node", "/opt/clervo/infra/stage4/synthetic-browser-smoke.mjs"]
