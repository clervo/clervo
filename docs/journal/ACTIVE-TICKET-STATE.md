# Active ticket state

**Ticket:** N4.27T — frozen-result failure remediation

**Ticket result:** completed with one failed isolated qualification preserved;
cleanup complete

**Starting commit:**
`8af7b665531fff75f021603f68cd335f8b4ba8af`

**Frozen implementation commit:**
`c54db9e7923e26ad414cec5a061d139a2d51ab78`

## Authority and result

The owner explicitly authorized the exact N4.27T cloud plan after granting the
configured deployer access. The one-run Job executed once on the exact
digest-pinned image. Infrastructure execution succeeded with zero container
restarts, but the mandatory qualification gate failed: developer registry
retrieval passed 10/10 and browser execution passed 0/20. All 12 JavaScript and
eight hostile fixtures returned `browser_process_failed:`. The result is
immutable and no rerun is authorized.

The final result is hash-bound in
`docs/evidence/n4.27t/qualification-closeout.v1.json`. N4.27S final evidence and
every earlier sealed artifact remain immutable.

## Cost, cleanup and payment truth

- The Kubernetes namespace, GKE cluster, Artifact Registry repository and
  image were synchronously deleted. Fresh exact-prefix inventory found no
  residual instance, disk, address, firewall, cluster, repository, alert or
  pending operation.
- Active incremental exposure is USD 0/day. The cluster existed for about
  1,033 seconds; estimated gross ticket cost is USD 0.04854 (reported as USD
  0.05) against the USD 5 ceiling. Actual provider billing could not be
  inspected because the execution environment blocks that command.
- Provider API cash cost was USD 0. No wallet, payment, mock x402 or USDC action
  ran; the 0.03 USDC reserve remains untouched.
- No IAM, billing, secret, production, customer, public-ingress, legacy or
  unrelated-resource mutation ran.

## Product truth

- Search remains `preview`; AI, Sandbox, RPC, Prediction and Crypto
  Intelligence remain `unavailable`.
- Five Stage 4 blockers remain. Search is not commercially competitive,
  production-qualified or the reference pattern.
- N4.28 and Stage 5 remain unauthorized.

## Exact next dispatch

N4.27U — isolated Chromium process-launch failure repair — is the smallest
bounded repair created by the failed qualification. A fresh local dispatch may
use synthetic development-only fixtures to reproduce and diagnose the nonroot
Chromium launch failure, repair only the proven launcher or diagnostic
boundary, freeze a new independent pre-split requalification procedure,
validate locally, commit and stop.

N4.27U must not open, reuse, rerun or tune against the N4.27T corpus, labels,
evaluator, result or once-only execution. It has no cloud authority. Do not
begin N4.28, mock x402, Stage 5, production, real payment, later product cores
or legacy mutation.
