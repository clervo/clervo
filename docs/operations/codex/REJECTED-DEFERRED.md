# Rejected and deferred tools

## Rejected or removed

| Candidate | Decision | Reason and reconsideration trigger |
| --- | --- | --- |
| Serena | rejected | representative native `rg` was 4.184 ms versus 64.422 ms for compiler-backed semantic lookup, with identical four locations; repository is small and TypeScript API is already present. Reconsider only for measured cross-language/navigation failures. |
| RTK | rejected | automatic output filtering could become the only evidence or omit failure context. Deterministic summaries saved 75.80% and 87.53% while preserving raw logs. Reconsider only with lossless canonical capture and a measured interaction gain. |
| Caveman | rejected/not installed | no independent benefit proved beyond native tools; evidence-quality risk fails the user's explicit gate. |
| Playwright MCP | rejected/not installed | overlaps the deterministic Playwright CLI and adds MCP schema/context; official guidance favors CLI/skills for coding agents. |
| local Context7 server 3.2.5 | removed | noninteractive stdio transport closed immediately; official remote MCP passed with two tools and lower local maintenance. |
| broad filesystem/shell/memory/cloud/database MCPs | rejected | duplicate transparent CLIs or create excessive write/auth/data exposure. |
| Obsidian | deferred | Git-controlled docs already provide authority, review and recovery; no unique current value. |

## Deferred until exact need

| Candidate | Trigger |
| --- | --- |
| Figma MCP | owner OAuth plus exact file authority; endpoint is prepared disabled |
| shadcn CLI/MCP/skill 4.16.1 | authorized real frontend ticket that needs component generation; review registry writes first |
| Storybook and Storybook MCP | compatible real Storybook project exists under an authorized ticket |
| Impeccable | design ticket proves its reviewed patterns outperform the compact Clervo design skill without catalog overhead |
| GitHub CLI/MCP | exact remote workflow and human authentication are required; prefer CLI |
| Google Cloud CLI repair | exact cloud task exists; install supported user-local archive or repair confinement without weakening AppArmor |
| kubectl, Helm, OpenTofu/Terraform | an authorized infrastructure ticket names cluster/state/provider boundaries |
| PostgreSQL client | an authorized database diagnostic requires it and credentials can remain safe |
| yq | structured YAML edits exceed existing deterministic Node/Python capabilities |
| Trivy/Semgrep or other scanners | an authorized container/IaC/source gate demonstrates coverage beyond npm, compiler/lint, secret and boundary checks |
| Next.js, React, TypeScript additions, Tailwind, Storybook, Vitest, RTL, axe | future product ticket; do not add globally or to this repository preemptively |
| Sharp, FFmpeg, GSAP/Motion, Three.js/R3F, Lottie, Rive, Spline | future media/design ticket selects one justified stack and performance budget; avoid duplicate animation systems |

Removal proof is the committed lock/profile inventory: rejected packages are
absent, Figma is disabled, and visual QA contains no MCP table. Restore any
candidate only through the upgrade/pinning procedure and a fresh representative
benchmark; never enable it from this register alone.
