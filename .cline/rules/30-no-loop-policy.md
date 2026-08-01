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
3. State the exact next file and edit.
4. Perform that edit or report one genuine owner-only blocker.
5. If the task still repeats, continue from the current diff rather than restarting discovery.

Keep planning concise and implementation-oriented.
