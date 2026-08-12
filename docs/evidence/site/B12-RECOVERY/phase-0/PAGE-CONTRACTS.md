# B12 recovery — page contracts

These contracts are prerequisites, not design approval. Each archetype must be
reviewed again immediately before implementation against current canonical data
and observed behavior.

## 0. Global shell

- **PAGE PURPOSE:** Provide one stable Clervo identity, navigation system, accessibility foundation, and responsive frame without imposing one composition on every page.
- **PRIMARY AUDIENCE:** Every visitor, including keyboard, touch, reduced-motion, and deep-link users.
- **VISITOR QUESTION:** Where am I, where can I go, and what is the canonical next action?
- **FIRST-FOLD ANSWER:** Clervo identity, current primary destination, and one unambiguous Set up Clervo action.
- **PRIMARY ACTION:** Navigate to the route appropriate to the visitor's intent.
- **SECONDARY ACTION:** Open the compact site map/footer or mobile navigation.
- **TRUTH SOURCES:** Route inventory, canonical destination contracts, observed family truth for any global status note.
- **INFORMATION ARCHITECTURE:** Skip link; header/primary nav; route-owned main composition; optional archetype-local navigation; compact footer/site map.
- **UNIQUE VISUAL IDEA:** A quiet technical frame that lets cinematic, dense, operational, and editorial archetypes retain distinct grammar.
- **MOTION / INTERACTION ROLE:** Restrained focus/hover/menu transitions; global motion never claims product state.
- **MOBILE COMPOSITION:** Independent compact header and focus-trapped navigation dialog; no compressed desktop links.
- **NEXT JOURNEY:** Product, Models, Pricing, Docs, Status, or canonical Start according to label.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Missing routes keep a true 404 and useful recovery links; optional media failure never removes content or navigation.
- **REJECTION CONDITIONS:** Reject if the shell forces Instrument/LifecycleRail or one hero/panel grammar on all routes; hides navigation in media; changes Set up Clervo semantics; loses focus trap/Escape/scroll lock/current state; breaks 320px; or lets optional WebGL block content.

## 1. Home

- **PAGE PURPOSE:** Explain Clervo in five seconds and begin a real task or setup journey.
- **PRIMARY AUDIENCE:** New agent builders and technical evaluators.
- **VISITOR QUESTION:** What is Clervo, why does it matter, and what can I do now?
- **FIRST-FOLD ANSWER:** Give your agent a task; Clervo qualifies bounded work and returns an inspectable result.
- **PRIMARY ACTION:** Set up Clervo through the real Start path.
- **SECONDARY ACTION:** Explore current capabilities/models or run the real free-first path.
- **TRUTH SOURCES:** Launch identity, observed family truth, canonical catalog, current B11 package registry, proof record.
- **INFORMATION ARCHITECTURE:** Hero/action; operating explanation; capability discovery; result contract; free first; proof/evidence; final setup action.
- **UNIQUE VISUAL IDEA:** Cinematic Hollow Apex operating instrument resolving one task into one verified outcome.
- **MOTION / INTERACTION ROLE:** Teach request → qualify → execute → verify → receipt using truthful final states; no fake telemetry.
- **MOBILE COMPOSITION:** Promise/action first, static semantic instrument, short evidence stack, capability controls as touch-safe list/rail.
- **NEXT JOURNEY:** Product, Start, Models, or Proof according to intent.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Show truthful family unavailability and a useful alternative; never substitute fixture results.
- **REJECTION CONDITIONS:** Reject if Clervo identity or the core promise weakens; prototype setup becomes primary; fixture behavior masquerades as live; family content repeats without a new job; gold appears before proof; motion is decorative; mobile is compressed desktop; primary CTA is ambiguous/wrong; reduced motion loses information; keyboard/overflow/performance regress; or the page becomes another repeated panel stack.

## 2. Product overview

- **PAGE PURPOSE:** Explain why six families operate as one bounded Clervo layer.
- **PRIMARY AUDIENCE:** Technical product evaluators and platform architects.
- **VISITOR QUESTION:** Why not call providers directly, and what does Clervo add?
- **FIRST-FOLD ANSWER:** Clervo makes discovery, qualification, cost, execution, evidence, receipt, and replay one visible contract.
- **PRIMARY ACTION:** Inspect a real family/operation.
- **SECONDARY ACTION:** Start with the released integration path.
- **TRUTH SOURCES:** Catalog, observed lifecycle/proof, OpenAPI, onboarding/recovery, receipt and replay contracts.
- **INFORMATION ARCHITECTURE:** Intent; direct-provider gap; operating stages; six connected families; bounded authority; interfaces; next action.
- **UNIQUE VISUAL IDEA:** A connected operating topology where one task crosses explicit gates and resolves into evidence, not six cards.
- **MOTION / INTERACTION ROLE:** Step through qualification facts and resulting route; final state is accessible without motion.
- **MOBILE COMPOSITION:** Vertical gate sequence with family drill-down and no persistent decorative scene.
- **NEXT JOURNEY:** Selected family → operation → call example, or Start.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Gate stops with explicit reason, next action, and no execution claim.

## 3. Product family

- **PAGE PURPOSE:** Sell and explain one family's truthful outcomes and calling contract.
- **PRIMARY AUDIENCE:** Users with a family-specific task.
- **VISITOR QUESTION:** What can this family do now, what does it cost, what returns, and what can fail?
- **FIRST-FOLD ANSWER:** Family-specific outcome plus current serving/unavailable state.
- **PRIMARY ACTION:** Choose a current operation or real example.
- **SECONDARY ACTION:** Inspect pricing, docs, or related Models for AI.
- **TRUTH SOURCES:** Observed family truth, canonical operations, OpenAPI, pricing, source attribution, relevant proof.
- **INFORMATION ARCHITECTURE:** Outcome; operations; serving state; quote/cost; result/evidence; limits; failures; interfaces; next action.
- **UNIQUE VISUAL IDEA:** Search—source resolution; AI—model route; Sandbox—bounded runtime; Prediction—market comparison; Crypto—evidence-backed derived signal; RPC—honest blocked architecture.
- **MOTION / INTERACTION ROLE:** Explain the family's actual qualification mechanism; unavailable RPC remains static and explicit.
- **MOBILE COMPOSITION:** State and operation choice first; complex visuals simplify to labelled semantic stages.
- **NEXT JOURNEY:** Operation detail, Model catalog/detail, Pricing, or Start.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Family reason and recovery/replacement path; RPC never implies live service.

## 4. Models catalog

- **PAGE PURPOSE:** Help a technical user find the right current Clervo model ID.
- **PRIMARY AUDIENCE:** AI developers and model evaluators.
- **VISITOR QUESTION:** Which model matches my modality, capabilities, price, parameters, and availability?
- **FIRST-FOLD ANSWER:** A searchable technical catalog with current result count and backed filters.
- **PRIMARY ACTION:** Open a matching model detail.
- **SECONDARY ACTION:** Switch technical/list view or inspect AI operation docs.
- **TRUTH SOURCES:** `models.json`, reviewed creator map, observed routes, pricing, supported parameters only where canonical.
- **INFORMATION ARCHITECTURE:** Search; backed filters; sort if backed; list/table; identity/state legend; requested model/alias; creator; execution supplier; resolved canonical model; Clervo route/availability; results; empty state; AI operation path.
- **UNIQUE VISUAL IDEA:** Dense routing index that visibly distinguishes requested aliases from creator identity, supplier execution, resolved canonical models, and Clervo route state.
- **MOTION / INTERACTION ROLE:** Filtering visibly resolves the eligible set; no fake route execution.
- **MOBILE COMPOSITION:** Sticky search, filter drawer/chips, compact result rows, optional technical disclosure, no clipped table.
- **NEXT JOURNEY:** Model detail → relevant operation → integration example.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Explain why no model matches and offer safe filter reset; paused/unavailable remains visible.
- **REJECTION CONDITIONS:** Reject if creator equals supplier, aliases look Clervo-created, requested and resolved IDs blur together, filters lack authority, browser Find/screen-reader semantics are lost, or virtualization is added without measured necessity and accessibility/prerender/deep-link parity.

## 5. Model detail

- **PAGE PURPOSE:** Make one model ID understandable and callable without Home context.
- **PRIMARY AUDIENCE:** Developer arriving from catalog, search, or deep link.
- **VISITOR QUESTION:** What exactly is this ID, who created it, what can it do, and how do I call it?
- **FIRST-FOLD ANSWER:** Human name, creator, exact copyable Clervo ID, canonical/alias status, modality, and availability.
- **PRIMARY ACTION:** Copy ID or open the relevant executable operation example.
- **SECONDARY ACTION:** Compare related models or return to filtered Models.
- **TRUTH SOURCES:** Canonical model document, creator review map, pricing, route/supplier truth where public, operation mapping.
- **INFORMATION ARCHITECTURE:** Identity; availability; tasks/modalities/parameters; pricing; examples; route/evidence; related models.
- **UNIQUE VISUAL IDEA:** Identity dossier with the canonical ID as a primary technical object, not a footnote.
- **MOTION / INTERACTION ROLE:** Copy and client switching only; no decorative motion required.
- **MOBILE COMPOSITION:** Break long IDs safely, one-column facts, horizontally scrollable code, compact related list.
- **NEXT JOURNEY:** Relevant operation/reference or another model.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** State and blockers are prominent; unsupported metadata is omitted or labelled unknown, never inferred.

## 6. Operation detail

- **PAGE PURPOSE:** Let an engineer understand and call one canonical operation.
- **PRIMARY AUDIENCE:** Implementing developer.
- **VISITOR QUESTION:** What is the exact request, response, price/payment behavior, failure contract, and interface syntax?
- **FIRST-FOLD ANSWER:** Operation ID, family, lifecycle, endpoint/interface, and whether it is callable now.
- **PRIMARY ACTION:** Copy a mechanically validated example.
- **SECONDARY ACTION:** Inspect schema/OpenAPI or relevant model/family.
- **TRUTH SOURCES:** OpenAPI, generated catalog, observed truth, pricing, onboarding recovery, released packages, proof records.
- **INFORMATION ARCHITECTURE:** Overview; request fields; result; state; quote/spend; evidence/receipt; clients; errors/limits; replay/reconcile; related operations.
- **UNIQUE VISUAL IDEA:** Executable contract workspace, not marketing story or simulated execution console.
- **MOTION / INTERACTION ROLE:** Client/schema switching and copy feedback. A request builder, schema explorer, preflight, or quote inspector must perform a real safe contract action or generate a real executable request; otherwise it must be an isolated explicit demo. No disconnected fixture execution.
- **MOBILE COMPOSITION:** Sticky compact operation identity, collapsible schema groups, scrollable code/tables, anchored section menu.
- **NEXT JOURNEY:** Integration docs, model detail, family, or Start.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Uncallable operations disable execution CTA and show reason/alternative; unknown contract fields remain explicit.
- **REJECTION CONDITIONS:** Reject any visually convincing execution/quote/replay control that only mutates fixture state; unvalidated examples; stale clients; hidden lifecycle/price/failure truth; or unavailable operations with active execution affordances.

## 7. Docs / developer portal

- **PAGE PURPOSE:** Provide authoritative task, concept, integration, reference, and recovery documentation.
- **PRIMARY AUDIENCE:** Developers from first install through production recovery.
- **VISITOR QUESTION:** How do I integrate, understand, call, and recover Clervo?
- **FIRST-FOLD ANSWER:** Current location, article purpose, search, and immediate task path—not a marketing promise.
- **PRIMARY ACTION:** Follow the article's real procedure or copy its validated example.
- **SECONDARY ACTION:** Search docs or move previous/next.
- **TRUTH SOURCES:** Released package manifests/registries, Router/MCP/SDK source, OpenAPI, schemas, onboarding/recovery, catalog.
- **INFORMATION ARCHITECTURE:** Get Started; Connect; Core Concepts; Products; AI/Models; Reference; Recovery/Troubleshooting.
- **UNIQUE VISUAL IDEA:** Information-dense three-region developer workspace: nav, article, optional page outline.
- **MOTION / INTERACTION ROLE:** Static-index search defined in `DOCS-SEARCH-CONTRACT.md`, navigation drawer, code/client switching, and copy; reading never depends on animation.
- **MOBILE COMPOSITION:** Search and current location first; accessible nav drawer; one-column article; readable code; optional TOC disclosure.
- **NEXT JOURNEY:** Quickstart → integration → operation reference → recovery concept as needed.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Search empty state suggests models/operations/errors; unavailable docs say why and link to current state.
- **REJECTION CONDITIONS:** Reject if Docs reuses the marketing shell unchanged; search is browser Find or opens only document roots; hierarchy/current location is absent; examples are stale/unreleased; code is unusable on mobile; or navigation/search fails keyboard, touch, focus return, or 320px.

## 8. Start / Connect

- **PAGE PURPOSE:** Activate a real released Clervo integration and return the first useful free result.
- **PRIMARY AUDIENCE:** New developer or agent operator ready to install.
- **VISITOR QUESTION:** Which interface should I choose and how do I verify it works safely?
- **FIRST-FOLD ANSWER:** Choose Router/CLI, MCP, TypeScript, Python, or OpenAI-compatible; each is currently released with exact version truth.
- **PRIMARY ACTION:** Select an interface and copy/run the real install + verification path.
- **SECONDARY ACTION:** Read the Quickstart article or raw HTTP path.
- **TRUTH SOURCES:** Current package registries, package READMEs/source, free route observation, onboarding/recovery, public API state.
- **INFORMATION ARCHITECTURE:** Choose; install; verify; free result; wallet when needed; limits; paid use; receipt; replay; reconcile; doctor.
- **UNIQUE VISUAL IDEA:** Guided activation rail where five clients converge on one Clervo Connect core and one free-first outcome.
- **MOTION / INTERACTION ROLE:** Progress advances only from user choice/evidence, not fake install timers.
- **MOBILE COMPOSITION:** Interface picker as large list; one step at a time; copyable commands; persistent progress/current action.
- **NEXT JOURNEY:** First result, relevant docs, operation reference, or Models.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Unsupported environment, install failure, API unavailable, and paid-recovery states each provide safe next action; no pretend success.
- **REJECTION CONDITIONS:** Reject if prototype/design-target language leads; any released B11 interface is omitted or invented; a fake timer/page view marks completion; wallet appears before needed; free-first is not real; versions are stale; failure/reconcile/doctor paths are absent; or mobile/keyboard copy controls fail.

## 9. Activation compatibility (`/build`)

- **PAGE PURPOSE:** Preserve the historical URL while directing its onboarding intent to the one canonical Start / Connect system.
- **PRIMARY AUDIENCE:** Visitor or old bookmark arriving at `/build`.
- **VISITOR QUESTION:** Where do I set up Clervo now?
- **FIRST-FOLD ANSWER:** Setup lives at `/start`; transition there without presenting a second product.
- **PRIMARY ACTION:** Continue to `/start` through a permanent redirect where safely supported.
- **SECONDARY ACTION:** None required beyond normal global navigation.
- **TRUTH SOURCES:** Route/link/discovery audit and the final `/build` disposition.
- **INFORMATION ARCHITECTURE:** Redirect; or minimal compatibility transition with `/start` canonical metadata.
- **UNIQUE VISUAL IDEA:** None; compatibility is infrastructure, not an archetype to market.
- **MOTION / INTERACTION ROLE:** None.
- **MOBILE COMPOSITION:** Same redirect/transition behavior.
- **NEXT JOURNEY:** `/start`.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** If redirect support is unavailable, render the Start entry and preserve a direct canonical link; never restore fixture progress.

## 10. Pricing

- **PAGE PURPOSE:** Make current Clervo per-operation economics understandable before action.
- **PRIMARY AUDIENCE:** Commercial evaluator and cost-conscious developer.
- **VISITOR QUESTION:** What is free, what quotes, what is the maximum, and when am I charged?
- **FIRST-FOLD ANSWER:** Free-first exists; payable work is operation/model dependent and bounded before authorization.
- **PRIMARY ACTION:** Compare current operations and inspect one price/quote contract.
- **SECONDARY ACTION:** Start free or open relevant product.
- **TRUTH SOURCES:** Generated pricing, observed quote/price, model pricing, onboarding/payment/replay contracts.
- **INFORMATION ARCHITECTURE:** Free first; compact comparison; dynamic price explanation; refusal/failure/replay; asset/network; Start.
- **UNIQUE VISUAL IDEA:** Compact economic ledger with fixed/request-derived/model-metered shapes directly comparable.
- **MOTION / INTERACTION ROLE:** Filter/select actual pricing records; no simulated approval or charge.
- **MOBILE COMPOSITION:** Stacked comparison rows with essential price visible before disclosure.
- **NEXT JOURNEY:** Product/operation or Start.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Unavailable product has no sellable price; missing price is explicit and cannot create an approval CTA.

## 11. Status

- **PAGE PURPOSE:** Report current observed operational state first.
- **PRIMARY AUDIENCE:** Active user diagnosing availability and evaluator checking current service state.
- **VISITOR QUESTION:** What is serving now, what is degraded/unavailable, when was it observed, and why?
- **FIRST-FOLD ANSWER:** Observation timestamp plus family/component state and active degradation summary.
- **PRIMARY ACTION:** Drill into affected family/model/operation.
- **SECONDARY ACTION:** Inspect proof/evidence or subscribe/history only if a real system exists.
- **TRUTH SOURCES:** Live registry observation, status projection, route/model health; incident source only if canonical.
- **INFORMATION ARCHITECTURE:** Current summary; timestamp; families; route/model degradation; reasons; limitations; links.
- **UNIQUE VISUAL IDEA:** Operational state board with restrained Clervo semantics, not a cinematic marketing hero.
- **MOTION / INTERACTION ROLE:** State drill-down and truthful refresh indication; no fake live telemetry.
- **MOBILE COMPOSITION:** Summary and affected items first; expandable component detail; timestamp remains visible.
- **NEXT JOURNEY:** Affected product/model/operation, Proof, or Security.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Missing incident/history authority says unavailable without implying zero incidents or SLA.

## 12. Proof

- **PAGE PURPOSE:** Explain and expose real Clervo proof structures and their boundaries.
- **PRIMARY AUDIENCE:** Trust evaluator, paying operator, and developer inspecting receipts/evidence.
- **VISITOR QUESTION:** What does proof mean, what was verified, and what does it not prove?
- **FIRST-FOLD ANSWER:** Proof binds operation, result, evidence/provenance, receipt/settlement, replay/reconciliation, and proof level.
- **PRIMARY ACTION:** Inspect a redacted canonical proof/receipt anatomy.
- **SECONDARY ACTION:** Open Proof Lab or current Status.
- **TRUTH SOURCES:** Approved/redacted proof records, receipt schema, observed proof levels, onboarding/recovery.
- **INFORMATION ARCHITECTURE:** Definition; proof levels; artifact anatomy; settlement/replay/reconcile; owner-funded boundary; Lab link.
- **UNIQUE VISUAL IDEA:** Receipt/evidence artifact as the strongest object, with fields connected to their authority.
- **MOTION / INTERACTION ROLE:** Inspect layers of one artifact; replay reconnects to the same identity without inventing a transaction.
- **MOBILE COMPOSITION:** Receipt fields as readable stacked record; evidence disclosures remain keyboard/touch accessible.
- **NEXT JOURNEY:** Status, Security, relevant operation, or named Proof Lab.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Missing proof remains “not demonstrated”; owner-funded proof never becomes customer demand.

## 13. Proof Lab / demo

- **PAGE PURPOSE:** Teach request-to-receipt mechanics with an unmistakably local deterministic fixture.
- **PRIMARY AUDIENCE:** Learner who wants to inspect behavior without a real transaction.
- **VISITOR QUESTION:** How does the mechanism behave, including refusal and recovery?
- **FIRST-FOLD ANSWER:** Demonstration/fixture/no real customer transaction; no network/provider/wallet/payment action.
- **PRIMARY ACTION:** Run the local deterministic sequence.
- **SECONDARY ACTION:** Inspect the separate real proof or Quickstart.
- **TRUTH SOURCES:** Fixture schema/state machine plus links to separate canonical proof and docs.
- **INFORMATION ARCHITECTURE:** Boundary; request; qualify; quote; approve; evidence; result; receipt; recover.
- **UNIQUE VISUAL IDEA:** Inspectable local console tied to explicit state evidence.
- **MOTION / INTERACTION ROLE:** Deterministic semantic state transition; reduced motion renders each completed state immediately.
- **MOBILE COMPOSITION:** One stage at a time with sticky state summary and full touch/keyboard control.
- **NEXT JOURNEY:** Real Proof, Docs, Start.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Fixture failures are deliberate named scenarios and cannot imply production incidents.

## 14. Trust / Security / Legal

- **PAGE PURPOSE:** Organize specific mechanisms, policies, boundaries, and unclaimed assurance by subject.
- **PRIMARY AUDIENCE:** Security, legal, privacy, procurement, and technical evaluators.
- **VISITOR QUESTION:** How is authority bounded, data handled, money controlled, and uncertainty recovered?
- **FIRST-FOLD ANSWER:** Specific implemented/published mechanisms and explicit assurance gaps, not adjectives.
- **PRIMARY ACTION:** Inspect the relevant subject/control/policy.
- **SECONDARY ACTION:** Open Proof, Status, or recovery docs.
- **TRUTH SOURCES:** Security mechanisms in Router/SDK/runtime, wallet handling, payment/replay/reconciliation contracts, public policies, supplier boundaries.
- **INFORMATION ARCHITECTURE:** Security; custody/secrets; spend/payment; replay/settlement; data/suppliers; proof boundary; privacy/legal.
- **UNIQUE VISUAL IDEA:** Structured boundary map and evidence ledger by subject.
- **MOTION / INTERACTION ROLE:** Subject navigation and disclosure only; motion is unnecessary.
- **MOBILE COMPOSITION:** Topic index and stacked control records; policy links remain primary.
- **NEXT JOURNEY:** Proof, Status, Docs recovery, or public policy.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** Certifications/audits not held are “not claimed”; missing public policy is a blocker, not placeholder copy.

## 15. Compare / Research / Benchmarks

- **PAGE PURPOSE:** Publish dated, sourced analytical methods and observations without SEO spam.
- **PRIMARY AUDIENCE:** Technical evaluator comparing approaches or inspecting research quality.
- **VISITOR QUESTION:** What was measured/observed, how, against what, and what cannot be concluded?
- **FIRST-FOLD ANSWER:** Date, question, method, evidence source, and limitation.
- **PRIMARY ACTION:** Inspect methodology/raw evidence or the relevant product contract.
- **SECONDARY ACTION:** View current Status/Proof.
- **TRUTH SOURCES:** Dated primary sources, reproducible benchmark artifacts, explicit methodology and limitations.
- **INFORMATION ARCHITECTURE:** Question; date; methodology; dimensions; observations; sources; limitations; related product.
- **UNIQUE VISUAL IDEA:** Editorial analytical worksheet/table, not product cards or unsourced score bars.
- **MOTION / INTERACTION ROLE:** Filter dimensions or compare sourced rows; no decorative chart animation.
- **MOBILE COMPOSITION:** Each comparison dimension becomes a readable record; tables support deliberate horizontal/stacked behavior.
- **NEXT JOURNEY:** Relevant product/operation, Proof, or methodology artifact.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** No data produces a publication contract/empty state, never a superiority claim.

## 16. Changelog

- **PAGE PURPOSE:** Show dated, sourced product/release changes and their practical impact.
- **PRIMARY AUDIENCE:** Existing users and developers tracking compatibility/behavior.
- **VISITOR QUESTION:** What changed, when, why does it matter, and where are the docs?
- **FIRST-FOLD ANSWER:** Latest dated entries, not a marketing hero.
- **PRIMARY ACTION:** Open the relevant docs/product/release detail.
- **SECONDARY ACTION:** Filter/search entries or inspect current Status.
- **TRUTH SOURCES:** Repository release truth, package releases, generated observations clearly typed as observations.
- **INFORMATION ARCHITECTURE:** Search/filter; chronological entries; release/product; impact; links; source note.
- **UNIQUE VISUAL IDEA:** Precise chronological release ledger with change type and impact.
- **MOTION / INTERACTION ROLE:** Search/filter only.
- **MOBILE COMPOSITION:** Date and impact remain visible; metadata stacks without tiny type.
- **NEXT JOURNEY:** Docs, product, operation, Status.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** No matching entries suggests reset; missing historical source is explicit.

## 17. Utility / 404

- **PAGE PURPOSE:** Confirm the path does not exist and recover the visitor.
- **PRIMARY AUDIENCE:** Any visitor following a stale or mistyped URL.
- **VISITOR QUESTION:** What happened and where can I go?
- **FIRST-FOLD ANSWER:** This route has no contract; it is a real noindex 404.
- **PRIMARY ACTION:** Go to the most likely canonical destination.
- **SECONDARY ACTION:** Home, Models, Docs, Start, Product choices.
- **TRUTH SOURCES:** Canonical route inventory and deployment 404 handling.
- **INFORMATION ARCHITECTURE:** Error statement; recovery links; optional search if shared docs/catalog index supports it.
- **UNIQUE VISUAL IDEA:** Compact unresolved-path expression using Clervo identity without a full marketing composition.
- **MOTION / INTERACTION ROLE:** None required.
- **MOBILE COMPOSITION:** Immediate error and large recovery actions.
- **NEXT JOURNEY:** Home, Models, Docs, Start, Product.
- **FAILURE / EMPTY / UNAVAILABLE STATE:** The 404 is the state; never render a 200 SPA fallback in production.
