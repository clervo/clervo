# Active ticket state

**Ticket:** N4.21 — isolated SearXNG loopback and direct Common Crawl WARC proof
**Stage:** 4
**One question:** Can one repository-controlled loopback SearXNG development composition and one independent direct Common Crawl index-to-WARC range path execute within strict identity, byte, freshness, safety, truthfulness, and zero-USDC bounds?
**Result:** complete; development execution verified; production remains unauthorized; Stage 4 exit remains blocked

## Authoritative inputs

- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`, synchronized to N4.20 before ticket execution
- `/workspace/clervo-next/AGENTS.md`
- `/workspace/clervo-next/.codex-autonomy-policy.md`
- Owner-authorized N4.21 prompt dated 2026-07-31
- Clean `main` at `f003b90`

## Acceptance criteria met

- Ran SearXNG at exact official commit `057a77168d3175ce2e42e5b10f46a8df073886d5` in a dedicated virtual environment/process bound only to `127.0.0.1:18888`.
- Configured exactly two development engines and failure domains: Wikipedia / Wikimedia and OpenStreetMap public Nominatim / OSMF Nominatim.
- Preserved public Nominatim's non-resale restriction and kept production readiness structurally false.
- Performed one accepted exact Common Crawl index lookup and one exact index-derived 954-byte WARC range retrieval.
- Recorded timestamps, hosts, statuses, byte ceilings, hashes, exact identities, failure domains, and safe failure.
- Added deterministic fixtures/tests for every named N4.21 failure mode.
- Updated only the genuinely strengthened Stage 4 evidence text; no staging-verification boolean changed.
- Ran focused validation, contract validation, discovery generation, boundary/diff checks, canonical acceptance once, and the separate Stage 4 verifier command once.

## Decisions and constraints preserved

- The self-hosted proof used process/virtual-environment isolation because the outer container denied both privileged Docker mount namespaces and rootless subordinate UID/GID mapping. No container proof is claimed.
- SearXNG exposed no non-loopback listener and was stopped after two bounded broker requests.
- The OpenStreetMap engine used one-result Nominatim settings with extra tags disabled, preventing optional Wikidata enrichment from becoming a third upstream.
- The first Common Crawl index HTTP 502 failed closed and authorized no range. One repair succeeded; no further provider repair was attempted.
- No N4.18 deployment, product route, credential, cloud/IAM/billing state, payment, wallet, facilitator, or production resource changed.
- Public Nominatim is not resale-qualified; Common Crawl origin-content rights remain legal-review gated; general-Web quality remains unproven.

## Files changed

- `infra/development/n4.21-searxng/settings.yml`
- `packages/contracts/src/retrieval-execution-proof.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/schemas/retrieval-execution-proof.schema.json`
- `packages/contracts/fixtures/retrieval-execution-proof-valid.json`
- `tests/contract/n4.21.test.mjs`
- `tests/fixtures/n4.21-retrieval-execution-cases.json`
- `package.json`
- `scripts/run-acceptance.mjs`
- `generated/public/openapi.json`
- `generated/public/schemas/2026-07-29.1/retrieval-execution-proof.schema.json`
- `infra/staging/stage4-exit-evidence.json`
- `docs/tickets/N4.21.md`
- `docs/evidence/N4.21-loopback-and-warc-evidence.md`
- `docs/journal/ACTIVE-TICKET-STATE.md`
- `docs/journal/BUILD-JOURNAL.md`
- `README.md`

## Tests and exact results

- `npm run test:n4.21`: passed, 9/9 (rerun after final source binding change; passed 9/9).
- `npm run lint`: passed, 180 source/contract files.
- `npm run contracts`: passed, 36 schemas / 67 fixtures.
- `npm run generate:discovery`: passed, 36 schemas.
- `./scripts/verify-clean-room-boundary.sh`: passed, zero legacy dependencies.
- `npm test`: invoked exactly once; passed 200/200 with `acceptance: PASS`, Node.js 24.18.1, 0 external network calls during acceptance, and 0 USDC spent.
- `npm run verify:stage4-exit`: invoked exactly once as the separate closeout command; passed with decision `blocked`, 21 blocking checks, reference-pattern authorization false, Stage 5 authorization false, 0 external network calls, and 0 USDC spent.
- Final `git diff --check`: passed after documentation updates.

## Current Stage 4 blockers

- The two live development mechanics are not connected to Clervo product execution or staging.
- Public Nominatim cannot be resold; Common Crawl content requires legal/rights review.
- General-Web recall, freshness, ranking, quality, quota, long-run availability, operating cost, monitoring, and hard provider spend stops are not proven.
- Twenty-one source-bound checks remain blocking; search is not the reference pattern and Stage 5 is unauthorized.

## Exact next action

- Stop after the N4.21 commit and completion report. No next ticket is authorized or inferred. Do not begin N4.22 or Stage 5.

## Out of scope / parking lot

- N4.22; Stage 5; production readiness; N4.18 deployment mutation; product adapter wiring; public Nominatim resale; Common Crawl legal clearance; extraction-worker selection; real payment; cloud/IAM/billing; unrelated refactors.

## Stop condition

- Commit only bounded N4.21 work, update the external master-plan handoff, report completion, and stop.
