# Context and command-output budget

The goal is correct context, not maximum context.

## Before reading

1. Inspect the current roadmap item and current diff.
2. Name the exact missing fact.
3. Read only the smallest relevant line range or file.

## Working limits

- No recursive full-workspace search.
- No search returning more than 100 matches.
- No terminal output above 120 lines.
- No reading an entire file above 500 lines unless the task requires it.
- No repeated search using equivalent terms after the relevant files are known.
- No more than two repository-discovery commands before editing begins.
- After compaction, do not rediscover the repository. Read the current summary and diff.

Use targeted paths, `git diff`, `git grep`, `rg` with exact directories, `sed` line ranges, and test-name filters.
