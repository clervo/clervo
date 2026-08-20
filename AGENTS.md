# Clervo engineering rules

The owner's current explicit task determines the work. Runtime behavior and the
current catalog and generated discovery artifacts determine product truth;
roadmaps, milestones, screenshots, old proofs, and chat history do not.

Codex owns ordinary engineering decisions and should continue through
implementation, testing, and documentation without waiting on unrelated
commercial decisions. The owner decides provider/commercial approval, pricing,
legal and contractual matters, branding and business direction, and any real
spend. Missing owner decisions block only the action that needs them.

Permanent safety requirements:

- Never expose secrets, credentials, wallet material, customer payloads, or
  authentication files in source, logs, commits, or reports.
- Preserve payment idempotency, replay and reconciliation correctness. Unknown
  settlement state fails closed; never authorize or spend real money without
  explicit owner approval.
- Preserve wallet isolation, Sandbox isolation, SSRF and redirect protection,
  exact-model identity, hard resource and cost bounds, cleanup, and truthful
  failure reporting.
- Do not destructively change unrelated infrastructure, production or customer
  data, IAM, billing, domains, registries, backups, or other projects.
- Public availability claims must match the externally reachable system and
  generated catalog. Source presence or a local test is not availability.

Use specialist skills only when the current task matches their stated purpose.
Avoid repeated research or planning once the facts needed to implement are
known. Preserve unrelated work and make the smallest coherent change.
