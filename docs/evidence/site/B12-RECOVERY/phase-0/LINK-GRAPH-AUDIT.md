# B12 recovery — link graph and CTA audit

## Graph result

Graph reachability and semantic journey correctness are separate gates. This
section records the graph; `CANONICAL-JOURNEYS.md` records label, user intent,
destination, and required destination state for the accepted journeys.

The rendered production crawl recorded 7,714 anchor contracts and 7,165 edges
whose destinations are canonical page routes.

- Orphan canonical routes: **0**
- Pages with no onward canonical action: **0**
- Generated model/operation pages without contextual links: **0**
- Dead or noncanonical visible operation destinations: **6**
- Production unknown route behavior: **404**

The full source page, label, destination, internal/external flag, desktop
visibility, mobile visibility, and current-page state are in
`production/forensic-audit.json.gz` under `linkGraph.linkContracts`.

`interaction-contracts.json.gz` expands the rendered inventory to 8,716 anchor,
button, input, select, and related control instances. It records source page,
source archetype, visible label, inferred Phase 0 user intent, destination,
internal/external/local scope, expected destination state, desktop/mobile
behavior, future analytics identity, disabled state, and test status. This is
the exhaustive mechanical contract inventory; material CTA semantics remain a
manual archetype-approval gate.

## Invalid destinations

All six are Home fixture-catalog controls. JavaScript prevents default
navigation, but they remain anchors and promise unavailable destinations to
keyboard, touch, and assistive-technology users.

| Visible intent | Current destination | Canonical recovery target |
| --- | --- | --- |
| Research and verify | `/operations/search.research.verify` | `/operations/search.web` |
| Run bounded AI | `/operations/ai.run.bounded` | `/operations/ai.execute` |
| Execute bounded sandbox | `/operations/sandbox.execute.bounded` | `/operations/sandbox.run` |
| Inspect prediction market | `/operations/prediction.inspect.market` | `/operations/prediction.market` |
| Analyze protocol | `/operations/crypto.analyze.protocol` | `/products/crypto` because no canonical protocol-analysis operation matches |
| Verify chain state | `/operations/rpc.verify.chain-state` | `/products/rpc`, with explicit unavailable state and no live CTA |

## CTA semantic findings

- “Set up Clervo” consistently points to `/start`; preserve this canonical
  meaning during recovery.
- “Catalog” currently means both `/catalog` and `/docs/catalog`; labels should
  become “Models” and “Catalog concept” (or similarly explicit) so user intent
  is not overloaded.
- “Explore the catalog” appears as both an intercepted same-page anchor and a
  route link. Final controls must either scroll to a real catalog section or
  navigate to Models, never suppress the action.
- Operation-template labels such as “Inspect contract” and “Open contract” are
  repeated across generated routes and are contextually valid because their
  adjacent operation ID disambiguates them.
- Status family rows currently do not provide direct product/model drill-down
  from every affected state. This is a product-graph gap even though no page is
  mechanically orphaned.
- Model details link to related models and Docs but do not consistently link to
  the relevant operation for the model modality. This is a journey gap, not an
  orphan.

## Journey graph implications

| Journey | Current graph state | Required recovery |
| --- | --- | --- |
| Home → Product → Start → free first | Reaches Start, then enters prototype | Replace Start destination experience with released B11. |
| Docs → integration → install → reference | Real quickstart routes exist but `/docs` is a marketing index | Add docs shell/search and operation-reference adjacency. |
| Models → detail → operation → example | Catalog and detail exist; operation adjacency is weak | Add modality/operation mapping and executable client examples. |
| Pricing → product → quote → Start | Links exist; fixture approval interrupts explanation | Keep registry price and link to real activation. |
| Status → Proof → Security | Routes exist; Status drill-down is incomplete | Link affected state to family/model/operation detail. |
| Deep model/operation → onward action | All generated pages have onward links | Improve relevance; preserve generation and canonical URLs. |

## Test status

The crawl proves existence and rendered visibility at desktop and mobile. It
does not claim that every label is semantically approved. Each archetype
evidence pack must include a smaller reviewed link-contract table, and the final
journey pass must activate every major CTA.
