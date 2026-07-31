# Active ticket state

**Ticket:** N4.24 — Independent live-federation route and connected local retrieval pipeline
**Stage:** 4 — Search vertical slice remediation
**One question:** Can Clervo connect an independent lawful live-federation route to the focused-index route through one bounded deterministic local retrieval pipeline without identity substitution or unsafe source use?
**Result:** complete; repository-verified only

## Authoritative inputs

- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`
- `AGENTS.md`, `.codex-autonomy-policy.md`, and the N4.22 source-bound Stage 4 campaign
- N4.23A selection evidence, N4.23B focused-index evidence, and existing retrieval/fetch/extraction contracts

## Decision and implementation

- Implemented exact route identity `clervo.live-federation.v1` with independent provider, adapter, health, circuit, and failure-domain identities.
- Selected Wikimedia Action API and Crossref REST metadata as the smallest qualified open-data set; Common Crawl CDXJ/index is metadata-only provisional and archived bodies fail closed.
- Added direct current-page retrieval through the existing URL/DNS/robots/redirect/MIME/byte/deadline controls and a provisional internal-only Crawl4AI `0.9.2` / Playwright `1.61.0` fallback selected only by deterministic JavaScript-required evidence.
- Connected focused and live routes with deterministic rewrite, parallel execution, deadlines/cancellation, route identity, normalization, exact/near deduplication, freshness/authority/relevance/diversity ranking, locale propagation, extraction provenance, evidence-offset citations, prompt-injection isolation, deterministic schema/replay, and honest degradation.
- Completed local `search.web`, `web.fetch`, and `web.extract`; `search.answer` remains preview-only and `research.report` unavailable.

## Evidence and validation

- `npm run test:n4.24`: 12/12 passed; `npm run test:n4.23b`: 8/8 passed.
- Contracts passed 40 schemas / 75 fixtures; discovery generated 40 schemas; build/typecheck passed.
- Official terms/documentation review was bounded and read-only; no provider API or current publisher page was probed. No staging evidence or `stagingVerified` value changed.

## Cost, network, and credentials

- Official hosts contacted: Wikimedia Foundation, MediaWiki, Crossref, Common Crawl, and Common Crawl Index documentation only.
- Third-party search-provider API cost: USD 0.000000. Infrastructure cost: USD 0.000000. Credentials/secrets: none inspected, used, or printed. USDC spent: 0.
- No deployment, cloud/IAM/billing, wallet/facilitator, payment, or legacy-runtime action occurred.

## Exact next action

- N4.25 only after this commit and explicit continuation: production-isolate/qualify the provisional Crawl4AI fallback, durable cache, and staging security controls. Do not begin N4.26, N4.27, N4.28, Stage 5, or any expansion stage in this run.

**Commit:** N4.24 atomic implementation commit; final hash is recorded in the closeout report.

## Stop condition

- Commit N4.24 atomically and stop. Stage 4 remains blocked on 21 source-bound checks; reference-pattern and Stage 5 authorization remain false.
