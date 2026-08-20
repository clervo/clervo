# Fixed infrastructure cost reduction — 2026-08-20

## Outcome

Cost cut: **PARTIAL**. The evidence-backed configuration reduction is approximately **35.6% at public list rates**. Applying that same ratio to the owner's approximately $400/month baseline gives an estimated new bill of **$258/month**. Cloud Billing invoice and export access were unavailable to the active service account, so $258 is explicitly an estimate, not an observed invoice.

Gross public-list reconstruction is approximately $711/month before and $458/month after. This reconstruction uses 730 hours/month and excludes request-variable Cloud Run, network egress, discounts, commitments, credits, taxes, and free-tier consumption. It is kept separate from the account-reported billed baseline to avoid subtracting undiscounted savings from a discounted invoice.

Pricing references captured for the reconstruction:

- [Compute Engine general-purpose VMs](https://cloud.google.com/products/compute/pricing/general-purpose)
- [Persistent Disk, Hyperdisk, and snapshots](https://cloud.google.com/compute/disks-image-pricing)
- [Cloud SQL](https://cloud.google.com/sql/pricing)
- [GKE cluster management](https://cloud.google.com/kubernetes-engine/pricing)
- [Cloud NAT](https://cloud.google.com/nat/pricing)
- [Artifact Registry](https://cloud.google.com/artifact-registry/pricing)

## Internal cost map

| Component | Before list/month | After list/month | Utilization evidence | Required? | Optimization |
| --- | ---: | ---: | --- | --- | --- |
| Devbox compute | $282.9 | $141.4 | 5-minute CPU: 1.3% average, 2.5% p95 before resize; approximately 13 GiB available after | Yes: workspace and private AI gateway | `c4-standard-8` to `c4-standard-4`; `c4-standard-2` was attempted and rolled back after zonal capacity failure |
| Devbox Hyperdisk | $42.2 | $19.2 | Workspace 7% used; observed I/O approximately 4 reads/s and 1.4 writes/s, under 1% utilization; post-change iowait approximately 0% | Yes | Kept 240 GB; reduced both disks to included 3,000 IOPS / 140 MB/s baseline |
| Cloud SQL HA PostgreSQL | $204.1 | $133.5 | Before: CPU 4.8% avg / 5.4% p95 / 14.2% max; memory 48.6% avg. After: CPU 10.2% avg / 11.8% p95 / 15.6% max; memory 49.9% | Yes; durable state, payments, replay | `db-custom-2-7680` to `db-custom-1-6656`; retained regional HA, PITR, and backups |
| `bloxsniper-r13` VM, disk, IP | $55.9 | $55.9 | CPU 98.1% avg / 98.7% p95; memory approximately 21% p95; active recommender asks for two vCPUs | Yes | Kept; downsize is unsafe and an upsize may be needed for performance |
| Sandbox system pool | $27.5 | $27.5 | Live: 28% CPU, 66% memory; system components dominate | Yes | Kept one `e2-medium`; smaller pool is unsafe on memory |
| Sandbox gVisor execution pool | $51.9 | $51.9 | Live: 6% CPU, 15% memory idle; two concurrent isolated executions and bounded overload proved | Yes, essential capability | Restored one required node after audit found actual MIG target zero despite min=1 configuration |
| Sandbox internal load balancer | $18.3 | $18.3 | Private control path healthy; no public endpoint | Yes | Kept for isolation and serverless-to-cluster access |
| Cloud NAT and external address | $6.7 | $6.7 | Private devbox and GKE require outbound access | Yes | Kept; error-only NAT logging already bounded |
| Snapshots | $2.3 | $2.3 | Approximately 46.3 GiB billed snapshot storage; daily chain has 14-day retention | Yes | Kept short rollback chain and precut snapshots; deleting them saves too little for the recovery loss |
| Artifact Registry | $1.35 | $1.35 | Approximately 14 GiB across production, Sandbox, Cloud Run source, and development repositories | Yes | Kept rollback/supply-chain artifacts |
| GCS | $0.2 | $0.2 | Approximately 9.5 GiB, mostly Cloud Build; seven-day soft delete | Yes | No material safe saving |
| Logging | $0 | $0 | 0.523 GiB ingested over seven days, approximately 2.24 GiB/month | Yes | Below 50 GiB/month free allotment; default 30-day retention already bounded |
| Cloud Run fixed floor | $0 | $0 | Three services, all minimum scale zero | Yes | No fixed instances to remove; request charges remain variable |
| Terminated VMs/disks and unused IP | $18.2 | approximately $0 | `bloxsniper` and `bounty-verifier` were terminated; `venom-dashboard-ip` had no user | No | Snapshot-backed deletion of two stale boot disks/VM records and deletion of unused static IP |

The gross totals include normal Sandbox capacity both before and after. The temporary zero-node state is not counted as a saving because it failed production Sandbox acceptance.

## Inventory and decisions

- Compute: two standalone VMs plus two active GKE nodes. No orphaned persistent disks remain.
- Processes: the devbox runs `clervo-ai-gateway`, `cliproxy-personal`, and `clervo-ai-cloudflared`. They are distinct and required. Docker logs are capped at 3 × 10 MiB per container; current files total under 7 MiB.
- Workers: Cloud Run concurrency is bounded and minimum scale is zero. There are no fixed duplicate application workers.
- Data services: one regional Cloud SQL instance. Redis and Cloud Tasks APIs are disabled; no application Pub/Sub topics or Cloud Functions exist.
- Queues/caches/temp: no billed managed queue/cache was found. Root is 63% used; workspace is 7% used. Cleaning local files would not reduce provisioned disk charges.
- Network: one required NAT, one required Sandbox internal load balancer, one in-use service IP, and one serverless internal range. No unused external static IP remains.
- Backups: SQL retains 14 backups and seven days PITR. Compute snapshots total approximately 46.3 GiB; daily snapshots expire after 14 days.
- Artifacts: approximately 14 GiB in Artifact Registry and 9.5 GiB in GCS. Retained for deployed-image rollback and build recovery.
- Logging/monitoring: `_Default` retains 30 days; locked `_Required` retains the provider-required 400 days. One critical-event email alert policy is enabled. No paid log-retention excess was found.
- Polling/jobs: only normal OS maintenance, metrics, certificate refresh, and workspace pool management timers were present. No duplicate product cron was found.
- AI gateway: co-resident on the right-sized devbox; no separate fixed VM or duplicate tunnel.
- Sandbox: private GKE cluster, Agent Sandbox enabled, Dataplane v2, gVisor execution pool, private control service, restricted RBAC. It is intentionally retained.

## Change safety and rollback

| Change | Configuration captured | Dependency/utilization evidence | Rollback |
| --- | --- | --- | --- |
| Devbox C4 resize | Machine type and both disk snapshots | CPU p95 2.5%; memory headroom | Stop, set `c4-standard-8`, start; restore `clervo-*-precut-20260820-020952` if needed |
| Cloud SQL resize | Tier, HA/storage/backup configuration and manual backup | CPU/memory/disk/backend history | Resize to `db-custom-2-7680`; restore manual backup if data recovery is required |
| Stale VM deletion | TERMINATED state, disks, dependencies | No running process or active user | Recreate from `old-bloxsniper-20260820-060505` or `old-bounty-verifier-20260820-060505` |
| Hyperdisk performance | 40/200 GiB, 3,240/6,000 IOPS, 200/250 MB/s; precut snapshots | Under 1% disk utilization and approximately 0% iowait | Update boot to 3,240 IOPS / 200 MB/s and workspace to 6,000 IOPS / 250 MB/s |
| Sandbox node restoration | Pool min/max, MIG target, node labels/runtime | Zero nodes failed live Sandbox; one node passed useful gVisor execution | Do not scale to zero. Normal rollback of an unrelated pool change is min=1/max=3 with one Ready node |

## Production acceptance

| Capability | Before cost setting | After | Result |
| --- | --- | --- | --- |
| API health/readiness/durable state | Pass | Pass | B14 live health: 8/8 checks, no mutation/payment |
| AI free execution | 503 `ai_execution_adapter_missing` | Same 503 | **Pre-existing fail**, reproduced on serving and latest candidate revisions; not caused by infrastructure change |
| Search | One transient 502, retry 200 in 8.15 s | 200 in 8.08 s | Pass with upstream latency noted |
| Sandbox private execution | Initially failed because execution pool actual target was zero; passed after restore | Pass | Node/Python execution, artifacts, isolation, concurrency, cleanup, replay all passed at zero charge |
| Prediction | 402 in 101 ms | 402 in 97 ms | Pass technical and paid-challenge path; no payment sent |
| Crypto | 402 in 62 ms | 402 in 68 ms | 402 path passes; health reports `unavailable`, so useful paid execution remains unaccepted |
| RPC | 8/8 chains healthy; 402 in 105 ms | 8/8; 402 in 87 ms | Pass enabled technical path |
| MCP | Discovery/package/tool inventory reached; failed at free AI call | Same | Partial; MCP transport works, end-to-end acceptance blocked by AI defect |
| Shared wallet / paid behavior | Historical proof is settled/reconciled; live challenges valid | Same | Pass without a new payment; no USDC authorization was granted for this mission |
| Replay/idempotency | Pass | Pass | Live Sandbox replay/conflict plus B14 durable-state controls |
| Monitoring | Pass | Pass | Alert enabled; B14 delivery/idempotency/PII controls pass |

The live unpaid 402 checks returned the expected products and atomic maximums after the change: Search 6,000; Sandbox 60,000; Prediction 2,000; Crypto report 4,000; RPC 1,000. No product executed and no payment was signed or settled by these checks.

## Before versus after

- Fixed monthly cost: account-reported approximately $400 before; approximately $258 after if the same effective discount ratio applies. Gross list reconstruction: approximately $711 to $458.
- CPU: devbox remains approximately 99% idle; SQL rose from approximately 4.8% to 10.2% average with safe headroom; GKE system/execution observed at 28%/6% during acceptance.
- Memory: devbox has approximately 13 GiB available; SQL approximately 50%; GKE system/execution 66%/15%.
- Disk: capacities and usage unchanged; performance provision reduced to baseline with post-change iowait approximately 0% and filesystems healthy.
- Latency: unpaid product probes were flat-to-better except Crypto noise (+6 ms); Search successful retry was 8.15 s before and 8.08 s after. Cloud Run's small acceptance windows measured 99.6 ms mean before (93 requests) and 252.4 ms after (30 requests); the latter is skewed by the deliberate slow Search and failing AI acceptance calls rather than a disk-backed serving-path regression.
- Error rate: Cloud Run measured 3/93 5xx (3.2%) in the 25-minute before window and 2/30 (6.7%) in the short after window. Both after-window 5xx responses were deliberately reproduced AI acceptance failures. Infrastructure acceptance introduced no new failure; the existing AI 503 and Crypto health defect persisted before and after.
- Availability: API and Sandbox remained available during the online disk change. Sandbox availability was restored from the unsafe pre-audit zero-node state.

## Final safe pass

The follow-up pass measured 5,515 thirty-day CPU samples: 1.26% average, 2.40% p95, 44.9% p99, and 62.3% maximum on four vCPUs. Nine days of host sysstat history showed a 0.78 maximum load-15 and 3.15 GiB maximum working memory; the latest four hours peaked at 1.02 GiB. The workload therefore fits two vCPUs and 7 GiB in steady state, with rare build bursts requiring real green validation. Thirty-day network totals were 23.31 GiB received and 25.01 GiB sent.

A quarantined `c4-standard-2` probe found a stockout in `us-central1-f` and successfully booted in `us-central1-b` with two CPUs and 6.8 GiB usable memory. It had no external address, was blocked from egress, received no production traffic, and was deleted after the capacity proof.

The faithful green clone could not be provisioned. C4 supports Hyperdisk but not Persistent Disk, blue consumes 240 GB of the 250 GB regional Hyperdisk Balanced quota, and green requires the same 240 GB. Google immediately denied the temporary request for a 500 GB limit and retained 250 GB. Deleting or shrinking blue to create quota room would destroy the required live rollback. Cross-region NAT/subnet infrastructure or an undersized 10 GB rebuild would change topology or functionality, so both were rejected.

No traffic shifted, blue never stopped, and the cost remains approximately $258/month. The probe VM/disk, quarantine firewall, and temporary snapshots were deleted; the quota preference was returned to 250 GB.

Final acceptance remained no worse: B14 API/readiness/durable-state and monitoring passed; Search returned 200; Sandbox useful execution/isolation/replay/cleanup passed; Prediction, Crypto, RPC, Search, and Sandbox returned valid unpaid 402 challenges; RPC remained 8/8 healthy; AI and MCP retained the existing `ai_execution_adapter_missing`; Crypto health retained the existing `unavailable` state. No payment was sent.

## Stop point and next opportunity

The next large opportunity remains worth approximately $70.7/month at list rates, but it is not currently executable as a safe blue/green change. It requires a granted `us-central1` Hyperdisk Balanced limit of at least 480 GB before provisioning a faithful `c4-standard-2` green in `us-central1-b`. No in-place stop/resize should be attempted.

Cloud SQL regional HA, the Sandbox system/execution nodes, Sandbox load balancer, NAT, backups, and rollback artifacts are intentionally kept. Removing HA or scaling Sandbox to zero would manufacture savings by reducing reliability or functionality and is rejected.
