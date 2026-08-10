# Clervo continuous engineering and safety

These rules are always active.

1. Read `CLAUDE.md` at the repository root for repository-wide truth and safety
   rules. `ROADMAP.md` is public product direction only, not an internal
   operations log or execution queue.
2. Current product lifecycle and availability come from directly observed
   behavior and the canonical catalog/launch-state data. `docs/` is
   research/history unless the current task explicitly names a file as input.
3. Working product behavior and current contracts outrank prose.
4. Continue automatically through ordinary local tasks, repairs, tests, and
   commits within the concrete owner/task scope. Do not invent a new production
   operation from historical planning material.
5. Preserve owner-owned and unrelated uncommitted files.
6. Never expose secrets, spend money, sign payments, or irreversibly mutate
   production, customer, or unrelated infrastructure without explicit owner
   action.
7. Preserve provider terms, payment idempotency, sandbox isolation, SSRF
   protection, cleanup, and cost controls.
8. Record uncertainty honestly and never promote preview, fixture, local, or
   failed behavior into a stronger public claim. Public availability requires
   evidence from the externally reachable system.
9. Keep private operational continuity out of public planning documents,
   including credential/secret-version data, wallet material, deployment IDs,
   rollback targets, private recovery state, spending authorizations, and
   supplier credentials.
