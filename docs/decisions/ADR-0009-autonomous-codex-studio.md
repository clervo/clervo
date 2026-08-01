# ADR-0009: Layered autonomous Codex studio

- Status: accepted
- Date: 2026-08-01
- Scope: repository control plane and cloud devbox only

## Context

Clervo needs routine engineering and creative-tool work to run without approval
prompts while the product roadmap, clean-room boundary, secrets, payments,
production, cloud billing, IAM, and irreversible actions remain fail-closed.
Prompt prose alone is not a sufficient boundary. Loading every candidate MCP or
framework would also add startup, schema/context, supply-chain, and overlap cost.

## Decision

Use five named Codex profiles installed from version-controlled templates:

| Profile | Host permission | Network/tool model | Intended use |
| --- | --- | --- | --- |
| `engineering` | repository-only `workspace-write` | shell network off; read-only documentation MCPs | everyday authorized repository work |
| `studio-maintenance` | `danger-full-access` | guarded host tools and cached research | exact owner-authorized devbox/control-plane maintenance |
| `design` | repository-only `workspace-write` | Context7; disabled Figma endpoint | authorized UI planning and later frontend tickets |
| `browser-debug` | guarded host access | Chrome DevTools MCP attached to disposable loopback Chromium | local DOM/network/performance diagnostics |
| `visual-qa` | guarded host access | deterministic Docker/Playwright CLI; no browser MCP | cross-browser visual and accessibility qualification |

All profiles use `approval_policy = "never"`. Autonomy is constrained by the
least privilege profile, filtered inherited environment, repository authority
documents, system AppArmor/no-supported-sudo state, global forbidden-command
rules, a reviewed `PreToolUse` hook on host-capable profiles, loopback or absent
browser networking, immutable container and npm pins, and isolated ephemeral
state. The launcher bypasses only Codex's trust prompt for the reviewed hook; it
does not bypass the selected sandbox or the hook decision.

Retain only OpenAI Developer Docs, Context7 remote MCP, and Chrome DevTools MCP.
Keep Figma configured but disabled pending OAuth and exact file authority. Use
Playwright as a pinned CLI/library instead of its MCP because routine visual QA
is more deterministic and carries no MCP schema overhead. Use `rg` by default
and TypeScript's local API for exceptional semantic questions; do not retain
Serena. Preserve full raw command evidence and generate explicit deterministic
summaries; do not install RTK or Caveman as automatic evidence filters.

Keep frontend frameworks and media runtimes repository-scoped and deferred
until an exact product ticket needs them. Machine preparation consists of the
profile, pinned test tooling, container image, inventories, and recovery path;
it does not add product dependencies.

## Consequences

- Everyday engineering has no routine prompts and cannot write outside the
  clean-room repository or open shell network connections.
- Host-capable work remains powerful but is intentionally an exact-maintenance
  profile, protected by independent command rules, a hook, environment
  minimization, lack of privileged credentials, and the VM security controls.
- Chrome DevTools and Playwright never share a browser, user-data directory,
  network namespace, or control channel.
- Remote documentation MCP availability may degrade independently without
  preventing startup because it is not required. Raw shell evidence remains
  authoritative.
- A clean VM can be restored from Git, the pinned npm lock, and the immutable
  browser image. No billable VM snapshot is part of this decision.

## Rejected alternatives

One unrestricted profile, prompts as the only safeguard, automatic tool-output
filters, a shared personal browser, overlapping browser controllers, unpinned
`npx` execution, broad MCP catalogs, and eager global frontend installation are
rejected. Reasons and recovery triggers are maintained in
`docs/operations/codex/REJECTED-DEFERRED.md`.
