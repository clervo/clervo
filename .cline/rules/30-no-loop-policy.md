# No-loop policy

A loop is present when any two of these occur twice without meaningful implementation progress:

- the same plan is restated;
- Stage 4 or the workspace is searched broadly again;
- the same files are reread without a named missing fact;
- context compacts and repository discovery restarts;
- provider candidates are surveyed again;
- the agent promises implementation but performs another planning cycle.

When a loop is detected:

1. Stop all broad inspection.
2. Run only `git status --short` and a bounded `git diff --stat`.
3. Create or update `docs/journal/ACTIVE-TICKET-STATE.md`.
4. State the exact next file and edit.
5. Perform that edit or declare one concrete blocker.
6. If the task still repeats, stop and request a new focused task. Do not continue consuming context.

Planning is limited to one concise plan per task.
