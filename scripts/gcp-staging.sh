#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_PROJECT="bloxsniper-prod"
readonly EXPECTED_REGION="us-central1"
readonly SERVICE="clervo-stage4-slice-staging"
readonly STATE_DIR=".staging-state"

die() { printf 'gcp staging: FAIL: %s\n' "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

require gcloud
require curl
require jq

project="${GCP_PROJECT:-}"
region="${GCP_REGION:-}"
[[ "$project" == "$EXPECTED_PROJECT" ]] || die "GCP_PROJECT must equal $EXPECTED_PROJECT"
[[ "$region" == "$EXPECTED_REGION" ]] || die "GCP_REGION must equal $EXPECTED_REGION"
gcloud auth print-access-token >/dev/null 2>&1 || die "gcloud has no active authenticated identity"

action="${1:-}"
case "$action" in
  inspect)
    gcloud run services describe "$SERVICE" --project "$project" --region "$region" --format=json 2>/dev/null \
      || printf '{"service":"%s","status":"absent"}\n' "$SERVICE"
    ;;
  deploy)
    release_id="${CLERVO_RELEASE_ID:-}"
    [[ "$release_id" =~ ^[A-Za-z0-9._-]{3,128}$ ]] || die "CLERVO_RELEASE_ID must be an immutable safe identifier"
    mkdir -p "$STATE_DIR"
    previous_revision="$(gcloud run services describe "$SERVICE" --project "$project" --region "$region" --format='value(status.traffic[0].revisionName)' 2>/dev/null || true)"
    printf '%s\n' "$previous_revision" > "$STATE_DIR/previous-revision"
    gcloud run deploy "$SERVICE" \
      --project "$project" \
      --region "$region" \
      --source . \
      --allow-unauthenticated \
      --ingress all \
      --cpu 1 \
      --memory 512Mi \
      --concurrency 8 \
      --min-instances 0 \
      --max-instances 1 \
      --timeout 60s \
      --set-env-vars "CLERVO_ENV=staging,CLERVO_RELEASE_ID=$release_id"
    origin="$(gcloud run services describe "$SERVICE" --project "$project" --region "$region" --format='value(status.url)')"
    gcloud run services update "$SERVICE" \
      --project "$project" \
      --region "$region" \
      --update-env-vars "CLERVO_PUBLIC_ORIGIN=$origin"
    CLERVO_STAGING_ORIGIN="$origin" CLERVO_RELEASE_ID="$release_id" \
      CLERVO_STAGING_EVIDENCE_PATH="infra/staging/live-smoke-evidence-$release_id.json" \
      node ./scripts/staging-live-smoke.mjs
    printf 'gcp staging: PASS\nservice=%s\norigin=%s\n' "$SERVICE" "$origin"
    ;;
  rollback)
    [[ -f "$STATE_DIR/previous-revision" ]] || die "no previous revision state exists"
    previous_revision="$(cat "$STATE_DIR/previous-revision")"
    [[ -n "$previous_revision" ]] || die "the service had no previous revision; delete the isolated service explicitly if rollback is required"
    gcloud run services update-traffic "$SERVICE" \
      --project "$project" \
      --region "$region" \
      --to-revisions "$previous_revision=100"
    printf 'gcp staging rollback: PASS\nrevision=%s\n' "$previous_revision"
    ;;
  *)
    die "usage: scripts/gcp-staging.sh inspect|deploy|rollback"
    ;;
esac