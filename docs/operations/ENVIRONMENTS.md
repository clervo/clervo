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

The current workflow is intentionally a **readiness and smoke-test gate**, not a provider deployment. It starts the minimal hello service, probes `/healthz` and `/hello`, and validates the release identifier. No remote repository, hosting target, application credential, or live staging URL was available during N0.3; therefore live staging deployment remains explicitly unproven.

## Rollback

The release manifest defines rollback as redeploying the previous verified immutable commit and rerunning `npm run staging:smoke`. A real hosting adapter must preserve at least one prior verified release and implement that contract before any live staging claim is made. Local smoke validation proves the service and rollback input contract, not remote traffic switching.