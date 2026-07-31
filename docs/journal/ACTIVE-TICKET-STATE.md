# Active ticket state

**Ticket:** N4.22 — source-bound Stage 4 remediation campaign control
**Stage:** 4
**One question:** Which exact 21 source-bound checks remain, what evidence closes each, in what dependency order, and can the campaign proceed from this container without mislabeling local evidence as staging proof?
**Result:** complete; campaign blocked by genuine external prerequisites; Stage 4 remains blocked

## Authoritative inputs

- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`
- `/workspace/clervo-next/AGENTS.md`
- `/workspace/clervo-next/.codex-autonomy-policy.md`
- Owner-authorized Stage 4 remediation campaign prompt dated 2026-07-31
- Clean `main` at `0060277`

## TypeScript conclusion

- Workspace TypeScript: `7.0.2`.
- Repository target: `ES2023`.
- `npm run typecheck`: passed under Node.js 24.18.1.
- Repository change needed: no. The Mac warning is an older VS Code language-service mismatch; select the workspace TypeScript version.

## Exact blocker state

- `infra/staging/stage4-remediation-campaign.json` contains all 21 identifiers in the exact order returned by the Stage 4 verifier.
- Every blocker records required source-bound evidence, current missing evidence, dependency group, and local/staging/owner boundary.
- Every remaining check requires staging evidence; repository-local proof cannot reduce the count.
- Queue: N4.23 lawful supply/access; N4.24 live product pipeline; N4.25 browser/cache/security; N4.26 benchmark/monitoring/cost; N4.27 payable route; N4.28 final zero-blocker verification.
- N4.23 and N4.27 are `blocked_external`; dependent groups were not started.

## Genuine external blocker evidence

- Target staging service is private/authenticated `clervo-stage4-slice-staging` in `bloxsniper-prod/us-central1`.
- No active gcloud account is selected; access-token generation fails.
- Application-default credentials are absent.
- Credential environment-variable names present: none.
- Supported future names: `GOOGLE_APPLICATION_CREDENTIALS`, `CLERVO_STAGING_IDENTITY_TOKEN`.
- One bounded unauthenticated health request returned HTTP 403, 304 bytes, SHA-256 `7e003d2f633eeeb1b8536c627a1adeb02fe4eaa9487e631f91d8e9515043c5fe`.
- No deployment, staging mutation, authenticated log read/smoke, provider call, evidence promotion, payment, or USDC spend occurred.

## Exact owner intervention required

1. Activate an authorized gcloud identity or mount approved ADC with Cloud Run, Cloud Build, Artifact Registry, and log read/deploy access for the existing project/region; Codex must not change IAM.
2. Approve two independent production/resale-eligible general-Web suppliers and their terms, replacing public Nominatim; approve Common Crawl content use or a legally cleared archive alternative.
3. Provide selected provider credential environment-variable names and mounted values.
4. Authorize staging facilitator/payee configuration and any separately bounded real-settlement proof required by `deployed_paid_route`; current authority prohibits facilitator/wallet transactions and USDC spend.
5. Provide an approved staging alert-delivery channel and its credential environment-variable name if Cloud Logging is insufficient.

## Files changed

- `infra/staging/stage4-remediation-campaign.json`
- `scripts/verify-stage4-campaign.mjs`
- `tests/contract/n4.22.test.mjs`
- `package.json`
- `scripts/run-acceptance.mjs`
- `docs/tickets/N4.22.md`
- `docs/evidence/N4.22-stage4-remediation-campaign.md`
- `docs/journal/ACTIVE-TICKET-STATE.md`
- `docs/journal/BUILD-JOURNAL.md`
- `README.md`

## Tests and exact results

- `npm run typecheck`: passed.
- `npm run test:n4.22`: passed 5/5.
- `npm run lint`: passed 182 source/contract files.
- `npm run verify:stage4-campaign`: passed with 21 exact blockers and N4.23 `blocked_external`.
- Canonical `npm test`: passed 205/205, 36 schemas / 67 fixtures, `acceptance: PASS`, zero external network calls during acceptance, and 0 USDC spent.
- `npm run verify:stage4-exit`: verifier execution passed; decision `blocked`, 21 blockers, reference pattern false, Stage 5 authorization false.
- `./scripts/verify-clean-room-boundary.sh` and final `git diff --check`: passed.

## Network, credentials, deployment, and cost

- External host contacted: `clervo-stage4-slice-staging-jbtbib4yqa-uc.a.run.app` once.
- Credential values used/read/printed: none.
- Credential environment-variable names involved: none present; supported future names are `GOOGLE_APPLICATION_CREDENTIALS` and `CLERVO_STAGING_IDENTITY_TOKEN`.
- Deployment/staging mutation: none.
- Provider/crawling/payment/wallet/facilitator activity: none.
- USDC spent: 0.

## Exact next action

- Owner supplies the five named prerequisites. Resume with N4.23 only after authenticated staging access and the lawful production-supplier decision are available.

## Out of scope / parking lot

- N4.23–N4.28 until prerequisites exist; Stage 5; production deployment; IAM/billing changes; real payment; public Nominatim resale; unapproved Common Crawl commercial use; unrelated pillars/refactors.

## Stop condition

- Commit N4.22, synchronize the writable external master plan, report the genuine external blockers and exact owner actions, and stop. Do not begin N4.23 or Stage 5.
