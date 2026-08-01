# MCP inventory

| Server | Profiles | Pin/endpoint | Capability and permission | Decision |
| --- | --- | --- | --- | --- |
| OpenAI Developer Docs | engineering, studio-maintenance | `https://developers.openai.com/mcp` | current official OpenAI documentation; read-oriented; optional startup | retained |
| Context7 | engineering, design | `https://mcp.context7.com/mcp` | two tools for library resolution/current documentation; remote network; optional startup | retained |
| Chrome DevTools MCP | browser-debug only | npm `1.6.0`, Apache-2.0 | 29 DOM, console, network, storage, memory, performance, Lighthouse and screenshot tools; local disposable browser only | retained |
| Figma | design, disabled | `https://mcp.figma.com/mcp` | official design context; OAuth and file access required; writes require approval mode | prepared, disabled |

The final discovery probe measured OpenAI Developer Docs at 638.435 ms with 5
tools and 3,244 schema bytes, Context7 at 295.443 ms with 2 tools and 4,934
schema bytes, and Chrome DevTools at 353.536 ms with 29 tools and 22,608 schema
bytes. An intentionally absent server failed with `ENOENT` in 1.641 ms without
affecting the other probes. Full schemas are in
`docs/evidence/codex-studio/raw/mcp`.

Context7 local package `3.2.5` was removed after its stdio process closed under
noninteractive pipe transport; the official remote transport then passed.
No API key is recorded. If the anonymous service later requires authentication,
disable it or complete the human authentication procedure without placing the
key in Git.

Playwright MCP is rejected: the official project recommends CLI/skills for
coding-agent workflows where deterministic operation and lower token overhead
matter. Visual QA therefore uses the pinned library and Docker image. Storybook
MCP is deferred until a real compatible Storybook project exists. GitHub MCP is
deferred in favor of deterministic `git`/future `gh`; broad filesystem, shell,
cloud, database, and memory MCPs duplicate safer CLIs or exceed current scope.

Removal: set `enabled = false` or remove the server table in the relevant source
profile, run the installer, and rerun health/discovery. Chrome DevTools package
removal also requires deleting the exact dependency and regenerating the
lockfile. Recovery is the inverse using the reviewed pin.
