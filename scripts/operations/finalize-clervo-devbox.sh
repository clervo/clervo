#!/usr/bin/env bash
set -euo pipefail

PROJECT='bloxsniper-prod'
DEVBOX='clervo-devbox-primary'
DEVBOX_ZONE='us-central1-c'
WORKSPACE_DISK='clervo-devbox-workspace'
REGION='us-central1'
NETWORK='clervo-devbox-net'
SUBNET='clervo-devbox-uscentral1'
RELEASED_SERVERLESS_SUBNET='clervo-run-sandbox-uscentral1'
SERVERLESS_ADDRESS='serverless-ipv4-1785808136806194532'
ROUTER='clervo-devbox-router'
NAT='clervo-devbox-nat'
FIREWALL='clervo-devbox-iap-ssh'
DEVBOX_SA='clervo-devbox-primary@bloxsniper-prod.iam.gserviceaccount.com'
BLOX_VM='bloxsniper-r13'
BLOX_ZONE='us-central1-b'
BLOX_DISK='bloxsniper-r13'
BLOX_ADDRESS='bloxsniperip'
BLOX_IP='136.112.201.250'
PUSHED_BRANCH='agent/infra-rearch-phase1'
REPOSITORY='https://github.com/clervo/clervo.git'

die() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

resource_exists() {
  "$@" >/dev/null 2>&1
}

verify_bloxsniper() {
  local vm_status disk_user address_status address_value address_user health service_state
  local stats_status trending_status auth_status login_status
  vm_status=$(gcloud compute instances describe "$BLOX_VM" --project="$PROJECT" --zone="$BLOX_ZONE" --format='value(status)')
  [[ "$vm_status" == 'RUNNING' ]] || die "$BLOX_VM is not RUNNING (status=$vm_status)"

  disk_user=$(gcloud compute disks describe "$BLOX_DISK" --project="$PROJECT" --zone="$BLOX_ZONE" --format='value(users.basename())')
  [[ "$disk_user" == "$BLOX_VM" ]] || die "$BLOX_DISK is not attached only to $BLOX_VM"

  address_status=$(gcloud compute addresses describe "$BLOX_ADDRESS" --project="$PROJECT" --region="$REGION" --format='value(status)')
  address_value=$(gcloud compute addresses describe "$BLOX_ADDRESS" --project="$PROJECT" --region="$REGION" --format='value(address)')
  [[ "$address_status" == 'IN_USE' && "$address_value" == "$BLOX_IP" ]] \
    || die "$BLOX_ADDRESS does not resolve to the protected in-use IP"
  address_user=$(gcloud compute addresses describe "$BLOX_ADDRESS" --project="$PROJECT" --region="$REGION" --format='value(users.basename())')
  [[ "$address_user" == "$BLOX_VM" ]] || die "$BLOX_ADDRESS is not assigned to $BLOX_VM"

  health=$(curl -fsS --max-time 20 'https://api.bloxsniper.cc/health') || die 'BloxSniper public health request failed'
  [[ "$health" == *'"status":"ok"'* && "$health" == *'"db1":"ok"'* && "$health" == *'"db2":"ok"'* ]] \
    || die 'BloxSniper public health response is not fully healthy'

  stats_status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 'https://api.bloxsniper.cc/api/stats')
  trending_status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 'https://api.bloxsniper.cc/api/games/trending')
  auth_status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 'https://api.bloxsniper.cc/api/users/me')
  login_status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 'https://api.bloxsniper.cc/api/auth/google/login')
  [[ "$stats_status" == 200 && "$trending_status" == 200 && "$auth_status" == 401 && "$login_status" == 302 ]] \
    || die "BloxSniper public production probes failed (stats=$stats_status trending=$trending_status auth=$auth_status login=$login_status)"

  service_state=$(gcloud compute ssh "$BLOX_VM" --project="$PROJECT" --zone="$BLOX_ZONE" --quiet \
    --command='systemctl is-active bloxsniper-sync.service bloxsniper-webhook.service' 2>/dev/null) \
    || die 'BloxSniper background-service check failed'
  [[ "$service_state" == $'active\nactive' ]] || die 'BloxSniper background services are not both active'
}

require_command gcloud
require_command git
require_command curl

[[ $# -eq 2 && "$1" == '--execute' ]] || die 'usage: finalize-clervo-devbox.sh --execute <pushed-commit-sha>'
EXPECTED_COMMIT=$2
[[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]] || die 'expected commit must be a full 40-character lowercase Git SHA'

REMOTE_COMMIT=$(git ls-remote "$REPOSITORY" "refs/heads/$PUSHED_BRANCH" | awk 'NR == 1 { print $1 }')
[[ "$REMOTE_COMMIT" == "$EXPECTED_COMMIT" ]] || die "the pushed branch is $REMOTE_COMMIT, not $EXPECTED_COMMIT"

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)
[[ -n "$ACTIVE_ACCOUNT" ]] || die 'gcloud has no active account; run gcloud auth login first'

RUN_NAMES=$(gcloud run services list --project="$PROJECT" --platform=managed --format='value(metadata.name)')
SQL_NAMES=$(gcloud sql instances list --project="$PROJECT" --format='value(name)')
GKE_NAMES=$(gcloud container clusters list --project="$PROJECT" --format='value(name)')
ARTIFACT_NAMES=$(gcloud artifacts repositories list --project="$PROJECT" --location=all --format='value(name.basename())')
SECRET_NAMES=$(gcloud secrets list --project="$PROJECT" --format='value(name)')
if grep -Eq '^clervo-' <<<"$RUN_NAMES"; then
  die 'a non-Devbox Clervo Cloud Run service still exists'
fi
if grep -Eq '^clervo-' <<<"$SQL_NAMES"; then
  die 'a non-Devbox Clervo Cloud SQL instance still exists'
fi
if grep -Eq '^clervo-' <<<"$GKE_NAMES"; then
  die 'a non-Devbox Clervo GKE cluster still exists'
fi
if grep -Eq '^clervo-' <<<"$ARTIFACT_NAMES"; then
  die 'a non-Devbox Clervo Artifact Registry repository still exists'
fi
if grep -Eq '^clervo-' <<<"$SECRET_NAMES"; then
  die 'a non-Devbox Clervo secret still exists'
fi
if gcloud storage ls --soft-deleted 'gs://bloxsniper-prod_cloudbuild/**' >/dev/null 2>&1; then
  die 'Clervo Cloud Build objects remain in mandatory GCS soft-delete retention; retry after 2026-08-27T22:23:16Z'
fi
if gcloud storage ls --soft-deleted 'gs://run-sources-bloxsniper-prod-us-central1/services/clervo*/**' >/dev/null 2>&1; then
  die 'Clervo Cloud Run source objects remain in mandatory GCS soft-delete retention; retry after 2026-08-27T22:23:16Z'
fi
resource_exists gcloud compute addresses describe "$SERVERLESS_ADDRESS" --project="$PROJECT" --region="$REGION" \
  && die 'Cloud Run has not released its provider-managed SERVERLESS address; wait and retry in 1-2 hours'
if resource_exists gcloud compute networks subnets describe "$RELEASED_SERVERLESS_SUBNET" --project="$PROJECT" --region="$REGION"; then
  gcloud compute networks subnets delete "$RELEASED_SERVERLESS_SUBNET" --project="$PROJECT" --region="$REGION" --quiet
fi

resource_exists gcloud compute instances describe "$DEVBOX" --project="$PROJECT" --zone="$DEVBOX_ZONE" \
  || die "$DEVBOX is already absent; inspect before running a partial retry"

verify_bloxsniper

printf 'Preflight passed as %s. Deleting the final Clervo Devbox resources.\n' "$ACTIVE_ACCOUNT"
gcloud compute instances delete "$DEVBOX" --project="$PROJECT" --zone="$DEVBOX_ZONE" --delete-disks=all --quiet

for disk in "$DEVBOX" "$WORKSPACE_DISK"; do
  if resource_exists gcloud compute disks describe "$disk" --project="$PROJECT" --zone="$DEVBOX_ZONE"; then
    gcloud compute disks delete "$disk" --project="$PROJECT" --zone="$DEVBOX_ZONE" --quiet
  fi
done

SNAPSHOTS=()
while IFS=$'\t' read -r snapshot source_disk; do
  case "$source_disk" in
    */disks/clervo-devbox-primary|*/disks/clervo-devbox-workspace) SNAPSHOTS+=("$snapshot") ;;
  esac
done < <(gcloud compute snapshots list --project="$PROJECT" --format='csv[no-heading,separator="\t"](name,sourceDisk)')
if [[ ${#SNAPSHOTS[@]} -gt 0 ]]; then
  gcloud compute snapshots delete "${SNAPSHOTS[@]}" --project="$PROJECT" --quiet
fi

MACHINE_IMAGES=()
while IFS=$'\t' read -r image source_instance; do
  case "$source_instance" in
    */instances/clervo-devbox-primary) MACHINE_IMAGES+=("$image") ;;
  esac
done < <(gcloud compute machine-images list --project="$PROJECT" --format='csv[no-heading,separator="\t"](name,sourceInstance)')
if [[ ${#MACHINE_IMAGES[@]} -gt 0 ]]; then
  gcloud compute machine-images delete "${MACHINE_IMAGES[@]}" --project="$PROJECT" --quiet
fi

if gcloud compute routers nats list --project="$PROJECT" --router="$ROUTER" --region="$REGION" --format='value(name)' 2>/dev/null | grep -Fxq "$NAT"; then
  gcloud compute routers nats delete "$NAT" --project="$PROJECT" --router="$ROUTER" --region="$REGION" --quiet
fi
if resource_exists gcloud compute routers describe "$ROUTER" --project="$PROJECT" --region="$REGION"; then
  gcloud compute routers delete "$ROUTER" --project="$PROJECT" --region="$REGION" --quiet
fi
if resource_exists gcloud compute firewall-rules describe "$FIREWALL" --project="$PROJECT"; then
  gcloud compute firewall-rules delete "$FIREWALL" --project="$PROJECT" --quiet
fi
if resource_exists gcloud compute networks subnets describe "$SUBNET" --project="$PROJECT" --region="$REGION"; then
  gcloud compute networks subnets delete "$SUBNET" --project="$PROJECT" --region="$REGION" --quiet
fi
if resource_exists gcloud compute networks describe "$NETWORK" --project="$PROJECT"; then
  gcloud compute networks delete "$NETWORK" --project="$PROJECT" --quiet
fi

IAM_ROLES=(
  roles/artifactregistry.admin
  roles/compute.viewer
  roles/container.admin
  roles/logging.logWriter
  roles/logging.viewer
  roles/monitoring.alertPolicyEditor
  roles/monitoring.metricWriter
  roles/monitoring.notificationChannelViewer
  roles/monitoring.viewer
  roles/owner
  roles/serviceusage.serviceUsageConsumer
  roles/serviceusage.serviceUsageViewer
)
for role in "${IAM_ROLES[@]}"; do
  if gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
    --filter="bindings.members:serviceAccount:$DEVBOX_SA" --format='value(bindings.role)' | grep -Fxq "$role"; then
    gcloud projects remove-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEVBOX_SA" --role="$role" --quiet >/dev/null
  fi
done
if resource_exists gcloud iam service-accounts describe "$DEVBOX_SA" --project="$PROJECT"; then
  gcloud iam service-accounts delete "$DEVBOX_SA" --project="$PROJECT" --quiet
fi

resource_exists gcloud compute instances describe "$DEVBOX" --project="$PROJECT" --zone="$DEVBOX_ZONE" \
  && die "$DEVBOX still exists"
for disk in "$DEVBOX" "$WORKSPACE_DISK"; do
  resource_exists gcloud compute disks describe "$disk" --project="$PROJECT" --zone="$DEVBOX_ZONE" \
    && die "disk $disk still exists"
done
[[ -z $(gcloud compute snapshots list --project="$PROJECT" --filter='sourceDisk:(clervo-devbox-primary OR clervo-devbox-workspace)' --format='value(name)') ]] \
  || die 'a Devbox-derived snapshot still exists'
[[ -z $(gcloud compute machine-images list --project="$PROJECT" --filter='sourceInstance:clervo-devbox-primary' --format='value(name)') ]] \
  || die 'a Devbox-derived machine image still exists'
resource_exists gcloud compute networks describe "$NETWORK" --project="$PROJECT" && die "$NETWORK still exists"
resource_exists gcloud iam service-accounts describe "$DEVBOX_SA" --project="$PROJECT" && die "$DEVBOX_SA still exists"

RUN_NAMES=$(gcloud run services list --project="$PROJECT" --platform=managed --format='value(metadata.name)')
SQL_NAMES=$(gcloud sql instances list --project="$PROJECT" --format='value(name)')
GKE_NAMES=$(gcloud container clusters list --project="$PROJECT" --format='value(name)')
ARTIFACT_NAMES=$(gcloud artifacts repositories list --project="$PROJECT" --location=all --format='value(name.basename())')
SECRET_NAMES=$(gcloud secrets list --project="$PROJECT" --format='value(name)')
COMPUTE_NAMES=$(gcloud compute instances list --project="$PROJECT" --format='value(name)')
DISK_NAMES=$(gcloud compute disks list --project="$PROJECT" --format='value(name)')
SNAPSHOT_NAMES=$(gcloud compute snapshots list --project="$PROJECT" --format='value(name)')
SERVICE_ACCOUNT_NAMES=$(gcloud iam service-accounts list --project="$PROJECT" --format='value(email)')
for remaining in "$RUN_NAMES" "$SQL_NAMES" "$GKE_NAMES" "$ARTIFACT_NAMES" "$SECRET_NAMES" \
  "$COMPUTE_NAMES" "$DISK_NAMES" "$SNAPSHOT_NAMES" "$SERVICE_ACCOUNT_NAMES"; do
  grep -Eiq '(^|[[:space:]@])clervo-' <<<"$remaining" && die 'a direct Clervo resource remains after finalization'
done
if gcloud storage ls 'gs://run-sources-bloxsniper-prod-us-central1/services/clervo*/**' >/dev/null 2>&1; then
  die 'a Clervo object remains in shared Cloud Run source storage'
fi

printf '\nRemaining resources whose names contain clervo (provider history may be eventually consistent):\n'
gcloud asset search-all-resources --scope="projects/$PROJECT" --query='name:clervo' \
  --format='table(assetType,displayName,location,state)' --page-size=500 || true

verify_bloxsniper
printf '\nCLERVO FINAL DEVBOX DELETE: PASS\nBLOXSNIPER: HEALTHY AND UNTOUCHED\n'
