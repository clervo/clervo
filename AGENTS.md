# Clervo — agent instructions

The full instructions are in `CLAUDE.md` at this repository root. Read that
file. It applies to every agent working in this repository, not only Claude.

Summary of the parts most often gotten wrong:

- Current product truth comes from directly observed deployed behavior and the
  canonical catalog/launch-state data.
- `ROADMAP.md` is a **public product-direction document**, not an internal
  operations log, deployment runbook, recovery authority, payment ledger, or
  private milestone tracker.
- Work selection comes from the owner's explicit instruction and the concrete
  issue, pull request, branch, or scoped task in front of you.
- `docs/` is research/history unless the current task explicitly names a file as
  input. Historical material does not override live behavior or the canonical
  registry.
- Do not place deployment IDs, secret versions, wallet material, rollback
  targets, private recovery state, spending authorizations, supplier
  credentials, or similar operational details in public planning documents.
- A capability is public only when the externally reachable system proves the
  claimed lifecycle. A passing local test or source-code presence is not enough.
- If a production-sensitive action needs private context that is unavailable,
  stop before that action rather than reconstructing it from historical public
  artifacts.
