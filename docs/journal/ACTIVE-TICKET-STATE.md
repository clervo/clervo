# Active ticket state

**Ticket:** N4.19 — provider-neutral lawful free-first retrieval supply
**Stage:** 4
**One question:** What is the smallest provider-neutral contract and qualification change required so Clervo search is not locked to paid Brave while preserving all completed Stage 4 guarantees?
**Result:** complete; focused tests pass; canonical acceptance blocked by preserved pre-existing owner file

## Acceptance criteria

- Brave is optional rather than required.
- Ready search supply cannot depend on one provider.
- A self-hosted metasearch broker is not ready without at least two independently qualified upstream engines.
- Public SearXNG instances cannot become production supply.
- Common Crawl remains a separate failure domain.
- Exactly one extraction worker may be selected behind the existing safety boundary.
- Deferred tools cannot become core dependencies.
- Named providers and sources cannot be silently substituted.
- Existing Stage 4 provenance, normalization, deduplication, ranking, citations, synthesis, benchmarks, deployment evidence, stage-exit verification, and safety contracts remain unchanged unless one named compatibility edit is essential.
- Focused adversarial tests pass; canonical acceptance is run once and any owner-state blocker is recorded without mutation.

## Decisions already made

- N4.18 is complete and will not be reopened.
- Brave is an optional qualified adapter, not a launch dependency.
- Self-hosted SearXNG may serve only as a provider-neutral broker; every enabled upstream must be qualified independently.
- Public shared SearXNG instances are not production supply.
- Common Crawl stays an independent archive/corpus failure domain, not a SearXNG engine.
- Evaluate exactly one extraction worker: Crawl4AI first; select it only if the existing bounded safety contract fits.
- ScrapeGraphAI, Agent Browser/browser-use-style tools, Agent Reach, Scrapling, and similar tools are deferred and will not be installed or made dependencies.
- Stage 5 is out of scope and unauthorized.

## Files inspected

- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md` current handoff and pre-N4.19 amendment
- `/workspace/clervo-next/package.json`
- `/workspace/clervo-next/packages/contracts/schemas/retrieval-qualification.schema.json`
- `/workspace/clervo-next/packages/contracts/schemas/qualification-result.schema.json`
- `/workspace/clervo-next/packages/contracts/fixtures/retrieval-qualification-valid.json`
- `/workspace/clervo-next/packages/contracts/fixtures/retrieval-qualification-false-ready-invalid.json`
- `/workspace/clervo-next/tests/contract/n4.17.test.mjs`
- `/workspace/clervo-next/tests/contract/n4.18.test.mjs`
- Existing owner diff in `/workspace/clervo-next/README.md`
- `/workspace/clervo-next/packages/contracts/src/retrieval.ts`
- Official SearXNG engine-settings and limiter documentation
- Official Common Crawl index/archive and terms pages
- Official Crawl4AI repository; two official documentation paths returned 404

## Files changed

- `docs/journal/ACTIVE-TICKET-STATE.md`
- `packages/contracts/src/retrieval-supply.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/schemas/retrieval-supply.schema.json`
- `packages/contracts/fixtures/retrieval-supply-valid.json`
- `packages/contracts/fixtures/retrieval-supply-false-ready-invalid.json`
- `tests/contract/n4.19.test.mjs`
- `package.json`
- `scripts/run-acceptance.mjs`
- `docs/tickets/N4.19.md`
- `docs/evidence/N4.19-retrieval-supply-evidence.md`
- `docs/journal/BUILD-JOURNAL.md`
- `README.md` (owner N4.18 changes preserved; N4.19 text added)

## Tests still required

- `npm run test:n4.19`: passed 6/6
- `npm test`: run once; lint/typecheck passed, then pre-existing owner file failed clean-room boundary
- Final diff/schema verification only; do not rerun canonical acceptance

## Exact next action

- Verify generated schema/discovery artifacts, exact diff, and repository status; then commit N4.19 and stop.

## Out of scope / parking lot

- N4.18 changes or evidence reopening
- Stage 4 redesign
- Stage 5
- Public shared SearXNG production use
- Installation of SearXNG, Crawl4AI, Scrapling, ScrapeGraphAI, Agent Browser, browser-use, Agent Reach, or similar repositories
- Provider secrets, billable calls, wallet/payment changes, public deployment, IAM, or cloud mutation
- Deferred candidate feature claims

## Stop condition

- N4.19 focused tests pass, canonical acceptance is invoked once with any preserved owner-state blocker recorded, evidence/handoff are updated once, the bounded commit is created, and work stops before the next ticket.