# Clervo Next engineering instructions

## Product direction

- The current active priority is the one-time supply-foundation program in
  `docs/product/CLERVO-SUPPLY-FOUNDATION.md`. Keep the product roadmap paused
  until that document's completion criteria and final sourcing-gap evaluation
  are satisfied. This is a continuous engineering project, not a ticket gate.
- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md` defines product scope,
  roadmap order, correctness, security, truthful claims, and launch gates.
- The roadmap's stages and ticket labels are an implementation checklist, not
  authorization boundaries. Read the current status and relevant sections;
  do not reread the complete roadmap or historical evidence for ordinary work.
- Continue through the next unfinished active-priority work automatically.
  Completing a task, ticket, stage, test run, journal entry, or commit is not a
  stop point.
- Proven contracts, tests, deployed behavior, prices, receipts, and observed
  results outrank plans, copy, assumptions, and memory.

## Engineering workflow

- Inspect Git state before editing and preserve unrelated work.
- Make the smallest coherent production-quality change, including refactoring
  when needed. Fix ordinary failures without requesting approval.
- Use focused build, typecheck, unit, integration, and smoke checks while
  implementing. At a full-stage boundary run one consolidated stage check, fix
  meaningful failures, and rerun affected checks.
- Do not rerun the entire historical suite, rebuild proof packages, or append an
  extensive journal entry after every small change.
- Keep commits small enough to recover or review, then continue. Record only
  meaningful decisions, stage outcomes, external effects, costs, and risks.
- Research current primary sources when a material technical or provider choice
  depends on changing facts. Prefer a clear technical winner and keep moving.

## Owner-only blockers

Pause only when progress genuinely requires the owner to:

- choose between materially different paid providers with no clear winner;
- supply a missing account or credential, or complete login, CAPTCHA, MFA,
  email confirmation, or account approval;
- approve real spending or sign a wallet transaction;
- authorize an irreversible production, customer-data, or unrelated
  infrastructure operation; or
- make a legal, contractual, branding, pricing, or business decision that
  cannot be inferred technically.

Continue independent local work when only a later external step is blocked.

## Permanent safety and truth boundaries

- Never expose secrets, credentials, wallet material, customer payloads, or
  authentication files in chat, source, logs, commits, reports, or test output.
- Never spend real money or sign a real payment without explicit owner approval.
  Unknown payment or settlement state fails closed and is reconciled before any
  new authorization or retry.
- Never destructively modify unrelated infrastructure, production/customer
  data, legacy projects, backups, IAM, billing, domains, or registries.
- Treat `/workspace/x402-platform`, older Clervo runtimes, and legacy state as
  read-only evidence. Never import, execute, mount, link, or connect them.
- Preserve `docs/decisions/ADR-0001-clean-room-repository-boundary.md` and run
  `./scripts/verify-clean-room-boundary.sh` after boundary-relevant changes.
- Maintain payment idempotency, secret protection, sandbox isolation, SSRF and
  redirect protection, resource cleanup, hard cost ceilings, and provider terms.
- Never weaken schemas, delete useful tests, fabricate provider results or proof,
  hide failures, or claim preview/unavailable work is production-ready.
- Keep contracts, lifecycle, prices, receipts, discovery, documentation, and
  public claims synchronized with proven behavior.
