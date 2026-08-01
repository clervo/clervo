#!/usr/bin/env bash
set -uo pipefail

qualification_dir="${1:-/tmp/clervo-stage4-qualification}"
browser_archive="${qualification_dir}/browser-image.tar.gz"
commerce_archive="${qualification_dir}/commerce-image.tar.gz"
seccomp_profile="${qualification_dir}/chromium-seccomp.json"
browser_output="${qualification_dir}/browser-result.json"
commerce_output="${qualification_dir}/commerce-result.json"
status_output="${qualification_dir}/execution-status.env"
browser_container="clervo-stage4-browser-final"
commerce_container="clervo-stage4-commerce-final"

expected_browser_archive="1e48ec0d102ee76c5a51b6175976a7c1acf74e1a12d0291d69b779f0d11c2377"
expected_commerce_archive="13c6659a1c82642980524e2efa461e265ca353f024e68b16bac7a9513f6ce78d"

for required in "${browser_archive}" "${commerce_archive}" "${seccomp_profile}"; do
  test -f "${required}" || { printf 'missing qualification input\n' >&2; exit 90; }
done
test "$(sha256sum "${browser_archive}" | cut -d ' ' -f 1)" = "${expected_browser_archive}" || exit 91
test "$(sha256sum "${commerce_archive}" | cut -d ' ' -f 1)" = "${expected_commerce_archive}" || exit 92
docker load --input "${browser_archive}" >/dev/null || exit 93
docker load --input "${commerce_archive}" >/dev/null || exit 94
docker image inspect clervo-stage4-browser:dev clervo-stage4-commerce:dev >/dev/null || exit 95

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker rm --force "${browser_container}" "${commerce_container}" >/dev/null 2>&1 || true

docker run --rm --name "${browser_container}" \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=268435456 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --security-opt "seccomp=${seccomp_profile}" \
  --pids-limit 128 \
  --memory 1073741824 \
  --cpus 2 \
  --env CLERVO_STAGE4_JAVASCRIPT_RUNS=20 \
  --env CLERVO_STAGE4_HOSTILE_RUNS=8 \
  clervo-stage4-browser:dev >"${browser_output}"
browser_status=$?

docker run --detach --name "${commerce_container}" \
  --network host \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=67108864 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 128 \
  --memory 536870912 \
  --cpus 1 \
  --env CLERVO_ENV=stage4-private-qualification \
  --env CLERVO_RELEASE_ID=stage4-final-qualification \
  --env CLERVO_HTTP_HOST=127.0.0.1 \
  --env CLERVO_PUBLIC_ORIGIN=https://127.0.0.1:8080 \
  --env CLERVO_STAGE4_PRIVATE_MOCK_COMMERCE=enabled \
  clervo-stage4-commerce:dev >/dev/null
commerce_start_status=$?

commerce_status=96
if test "${commerce_start_status}" -eq 0; then
  for _ in $(seq 1 30); do
    docker logs "${commerce_container}" 2>&1 | grep -q 'clervo.search.started' && break
    test "$(docker inspect "${commerce_container}" --format '{{.State.Running}}' 2>/dev/null)" = true || break
    sleep 1
  done
  docker exec "${commerce_container}" node ./infra/stage4/commerce-smoke.mjs >"${commerce_output}"
  commerce_status=$?
fi

docker rm --force "${commerce_container}" >/dev/null 2>&1 || true
docker rm --force "${browser_container}" >/dev/null 2>&1 || true
orphan_count="$(docker ps --all --filter 'name=clervo-stage4-' --format '{{.Names}}' | wc -l | tr -d ' ')"
finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  printf 'started_at=%s\n' "${started_at}"
  printf 'finished_at=%s\n' "${finished_at}"
  printf 'browser_status=%s\n' "${browser_status}"
  printf 'commerce_status=%s\n' "${commerce_status}"
  printf 'orphan_count=%s\n' "${orphan_count}"
} >"${status_output}"

test "${browser_status}" -eq 0 && test "${commerce_status}" -eq 0 && test "${orphan_count}" -eq 0
