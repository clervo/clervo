# Skills inventory

The immediately discoverable Clervo catalog is deliberately limited to six
authority-specific skills:

| Skill | Trigger and unique role |
| --- | --- |
| `clervo-engineering-stage` | classify exact product/maintenance/read-only authority and stop boundaries before Clervo work |
| `clervo-cloud-cleanup` | prove ownership, dependency-ordered teardown, cost closure, and zero-resource checks |
| `clervo-benchmark-freeze` | predefine, split, hash, freeze, execute, and preserve independent evidence without leakage/reruns |
| `clervo-x402-proof` | fail closed unless exact bounded real-payment authority exists; prove single authorization, settlement, replay, and reconciliation |
| `clervo-release-handoff` | reconcile verification, lifecycle truth, costs, journal, commit, next proposal, and stop |
| `clervo-design-studio` | encode Clervo brand, truthful UI evidence, responsive/accessibility/motion/performance proof without granting product authority |

All skill directories pass the official skill-creator validator. Codex 0.146.0
prompt rendering discovers all six, including an explicit
`$clervo-cloud-cleanup` routing probe. The health report binds SHA-256 values for
every `SKILL.md` and `agents/openai.yaml` file.

Additional stage-specific skills stay deferred until an authorized stage needs
them. This avoids catalog/context overhead and prevents future workflow text
from appearing authoritative. Remove a skill by deleting only its reviewed
`.agents/skills/<name>` directory in an authorized maintenance commit; recover
it from Git and rerun validation and health.
