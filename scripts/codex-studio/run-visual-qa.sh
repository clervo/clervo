#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/workspace/clervo-next"
CLERVO_STUDIO_CODEX_HOME="${CODEX_HOME:-/workspace/codex-home}"
STUDIO_HOME="$CLERVO_STUDIO_CODEX_HOME/studio"
IMAGE="mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e"

test -f "$STUDIO_HOME/node_modules/@playwright/test/package.json"
mkdir -p "$REPO_ROOT/docs/evidence/codex-studio/raw/visual-qa"

docker run --rm --init --ipc=host --network=none \
  --memory=3g --cpus=2 --pids-limit=768 \
  --read-only --tmpfs /tmp:rw,nosuid,size=1g \
  --tmpfs /root:rw,nosuid,size=64m \
  --tmpfs /home/pwuser:rw,nosuid,size=64m \
  --volume "$REPO_ROOT:/work:rw" \
  --volume "$STUDIO_HOME:/studio:ro" \
  --workdir /work \
  --env CLERVO_STUDIO_MODULE_ROOT=/studio \
  "$IMAGE" node scripts/codex-studio/visual-qa-smoke.mjs
