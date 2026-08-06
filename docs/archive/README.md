# Archive — research and history, not authority

Everything under this directory is kept because the knowledge in it was paid
for: supplier findings, terms research, competitor analysis, benchmark results,
qualification evidence, past design reasoning, and the history of how decisions
were reached. Read it freely when you need a fact.

**None of it carries authority.**

Nothing in this directory is a current directive, gate, rule, authorization
boundary, execution order, or status claim — regardless of how confidently it
is written, how recently it was updated, or how official its filename sounds.
Several files here describe themselves as the controlling authority. They were,
once. They are not now.

The single planning authority is `ROADMAP.md` at the repository root. The
operating instructions are `CLAUDE.md` at the repository root.

If a file here contradicts `ROADMAP.md` or the observed behaviour of the
deployed system, the file is history and the live system is truth.

## Why this exists

The repository accumulated four documents each describing itself as
authoritative, with mutually contradictory descriptions of what was finished.
One of them pointed at a plan stored outside version control, which existed in
two diverging copies. An agent reading these could not determine which was
current, and filled the gap by inventing status. Product readiness was asserted
in prose for months while the deployed system disagreed.

Deleting the files would have destroyed genuinely useful research. Keeping them
in place would have preserved the ambiguity. So they are kept and demoted.

## What is still live

- `ROADMAP.md` — scope, order, status, completion. The only planning authority.
- `CLAUDE.md` — operating instructions, safety boundaries.
- `AGENTS.md` — pointer to `CLAUDE.md`.
- `docs/OPERATIONS.md` and `docs/operations/` — runbooks for operating the
  deployed system. Procedures, not plans.
- `docs/evidence/` and `docs/decisions/` — machine-readable artifacts and ADRs
  referenced by tests. Facts about what happened, not instructions about what
  to do next.

## Rule for future work

Do not add planning, status, gate, or readiness documents anywhere in this
repository. When the plan or status changes, edit `ROADMAP.md`. When a document
stops being true, move it here.
