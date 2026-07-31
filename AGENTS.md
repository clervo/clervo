# Clervo Next agent instructions

1. Read `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md` before changing this repository.
2. Execute only the exact ticket named in the plan's current handoff.
3. Treat `/workspace/x402-platform` and all older Clervo runtimes as read-only evidence, never dependencies.
4. Do not copy legacy modules, connect legacy state, expose secrets, make billable calls, or spend USDC.
5. Preserve the mandatory directory boundaries documented in `docs/decisions/ADR-0001-clean-room-repository-boundary.md`.
6. Run `./scripts/verify-clean-room-boundary.sh` after every repository-boundary change.
7. Append evidence to `docs/journal/BUILD-JOURNAL.md`; do not rewrite earlier entries.
8. Stop after completing and recording one ticket.

## Autonomous container execution

Read and follow `.codex-autonomy-policy.md`.

Inside the dedicated Clervo Docker container, routine repository commands
do not require owner approval. The master plan, active ticket, stage gates,
payment restrictions, secret rules, and explicit stop conditions remain
binding.
