# Security and permission matrix

| Boundary | Engineering/design | Studio maintenance | Browser debug | Visual QA |
| --- | --- | --- | --- | --- |
| Filesystem | repository write only; no `/tmp` write | host access for maintenance | host agent; browser has no host mount | host agent; browser gets repository + studio mounts for test only |
| Shell network | denied | available for maintenance | disabled Web search; local DevTools target | browser container `--network=none` |
| Approval policy | never | never | never | never |
| Inherited secrets | filtered by name | filtered more broadly | filtered more broadly | filtered more broadly |
| Command hook | restrictive sandbox is primary | mandatory reviewed hook | mandatory reviewed hook | mandatory reviewed hook |
| Global rules | forbidden dangerous prefixes | forbidden dangerous prefixes | forbidden dangerous prefixes | forbidden dangerous prefixes |
| Browser state | none | none | fresh `/tmp`, loopback 9223 | fresh process/container, no DevTools MCP |
| MCP writes | no writable MCP retained | no writable MCP retained | external navigation and dangerous inputs denied | no MCP |

Independent deny layers cover destructive Git/filesystem operations; broad
Docker deletion; privilege/security-control changes; cloud deployment, billing,
IAM, secrets and infrastructure mutation; wallet/payment commands; production
mutations; legacy/unrelated paths; credential-file access; environment dumps;
and external browser navigation. The rules and hook complement rather than
replace OS/cloud controls.

Known limitation: a host-capable process is not an OS security boundary against
every possible program encoding. Therefore those profiles remain limited to
maintenance or isolated browser work, inherit no common
credential variables, run without supported sudo, and must not have production,
wallet, IAM, or billing credentials placed on the VM. Critical cloud safeguards
must also be enforced by project separation, least-privilege identities,
budgets, provider policy, and absent secrets.

Figma is disabled. No personal browser profile is mounted. No legacy directory,
unrelated project, production endpoint, wallet, payment rail, or cloud resource
is connected by the studio.
