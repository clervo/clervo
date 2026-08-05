# Authority map

| Truth | Live authority |
|---|---|
| Product promise and finish standard | `docs/PRODUCT.md` |
| Current public deployment and commercial truth | `packages/catalog/launch-state.v1.json` |
| Platform capability structure | `packages/catalog/platform-registry.v1.json` |
| Current objective and blockers | `docs/CURRENT-STATE.yaml` |
| Current implementation contract | Active Shop-Open issue |
| Generated public truth | `generated/public/**` |
| Stable engineering rules | `AGENTS.md` |
| Historical decisions and evidence | Git and `docs/archive/**` |

## Precedence

1. Security and protection of funds
2. Current approved ADRs
3. Product authority
4. Launch state
5. Active issue
6. Current state
7. Current implementation and deployment evidence
8. Agent instructions
9. Archived history

Do not silently reconcile conflicts. Record the conflict and the smallest
decision required.

Archived files are never loaded by default.
