#!/usr/bin/env bash
set -euo pipefail

PROJECT='bloxsniper-prod'
DEVBOX='clervo-devbox-primary'
DEVBOX_ZONE='us-central1-c'
WORKSPACE_DISK='clervo-devbox-workspace'
REGION='us-central1'
NETWORK='clervo-devbox-net'
DEVBOX_SUBNET='clervo-devbox-uscentral1'
SERVERLESS_SUBNET='clervo-run-sandbox-uscentral1'
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
REPOSITORY_WEB='https://github.com/clervo/clervo'
PRESERVED_SHUTDOWN_COMMIT='b9ce0bb19eb55e1ee55ceea7e043febbeb078d8f'

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

allowed_iam_role() {
  local candidate=$1 role
  for role in "${IAM_ROLES[@]}"; do
    [[ "$candidate" == "$role" ]] && return 0
  done
  return 1
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

verify_pushed_commit() {
  local remote_commit
  remote_commit=$(git ls-remote "$REPOSITORY" "refs/heads/$PUSHED_BRANCH" | awk 'NR == 1 { print $1 }')
  [[ "$remote_commit" == "$EXPECTED_COMMIT" ]] || die "the pushed branch is $remote_commit, not $EXPECTED_COMMIT"
  curl -fsSL --max-time 20 -o /dev/null "$REPOSITORY_WEB/commit/$PRESERVED_SHUTDOWN_COMMIT" \
    || die "baseline shutdown commit $PRESERVED_SHUTDOWN_COMMIT is not reachable on GitHub"
}

verify_devbox_source_preserved() {
  local check
  check=$(gcloud compute ssh "$DEVBOX" --project="$PROJECT" --zone="$DEVBOX_ZONE" --tunnel-through-iap --quiet \
    --command="sudo -u support_bloxsniper_cc bash -lc 'cd /workspace/clervo-next && git fetch --prune origin >/dev/null 2>&1 && test \"\$(git rev-parse HEAD)\" = \"$EXPECTED_COMMIT\" && test -z \"\$(git status --porcelain --untracked-files=all)\" && test -z \"\$(git rev-list --all --not --remotes)\" && printf SOURCE_PRESERVED'" 2>/dev/null) \
    || die 'could not prove the Devbox repository is clean, at the pushed finalizer commit, and free of local-only Git history'
  [[ "$check" == 'SOURCE_PRESERVED' ]] || die 'Devbox source-preservation check returned an unexpected result'
}

verify_no_non_devbox_clervo_runtime() {
  local run_names sql_names gke_names artifact_names secret_names
  run_names=$(gcloud run services list --project="$PROJECT" --platform=managed --format='value(metadata.name)')
  sql_names=$(gcloud sql instances list --project="$PROJECT" --format='value(name)')
  gke_names=$(gcloud container clusters list --project="$PROJECT" --format='value(name)')
  artifact_names=$(gcloud artifacts repositories list --project="$PROJECT" --location=all --format='value(name.basename())')
  secret_names=$(gcloud secrets list --project="$PROJECT" --format='value(name)')
  grep -Eq '^clervo-' <<<"$run_names" && die 'a non-Devbox Clervo Cloud Run service still exists'
  grep -Eq '^clervo-' <<<"$sql_names" && die 'a non-Devbox Clervo Cloud SQL instance still exists'
  grep -Eq '^clervo-' <<<"$gke_names" && die 'a non-Devbox Clervo GKE cluster still exists'
  grep -Eq '^clervo-' <<<"$artifact_names" && die 'a non-Devbox Clervo Artifact Registry repository still exists'
  grep -Eq '^clervo-' <<<"$secret_names" && die 'a non-Devbox Clervo secret still exists'
  if gcloud storage ls 'gs://run-sources-bloxsniper-prod-us-central1/services/clervo*/**' >/dev/null 2>&1; then
    die 'a live Clervo object remains in shared Cloud Run source storage'
  fi
}

verify_devbox_dependencies() {
  local instance_users sa_users router_network firewall_network subnet_network serverless_network
  local forwarding_rules roles role subnets routers firewalls
  instance_users=$(gcloud compute instances list --project="$PROJECT" \
    --filter="networkInterfaces.network:$NETWORK" --format='csv[no-heading](name,zone.basename())')
  if [[ -n "$instance_users" && "$instance_users" != "$DEVBOX,$DEVBOX_ZONE" ]]; then
    die "$NETWORK has an unexpected VM dependency: $instance_users"
  fi

  sa_users=$(gcloud compute instances list --project="$PROJECT" \
    --filter="serviceAccounts.email=$DEVBOX_SA" --format='csv[no-heading](name,zone.basename())')
  if [[ -n "$sa_users" && "$sa_users" != "$DEVBOX,$DEVBOX_ZONE" ]]; then
    die "$DEVBOX_SA has an unexpected VM dependency: $sa_users"
  fi

  forwarding_rules=$(gcloud compute forwarding-rules list --project="$PROJECT" \
    --format='csv[no-heading](name,network.basename())' | awk -F, -v network="$NETWORK" '$2 == network { print $1 }')
  [[ -z "$forwarding_rules" ]] || die "$NETWORK has an unexpected forwarding rule: $forwarding_rules"

  subnets=$(gcloud compute networks subnets list --project="$PROJECT" --regions="$REGION" \
    --filter="network:$NETWORK" --format='value(name)' | sort)
  while IFS= read -r subnet; do
    [[ -z "$subnet" || "$subnet" == "$DEVBOX_SUBNET" || "$subnet" == "$SERVERLESS_SUBNET" ]] \
      || die "$NETWORK has an unexpected subnet: $subnet"
  done <<<"$subnets"

  routers=$(gcloud compute routers list --project="$PROJECT" --regions="$REGION" \
    --filter="network:$NETWORK" --format='value(name)')
  while IFS= read -r router; do
    [[ -z "$router" || "$router" == "$ROUTER" ]] || die "$NETWORK has an unexpected router: $router"
  done <<<"$routers"

  firewalls=$(gcloud compute firewall-rules list --project="$PROJECT" \
    --filter="network:$NETWORK" --format='value(name)')
  while IFS= read -r firewall; do
    [[ -z "$firewall" || "$firewall" == "$FIREWALL" ]] || die "$NETWORK has an unexpected firewall rule: $firewall"
  done <<<"$firewalls"

  if resource_exists gcloud compute routers describe "$ROUTER" --project="$PROJECT" --region="$REGION"; then
    router_network=$(gcloud compute routers describe "$ROUTER" --project="$PROJECT" --region="$REGION" --format='value(network.basename())')
    [[ "$router_network" == "$NETWORK" ]] || die "$ROUTER is not attached to the exact Clervo network"
  fi
  if resource_exists gcloud compute firewall-rules describe "$FIREWALL" --project="$PROJECT"; then
    firewall_network=$(gcloud compute firewall-rules describe "$FIREWALL" --project="$PROJECT" --format='value(network.basename())')
    [[ "$firewall_network" == "$NETWORK" ]] || die "$FIREWALL is not attached to the exact Clervo network"
  fi
  if resource_exists gcloud compute networks subnets describe "$DEVBOX_SUBNET" --project="$PROJECT" --region="$REGION"; then
    subnet_network=$(gcloud compute networks subnets describe "$DEVBOX_SUBNET" --project="$PROJECT" --region="$REGION" --format='value(network.basename())')
    [[ "$subnet_network" == "$NETWORK" ]] || die "$DEVBOX_SUBNET is not attached to the exact Clervo network"
  fi
  if resource_exists gcloud compute networks subnets describe "$SERVERLESS_SUBNET" --project="$PROJECT" --region="$REGION"; then
    serverless_network=$(gcloud compute networks subnets describe "$SERVERLESS_SUBNET" --project="$PROJECT" --region="$REGION" --format='value(network.basename())')
    [[ "$serverless_network" == "$NETWORK" ]] || die "$SERVERLESS_SUBNET is not attached to the exact Clervo network"
  fi

  if resource_exists gcloud compute addresses describe "$SERVERLESS_ADDRESS" --project="$PROJECT" --region="$REGION"; then
    local address_purpose address_subnet
    address_purpose=$(gcloud compute addresses describe "$SERVERLESS_ADDRESS" --project="$PROJECT" --region="$REGION" --format='value(purpose)')
    address_subnet=$(gcloud compute addresses describe "$SERVERLESS_ADDRESS" --project="$PROJECT" --region="$REGION" --format='value(subnetwork.basename())')
    [[ "$address_purpose" == 'SERVERLESS' && "$address_subnet" == "$SERVERLESS_SUBNET" ]] \
      || die "$SERVERLESS_ADDRESS is not the expected provider-managed address"
  fi

  roles=$(gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
    --filter="bindings.members:serviceAccount:$DEVBOX_SA" --format='value(bindings.role)' | sort -u)
  while IFS= read -r role; do
    [[ -z "$role" ]] || allowed_iam_role "$role" || die "$DEVBOX_SA has an unexpected IAM role: $role"
  done <<<"$roles"
}

soft_deleted_clervo_bytes() {
  local build_bytes run_bytes
  build_bytes=$(gcloud storage ls --soft-deleted --long 'gs://bloxsniper-prod_cloudbuild/**' 2>/dev/null \
    | awk '$1 ~ /^[0-9]+$/ { total += $1 } END { printf "%.0f", total + 0 }' || true)
  run_bytes=$(gcloud storage ls --soft-deleted --long 'gs://run-sources-bloxsniper-prod-us-central1/services/clervo*/**' 2>/dev/null \
    | awk '$1 ~ /^[0-9]+$/ { total += $1 } END { printf "%.0f", total + 0 }' || true)
  awk -v build="${build_bytes:-0}" -v run="${run_bytes:-0}" 'BEGIN { printf "%.0f", build + run }'
}

delete_exact_snapshots_and_images() {
  local snapshot source_disk image source_instance
  local -a snapshots=() machine_images=()
  while IFS=$'\t' read -r snapshot source_disk; do
    case "$source_disk" in
      */disks/clervo-devbox-primary|*/disks/clervo-devbox-workspace) snapshots+=("$snapshot") ;;
    esac
  done < <(gcloud compute snapshots list --project="$PROJECT" --format='csv[no-heading,separator="\t"](name,sourceDisk)')
  if [[ ${#snapshots[@]} -gt 0 ]]; then
    gcloud compute snapshots delete "${snapshots[@]}" --project="$PROJECT" --quiet
  fi

  while IFS=$'\t' read -r image source_instance; do
    case "$source_instance" in
      */instances/clervo-devbox-primary) machine_images+=("$image") ;;
    esac
  done < <(gcloud compute machine-images list --project="$PROJECT" --format='csv[no-heading,separator="\t"](name,sourceInstance)')
  if [[ ${#machine_images[@]} -gt 0 ]]; then
    gcloud compute machine-images delete "${machine_images[@]}" --project="$PROJECT" --quiet
  fi
}

delete_devbox_identity() {
  local role
  for role in "${IAM_ROLES[@]}"; do
    if gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
      --filter="bindings.members:serviceAccount:$DEVBOX_SA" --format='value(bindings.role)' | grep -Fxq "$role"; then
      gcloud projects remove-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEVBOX_SA" --role="$role" --quiet >/dev/null
    fi
  done
  if resource_exists gcloud iam service-accounts describe "$DEVBOX_SA" --project="$PROJECT"; then
    gcloud iam service-accounts delete "$DEVBOX_SA" --project="$PROJECT" --quiet
  fi
}

delete_phase_a_network() {
  if gcloud compute routers nats list --project="$PROJECT" --router="$ROUTER" --region="$REGION" --format='value(name)' 2>/dev/null | grep -Fxq "$NAT"; then
    gcloud compute routers nats delete "$NAT" --project="$PROJECT" --router="$ROUTER" --region="$REGION" --quiet
  fi
  if resource_exists gcloud compute routers describe "$ROUTER" --project="$PROJECT" --region="$REGION"; then
    gcloud compute routers delete "$ROUTER" --project="$PROJECT" --region="$REGION" --quiet
  fi
  if resource_exists gcloud compute firewall-rules describe "$FIREWALL" --project="$PROJECT"; then
    gcloud compute firewall-rules delete "$FIREWALL" --project="$PROJECT" --quiet
  fi
  if resource_exists gcloud compute networks subnets describe "$DEVBOX_SUBNET" --project="$PROJECT" --region="$REGION"; then
    gcloud compute networks subnets delete "$DEVBOX_SUBNET" --project="$PROJECT" --region="$REGION" --quiet
  fi

  if resource_exists gcloud compute addresses describe "$SERVERLESS_ADDRESS" --project="$PROJECT" --region="$REGION"; then
    printf 'UNAVOIDABLE PROVIDER RETENTION: %s still holds %s; leaving that subnet and %s.\n' \
      "$SERVERLESS_ADDRESS" "$SERVERLESS_SUBNET" "$NETWORK"
    return
  fi
  if resource_exists gcloud compute networks subnets describe "$SERVERLESS_SUBNET" --project="$PROJECT" --region="$REGION"; then
    gcloud compute networks subnets delete "$SERVERLESS_SUBNET" --project="$PROJECT" --region="$REGION" --quiet
  fi
  if resource_exists gcloud compute networks describe "$NETWORK" --project="$PROJECT"; then
    gcloud compute networks delete "$NETWORK" --project="$PROJECT" --quiet
  fi
}

verify_avoidable_absent() {
  local disk
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
  gcloud compute routers nats list --project="$PROJECT" --router="$ROUTER" --region="$REGION" --format='value(name)' 2>/dev/null \
    | grep -Fxq "$NAT" && die "$NAT still exists"
  resource_exists gcloud compute routers describe "$ROUTER" --project="$PROJECT" --region="$REGION" && die "$ROUTER still exists"
  resource_exists gcloud compute firewall-rules describe "$FIREWALL" --project="$PROJECT" && die "$FIREWALL still exists"
  resource_exists gcloud compute networks subnets describe "$DEVBOX_SUBNET" --project="$PROJECT" --region="$REGION" \
    && die "$DEVBOX_SUBNET still exists"
  resource_exists gcloud iam service-accounts describe "$DEVBOX_SA" --project="$PROJECT" && die "$DEVBOX_SA still exists"
  [[ -z $(gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
    --filter="bindings.members:serviceAccount:$DEVBOX_SA" --format='value(bindings.role)') ]] \
    || die "$DEVBOX_SA still has a project IAM binding"
}

report_provider_retention() {
  local -a remaining=()
  local bytes currency='$'
  resource_exists gcloud compute addresses describe "$SERVERLESS_ADDRESS" --project="$PROJECT" --region="$REGION" \
    && remaining+=("$SERVERLESS_ADDRESS")
  resource_exists gcloud compute networks subnets describe "$SERVERLESS_SUBNET" --project="$PROJECT" --region="$REGION" \
    && remaining+=("$SERVERLESS_SUBNET")
  resource_exists gcloud compute networks describe "$NETWORK" --project="$PROJECT" \
    && remaining+=("$NETWORK")
  bytes=$(soft_deleted_clervo_bytes)
  printf 'Remaining provider-managed resources: %s\n' "${remaining[*]:-none}"
  printf 'Remaining unavoidable GCS bytes: %s\n' "$bytes"
  printf 'Estimated avoidable Clervo fixed monthly cost: %s0\n' "$currency"
  if [[ "$bytes" == 0 ]]; then
    printf 'Estimated unavoidable temporary residual cost: %s0\n' "$currency"
  else
    printf 'Estimated unavoidable temporary residual cost: less than %s0.04 until Google hard-deletes the retained objects (latest recorded deadline 2026-08-27T22:23:16Z)\n' "$currency"
  fi
}

run_phase_a() {
  local disk local_instance
  local_instance=$(curl -fsS --max-time 2 -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/name' 2>/dev/null || true)
  [[ "$local_instance" != "$DEVBOX" ]] \
    || die 'Phase A must run from the external Mac, not from the Devbox being deleted'

  verify_no_non_devbox_clervo_runtime
  verify_devbox_dependencies
  if resource_exists gcloud compute instances describe "$DEVBOX" --project="$PROJECT" --zone="$DEVBOX_ZONE"; then
    verify_devbox_source_preserved
  else
    printf 'NOTE: %s is already absent; continuing an exact-resource Phase A retry.\n' "$DEVBOX"
  fi
  verify_bloxsniper

  printf 'PHASE A — AVOIDABLE COST DELETE NOW (account %s)\n' "$ACTIVE_ACCOUNT"
  if resource_exists gcloud compute instances describe "$DEVBOX" --project="$PROJECT" --zone="$DEVBOX_ZONE"; then
    gcloud compute instances delete "$DEVBOX" --project="$PROJECT" --zone="$DEVBOX_ZONE" --delete-disks=all --quiet
  fi
  for disk in "$DEVBOX" "$WORKSPACE_DISK"; do
    if resource_exists gcloud compute disks describe "$disk" --project="$PROJECT" --zone="$DEVBOX_ZONE"; then
      gcloud compute disks delete "$disk" --project="$PROJECT" --zone="$DEVBOX_ZONE" --quiet
    fi
  done
  delete_exact_snapshots_and_images
  delete_phase_a_network
  delete_devbox_identity

  verify_avoidable_absent
  verify_no_non_devbox_clervo_runtime
  verify_bloxsniper
  printf '\nCLERVO IMMEDIATE SHUTDOWN: PASS\n'
  printf 'Devbox VM: DELETED\nDevbox disks: DELETED\nDevbox snapshots: DELETED\n'
  printf 'Devbox NAT: DELETED\nDevbox router: DELETED\nDevbox service account: DELETED\n'
  report_provider_retention
  printf 'BloxSniper status: HEALTHY\nBloxSniper resources touched: NONE (read-only verification only)\n'
}

run_phase_b() {
  verify_avoidable_absent
  verify_no_non_devbox_clervo_runtime
  verify_bloxsniper
  if resource_exists gcloud compute addresses describe "$SERVERLESS_ADDRESS" --project="$PROJECT" --region="$REGION"; then
    printf '\nCLERVO PROVIDER CLEANUP: WAIT\n'
    printf '%s is still Google-owned; no deletion was attempted against its subnet or parent network.\n' "$SERVERLESS_ADDRESS"
    report_provider_retention
    printf 'BloxSniper status: HEALTHY\nBloxSniper resources touched: NONE (read-only verification only)\n'
    return
  fi
  if resource_exists gcloud compute networks subnets describe "$SERVERLESS_SUBNET" --project="$PROJECT" --region="$REGION"; then
    gcloud compute networks subnets delete "$SERVERLESS_SUBNET" --project="$PROJECT" --region="$REGION" --quiet
  fi
  if resource_exists gcloud compute networks describe "$NETWORK" --project="$PROJECT"; then
    gcloud compute networks delete "$NETWORK" --project="$PROJECT" --quiet
  fi
  verify_bloxsniper
  printf '\nCLERVO PROVIDER CLEANUP: PASS\n'
  report_provider_retention
  printf 'BloxSniper status: HEALTHY\nBloxSniper resources touched: NONE (read-only verification only)\n'
}

require_command gcloud
require_command git
require_command curl

[[ $# -eq 2 && ( "$1" == '--phase-a' || "$1" == '--phase-b' ) ]] \
  || die 'usage: finalize-clervo-devbox.sh --phase-a|--phase-b <pushed-finalizer-commit-sha>'
MODE=$1
EXPECTED_COMMIT=$2
[[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]] || die 'expected commit must be a full 40-character lowercase Git SHA'
verify_pushed_commit

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)
[[ -n "$ACTIVE_ACCOUNT" ]] || die 'gcloud has no active account; run gcloud auth login first'

case "$MODE" in
  --phase-a) run_phase_a ;;
  --phase-b) run_phase_b ;;
esac
