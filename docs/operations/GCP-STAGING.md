# GCP Cloud Run staging runbook

## Fixed scope

This runbook is restricted to project `bloxsniper-prod`, region `us-central1`, and the new service `clervo-stage4-slice-staging`. The script refuses any other project or region. Do not reuse an existing service, database, queue, secret, service account, domain, or payment system.

The deployed application uses recorded retrieval evidence. It is useful for deployment, routing, schema, monitoring-log, and rollback proof only. It does not prove live Brave/Common Crawl retrieval, a payable x402 route, real settlement, collector delivery, dashboard delivery, or alert receipt.

## Prerequisites

1. Install the Google Cloud CLI outside the repository.
2. Authenticate an operator identity authorized to inspect and deploy only the isolated staging service.
3. Set `GCP_PROJECT=bloxsniper-prod` and `GCP_REGION=us-central1`.
4. Select an immutable release identifier, preferably the full Git commit SHA.
5. Confirm billing and organizational policy permit a new Cloud Run service. The deployment caps scale at one instance and zero minimum instances, but cloud resources can still incur cost.

## Inspect before mutation

```sh
GCP_PROJECT=bloxsniper-prod \
GCP_REGION=us-central1 \
npm run staging:gcp -- inspect
```

If the isolated service already exists unexpectedly, stop and review ownership before deployment.

## Deploy and collect evidence

```sh
GCP_PROJECT=bloxsniper-prod \
GCP_REGION=us-central1 \
CLERVO_RELEASE_ID="$(git rev-parse HEAD)" \
npm run staging:gcp -- deploy
```

The command deploys source through Cloud Build as a private Cloud Run service with the normal invoker IAM check retained, limits instances to one, binds the deterministic HTTPS Cloud Run origin into the non-payable challenge during the initial create, mints an operator identity token, runs `/healthz`, executes one recorded free request, confirms the paid route stays `402` and non-payable, and writes a new `infra/staging/live-smoke-evidence-<release>.json` file without overwriting prior evidence. Public access is not required for this bounded deployment proof.

Review Cloud Run request logs for the JSON `clervo.search.started` event and periodic `clervo.search.monitoring_snapshot` events. Cloud Run log ingestion alone is not evidence of a configured dashboard, delivered page, or alert receipt.

## Rollback

```sh
GCP_PROJECT=bloxsniper-prod \
GCP_REGION=us-central1 \
npm run staging:gcp -- rollback
```

Rollback routes 100% of traffic to the revision captured before deployment. If no previous revision existed, rollback deletes the isolated first-deployment service after the operator has retained its evidence.

## Stage 4 evidence rule

Do not change `stagingVerified` values merely because deployment succeeds. Each check requires direct fresh evidence for its exact claim. In particular, the recorded executor cannot verify two live lawful retrieval paths, live cost/quality benchmarks, provider spend caps, a payable route, real payment, or delivered monitoring/alerts.