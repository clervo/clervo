# Clervo — agent instructions

## Authority

`ROADMAP.md` at this repository root is the single planning authority. Read it
first and follow it in order.

No other document in this repository defines current status, scope, order,
gates, or readiness. If another file disagrees with `ROADMAP.md`, the roadmap
wins. If the roadmap disagrees with directly observed behavior of a deployed
system, **observed behavior wins and the roadmap is corrected.**

Files under `docs/` are an archived research and history library. Use them for
facts and historical context, not as current directives. Material outside this
repository is not project authority unless the owner explicitly makes it so.

Do not create parallel planning, status, gate, authority, or readiness
documents. When plan or status changes, edit `ROADMAP.md`.

## Truth

Status is observed from deployed behavior, never asserted only in prose. Proven
contracts, deployed behavior, prices, receipts, and observed results outrank
plans, copy, assumptions, and memory.

A step is complete only when the evidence required by that step exists. Public
availability claims require external proof from a clean client; a passing local
test alone is not evidence that a public capability is available.

## Safety boundaries

These are permanent and are not subject to the roadmap.

- Never expose secrets, credentials, wallet material, customer payloads, or
  authentication files in chat, source, logs, commits, reports, or test output.
- Never spend real money or sign a real payment without explicit owner
  approval. Unknown payment or settlement state fails closed and is reconciled
  before any new authorization or retry.
- Maintain payment idempotency, secret protection, sandbox isolation, SSRF and
  redirect protection, resource cleanup, hard cost ceilings, and provider
  terms.
- Treat production runtimes, credentials, network configuration, payment
  infrastructure, and unrelated systems as protected infrastructure. Do not
  stop, delete, replace, reconfigure, or include them in cleanup without the
  authorization required for that exact action.
- Never destructively modify unrelated infrastructure, production or customer
  data, legacy projects, backups, IAM, billing, domains, or registries.
- Never fabricate provider results or proof, hide failures, weaken schemas, or
  claim preview or unavailable work is production-ready.

## Owner-only decisions

Pause only when progress genuinely requires the owner to supply an account or
credential, complete a login, approve real spending, sign a wallet transaction,
authorize an irreversible production operation, or make a legal, contractual,
pricing, or branding decision that cannot be inferred technically.

Continue independent work when only a later external step is blocked.

## Working style

Inspect git state before editing and preserve unrelated work. Make the smallest
coherent production-quality change. Keep commits small. Use focused validation
during implementation and broader validation at meaningful boundaries.