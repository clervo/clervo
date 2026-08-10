# Clervo — agent instructions

## Authority and current truth

This repository is public. Do not use public documentation as a place to store
private operational continuity.

Current product lifecycle and availability are established from **directly
observed deployed behavior** and the canonical catalog/launch-state data in this
repository. Those sources outrank planning prose, old screenshots, archived
proof, chat history, and memory.

`ROADMAP.md` is a public product-direction document. It is **not** an internal
operations log, deployment runbook, recovery authority, payment ledger, or
private milestone tracker.

Work selection comes from the owner's explicit instruction and the concrete
issue, pull request, branch, or scoped task being worked on. Do not infer a new
production operation merely because historical roadmap material mentions one.

Files under `docs/` are research and history unless a current task explicitly
names one as input. They do not override observed behavior or the canonical
registry.

Do not create new public planning/status files containing deployment IDs,
secret versions, wallet material, rollback targets, private branch recovery
state, internal spending authorizations, supplier credentials, or other
operational details that do not need to be public.

## Truth

Status is observed from deployed behavior, never asserted only in prose. Proven
contracts, deployed behavior, prices, receipts, and observed results outrank
plans, copy, assumptions, and memory.

A step is complete only when the evidence required by that step exists. Public
availability claims require external proof from a clean client; a passing local
test alone is not evidence that a public capability is available.

If an operation requires private production context that is not available in
the current task, stop before the production-sensitive action rather than
reconstructing private state from historical public artifacts.

## Safety boundaries

These are permanent.

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
