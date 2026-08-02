# Current engineering state

Updated 2026-08-02 at the account-switch boundary. This is a compact resumable
handoff, not an authorization gate. Continue automatically after reading it.

## Active work

Stage 7 secure sandbox is the current roadmap priority. The local product core,
contracts, lifecycle, cleanup, artifact quarantine, cost controls, verified-image
registry, runner, and synthetic red-team gate are implemented. Stage 8 N8.1's
bounded multi-chain policy is also already committed, but finish Stage 7 before
continuing Stage 8.

The production runner `sandbox.nodejs-24` is qualified at digest
`sha256:0cfdf789b798d623cee9ec071c32e584443f9331c73fc7be9bd20f7ae1c243af`.
Google Cloud Build provenance is signed at SLSA build level 3, Google Artifact
Analysis found zero vulnerabilities, a fresh ClamAV scan found zero infections,
and the SPDX SBOM is hash-bound in the approved-image registry. Preserve the
dedicated Artifact Registry repository and its immutable history.

## Live qualification result

The first ephemeral GKE Standard qualification cluster ran Kubernetes
`1.36.2-gke.2281000`, enabled Agent Sandbox, and used a separate tainted gVisor
node. The runner was non-root with zero effective capabilities, no mounted
service-account token, no sensitive environment keys, no host sockets, and
blocked internal and public egress.

The configuration failed closed because the GKE metadata endpoint still issued
a workload token. Kubernetes default-deny and a trial Calico metadata deny did
not block GKE's metadata interception. No token value was logged or retained.
The rest of the live red-team suite was deliberately not run after this gate
failed. Product/runtime lifecycle remains `unavailable`; do not claim otherwise.
The concise evidence is in
`docs/evidence/sandbox/gke-qualification-attempt.v1.json`.

## Next actions

1. **Completed:** the named ephemeral qualification cluster was deleted and
   independently confirmed absent. Billing reconciliation remains pending
   because Google cost reporting is delayed.
2. Test the `agents.x-k8s.io/v1alpha1` `Sandbox` custom resource boundary on a
   new bounded qualification cluster. Do not assume it differs from a gVisor Pod.
3. If metadata remains reachable, qualify dedicated gVisor execution hosts with
   host-enforced metadata firewalling and no workload identity available to jobs.
4. Only after metadata denial passes, run all ten live containment probes,
   cleanup/orphan checks, and cost reconciliation; then synchronize runtime
   lifecycle truth and continue through Stage 8 onward without stopping.

## Preserved boundaries

The supply-foundation program is complete. The external RPC resale-permission
blocker remains isolated. `ai.clervo.dev` is live on protected Clervo VM
infrastructure and must never be included in sandbox/cloud cleanup. No real
payment, wallet signing, production mutation, or customer-data operation has
been performed in this work.
