# B12 recovery — Trust architecture, legal authority, and `/build`

## Trust Center architecture

One shared Trust Center navigation may connect the following domains, but they
remain separate page purposes and information contracts.

| Domain | Purpose | Required subjects | Authority |
| --- | --- | --- | --- |
| Proof | Explain what a result record proves | result identity, evidence, provenance, receipt, replay, reconciliation, proof level | Canonical proof/receipt/replay records and observed state |
| Payment Safety | Explain how monetary authority is bounded and recovered | wallet custody, authorization, spend limits, quote expiry, unknown settlement, reconciliation/recovery | Released clients, x402/payment contracts, approved redacted proof |
| Security | Explain technical and supplier boundaries | local secret handling, execution isolation, supplier boundaries, failure isolation, idempotency/retry | Implemented code/contracts and verified controls |
| Privacy / Data | Explain data handling without inventing policy | received task data, stored records, data not stored, retention only where authoritative, supplier/subprocessor boundary | Implemented data paths plus approved policy when available |
| Legal | Publish actual approved legal documents | entity, terms, privacy, governing law, effective/version dates, notices as counsel approves | Owner/counsel-approved documents only |

Proof is not a generic trust badge. Payment Safety is not folded into Security.
Privacy implementation facts do not become a privacy policy. Legal does not
borrow unapproved prose from engineering documentation. No certification or
compliance badge is shown unless independently authoritative.

## Legal authority determination

**LEGAL CONTENT: EXTERNAL OWNER/COUNSEL DEPENDENCY**

Repository search found no owner/counsel-approved Terms of Service, Privacy
Policy, legal entity/jurisdiction record, or versioned legal publication source.
The current `/legal` page explicitly says it is structural and not final legal
terms; that statement is evidence of absence, not an authority to draft terms.

This dependency does **not** block Phase 0. The Legal recovery surface must
remain a specific, restrained unavailable/dependency state until approved
documents and their source/version/effective date are supplied. Codex must not
invent them.

## `/build` final disposition

**Disposition: COMPATIBILITY ROUTE TO THE CANONICAL START / CONNECT EXPERIENCE**

Evidence:

- the rendered link inventory has no inbound cross-route links to `/build`;
  its sole `/build` destination is the page's own skip link;
- `/build` is present in the route inventory, sitemap, canonical metadata, and
  trailing-slash redirect;
- the dormant command palette is the only source that describes it as
  onboarding;
- public web search for the exact URL returned no discoverable external
  references;
- its current purpose is browser-local fixture progress/preflight, which the
  accepted audit rejects as a second onboarding product.

Start can satisfy the useful intent: choose a released integration, install,
verify, complete a free-first result, then understand wallet/limits/receipt/
replay/reconcile/doctor. Browser-local fixture progress is not distinct
production value.

Implementation contract for the Start phase:

1. `/start` is the single canonical onboarding URL and metadata authority.
2. `/build` preserves backward compatibility through a permanent redirect when
   the static host contract safely supports it; otherwise it renders the Start
   entry with canonical `/start` metadata and an explicit compatibility
   transition.
3. `/build` leaves the sitemap as a canonical product route.
4. No existing browser-local fixture progress is migrated as customer proof.

The disposition is final and requires no additional Phase 0 owner decision.
