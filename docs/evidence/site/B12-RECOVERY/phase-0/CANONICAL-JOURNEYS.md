# B12 recovery — canonical journeys and semantic link acceptance

## Two different gates

**Graph reachability** asks whether routes have valid incoming/outgoing edges,
avoid chains, and resolve. **Semantic journey correctness** asks whether the
label and destination fulfill the visitor's intent in the destination's actual
state. Both must pass; HTTP 200 alone is insufficient.

## Canonical journeys

### New customer

`Home → Product or Start → released integration choice → real free-first result`

Home's primary CTA is **Set up Clervo** → `/start`. Product education uses
**See how Clervo works** → `/product`. Start must lead to released B11 clients,
not a prototype flow, and the free-first action must map to the current free
operation.

### Developer

`Docs → client integration → install/code example → operation reference → Start`

Docs results and article links must deep-link to the relevant section. Client
examples must identify their released package version and relevant canonical
operation. **Set up Clervo** retains the same `/start` meaning as Home.

### Model user

`Models → Model Detail → modality-relevant operation → executable example`

The model page must distinguish requested alias, creator, execution supplier,
resolved canonical model, and Clervo route/availability. The operation link is
chosen by supported modality/capability metadata, not by a generic AI landing
page.

### Commercial evaluator

`Pricing → product or operation → quote/payment explanation → Start`

Pricing rows link to the operation whose fixed or request-derived price is
being explained. Refusal, failure, replay, and settlement language remains
adjacent. No invented plan/tier intercepts the path.

### Trust evaluator

`Status → Proof → Security or Payment Safety → Trust Center`

Status links affected family/model/operation state to its detail. Proof links
to evidence/receipt explanation. Security and Payment Safety retain separate
domains under shared Trust Center navigation.

### Generated deep-link visitor

`Model or operation deep link → identity/context/current state → relevant operation/model/docs → Start`

The first fold explains Clervo context without requiring Home. Every generated
page has at least one job-relevant onward link; generic footer reachability does
not satisfy this journey.

## Six rejected Home destinations — final contracts

| Label | User intent | Final destination | Required destination state |
| --- | --- | --- | --- |
| Research and verify a current claim | Call a serving evidence-backed Search operation | `/operations/search.web` | Canonical live Search contract with real examples |
| Analyze an on-chain protocol | Understand current Crypto Intelligence outcomes without pretending a protocol-analysis operation exists | `/products/crypto` | Honest family page listing only canonical wallet-intelligence operations |
| Verify chain state across networks | Understand RPC's architectural role and current availability | `/products/rpc` | Explicit unavailable state; no live execution CTA before B14 |
| Run a bounded model task | Call a canonical bounded AI execution operation | `/operations/ai.execute` | Canonical operation contract with current lifecycle and client examples |
| Execute code in a bounded runtime | Call the bounded Sandbox run operation | `/operations/sandbox.run` | Canonical operation contract with limits/failures |
| Inspect a prediction market | Retrieve one current market contract | `/operations/prediction.market` | Canonical live Prediction operation contract |

The disconnected Home fixture catalog is removed during Home recovery. The
contracts above govern replacement capability links; no click is intercepted.

## Major CTA acceptance record

| Source | Label | User intent | Destination | Destination state required | Phase 0 status |
| --- | --- | --- | --- | --- | --- |
| Global header/footer | Set up Clervo | Install/connect through released B11 | `/start` | Real integration chooser | Correct destination; destination archetype pending rebuild |
| Home | See how Clervo works | Understand one operating layer | `/product` | Product overview, not Home repetition | Final Home contract |
| Home | Explore capabilities | Choose a current family | `/product#capabilities` or direct family links | Registry-backed current state | Final Home contract |
| Home | Browse models | Find a model | `/catalog` | Dense searchable explorer | Correct route; destination archetype pending rebuild |
| Docs | Set up Clervo | Move from instructions to activation | `/start` | Same canonical onboarding | Final Docs contract |
| Model detail | Use this model | Call relevant modality | relevant `/operations/*` | Exact executable contract | Mapping required in Model phase |
| Pricing row | Inspect operation | Understand specific economics | exact `/operations/*` | Matching fixed/dynamic quote state | Existing ledger pattern retained |
| Status state | Inspect affected product | Understand impact/context | family/model/operation | Matching observed state | Required in Status phase |
| Proof | Security boundaries | Evaluate mechanisms | `/security` | Security-specific content | Required in Trust architecture |

Final journey automation must activate the material controls and verify label,
destination, and state; the Phase 0 raw interaction ledger is only the starting
inventory.
