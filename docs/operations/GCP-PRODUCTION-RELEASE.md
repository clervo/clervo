# Google Cloud production release

This is the reproducible, fail-closed release path used for the verified private
Stage 14 Clervo API candidate. Public access and payment execution remain
disabled.

`ai.clervo.dev` is not a deployment target. Its VM runtime, process,
configuration, data, and network bindings remain protected and outside this
release path.

## Architecture

- Cloud Build runs the Stage 14 acceptance checks and builds the exact
  Dockerfile. The image is published through the build `images` field with
  verified provenance requested; an explicit `docker push` is forbidden.
- Artifact Registry stores the immutable digest. Promotion requires observed
  Cloud Build provenance and zero high or critical package vulnerabilities for
  that exact digest.
- A dedicated Cloud Run service identity receives only Cloud SQL Client plus
  accessor permission on the two named runtime secrets.
- Cloud SQL PostgreSQL 18 is regional, deletion-protected, backed up daily,
  retained for 14 backups, and configured for seven-day point-in-time recovery.
- A first-service bootstrap revision is private and authenticated. The candidate
  revision is separately tagged and receives zero traffic. It must
  pass authenticated database/readiness, non-payable behavior, monitoring
  delivery, and recovery smoke checks before promotion.
- Rollback requires both the preceding verified revision and its exact verified
  image digest. Missing or mismatched state fails closed.

The machine-readable contract is
`infra/production/gcp/deployment.v1.json`. Print its safe plan with:

```sh
npm run production:gcp -- plan
```

## Secret handling

Create and authorize secrets interactively outside chat and Git. The release
accepts only pinned positive integer versions—never `latest`:

- `clervo-production-database-url`
- `clervo-production-monitoring-endpoint`

Do not print their values. `CLERVO_DATABASE_URL` must use the Cloud SQL Unix
socket made available to the Cloud Run revision. Rotation creates a new secret
version and a new zero-traffic revision.

## Candidate release

The operator supplies an exact 40-character source commit, registry digest,
Cloud SQL connection name, HTTPS public origin, and pinned secret versions.
`CLERVO_PRODUCTION_ORIGIN` must never be `https://ai.clervo.dev`.

First use `validate`. A new Cloud Run service must first use the private
bootstrap action because Cloud Run cannot create its first revision with zero
traffic:

`CLERVO_PRODUCTION_CONFIRM=bootstrap-private:<40-character-release-id>`

The bootstrap is authenticated, x402-disabled, digest-pinned, and has no public
invoker. Candidate deployment then requires:

`CLERVO_PRODUCTION_CONFIRM=deploy-candidate:<40-character-release-id>`

The candidate command deploys a private tagged revision with `--no-traffic`. It does not
make the service public and does not enable paid execution.

## Promotion and rollback

Promotion additionally requires an observed candidate revision, successful
authenticated smoke, and acknowledged monitoring delivery. It requires:

`CLERVO_PRODUCTION_CONFIRM=promote-candidate:<40-character-release-id>`

Rollback requires the previous revision and exact previous image digest:

`CLERVO_PRODUCTION_CONFIRM=rollback-production:<40-character-release-id>`

The operator must stop traffic and reconcile unknown settlement before any
rollback involving future payment execution. Stage 14 keeps real payment
execution disabled.

## Managed recovery

Before promotion, restore a fresh backup or PITR point into an isolated
recovery instance, apply the repository verification contract, prove a stored
idempotent response, then remove only that explicitly named recovery instance.
A configured backup is not proof of recoverability. Stage 14 used on-demand
backup `1785755198118`, verified all five migrations and the durable smoke
receipt in `clervo-stage14-recovery-20260803`, and then verified that temporary
instance was absent after cleanup.

Cloud resource creation, recovery-instance creation, traffic change, public IAM
binding, and deletion are owner-approved external operations. Local validation
and plan inspection are not.
