#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-engineering}"
case "$PROFILE" in
  engineering|studio-maintenance|design|browser-debug|visual-qa) ;;
  *) printf 'Unknown profile: %s\n' "$PROFILE" >&2; exit 64 ;;
esac
if [ "$#" -gt 0 ]; then shift; fi

REPO_ROOT="/workspace/clervo-next"
IMAGE="mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e"
BROWSER_NAME="clervo-codex-browser-debug"

cleanup_browser() {
  docker rm -f "$BROWSER_NAME" >/dev/null 2>&1 || true
}

if [ "$PROFILE" = "browser-debug" ]; then
  cleanup_browser
  docker run --detach --rm --name "$BROWSER_NAME" \
    --init --ipc=host --memory=2g --cpus=2 --pids-limit=512 \
    --read-only --tmpfs /tmp:rw,noexec,nosuid,size=512m \
    --add-host host.docker.internal:host-gateway \
    --publish 127.0.0.1:9223:9222 \
    "$IMAGE" \
    /ms-playwright/chromium-1234/chrome-linux64/chrome \
    --headless=new --no-sandbox --disable-dev-shm-usage \
    --disable-background-networking --disable-component-update \
    --disable-default-apps --disable-sync --metrics-recording-only \
    --no-first-run --no-default-browser-check \
    --remote-debugging-address=0.0.0.0 --remote-debugging-port=9222 \
    --user-data-dir=/tmp/clervo-browser-debug about:blank >/dev/null
  trap cleanup_browser EXIT INT TERM
fi

CODEX_ARGS=(--profile "$PROFILE" --dangerously-bypass-hook-trust --cd "$REPO_ROOT")
# Codex 0.146 rejects --strict-config specifically for its debug command. All
# normal interactive, exec, and app-server launches retain strict validation.
if [ "${1:-}" != "debug" ]; then
  CODEX_ARGS=(--strict-config "${CODEX_ARGS[@]}")
fi
codex "${CODEX_ARGS[@]}" "$@"
