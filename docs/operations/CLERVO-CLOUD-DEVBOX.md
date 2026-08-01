# Clervo cloud-devbox runbook

## Purpose and authority

This runbook restores and operates the Clervo Codex studio on the dedicated
development VM. It is control-plane guidance only. Before work, read the
external master plan, its current handoff and stop condition, repository
`AGENTS.md`, `.codex-autonomy-policy.md`, and the live-intelligence launch
authority. A proposed product ticket is not authorization.

## Routine start

1. Enter `/workspace/clervo-next` and confirm `git status --short` contains no
   unexplained change.
2. Run `bash scripts/codex-studio/install.sh` after a clean-VM restore, profile
   change, lockfile change, or Codex-home repair.
3. Run `node scripts/codex-studio/health-check.mjs`.
4. Launch the least-privileged matching profile using the commands in
   `docs/operations/codex/README.md`.
5. Read the authority sources and invoke `$clervo-engineering-stage` before any
   repository mutation.

Routine engineering should not prompt. A denied command is a boundary result,
not a reason to weaken AppArmor, change permissions broadly, copy a secret, or
switch profiles without the exact maintenance authority.

## Browser operation

The browser-debug launcher removes any stale task-owned debug container, starts
fresh Chromium with an isolated `/tmp` user-data directory, publishes DevTools
only on loopback port 9223, and tears it down on exit. Do not attach Playwright
to that session or use a personal/privileged browser profile.

Visual QA uses the immutable Playwright image with no network, no persistent
state, and fresh browser processes. Its repository-only fixture is test
evidence for the studio, never a screenshot of deployed Clervo behavior.

## Failure and recovery

- MCP failure: continue with official docs/Web or deterministic shell tools;
  MCPs are failure-isolated and not required for startup. Do not retry a write.
- Browser failure: stop only `clervo-codex-browser-debug`, confirm teardown,
  reinstall from the lockfile, and rerun isolation and smoke checks.
- Profile drift: rerun the installer; it verifies source/installed byte equality.
- Broken npm tree: remove only `$CODEX_HOME/studio/node_modules`, rerun the
  installer, then health and MCP probes. Never edit the installed copy by hand.
- Docker image absent: pull the exact digest recorded in `inventory.json` and
  rerun health. Do not substitute an unreviewed tag.
- Host CLI or AppArmor issue: use `studio-maintenance` only within exact owner
  authority. The current gcloud snap is not repaired because snap confinement
  is incompatible with this no-new-privileges session; do not weaken AppArmor.

Full clean-VM restoration and rollback are in
`docs/operations/codex/RECOVERY.md`.

## Closeout

Run applicable lint, typecheck, dependency/secret/security checks, clean-room
verification, studio health, and diff-integrity review. Preserve raw results,
append the build journal, commit repository-controlled changes, confirm a clean
tree and zero task containers, then stop. Record external calls, gross and
owner-cash cost, provider effects, payments, USDC, cleanup, and claims still
false. Do not begin the proposed product ticket.
