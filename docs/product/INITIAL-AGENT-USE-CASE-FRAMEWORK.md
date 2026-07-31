# Initial agent and use-case framework

## Revenue model

Clervo can earn at five layers without changing the underlying versioned capability contracts:

1. **Raw API/x402 calls** — metered direct use of proven Search, AI, and Sandbox products.
2. **Prebuilt agent templates** — paid or sponsored reusable workflow definitions customers operate.
3. **Paid ready-made agents** — Clervo-hosted bounded jobs with a clear useful-result contract.
4. **Custom business agents** — scoped configuration and integration work on the same stable calls.
5. **Recurring managed workflows** — scheduled lawful monitoring/processing with budgets, review, alerts, and receipts.

Every layer exposes the exact calls, maximum charge, provenance, verification, failure state, and receipt. A template or agent never grants broader data rights, network access, sandbox permissions, or provider identity substitution. The following is a ranked backlog, not implemented inventory.

## Ranked initial backlog

### 1. Competitor change monitor — launch candidate

- **Customer:** product marketing or strategy lead at a B2B software company.
- **Job:** monitor named competitors' public product, pricing, documentation, and release pages; produce a cited change brief.
- **Why they pay:** replaces repetitive manual review and shortens response time.
- **Required Clervo calls:** `search.web`, `search.answer`, `ai.chat`, `sandbox.run` for bounded diff/tabulation.
- **Recurring behavior:** scheduled weekly and event-triggered reruns with deduplicated alerts.
- **Lawful-data boundary:** public pages permitted for retrieval; robots/terms respected; no login bypass, personal profiling, or copyrighted full-page redistribution.
- **Proof/demo needed:** recorded then live two-week change corpus, citation validity, false-change rate, bounded execution, degradation, alert, cost, and receipt proof.
- **Monetization:** per run plus managed monthly workflow.

### 2. Commerce price-and-assortment brief — launch candidate

- **Customer:** independent retailer or ecommerce category manager.
- **Job:** find public product offers for an owner-supplied SKU/category and return normalized, time-stamped comparisons.
- **Why they pay:** saves catalog research and highlights actionable assortment/price changes.
- **Required Clervo calls:** `search.web`, `search.answer`, `ai.chat`, `sandbox.run` for deterministic normalization.
- **Recurring behavior:** daily or weekly bounded watchlists.
- **Lawful-data boundary:** public merchant pages and licensed supplier feeds only; no checkout automation, access-control evasion, or unsupported price guarantees.
- **Proof/demo needed:** exact-SKU test set, currency/unit normalization, freshness, citation, missing-data, stale-price, cost, and receipt proof.
- **Monetization:** per SKU batch and recurring watchlist subscription.

### 3. Real-estate research monitor — launch candidate

- **Customer:** small property investor or buyer's research analyst.
- **Job:** track owner-selected public listings, planning sources, and local market pages; summarize material changes with citations.
- **Why they pay:** consolidates fragmented recurring research without pretending to provide valuation or legal advice.
- **Required Clervo calls:** `search.web`, `search.answer`, `ai.chat`, `sandbox.run` for lawful structured comparison.
- **Recurring behavior:** scheduled watchlists and change alerts.
- **Lawful-data boundary:** public/licensed sources only; no gated listing scraping, discrimination-sensitive ranking, personal dossiers, or automated high-impact decisions.
- **Proof/demo needed:** jurisdiction-labeled source set, change detection, freshness, attribution, false-alert, safe-language, cost, and receipt proof.
- **Monetization:** per property/watchlist and managed monthly workflow.

### 4. Company and lead research dossier — launch candidate

- **Customer:** B2B account executive or sales operations analyst.
- **Job:** assemble a cited company-level dossier and public business signals for owner-named accounts.
- **Why they pay:** reduces account-research time and improves call preparation.
- **Required Clervo calls:** `search.web`, `search.answer`, `ai.chat`, `sandbox.run` for structured field validation.
- **Recurring behavior:** refresh before meetings or on a bounded account cadence.
- **Lawful-data boundary:** company/public professional information; no sensitive personal data, contact harvesting, data-broker enrichment, or unsolicited outreach execution.
- **Proof/demo needed:** field provenance, entity disambiguation, stale/conflict handling, omission over fabrication, cost, and receipt proof.
- **Monetization:** per dossier, team template, or bounded managed account list.

### 5. Evidence-backed market brief — launch candidate

- **Customer:** founder, investor research associate, or corporate strategy analyst.
- **Job:** answer a scoped market question with current sources, competing evidence, calculations, and an auditable brief.
- **Why they pay:** compresses multi-source research while retaining traceability.
- **Required Clervo calls:** `search.web`, `search.answer`, `ai.chat`, `sandbox.run` for calculations and document assembly.
- **Recurring behavior:** weekly sector brief or reusable question template.
- **Lawful-data boundary:** public/licensed sources; no paywall bypass, material non-public information solicitation, or claims beyond cited evidence.
- **Proof/demo needed:** citation entailment, source diversity, uncertainty, reproducible calculations, injection resistance, cost, and receipt proof.
- **Monetization:** per report, premium template, or recurring brief.

### 6. Document and data batch processor — launch candidate

- **Customer:** operations analyst with an owner-controlled document set.
- **Job:** extract, classify, normalize, calculate, and return structured outputs plus exceptions.
- **Why they pay:** replaces fragile local scripts while keeping execution bounded and reproducible.
- **Required Clervo calls:** `ai.chat`, `ai.embed` where qualified, and `sandbox.run`; Search only for explicitly requested public reference data.
- **Recurring behavior:** repeated batches with fixed schemas and limits.
- **Lawful-data boundary:** customer-authorized inputs; retention minimization; no secrets in prompts/logs; no default sandbox network; reject prohibited or excessive payloads.
- **Proof/demo needed:** golden corpus, schema accuracy, malformed/file-bomb handling, isolation, deletion, cost ceiling, and receipt proof.
- **Monetization:** per document/batch plus managed recurring pipeline.

### 7. Developer dependency and release researcher — launch candidate

- **Customer:** software maintainer or engineering lead.
- **Job:** research upstream releases, advisories, migration notes, and compatibility; run bounded transformations/tests on supplied samples.
- **Why they pay:** reduces upgrade investigation and makes recommendations reproducible.
- **Required Clervo calls:** `search.web`, `search.answer`, `ai.chat`, `sandbox.run` with a pinned image and default-deny egress.
- **Recurring behavior:** release/advisory watch and scheduled dependency review.
- **Lawful-data boundary:** public repositories/advisories and owner-supplied code; no unauthorized private repo access, exploit deployment, or secret ingestion.
- **Proof/demo needed:** version identity, advisory citations, malicious-repository content handling, sandbox escape suite, deterministic sample test, cost, and receipt proof.
- **Monetization:** per dependency review, repository template, or managed watch.

### 8. Regulatory and policy change watch — later

- **Customer:** compliance operations lead in a non-high-impact advisory workflow.
- **Job:** monitor named official public sources and summarize text changes for human review.
- **Why they pay:** improves coverage and auditability of repetitive monitoring.
- **Required Clervo calls:** `search.web`, `search.answer`, `ai.chat`, `sandbox.run` for text diff.
- **Recurring behavior:** scheduled jurisdiction/source watch with escalation.
- **Lawful-data boundary:** official public material only; informational assistance, mandatory human/legal review, no autonomous compliance decision.
- **Proof/demo needed:** official-source allowlist, exact diff, omission/false-alert rates, disclaimer, human-review flow, cost, and receipt proof.
- **Monetization:** per monitored source and managed subscription after legal review.

### 9. Public-company event brief — later

- **Customer:** corporate development or public-markets research team.
- **Job:** track public company announcements and credible coverage; create cited event timelines and comparisons.
- **Why they pay:** faster evidence organization around named companies.
- **Required Clervo calls:** `search.web`, `search.answer`, `ai.chat`, `sandbox.run` for timeline/tabulation.
- **Recurring behavior:** scheduled or event-driven named-company monitoring.
- **Lawful-data boundary:** public sources only; no trading, personalized investment advice, rumor presented as fact, or material non-public data.
- **Proof/demo needed:** entity/event binding, timestamp/freshness, conflicting-source treatment, safe financial language, cost, and receipt proof.
- **Monetization:** per brief or managed watch after policy review.

### 10. Custom data transformation operator — later

- **Customer:** data engineering or business-operations team needing a bounded recurring transform.
- **Job:** validate an owner-supplied transformation specification, run isolated code, and return outputs, logs, and a receipt.
- **Why they pay:** avoids maintaining one-off infrastructure for predictable jobs.
- **Required Clervo calls:** `ai.chat` for optional plan/schema assistance and `sandbox.run` for execution; Search only for explicit public inputs.
- **Recurring behavior:** scheduled batches with fixed image, resources, schema, and spend budget.
- **Lawful-data boundary:** authorized inputs and code only; default-deny egress; no credentials, prohibited content, destructive external effects, or indefinite retention.
- **Proof/demo needed:** reviewed job template, resource/fork/output attacks, deterministic result hash, teardown, replay, charge ceiling, and receipt proof.
- **Monetization:** per execution plus custom setup and managed workflow fee.

## Promotion rule

An entry becomes a sellable agent only after the underlying pillar gates pass and a separate ticket proves its exact useful-result contract, lawful-data controls, deterministic success/failure fixtures, bounded x402 behavior, deployment, monitoring, and repeatable demonstration. This document authorizes no agent implementation.
