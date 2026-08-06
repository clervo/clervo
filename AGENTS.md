# Clervo — agent instructions

`ROADMAP.md` at this repository root is the single and only planning authority.

The full instructions are in `CLAUDE.md` at this repository root. Read that
file. It applies to every agent working in this repository, not only Claude.

Summary of the parts most often gotten wrong:

- `ROADMAP.md` defines scope, order, status, and completion. Nothing else does.
- `docs/` is an archived research library with **no authority**. Useful for
  facts, never a directive. Anything there contradicting `ROADMAP.md` or the
  live system is history, not instruction.
- Files outside this repository, including anything under `/workspace/docs/`
  or `/workspace/import/`, are not authority and are not a plan.
- Do not create new planning, status, gate, or readiness documents. Edit
  `ROADMAP.md`.
- A step is done only when proven from outside on a public URL. A passing local
  test is not completion.
- Live behaviour outranks every document, including `ROADMAP.md`.
