FROM node:24.18.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium chromium-sandbox curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/clervo
COPY infra/n4.27r/browser-boundary.mjs ./n4.27r/browser-boundary.mjs
COPY infra/n4.27s/browser-worker.mjs infra/n4.27s/qualify-browser.mjs ./n4.27s/
USER 65534:65534
ENTRYPOINT ["/usr/bin/prlimit", "--nproc=128:128", "--nofile=256:256", "--fsize=67108864:67108864", "--", "node", "/opt/clervo/n4.27s/qualify-browser.mjs"]
