# ADR-0003: CI, secret scanning, environments, and staging boundary

- **Status:** accepted with remote deployment deferred
- **Date:** 2026-07-29
- **Ticket:** N0.3

## Context

Stage 0 requires reproducible CI, secret scanning, explicit environment separation, and a staging hello-service/rollback path. The repository has no Git remote, GitHub CLI, cloud CLI, container runtime, database client, hosting credential, or application deployment target. N0.3 must therefore establish a portable, enforceable contract without claiming remote state that cannot be observed.

## Decision

1. **CI provider contract:** use GitHub Actions workflow definitions. All actions are pinned to immutable 40-character commit SHAs, the default token receives `contents: read` only, checkout credentials are not persisted, dependency install scripts are disabled, automatic package-manager caching is disabled, and `npm test` is the canonical gate.
2. **Secret scanning:** use a zero-dependency repository-local Node.js scanner in both local acceptance and CI. It scans committable working-tree files plus committed Git history, reports only file/rule metadata, and never prints matched values. N0.3 includes an injected committable credential failure test.
3. **Environment schema:** commit non-secret descriptors for `development`, `test`, `staging`, and `production`. Database, queue, secret-source, data, provider, and approval boundaries must remain distinct. `.env.example` contains names and safe local defaults only.
4. **Staging boundary:** use a GitHub Actions job referencing the `staging` environment plus a provider-neutral release manifest. The current job proves the minimal hello service through loopback HTTP; it does not mutate remote infrastructure.
5. **Rollback contract:** a hosting adapter must retain and redeploy the previous verified immutable commit, then rerun the staging smoke test. Until a provider adapter and live target exist, rollback is a validated contract rather than a remote traffic-switch result.

## Evidence reviewed

Freshness date: 2026-07-29.

- GitHub recommends least-privilege `GITHUB_TOKEN` permissions and pinning third-party actions to full commit SHAs. The selected release tags resolved to `actions/checkout` v7.0.1 at `3d3c42e5aac5ba805825da76410c181273ba90b1` and `actions/setup-node` v7.0.0 at `820762786026740c76f36085b0efc47a31fe5020`.
- `setup-node` supports `.nvmrc` through `node-version-file`. Its current documentation notes automatic npm caching when `packageManager` is declared and recommends `package-manager-cache: false` when caching is unnecessary for secure operation.
- GitHub environment secrets become available only to jobs referencing that environment and after configured protection rules pass. However, a workflow referencing a nonexistent environment can create it without protection rules or secrets. Remote administrator configuration must therefore be separately verified before approval protection is claimed.
- GitHub Actions and setup-node are MIT-licensed. No third-party secret-scanning runtime dependency or action is introduced; the scanner uses Node.js and Git already selected by the repository.

## Alternatives rejected or deferred

1. **Claim a live GitHub repository and staging deployment.** Rejected because no remote, authenticated GitHub control plane, hosting target, or deployment credential exists locally.
2. **Provider-specific hosting now.** Deferred until an application/database deployment ticket can compare authorized assets, cost, region, rollback, secret, and PostgreSQL requirements.
3. **Gitleaks Action.** A maintained option, but deferred because a private repository may require licensing configuration and the repository needs the same deterministic failure test locally without another binary. A later security ticket may add it as defense in depth.
4. **GitHub native secret scanning as the only gate.** Rejected as an unobservable remote setting and insufficient for pre-push local acceptance.
5. **Store staging values in repository files.** Rejected. Only names, safe defaults, and boundary metadata may be committed.

## Consequences

- CI and staging workflow definitions can run after a GitHub remote is created, but no run has yet been observed.
- Remote administrators must configure protected `staging` and `production` environments; workflow references alone do not prove approvals.
- The minimal hello service exists solely to prove the staging health/smoke boundary. Product API contracts begin at N1.1.
- Running PostgreSQL, pg-boss, database migrations, provider hosting, backups, and real rollback remain unresolved.