#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH='' cd -- "$SCRIPT_DIR/../.." && pwd)"
CLERVO_STUDIO_CODEX_HOME="${CODEX_HOME:-/workspace/codex-home}"
STUDIO_HOME="$CLERVO_STUDIO_CODEX_HOME/studio"
CLERVO_STUDIO_USER_HOME="$(getent passwd "$(id -u)" | cut -d: -f6)"
CLERVO_STUDIO_TMUX_CONFIG="${CLERVO_STUDIO_TMUX_CONFIG:-$CLERVO_STUDIO_USER_HOME/.tmux.conf}"

if [ -z "$CLERVO_STUDIO_USER_HOME" ]; then
  printf 'Unable to resolve the current user home directory\n' >&2
  exit 1
fi

mkdir -p "$STUDIO_HOME/bin" "$STUDIO_HOME/runtime" "$CLERVO_STUDIO_CODEX_HOME/rules"

for profile in engineering studio-maintenance design browser-debug visual-qa; do
  install -m 0644 "$REPO_ROOT/docs/operations/codex/profiles/$profile.config.toml" \
    "$CLERVO_STUDIO_CODEX_HOME/$profile.config.toml"
done

install -m 0755 "$REPO_ROOT/docs/operations/codex/hooks/clervo-guard-hook.mjs" \
  "$STUDIO_HOME/bin/clervo-guard-hook"
install -m 0644 "$REPO_ROOT/docs/operations/codex/rules/clervo-studio.rules" \
  "$CLERVO_STUDIO_CODEX_HOME/rules/clervo-studio.rules"
install -m 0644 "$REPO_ROOT/docs/operations/codex/tmux.conf" \
  "$CLERVO_STUDIO_TMUX_CONFIG"
install -m 0644 "$REPO_ROOT/tools/codex-studio/package.json" "$STUDIO_HOME/package.json"
install -m 0644 "$REPO_ROOT/tools/codex-studio/package-lock.json" "$STUDIO_HOME/package-lock.json"

PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --ignore-scripts --prefix "$STUDIO_HOME"

for profile in engineering studio-maintenance design browser-debug visual-qa; do
  cmp "$REPO_ROOT/docs/operations/codex/profiles/$profile.config.toml" \
    "$CLERVO_STUDIO_CODEX_HOME/$profile.config.toml"
done
cmp "$REPO_ROOT/docs/operations/codex/hooks/clervo-guard-hook.mjs" \
  "$STUDIO_HOME/bin/clervo-guard-hook"
cmp "$REPO_ROOT/docs/operations/codex/rules/clervo-studio.rules" \
  "$CLERVO_STUDIO_CODEX_HOME/rules/clervo-studio.rules"
cmp "$REPO_ROOT/docs/operations/codex/tmux.conf" "$CLERVO_STUDIO_TMUX_CONFIG"

printf 'Installed Clervo Codex studio at %s\n' "$STUDIO_HOME"
printf 'Installed tmux defaults at %s\n' "$CLERVO_STUDIO_TMUX_CONFIG"
