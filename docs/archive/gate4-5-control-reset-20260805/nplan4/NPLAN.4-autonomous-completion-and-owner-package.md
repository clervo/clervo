# NPLAN.4 autonomous completion and owner-package evidence

- Evaluated: 2026-08-01
- Starting commit: `bc92aa2a3309815d3008220fe2a284cf22111dc6`
- Final commit: the commit containing this evidence
- Authority effect: repository control-plane governance only
- Product/runtime/lifecycle/Stage 4 evidence effect: none
- Search lifecycle: `preview`
- Other five pillar lifecycles: `unavailable`
- Stage 4 blockers: 5 before / 5 after
- Search reference pattern / Stage 5 / First Revenue Release: false / false /
  false
- Real payment authorized/executed: false / false
- Provider/infrastructure cost: USD 0.000000
- USDC spent: 0; 0.03 reserve untouched
- Active incremental exposure: USD 0/day
- Cloud/IAM/billing/deployment/production/domain/registry/customer/legacy effects:
  none
- Secrets, credentials, customer payloads, wallet keys, seeds, and signatures:
  none inspected, used, or printed
- Frozen/sealed/once-only artifacts: none inspected, modified, executed, or
  authorized for rerun

## Owner mandate and adjustment

The owner explicitly directed Codex to work toward the truthful all-six roadmap
without repeated per-ticket approval, treat terminal failures as repair work,
create one exhaustive list of owner-only prerequisites, safely prepare the
receiver wallet and x402 settlement path, use USD 0 paid API dependency, and
avoid hallucinated readiness or completion.

NPLAN.4 implements that objective as bounded standing program authority rather
than unlimited side-effect authority. Each worker handles one exact ticket and
stops; a fresh cycle may admit the smallest next exact local ticket after clean
closeout. External effects remain tied to finite owner-prepared inputs and
separate explicit authority until trusted signed-manifest enforcement exists.
Product completion means all eight ordered evidence/hash-bound gates genuinely
passed; it never means or promises that the owner will become rich.

## Control-plane result

The machine policy and state now enforce:

1. exact ticket before implementation;
2. one active ticket lease and one ticket per worker cycle;
3. clean predecessor closeout, stage order, scope, truth, evidence, terms, cost,
   owner-input/authority, cleanup, and unknown-outcome admission checks;
4. fresh-cycle dispatch without another owner approval;
5. expected red/green in-scope development inside the active ticket, with a new
   exact repair ticket for terminal closeout failure, post-commit regression, or
   failed qualification;
6. at most two consecutive same-cause repairs before an exact architecture
   decision;
7. immutable failed/sealed/once-only evidence and a new independent pre-split
   procedure for any later qualification;
8. USD 0 mandatory paid/eventually-paid/trial-to-bill third-party API cash
   spend, USD 0 unmanifested external spend, and explicit infrastructure costs;
9. no skipped gate, invented owner input, silent provider/claim/price change, or
   fabricated proof; and
10. generic future-state validation rather than hard-coding NPLAN.4 forever;
11. release completion derived from eight ordered canonical JSON evidence
    files whose actual bytes, SHA-256 bindings, verifier/gate metadata,
    verification times, ancestor subject commits, lifecycle, and stage agree; and
12. workspace external/x402 files are non-authoritative and `authorized` is
    rejected until owner-controlled signed verification and mediation exist.

The standing policy lives outside `packages/contracts/schemas`, because current
discovery generation publishes every product contract schema. Internal control-
plane templates therefore cannot leak into OpenAPI or SDK projections.

## Owner-only prerequisite audit

The human-readable package records 29 exact responsibilities deduplicated into
25 machine intake groups. They cover:

- legal merchant identity, commercial/legal/tax/refund decisions, privacy/data
  residency/retention, public support/security/privacy/legal/abuse/billing and
  incident contacts;
- brand/domain/trademark rights, Git/CI/package registries, DNS/TLS/email,
  production database/queue/secret store, alerts/on-call, and legacy decisions;
- cloud project/identity/resource allowlist, gross/daily/monthly/residual cost,
  credits/billing, MFA/WIF/OIDC, cleanup, and unknown outcome;
- Search content rights/takedown, AI license/compute/data policy, Sandbox AUP,
  RPC broadcast/provider scope, Prediction terms/resolution, and Crypto source/
  risk scope;
- pricing/SLA/support/launch decisions, external customer consent/useful result/
  independent payment, and optional public-proof permission;
- receiver, separate payer, restricted signer, facilitator, network, asset,
  amount, fees, expiry, evidence, reconciliation, alert, and kill-switch inputs;
  and
- owner-controlled Ed25519 trust-root fingerprint/location, detached signing,
  independently signed revocation, rotation/recovery, and external signing
  service inputs required before unattended external admission.

Actual secret values stay in an environment secret manager or read-only secret
boundary. The ignored owner manifest contains only public values, decisions,
limits, attestations, and opaque references. Filled owner inputs and prepared
non-authoritative external/x402 inputs have operational structure validators;
default templates remain `missing`/`not_authorized`. The latter validators
intentionally reject `authorized`.

The immediate product blocker is the N4.27T cloud phase: exact cloud project,
identities, resource/name allowlist, gross/daily/monthly ceilings, no-IAM/
billing boundary, credential reference, billing alert, cleanup, and unknown-
outcome procedure plus separate explicit owner authority. Unattended external
admission also needs the owner-controlled trust root and a later trusted
supervisor implementation. Neither blocks N4.27T repository-local work.

## x402 wallet and settlement boundary

Official current x402 documentation was read from:

- <https://docs.x402.org/core-concepts/http-402>;
- <https://docs.x402.org/core-concepts/wallet>;
- <https://docs.x402.org/core-concepts/facilitator>;
- <https://docs.x402.org/getting-started/quickstart-for-sellers>; and
- <https://github.com/x402-foundation/x402>.

The official flow uses v2 `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and
`PAYMENT-RESPONSE` headers; the seller declares a public `payTo` address and the
buyer signs. The template therefore never requests or accepts the receiver
private key. The payer must be a different public address and its reference must
resolve to a restricted wallet/KMS/HSM/hardware/unix signer service—not a raw
key file, environment dump, command argument, chat value, Git value, or log.

The dormant Stage 15 input pins the exact environment, release, product,
operation, useful-result contract, payer/receiver, x402 v2 scheme, CAIP-2
network, USDC contract/mint and six decimals, atomic amount, total/fee/
infrastructure ceilings, facilitator identity/URL/terms, expiry, request hash,
idempotency, nonce, ledger, receipt, explorer evidence, alert, kill switch,
reconciliation, and stop. It permits at most one execution, at most 0.01 USDC,
and preserves at least 0.02 USDC. Unknown settlement permits reconciliation of
the same identity only and no new authorization. Owner-funded proof is plumbing
evidence, not revenue or demand.

Because the workspace is agent-writable, this JSON input cannot authorize a
payment. The current validator rejects `authorized`; Stage 15 also needs
separate explicit owner authority until detached signature verification,
independent revocation, actual bindings, and mediated signer/payment enforcement
exist outside the writable workspace.

## Independent review and repair before closeout

An independent read-only review found five pre-commit gaps:

1. the first validator version hard-coded the NPLAN.4/N4.27T bootstrap state;
2. completed owner/external/x402 manifests lacked full authorized-state checks;
3. the payer signer reference could have pointed to a raw key file;
4. the secondary alert path lacked a resource and credential reference; and
5. evidence, journal, active closeout, and dispatch completion were not yet
   written.

The bootstrap, signer, alert, and closeout defects were repaired. A second
independent security review then proved the proposed authorized workspace
manifests were forgeable and found three additional truth/validation gaps:
completion could be asserted from lifecycle/stage booleans without passing
evidence, future-dated or incomplete external envelopes could pass, and several
mandatory x402 evidence flags were not enforced.

The design now fails closed rather than claiming those files are authority.
Prepared external/payment inputs check validity time, exact non-wildcard
resources, runtime/credential coordinates, cleanup deadline, budgets, evidence,
separation, restricted signer references, and completeness, but `authorized`
is rejected. Completion derives from eight ordered canonical evidence files,
actual byte hashes, verifier/gate metadata, and ancestor subject commits. A
future exact security ticket and owner trust-root input are required before
unattended external admission.

A final external-security re-audit found that the generic state enum still
accepted `ready_trusted_exact_authority` while trusted enforcement was fail
closed. Both cloud and payment readiness values are now explicitly rejected in
that state and covered by adversarial tests.

During initial red/green construction, the focused verifier also failed on one
property-name mismatch and three overly literal authority-text regexes. Those
ordinary in-scope draft defects were corrected before terminal validation. No
canonical acceptance, Stage 4 verifier, external action, or product gate was
triggered by those failures.

## Artifact bindings

- Completion policy SHA-256:
  `45bcbf3ac83933fba754ab796567bc69d37cef96add60fca4a531cdd483498f8`
- Closed dispatch state SHA-256:
  `48ba3b9a658610ea7ff8386f1e520d8f464229ac62406a7dbdd5e180b37b2f00`
- Owner-input template SHA-256:
  `66430de120cd7bf298ac72418e8fc59ab5eebfddcfc8072b9a70059a2d641138`
- External-action template SHA-256:
  `0f282f24f9f6a868d0d7d61c558e76fed44aa91ea0eb0400fb6172638ac86187`
- x402 template SHA-256:
  `073ae6b53d73999e443c2719c3f8851e4a8515a0587ea27ba7447a2d1c2af911`
- Decision SHA-256:
  `2e48332e18a6fe6fbc8191c150fbbd31202af706d9278ebdc18138576d9a4b4e`
- Ticket SHA-256:
  `75c62c966e11a8d9cb66acc966ab24952f41324b09b02e6e89f580f83ce34875`
- External master-plan SHA-256:
  `70f8422eaf20d90e3a1be7eeb83b9cfe4cd205fed19c4de470c32edc42ededb9`

## Validation

- `npm run verify:autonomous-completion`: passed; 25 intake groups, per-ticket
  owner approval false, mandatory API cash spend USD 0, trusted external
  admission fail closed, payment false, next local ticket N4.27T.
- `npm run test:nplan.4`: passed 5/5, including future generic transitions,
  paid-API/gate/repair drift, forgeable-authority rejection, future validity,
  runtime/credential/cleanup/exact-resource checks, secret/reference rejection,
  restricted payer signer, payer/receiver separation, forged cloud/payment
  readiness, every payment evidence flag, ceilings, one execution, unknown
  quarantine, and dishonest completion.
- NPLAN.1, NPLAN.2, and NPLAN.3 regressions: passed 2/2, 2/2, and 5/5.
- `npm run typecheck`: passed under Node.js 24.18.1.
- `npm run lint`: passed across 259 source/contract files.
- `npm run verify:product-scope`: passed.
- `npm run scan:secrets`: passed; zero secret values printed.
- `npm run verify:boundary`: passed; zero legacy runtime dependencies.
- JSON parse for policy, state, and all three templates: passed.
- Active-authority transition/contradiction scan: passed.
- `git diff --check`: passed.

Canonical `npm test` and `npm run verify:stage4-exit` did not run. NPLAN.4 is a
governance ticket and did not alter Stage 4 bindings or product runtime.

## Exact transition and stop

Commit NPLAN.4 atomically, verify the exact commit and clean tree, and stop this
worker. In a fresh dispatch cycle, admit N4.27T repository-local work under its
recorded scope. Keep N4.27S final evidence read-only and use a new independent
pre-split procedure. Do not begin cloud work without exact owner-prepared inputs
and separate explicit authority; unattended admission also needs the signed
trust boundary. Do not begin N4.28, mock x402, Stage 5, production, real payment, later pillars,
or legacy mutation inside NPLAN.4 or N4.27T.
