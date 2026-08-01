FROM node:24.18.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium chromium-sandbox curl ca-certificates openssl tini && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/clervo
COPY infra/n4.27r/browser-boundary.mjs ./infra/n4.27r/browser-boundary.mjs
COPY infra/n4.27t/browser-runtime.mjs infra/n4.27t/developer-registry.mjs infra/n4.27t/validation-browser-worker.mjs infra/n4.27t/qualify-validation.mjs ./infra/n4.27t/
COPY benchmarks/n4.27t/validation-corpus.v1.json benchmarks/n4.27t/validation-labels.v1.json benchmarks/n4.27t/split-freeze.v1.json ./benchmarks/n4.27t/
USER 65534:65534
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/bin/prlimit", "--nproc=128:128", "--nofile=256:256", "--fsize=67108864:67108864", "--", "node", "/opt/clervo/infra/n4.27t/qualify-validation.mjs"]
