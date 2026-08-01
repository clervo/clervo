# Clervo autonomous Codex studio

This is a persistent, reproducible control-plane studio. It does not authorize
any product ticket. The master plan and current handoff remain authoritative.

## Install and launch

From `/workspace/clervo-next`:

```bash
bash scripts/codex-studio/install.sh
bash scripts/codex-studio/launch.sh engineering
bash scripts/codex-studio/launch.sh studio-maintenance
bash scripts/codex-studio/launch.sh design
bash scripts/codex-studio/launch.sh browser-debug
bash scripts/codex-studio/launch.sh visual-qa
```

Noninteractive commands may follow the profile name, for example:

```bash
bash scripts/codex-studio/launch.sh engineering exec "Run the authorized checks and report."
bash scripts/codex-studio/launch.sh browser-debug debug prompt-input "Profile probe."
```

Use `engineering` by default. Use `studio-maintenance` only for the exact
owner-authorized machine/control-plane task. Use `design` only for design work
within existing authority. `browser-debug` creates a fresh credential-free
Chromium container on `127.0.0.1:9223`, attaches Chrome DevTools MCP, and removes
the container on exit. `visual-qa` has no browser MCP; use the deterministic
runner:

```bash
bash scripts/codex-studio/run-visual-qa.sh
```

## Profile behavior

| Profile | Sandbox | Approval | Enabled MCP | Persistent browser data |
| --- | --- | --- | --- | --- |
| engineering | workspace-write | never | OpenAI docs, Context7 | none |
| studio-maintenance | danger-full-access + guards | never | OpenAI docs | none |
| design | workspace-write | never | Context7; Figma disabled | none |
| browser-debug | danger-full-access + guards | never | Chrome DevTools | disposable `/tmp` only |
| visual-qa | danger-full-access + guards | never | none | fresh container per run |

The host-capable profiles are necessary for Docker and machine repair. They do
not grant roadmap, payment, provider, production, IAM, billing, destructive
Git, secret, or unrelated-project authority. The hook and global rules deny
those command classes, while credentials are filtered from inherited process
environments. AppArmor is left enabled and the devbox has no supported `sudo`.

## Health and evidence

```bash
node scripts/codex-studio/health-check.mjs docs/evidence/codex-studio/raw/health-check-final.json
node scripts/codex-studio/mcp-probe.mjs
node scripts/codex-studio/benchmark-navigation.mjs
node scripts/codex-studio/benchmark-output.mjs
node scripts/codex-studio/browser-isolation-check.mjs
bash scripts/codex-studio/run-visual-qa.sh
```

Canonical raw results live under `docs/evidence/codex-studio/raw`. Failed
attempts are retained beside final evidence. Never replace a frozen or
once-only product qualification with these maintenance fixtures.

The source templates are under `docs/operations/codex/profiles`; installed
copies are `$CODEX_HOME/<profile>.config.toml`. The installer places pinned
packages and the hook under `$CODEX_HOME/studio` and the command rules under
`$CODEX_HOME/rules` without storing authentication material.

See the adjacent candidate evaluation, inventories, and matrices for MCP,
skill, tool, permission, authentication, upgrade, rejection, and recovery
detail.
