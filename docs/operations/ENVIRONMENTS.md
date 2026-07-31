# Environment and staging contract

Clervo has four named, isolated environment contracts under `infra/environments/`:

| Environment | Purpose | Data/provider policy | Secret source | Approval |
| --- | --- | --- | --- | --- |
| `development` | Local developer loop | Synthetic data and mocks | Untracked local `.env` | No |
| `test` | Ephemeral automated checks | Fixtures only | Test fixtures only | No |
| `staging` | Pre-production release proof | No production data; mocks by default | GitHub `staging` environment | Yes |
| `production` | Customer traffic | Production-only resources | GitHub `production` environment | Yes |

Database and queue boundary identifiers must be unique across all environments. Staging and production must never share credentials, databases, queues, deployment approvals, or release state.

## Configuration

`.env.example` documents names and safe local defaults only. Real values remain outside Git and are injected by the approved environment secret store. The repository rejects tracked `.env` files other than `.env.example` and scans both current files and committed history for credential patterns.

## Staging

`.github/workflows/staging.yml` references the protected GitHub environment named `staging`. Before enabling remote deployment, a repository administrator must create/configure that environment, require a reviewer, restrict deployment branches to `main`, and add only staging-scoped values. Merely referencing an absent GitHub environment can create it without protection rules, so a workflow run is not evidence that reviewer protection exists.

The GitHub workflow remains a **readiness and loopback smoke-test gate**, not the provider deployment path. N4.18 separately verified a private authenticated Cloud Run search service in `bloxsniper-prod/us-central1` using recorded retrieval only. Its current release, immutable image, health path, smoke path, and access mode are recorded in `infra/staging/release-manifest.json`; this does not prove GitHub environment protections, live suppliers, payable execution, or production readiness.

## Rollback

The Cloud Run operator captures the previously serving revision before mutation. Rollback restores 100% traffic to that revision, or deletes the isolated service when the capture proves the release was the first deployment. N4.18 exercised the first-deployment deletion path and captured the same rollback mode for the final verified release. Rollback does not authorize mutation of any other service or existing workload.