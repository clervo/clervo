# Clervo Ticket Runner

Use this skill when implementing one numbered Clervo ticket.

## Procedure

1. Read the current master-plan handoff and exact ticket.
2. Check `git status --short`.
3. Read `docs/journal/ACTIVE-TICKET-STATE.md` if it exists.
4. State one concise implementation plan.
5. Inspect no more than the exact contract, implementation, tests, and evidence files required.
6. Edit the smallest surface.
7. Run focused tests.
8. Run the ticket acceptance command.
9. Update ticket, journal, README, and master-plan handoff only as required.
10. Commit and stop.

## Failure rules

- Maximum two serious repairs for one external provider.
- Do not compensate for a failed candidate by redesigning the whole platform.
- Preserve evidence, disable/defer the candidate, and continue with the selected bounded route.
- Never begin the next ticket automatically.
