# Clervo Loop Rescue

Use when Cline repeatedly plans, searches, or compacts without implementing.

## Rescue sequence

1. Stop.
2. Inspect only:
   - current handoff;
   - active ticket;
   - `git status --short`;
   - `git diff --stat`;
   - files already modified.
3. Write `docs/journal/ACTIVE-TICKET-STATE.md`.
4. Identify exactly one next file edit.
5. Make the edit.
6. Run one focused test.
7. If no exact edit can be named, report one blocker and stop.
8. Do not run another broad repository search.
