# Studio recovery and clean-VM restoration

## Prerequisites

- Ubuntu-compatible VM with AppArmor left enabled;
- Git checkout at `/workspace/clervo-next`;
- Codex CLI 0.146.0, Node 24.18.1/npm 10.9.8, Docker 29.7.1 with Compose,
  `jq`, `rg`, and ShellCheck;
- `$CODEX_HOME` set or defaulting to `/workspace/codex-home`;
- no production, IAM, billing, customer, wallet, payment, or personal-browser
  credentials on the machine.

## Restore

1. Verify the repository commit and clean-room authority files.
2. Run `bash scripts/codex-studio/install.sh`. This copies five profile
   templates, the reviewed hook/rules, and performs `npm ci --ignore-scripts`
   from the committed lockfile with Playwright browser download disabled.
3. Pull the exact Playwright image digest from `inventory.json` if absent.
4. Run the final health, MCP, isolation, navigation, compression, and visual-QA
   commands from `docs/operations/codex/README.md`.
5. Run repository secret and clean-room verification. Compare the new evidence
   with the recorded environment; investigate drift rather than relabeling it.

No secret is restored from Git. Figma/GitHub/cloud authentication remains a
separate human action only when exact authority exists.

## Rollback or uninstall

Profiles are recovered by checking out the desired committed templates and
rerunning the installer. To disable the studio without destroying evidence,
stop task-owned browser containers, move the five installed profile files and
`$CODEX_HOME/studio` to a dated quarantine directory outside Git, and retain
the repository sources. Delete only after verifying recovery and exact owner
authority. Do not remove the base Codex home, other profiles, Docker globally,
or unrelated project data.

Individual MCP and tool rollback procedures are in their inventories. A failed
upgrade must retain logs, lock diff, environment identity, and cleanup result.

## Disaster and snapshot readiness

Repository configuration, lockfiles, scripts, evidence, and documentation are
sufficient to reconstruct the studio. The one large external artifact is
identified by immutable browser-image digest. The installed copies are
byte-compared by health checks, and no machine-local secret is part of the
snapshot contract.

This proves snapshot readiness only. No billable VM snapshot, image, backup,
cloud resource, IAM binding, or billing change was created during this
maintenance. If a future snapshot is explicitly authorized, first stop all
containers, confirm a clean repository, exclude authentication/browser state,
record size/cost/retention/encryption, create exactly one named artifact, and
test restoration independently.
