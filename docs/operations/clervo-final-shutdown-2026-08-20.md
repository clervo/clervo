# Clervo final shutdown — 2026-08-20

## Scope and authority

The owner explicitly stopped Clervo indefinitely and authorized deletion of
Clervo-only infrastructure in the shared `bloxsniper-prod` project. The project,
billing, project-wide APIs, `bloxsniper-r13`, and every BloxSniper dependency
were excluded. Unknown resources were not changed.

This record contains no credential values, wallet material, customer payloads,
or authentication files.

## Live ownership classification

| Class | Live resources and evidence |
| --- | --- |
| `CLERVO_ONLY` | The three `clervo-*` Cloud Run services; `clervo-production-postgres`; `clervo-sandbox-production` and its node pools, MIGs, templates, nodes, load balancer, NEG, addresses, firewall rules, and service discovery artifacts; three `clervo-*` Artifact Registry repositories; the Clervo package and object prefix in shared Cloud Run source storage; all 130 Cloud Build source archives created after the first Clervo build; 28 `clervo-*` secrets; four non-Devbox Clervo service accounts and their exact IAM bindings; the Clervo log metric, alert, and notification channel; two obsolete default-VPC Clervo firewall rules; two legacy Clervo bounty-verifier snapshots; the Cloudflare Workers, routes, tunnels, and empty R2 bucket listed below. The Devbox VM, its two disks, four source-disk snapshots, dedicated network/subnets/NAT/router/firewall, and service account are Clervo-only and comprise Phase A of the external finalizer. |
| `BLOXSNIPER_ONLY` | `bloxsniper-r13`; its `bloxsniper-r13` 50 GiB SSD; `bloxsniperip` at `136.112.201.250`; the dated `bloxsniper-*` snapshots; `old-bloxsniper-20260820-060505`; both `bloxsniper-*` machine images; `bloxsniper-prod-db-backups-1056938182028`; the local MySQL/Redis state and the `bloxsniper-sync` and `bloxsniper-webhook` services. |
| `SHARED` | The GCP project and billing attachment; enabled project APIs; the `default` VPC, automatic subnets/routes and default firewall rules; the Compute default and Google-managed service accounts; `_Default` and locked `_Required` log buckets/sinks; Google-managed Pub/Sub topics; `bloxsniper-prod_cloudbuild` (no live Clervo objects); `run-sources-bloxsniper-prod-us-central1` (only the unrelated `fruitdrama` live prefix remains); `cloud-run-source-deploy` (only the unrelated `fruitdrama` package remains). |
| `UNKNOWN` | `fruitdrama` Cloud Run/storage/service-account resources; `venom-ai-deployer` and `allow-venom-*` firewall rules; the App Engine default account; `ssh-troubleshoot-y9sqt`; any external-provider account plan not exposed by available billing APIs. These were not changed. |

## Protected BloxSniper dependency graph

`bloxsniper-r13` is `RUNNING` in `us-central1-b`. It uses only its own attached
boot disk, the `default` VPC/subnet, the Compute default service account, and
the in-use `bloxsniperip` static address. On the VM, Nginx terminates
`api.bloxsniper.cc` and proxies to the local webhook service. MySQL listens only
on loopback, Redis listens only on loopback, and both production systemd
services are active. Public `/health` returns HTTP 200 with `db1` and `db2`
healthy. None of these dependencies intersects the Clervo SQL, GKE, VPC, NAT,
service accounts, secrets, artifacts, buckets, or Devbox resources in this
shutdown.

## Deleted resources

- Cloudflare: 13 `clervo.dev` Worker routes, Workers
  `clervo-api-edge-production`, `clervo-site-production`,
  `clervo-site-preview`, and `clervo-b10-proof-temporary`; down tunnels
  `clervo-ai` and `clervo-api`; empty R2 bucket `clervo-artifacts`.
- Cloud Run: `clervo-ai-gateway`, `clervo-api-production`, and
  `clervo-stage4-slice-staging`, including their revisions.
- Cloud SQL: `clervo-production-postgres`, after disabling deletion protection;
  deletion did not request a final backup.
- GKE: `clervo-sandbox-production`, all three node pools and generated compute
  resources, the internal load balancer, and residual empty NEG.
- Artifact/storage: `clervo-n426`, `clervo-production`, and `clervo-sandbox`;
  the `clervo-stage4-slice-staging` package and four source objects in shared
  Cloud Run storage; 130 Clervo source archives totaling about 6.27 GiB in the
  shared Cloud Build bucket.
- Secrets and identities: all 28 Clervo secrets; runtime, builder, gateway, and
  sandbox-node service accounts and their exact project IAM bindings.
- Monitoring/network residuals: the Clervo metric, alert policy and notification
  channel; obsolete waitlist and temporary-deploy firewall rules; the Sandbox
  load-balancer address; two legacy Clervo bounty-verifier snapshots.

Payment evidence was checked before deleting the x402/MPP credentials. The
preserved repository evidence identifies the Base USDC receiver and records
prior settlement as reconciled with zero unreconciled operations. No payment,
authorization, signature, or balance-changing action occurred during shutdown.

## Immediate versus provider-retained cleanup

Phase A eliminates all avoidable cost immediately. It does **not** wait for GCS
soft-delete expiry or the provider-managed address. From the external Mac it:

1. proves the finalizer commit is pushed, the Devbox tree is clean with no
   local-only Git history, and BloxSniper is healthy;
2. deletes the Devbox VM, boot/workspace disks, exact source-disk snapshots and
   exact source-instance machine images;
3. deletes the dedicated NAT, router, firewall rule, Devbox subnet, exact IAM
   bindings, and Devbox service account;
4. leaves only the Google-held address and the exact subnet/network it blocks;
5. re-runs the full BloxSniper verification after deletion.

The source-preservation preflight found two old local-only branches and one Git
stash. Their complete histories passed the repository secret scanner and were
preserved as `release/b2-front-door`, `work/b10-search-sandbox-20260809`, and
`archive/devbox-stash-20260812` on GitHub before Phase A was enabled.

Phase B is provider cleanup. Cloud Run Direct VPC egress may retain the internal
`serverless-ipv4-1785808136806194532` address after service deletion. While
Google owns it, Phase B leaves `clervo-run-sandbox-uscentral1` and the parent
`clervo-devbox-net` intact. Once Google releases the address, rerunning Phase B
deletes the empty subnet and network. The Devbox does not depend on this release.

Cloud Storage placed the deleted shared-bucket objects into mandatory
soft-delete retention: 130 Cloud Build archives and four Cloud Run source
objects, 6,731,410,517 bytes total at the last inventory. Their recorded latest
hard-delete time is `2026-08-27T22:23:16Z`. Google does not permit early
permanent deletion of soft-deleted objects. This retention is reported as
`UNAVOIDABLE PROVIDER RETENTION`; it never blocks Phase A or Phase B. The
estimated remaining prorated storage cost is less than $0.04.

## External recurring-cost audit

| Classification | Provider/service | Required action |
| --- | --- | --- |
| `PAID_SUBSCRIPTION` | `clervo.dev` domain registration | **OWNER ACTION REQUIRED:** disable registrar auto-renew or cancel the registration if preserving the domain is not required. |
| `UNKNOWN` | Cloudflare zone/account plan | **OWNER ACTION REQUIRED:** check the `clervo.dev` zone/account subscription and downgrade/cancel any paid plan. Runtime Workers, tunnels, and R2 storage are already deleted. |
| `UNKNOWN` | Google Workspace mail for `@clervo.dev` | **OWNER ACTION REQUIRED:** cancel Clervo-only Workspace seats/subscription if no longer required; the live MX/SPF records prove mail was configured. |
| `UNKNOWN` | GitHub organization/repository and npm registry | Preserve the repository and history. **OWNER ACTION REQUIRED:** remove any Clervo-only paid organization/package plan without deleting source/history. |
| `UNKNOWN` | HCNSEC, OpenRouter, SambaNova, Mistral, SiliconFlow, NVIDIA, Deepgram, Groq, Helius, dRPC, Blockscout, Search primary/fallback, Sentry, and Coinbase CDP/x402 | **OWNER ACTION REQUIRED:** cancel any recurring plan or automatic credit recharge in each Clervo-only account. All corresponding GCP credentials were deleted, so Clervo cannot initiate new calls. |
| `NO_FIXED_COST` | Public/open-data suppliers recorded in the catalog without Clervo credentials | No deployed Clervo caller remains. Confirm no independent subscription exists before closing the associated account. |

The available Cloudflare OAuth scope could delete Workers, routes, tunnels, and
R2, but it did not include DNS-record read/write or subscription billing. The
proxied `api.clervo.dev` and `ai.clervo.dev` records therefore still require
owner-side deletion in the Cloudflare dashboard. Worker routes and tunnels are
gone, so those records cannot reach Clervo compute or recreate variable GCP
costs.

## External finalizer

Run `scripts/operations/finalize-clervo-devbox.sh --phase-a <commit>` from the
Mac. The script refuses to execute Phase A from the Devbox itself. GCS retention
and the Google-held SERVERLESS address are reported but never treated as Phase A
failures. Later, run the same script with `--phase-b <commit>`; it waits safely
while the address exists and deletes only the exact empty subnet/network after
provider release.

The finalizer never matches deletion targets by a broad `clervo` glob. It
operates on exact Devbox identities and discovers snapshots/machine images only
through the exact source VM/disk metadata.
