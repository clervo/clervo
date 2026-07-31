# Active ticket state

**Ticket:** N4.23B — Focused owned-index route
**Stage:** 4 — Search vertical slice remediation
**One question:** Can Clervo implement a bounded, lawful, persisted focused index behind the selected Scrapling 0.4.12 and Meilisearch 1.51.0 identities without weakening the existing retrieval boundary?
**Result:** complete; repository-verified only

## Authoritative inputs

- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`
- `AGENTS.md`, `.codex-autonomy-policy.md`, and the N4.22 source-bound Stage 4 campaign
- N4.23A selection evidence and the existing retrieval/fetch/extraction contracts

## Decision and implementation

- Implemented route identity `clervo.focused-index.v1` with independent persisted-index, health, and failure-domain identities.
- Admission requires an approved domain or exact explicit seed, an approved content-use policy, and a non-denylisted domain; unresolved policy fails closed.
- Sitemap XML and RSS/Atom discovery are bounded and deterministic. Existing Clervo URL/DNS/robots/redirect/MIME/byte/deadline controls remain the fetch boundary.
- Scrapling `0.4.12` is an extraction-only worker with no network, impersonation, stealth, proxy, CAPTCHA, or browser surface.
- Meilisearch `1.51.0` is a persisted community-feature adapter with analytics disabled, required master key, exact version/provider/health/failure identity, and honest unavailable status.
- Clervo owns canonicalization, content fingerprints, exact/near-duplicate suppression, freshness, deterministic ranking, deletion, expiry filtering, recrawl, rebuild, and provenance.

## Evidence and validation

- Focused N4.23B tests cover explicit seeds, sitemap/feed discovery, robots denial, denylist/removal, duplicate and near-duplicate suppression, stale/expired records, pause/resume, quota/concurrency, private targets, redirect/MIME/byte rejection, index/worker unavailable, corrupted frontier state, provider identity substitution, dishonest health, and deterministic replay/ranking.
- The pinned Scrapling worker was smoke-tested against a bounded in-memory HTML fixture using a temporary Scrapling `0.4.12` environment; it made no network request.
- Stage 4 remains blocked on 21 source-bound checks; no `stagingVerified` field, reference-pattern authorization, or Stage 5 authorization changed.

## Cost, network, and credentials

- Third-party search-provider API cost: USD 0.000000.
- Focused fixtures use loopback/injected transport only; no external provider or cloud call was made.
- Credentials/secrets: none inspected, used, or printed. No wallet, facilitator, payment, deployment, IAM, billing, or USDC action occurred; USDC spent: 0.

## Exact next action

- N4.24 only after this commit and explicit continuation: implement the independent live-federation path. Do not begin N4.25, N4.26, N4.27, N4.28, Stage 5, or any expansion stage in this run.

## Stop condition

- Commit N4.23B as one atomic commit and stop. Stage 4 remains blocked and local proof must not be promoted to staging evidence.
