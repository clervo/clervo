# Authentication-needed checklist

No authentication is needed for repository-local engineering, installed-profile
startup, visual QA, or the retained anonymous documentation probes.

Human-only actions remain intentionally unresolved:

- Figma: owner completes OAuth and names the exact authorized file/project;
  only then may the disabled server be enabled. Default MCP writes remain gated.
- GitHub: owner completes device/browser authentication only when an exact task
  needs remote issues, pull requests, releases, or private repositories.
- Google Cloud: owner supplies the exact project/task authority and completes
  browser/device authentication if needed. Production, IAM and billing changes
  require separate explicit authorization.
- Any provider, production, wallet or payment system: unavailable by design;
  exact ticket, environment, amount/cost ceiling, recipient, secret handling,
  evidence, reconciliation and stop authority are prerequisites.

Never paste tokens into chat, committed files, shell history, logs, screenshots,
or MCP configuration. Prefer device/OAuth flows and secret-manager references.
If an authentication variable is required later, scope it to the single process
and confirm it is absent from evidence before commit.
