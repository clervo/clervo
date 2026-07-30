#!/bin/sh
set -eu

fail() {
  printf 'clean-room boundary: FAIL: %s\n' "$1" >&2
  exit 1
}

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
git_root=$(git -C "$repo_root" rev-parse --show-toplevel 2>/dev/null) || fail 'not a Git repository'
[ "$git_root" = "$repo_root" ] || fail "Git root is $git_root, expected $repo_root"

required_directories='apps/api
apps/worker
apps/site
packages/contracts
packages/commerce
packages/catalog
packages/routing
packages/observability
packages/sdk-typescript
packages/sdk-python
packages/mcp
services/search
services/rpc
services/prediction
services/sandbox
services/crypto-intelligence
services/ai
adapters
infra
tests/contract
tests/integration
tests/acceptance
tests/security
tests/load'

printf '%s\n' "$required_directories" | while IFS= read -r directory; do
  [ -d "$repo_root/$directory" ] || fail "missing required directory: $directory"
done

symlinks=$(find "$repo_root" \
  \( -path "$repo_root/.git" -o -path "$repo_root/node_modules" \) -prune \
  -o -type l -print)
[ -z "$symlinks" ] || fail "symlinks are forbidden:\n$symlinks"

[ ! -e "$repo_root/.gitmodules" ] || fail '.gitmodules is forbidden'

gitlinks=$(git -C "$repo_root" ls-files --stage | awk '$1 == "160000" { print $4 }')
[ -z "$gitlinks" ] || fail "Git links/submodules are forbidden:\n$gitlinks"

legacy_name=x402-platform
legacy_absolute=/workspace/$legacy_name
legacy_relative=../$legacy_name

legacy_matches=$(find "$repo_root" \
  \( -path "$repo_root/.git" -o -path "$repo_root/node_modules" \) -prune \
  -o -type f -print0 \
  | xargs -0 grep -Il -e "$legacy_absolute" -e "$legacy_relative" 2>/dev/null || true)

allowed_legacy_references="$repo_root/README.md
$repo_root/AGENTS.md
$repo_root/docs/decisions/ADR-0001-clean-room-repository-boundary.md
$repo_root/docs/tickets/N0.1.md"

if [ -n "$legacy_matches" ]; then
  printf '%s\n' "$legacy_matches" | while IFS= read -r match; do
    printf '%s\n' "$allowed_legacy_references" | grep -Fxq "$match" \
      || fail "legacy runtime reference outside boundary documentation: ${match#$repo_root/}"
  done
fi

manifest_names='package.json pyproject.toml requirements.txt Cargo.toml go.mod pom.xml build.gradle build.gradle.kts composer.json Gemfile'
for manifest_name in $manifest_names; do
  escaping_dependencies=$(find "$repo_root" \
    \( -path "$repo_root/.git" -o -path "$repo_root/node_modules" \) -prune \
    -o -name "$manifest_name" -type f -print0 \
    | xargs -0 -r grep -InE '(file:|path[[:space:]]*=|replace[[:space:]]+)[^#\n]*(\.\./|/workspace/)' \
    || true)
  [ -z "$escaping_dependencies" ] \
    || fail "local dependency escapes repository through $manifest_name:\n$escaping_dependencies"
done

printf 'clean-room boundary: PASS\n'
printf 'repository: %s\n' "$repo_root"
printf 'legacy runtime dependencies detected: 0\n'
printf 'network calls made: 0\n'
printf 'USDC spent: 0\n'
