# CLI and tool inventory

## Retained host tools

| Tool | Version | Use |
| --- | --- | --- |
| Codex CLI | 0.146.0 | profiles, sandbox, hooks, rules, MCP, agent execution |
| Node.js | 24.18.1 | repository and studio scripts |
| npm | 10.9.8 | locked dependency restoration/audit |
| Git | 2.43.0 | versioned evidence and recovery |
| Docker Engine | 29.7.1 | isolated browsers/toolchains |
| Docker Compose | 5.3.1 | authorized local stacks |
| Docker Buildx | host plugin | deterministic multi-platform build preparation |
| jq | 1.7 | structured evidence inspection |
| ShellCheck | 0.9.0 | shell safety checks |
| ripgrep | host version | default fast repository navigation |

The VM retains its existing AppArmor controls. There is no supported sudo path
in this no-new-privileges session. The installed gcloud snap is not usable
under current confinement and was not repaired by weakening security.

## Pinned studio packages

| Package | Version | License | Unique use |
| --- | --- | --- | --- |
| `@playwright/test` | 1.62.1 | Apache-2.0 | deterministic Chromium/Firefox/WebKit control |
| `@axe-core/playwright` | 4.12.1 | MPL-2.0 | accessibility rules in browser context |
| `lighthouse` | 13.4.1 | Apache-2.0 | performance/accessibility audit and Web Vitals evidence |
| `chrome-devtools-mcp` | 1.6.0 | Apache-2.0 | browser-debug diagnostics only |
| `@modelcontextprotocol/sdk` | 1.30.0 | MIT | direct MCP discovery/failure-isolation probe |
| `svgo` | 4.0.2 | MIT | deterministic future authorized SVG optimization |

The lockfile has 235 installed packages and `npm audit` reports zero known
vulnerabilities at qualification time. Browser binaries and system libraries
come from `mcr.microsoft.com/playwright:v1.62.1-noble` pinned to
`sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.

## Upgrade and pinning policy

Never update an installed copy directly. In one authorized maintenance change:

1. verify the official project/release, license, maintenance, permissions,
   install scripts, transitive changes, and immutable artifact;
2. change one explicit version or digest in repository sources;
3. regenerate the lock without lifecycle scripts, inspect the diff, install,
   and run npm audit;
4. rerun health, MCP schemas/startup, browser isolation, visual QA, security,
   secret and clean-room checks;
5. retain failed attempts, update inventories/evidence, commit, and stop.

Rollback by reverting the version-controlled pin, rerunning the installer, and
verifying hashes. Never use floating `latest`, unreviewed install scripts, or
routine `npx -y` execution in the persistent studio.
