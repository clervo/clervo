# Candidate capability evaluation

Reviewed 2026-08-01. Versions are pinned only when retained. Deferred tools
must be rechecked at the future ticket because maintenance, license and install
behavior can change.

## Engineering and operations

| Candidate | Official source / license | Install and permission surface | Result |
| --- | --- | --- | --- |
| Native Codex | OpenAI Codex repository/docs; Apache-2.0 CLI | existing host CLI; profile sandbox, hooks, rules, MCP | retained as primary |
| Serena | `github.com/oraios/serena`; MIT | Python/`uvx` semantic MCP, LSP processes, broad repository reads and large tool schema | rejected: measured native + TS API covers current repository faster and more transparently |
| Context7 | `github.com/upstash/context7`; MIT server | remote HTTPS MCP; documentation query text leaves VM | retained remote for engineering/design; local package removed after stdio failure |
| OpenAI docs | `developers.openai.com`; official managed MCP | remote read-oriented MCP | retained where OpenAI work is relevant |
| RTK / command filters | candidate identity and output semantics are not sufficiently stable for canonical evidence | shell wrapping/automatic filtering | rejected; local deterministic summaries retain raw output |
| Caveman | no independently proved advantage for this repository | command interception/compression risk | rejected and not installed under the explicit mission gate |
| GitHub CLI | `github.com/cli/cli`; MIT | user-local binary, OAuth/device login, remote GitHub writes | deferred until an exact remote workflow; native Git retained |
| Google Cloud CLI | Google Cloud SDK; Google SDK terms | current snap is confinement-broken; cloud OAuth and broad APIs | repair deferred; no AppArmor weakening and no cloud task/auth |
| Docker / BuildKit / Compose | Docker/Moby/BuildKit/Compose official projects; Apache-2.0 components | existing privileged daemon socket; host-level container effects | retained only in guarded host profiles |
| kubectl | `kubernetes.io`; Apache-2.0 | standalone pinned binary; cluster credentials and mutation | deferred until exact cluster authority |
| Helm | `helm.sh`; Apache-2.0 | standalone pinned binary; chart rendering and cluster writes | deferred until exact deployment authority |
| OpenTofu | `opentofu.org`; MPL-2.0 | standalone binary; state/provider/cloud mutation | preferred over Terraform if future ticket permits; deferred |
| Terraform | HashiCorp; BUSL 1.1 current distribution | standalone binary; state/provider/cloud mutation | deferred; license and need must be re-evaluated |
| PostgreSQL client | PostgreSQL project; PostgreSQL License | apt/container client; database credentials and writes | deferred until exact database diagnostic |
| jq | `jqlang/jq`; MIT | existing host CLI; local data transform | retained |
| yq | `mikefarah/yq`; MIT | standalone binary; YAML transforms | deferred because Node/Python and reviewable edits suffice |
| ShellCheck | `koalaman/shellcheck`; GPL-3.0 | existing host CLI; read-only shell analysis | retained |
| Trivy | Aqua Security; Apache-2.0 | binary/container; registry/file reads and vulnerability DB network updates | deferred until container/IaC gate |
| Semgrep | Semgrep project; LGPL-2.1 core plus service/rule terms | local scan; optional remote rules/telemetry | deferred until source gate proves added coverage |
| Gitleaks | `gitleaks/gitleaks`; MIT | local history/worktree scan | not added; repository scanner already covers the required secret boundary |
| profiling/diagnostics | existing `time`, `/proc`, Docker inspect/top/logs, Codex debug | read-only host metadata unless profiling a live process | retained natively; no daemon/MCP needed |
| Obsidian | Obsidian proprietary application | GUI/plugin vault access, separate authority store | deferred; Git documentation is canonical |

## Design, browser and visual QA

| Candidate | Official source / license | Result |
| --- | --- | --- |
| Impeccable | `github.com/pbakaus/impeccable`; Apache-2.0 | reviewed, deferred; compact Clervo design skill avoids another catalog until a real ticket proves value |
| Figma MCP | official Figma remote endpoint/terms | prepared disabled; requires owner OAuth and exact file authority |
| shadcn | `ui.shadcn.com`; MIT CLI, registry/network and repository writes | version 4.16.1 audited, deferred until authorized frontend work |
| Storybook / MCP | `storybook.js.org`; MIT project; MCP is preview and project-scoped | deferred until a real compatible Storybook project exists |
| Chrome DevTools MCP | ChromeDevTools official repository; Apache-2.0 | retained 1.6.0 only in browser-debug; telemetry/update checks disabled, network headers redacted |
| Playwright | Microsoft official project; Apache-2.0 | retained CLI/library 1.62.1 and immutable browser image |
| Playwright MCP | Microsoft official project; Apache-2.0 | rejected because CLI is deterministic and materially smaller in context |
| axe-core Playwright | Deque official project; MPL-2.0 | retained 4.12.1 |
| Lighthouse | Chrome official project; Apache-2.0 | retained 13.4.1 |
| design tokens/CSS variables | Web platform primitives | retained as workflow guidance; no product token change |

## Frontend and media readiness

These remain project-local future-ticket choices, not global installs:

| Capability | License/terms reviewed | Decision |
| --- | --- | --- |
| Next.js, React | MIT | defer to authorized frontend ticket |
| TypeScript | Apache-2.0 | already repository-pinned for current code; no new frontend stack |
| Tailwind, Vitest, React Testing Library | MIT | defer |
| Sharp | Apache-2.0 | defer; use when image pipeline exists |
| FFmpeg | LGPL/GPL depending build | defer; select a compliant pinned build per media task |
| SVGO | MIT | retained CLI library 4.0.2 for deterministic SVG optimization only |
| Motion | MIT | preferred first animation candidate when needed; do not combine systems by default |
| GSAP | vendor license/terms require ticket-time review | defer; do not duplicate Motion |
| Three.js, React Three Fiber | MIT | defer until WebGL experience and performance budget are authorized |
| Lottie web | MIT | defer until asset/runtime need is proved |
| Rive runtime | MIT runtime; editor/service terms separate | defer |
| Spline | proprietary editor/service terms | defer |
| WebGL/shader profiling | browser DevTools/native APIs | ready through browser-debug; no framework needed |

Supply-chain rule: use official release channels, exact versions or immutable
digests, lockfiles, no unreviewed lifecycle scripts, license/permission review,
representative tests, startup/schema measurement, raw evidence retention, and a
documented removal path. An entry here is not authority to install or use it.
