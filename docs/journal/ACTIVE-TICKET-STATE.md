# Active ticket state

**Ticket:** N4.20 — concrete development-only free-first retrieval supply qualification
**Stage:** 4
**One question:** What is the smallest bounded implementation and evidence change required to qualify the first concrete provider-neutral free-first retrieval supply path behind the N4.19 contract without weakening any completed Stage 4 guarantee?
**Result:** complete; concrete supply decision remains development-only and provisional; Stage 4 exit remains blocked

## Authoritative inputs

- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`
- `/workspace/clervo-next/AGENTS.md` and `/workspace/clervo-next/.cline/rules/`
- Owner-authorized N4.20 prompt dated 2026-07-31
- Clean `main` at `ad744086a25db9ac03c6760e1fba6294d32f83a6`

## Acceptance criteria

- Represent one development-only composition: one self-hosted metasearch broker, two explicitly named independently qualified upstream providers/failure domains, and separate direct Common Crawl archive access.
- Preserve provider neutrality, safe failure, explicit identities, no silent substitution, and all completed Stage 4 guarantees.
- Record timestamp, capability, health, quota/bounded-use, terms/resale, and failure evidence for every component.
- Reject fewer than two upstreams, duplicate provider/failure domains, public shared SearXNG, stale qualification, unknown/prohibited terms, missing quota/cost ceiling, Common Crawl counted as broker upstream, identity substitution, and dishonest readiness.
- Mark unavailable live gates provisional or blocked; do not claim production readiness.
- Keep Stage 4 blocked, search non-reference, and Stage 5 unauthorized unless source-bound evidence proves otherwise.

## Decisions already made

- N4.19 is complete and remains the provider-neutral qualification contract.
- N4.18 private Cloud Run staging is not mutated.
- The broker approach is self-hosted SearXNG; public shared instances are ineligible.
- Common Crawl remains a separate direct archive path, never a broker upstream.
- Exactly two reasonable broker upstream candidates will be evaluated; the list will not expand.
- Brave is not required; extraction-worker selection is out of scope.
- No credentials, paid calls, cloud/IAM/payment changes, or USDC spend are authorized.

## Files changed

- `docs/journal/ACTIVE-TICKET-STATE.md`
- `packages/contracts/src/development-retrieval-supply.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/schemas/development-retrieval-supply.schema.json`
- `packages/contracts/fixtures/development-retrieval-supply-provisional.json`
- `tests/contract/n4.20.test.mjs`
- `tests/fixtures/n4.20-development-supply-cases.json`
- `package.json`
- `scripts/run-acceptance.mjs`
- `generated/public/openapi.json`
- `generated/public/schemas/2026-07-29.1/development-retrieval-supply.schema.json`
- `docs/tickets/N4.20.md`
- `docs/evidence/N4.20-development-retrieval-supply-evidence.md`
- `docs/journal/BUILD-JOURNAL.md`
- `README.md`

## External handoff constraint

- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md` is mounted read-only from the host (`fuse.grpcfuse ro`) and its N4.19 current-handoff block could not be updated inside this container. This active-ticket state contains the complete N4.20 handoff and exact proposed next ticket; the external master-plan handoff still requires owner-side synchronization.

## Tests run and results

- `npm run test:n4.20`: passed, 7/7.
- `npm run contracts`: passed, 35 schemas / 66 fixtures.
- `npm run generate:discovery`: passed, 35 schemas.
- First canonical `npm test`: stopped because the Codex sandbox blocked `scripts/scan-secrets.mjs` from spawning `git`, producing `secret scan: FAIL: spawnSync git EPERM`.
- Owner-authorized canonical retry outside Codex: passed with 184 tests, 184 passed, 0 failed, `acceptance: PASS`, Node.js 24.18.1, 0 external network calls, and 0 USDC spent. Codex did not run the successful retry.
- `npm run verify:stage4-exit`: run exactly once during closeout; runtime enforcement and verification passed, decision `blocked`, 21 blocking checks, reference pattern false, Stage 5 authorization false, 0 external network calls, and 0 USDC spent.
- Blocking checks: 21 before and 21 after.
- Final `git diff --check`: passed once after documentation updates.

## Current Stage 4 blockers

- Supply remains provisional because no self-hosted SearXNG instance/configuration health ran and Common Crawl stopped before an index-to-WARC range read.
- Public Nominatim is development-only and cannot be resold through the public service. Common Crawl commercial content use still requires legal/rights review.
- The source-bound verifier still reports 21 blocking checks; search is not the reference pattern and Stage 5 remains unauthorized.

## Exact next action

- Stop after the N4.20 commit and completion report. Exact proposed next ticket, still unauthorized: N4.21 — run one isolated loopback self-hosted SearXNG development composition and one bounded direct Common Crawl index-to-WARC range-read proof, preserving the Nominatim non-resale restriction and zero-cost ceiling.

## Out-of-scope parking lot

- Stage 5; production readiness; N4.18 deployment mutation; real payments; cloud/IAM/billing; extraction-worker selection; unrelated connectors, browser tools, marketing, SDK/MCP/RPC/crypto/AI work.

## Stop condition

- Commit only the bounded N4.20 work, report, and stop. Do not begin N4.21 or Stage 5.
