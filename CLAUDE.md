# Clervo — agent instructions

## Authority

`ROADMAP.md` at this repository root is the single and only planning authority.
Read it first. Follow it in order.

No other document in this repository defines status, scope, order, gates, or
readiness. If any other file disagrees with `ROADMAP.md`, `ROADMAP.md` wins.
If `ROADMAP.md` disagrees with observed live behaviour of the deployed system,
**live behaviour wins and `ROADMAP.md` is corrected.**

Files under `docs/` are an archived research and history library. They are kept
because the knowledge in them was paid for and may be useful: supplier
findings, terms research, competitor notes, past design reasoning. Read them
when you need a fact.

**They carry no authority.** Nothing in `docs/` may be treated as a current
directive, gate, rule, authorization boundary, or status claim, regardless of
how confidently it is written. Anything there that contradicts `ROADMAP.md` or
the live system is history, not instruction.

Documents outside this repository — including any file under `/workspace/docs/`
or `/workspace/import/` — are not authority and must not be treated as a plan.

Do not create new planning, status, gate, authority, or readiness documents.
When plan or status changes, edit `ROADMAP.md`.

## Truth

Status is observed from the deployed system, never asserted in prose. A
hand-written status claim is a bug. Proven contracts, deployed behaviour,
prices, receipts, and observed results outrank plans, copy, assumptions, and
memory.

A step is complete only when it is proven from outside: a public HTTPS URL,
reachable from a machine that has never heard of us, returning a real result.
A passing local test is not completion.

## Safety boundaries

These are permanent and are not subject to the roadmap.

- Never expose secrets, credentials, wallet material, customer payloads, or
  authentication files in chat, source, logs, commits, reports, or test output.
- Never spend real money or sign a real payment without explicit owner
  approval. Unknown payment or settlement state fails closed and is reconciled
  before any new authorization or retry.
- Maintain payment idempotency, secret protection, sandbox isolation, SSRF and
  redirect protection, resource cleanup, hard cost ceilings, and provider terms.
- `ai.clervo.dev` and its model gateway run on the Clervo VM. That runtime,
  configuration, data, and network binding are protected infrastructure. Never
  stop, delete, replace, reconfigure, or include it in cleanup without explicit
  owner authorization for that exact action.
- Never destructively modify unrelated infrastructure, production or customer
  data, legacy projects, backups, IAM, billing, domains, or registries.
- Treat `/workspace/x402-platform`, older Clervo runtimes, and legacy state as
  read-only evidence. Never import, execute, mount, link, or connect them.
- Never fabricate provider results or proof, hide failures, weaken schemas, or
  claim preview or unavailable work is production-ready.

## Owner-only decisions

Pause only when progress genuinely requires the owner to: supply an account or
credential, complete a login, approve real spending, sign a wallet transaction,
authorize an irreversible production operation, or make a legal, contractual,
pricing, or branding decision that cannot be inferred technically.

Continue independent work when only a later external step is blocked.

## Working style

Inspect git state before editing and preserve unrelated work. Make the smallest
coherent production-quality change. Keep commits small. Do not rerun the entire
historical suite or append a long journal entry after every change.
