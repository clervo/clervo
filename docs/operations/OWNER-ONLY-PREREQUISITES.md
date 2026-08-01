# One-time owner prerequisite package

## What Codex needs from the owner

Codex can build the code, contracts, tests, internal design, generated JSON,
SDKs, documentation, SEO system, evidence, and ordinary repair tickets. It
cannot truthfully create your legal identity, accept contracts, own external
accounts, perform MFA, grant itself authority, invent a customer, consent for a
customer, control your wallet, or choose how much money you permit external
systems to spend.

Complete non-secret values in a copy of
`docs/templates/CLERVO-OWNER-INPUTS.template.json` stored at the ignored path
`private/clervo-owner-inputs.json`. Use the separate external-action and x402
templates for bounded authority. The dispatcher asks once per missing class,
deduplicates it, and blocks only the affected external step.

## Do these first

1. Complete `cloud_project_identity_and_budget_envelope` if you want N4.27T's
   isolated cloud qualification to run. Local N4.27T work does not wait for it.
2. Complete `autonomous_external_authority_trust_root` if you want later
   external actions to run unattended. Until its signed verifier and mediator
   are implemented, every exact external action still needs separate explicit
   owner authority.
3. Establish one verified staging alert channel and owner/on-call contact.
4. Decide the permitted Search seed/content/takedown policy.
5. Start long-lead ownership work for the Git remote, package registries,
   domain, public contacts, legal entity, terms/privacy, and provider accounts.
6. You may supply the x402 receiver **public** address now, but real payment
   remains dormant until Stage 15.

## Exhaustive known owner-only classes

The 29 responsibilities below are deduplicated into 25 machine intake groups;
the `O` numbers explain human responsibilities and are not JSON keys.

| ID | Owner supplies or performs | Earliest blocking point |
| --- | --- | --- |
| O01 | Legal merchant/entity identity, jurisdiction, authorized owner, trading name, and publishable business details. | Provider contracting; final by Stage 13 |
| O02 | Rights attestation for name, logo, fonts, imagery, domains, and supplied assets. | Stage 13 |
| O03 | Support, security, privacy, legal, abuse, billing, incident, and status contacts. | Stages 13–14 |
| O04 | Cloud account/project, environment, region, exact resource/name allowlist, principal/runtime identity, allowed mutations, credits, and billing mode. | N4.27T cloud phase; later remote stages |
| O05 | Gross-ticket, daily, monthly, and residual cost ceilings; billing alerts; cleanup deadline; unknown-outcome procedure. | Every billable external action |
| O06 | Human cloud/account ceremonies: create/verify accounts, MFA, WIF/OIDC, least-privilege grants, organization policy, and billing setup. | Before credentialed deployment |
| O07 | Approved secret manager plus redacted asset registry: names/references, owner, purpose, scope, expiry, rotation, revocation, quota, and fallback. | Before any secret use |
| O08 | Provider inventory and current terms: allowed services/models/data, resale/commercial scope, privacy/training, quota, region, free-credit expiry, and hard zero-paid-API cash limit. | Product-core supplier qualification |
| O09 | Search rights: approved domains/datasets, robots/content-use, attribution, copyright/personal data, retention, deletion, opt-out, and takedown. | Stage 4/5 |
| O10 | AI policy: approved open-model licenses, prompt/data limits, retention/training, output rights, model disclosure, and owned/free-credit compute. | Stage 6 |
| O11 | Sandbox AUP: prohibited workloads, egress, artifacts, abuse escalation, legal response, and permitted regions. | Stage 7 |
| O12 | RPC scope: chains, archive need, free/self-hosted/provider terms, broadcast/no-broadcast policy, and optional customer BYOC. | Stage 8 |
| O13 | Prediction scope: markets/jurisdictions, data rights, resolution authority, no-trading boundary, and risk disclosure. | Stage 9 |
| O14 | Crypto scope: chains/sources, data rights, spam/scam policy, wallet-data retention, and financial-risk language. | Stage 10 |
| O15 | Commercial freeze: SKUs, prices, maximum charges, margin floor, refunds/failures, supported jurisdictions, SLA, and support hours. | Stage 12 |
| O16 | Git organization/remote, admins, branch protection, staging/production environments, Actions OIDC, and release permissions. | Stages 12–14 |
| O17 | npm, PyPI, MCP/x402 directory, container, and other registry ownership; MFA, terms, namespaces, and trusted publishing. | Stage 13 |
| O18 | Domain/DNS/TLS/email ownership, hostnames, records, scoped authority, redirects, sender verification, and renewal budget. | Stages 13–14 |
| O19 | Production database/queue/secret store, residency, retention/deletion, backups, RTO/RPO, on-call, escalation, and kill-switch owner. | Stage 14 |
| O20 | Two independent production alert paths and verified recipients; one staging channel earlier where a ticket requires it. | Stage 14 |
| O21 | Owner/counsel approval of Terms, Privacy, AUP, DPA, analytics/cookies, IP/takedown, refunds, crypto treatment, tax, sanctions, and jurisdiction restrictions. | Stage 13; final by Stage 16 |
| O22 | Receiver public `payTo` address, network family, ownership attestation, and permission to publish it. No receiver secret. | Stage 15 |
| O23 | Separate payer public address, exact funding cap, and opaque restricted one-shot signer reference. | Testnet integration and Stage 15 |
| O24 | Exact x402 version/scheme, CAIP-2 network, USDC contract/mint and decimals, facilitator/terms/credential reference, product/route, amount, expiry, one-execution cap, ledger/receipt/explorer/reconciliation, alerts, and kill switch. | Stage 15 |
| O25 | Optional dedicated offer/receipt signing public identity and KMS/HSM/wallet-signer reference, separate from payer and receiver. | Stages 13–15 if enabled |
| O26 | Genuine independent pilot/customer introduction or bounded outreach sender/channel authority; consent, real use case, useful-result acceptance, and independent payment. | Stage 16 |
| O27 | Optional permission for a logo, testimonial, screenshot, or public case study. Without it, proof remains redacted. | Stage 16; not a launch requirement |
| O28 | Legacy asset inventory/migration/sunset decisions with exact targets. Destructive action stays false by default. | Only a later migration ticket |
| O29 | Owner-controlled external-authority trust root: Ed25519 public-key fingerprint, detached signing workflow, read-only location outside the agent workspace, independently signed monotonic revocations, rotation/recovery, and signing-service reference. | Before any external action may run unattended |

New provider-specific fields may be discovered later because terms and account
requirements change. They must map into one of these classes; the dispatcher
may not turn them into repeated general approval requests.

## Wallet and x402 package

The seller/receiver wallet does **not** need to sign for Clervo to receive a
payment. Official x402 documentation describes the seller address as the
payment destination in the server's requirements, while the buyer wallet signs
the payment payload. Therefore provide only:

- receiver public address and proof/attestation that you control it;
- a different payer public address;
- an opaque payer signer reference that can enforce one exact authorization;
- network, USDC asset identity/decimals, facilitator, amount, expiry, limits,
  reconciliation, and stop decisions.

Never provide a receiver or payer private key, seed phrase, raw signature, or
populated payment header. The preferred signer is hardware/KMS/managed-wallet
or a protected local signer socket/service that returns only the approved
payload and independently enforces network, asset, recipient, amount, expiry,
and one-use limits. A raw-key file is not an acceptable payer signer reference.

x402 v2 uses `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE`
headers, and current seller configuration identifies networks in CAIP-2 form.
The development path starts on testnet; a real proof happens once in Stage 15
under an exact payment ticket, prepared input, and separately explicit owner
authority unless the trusted signed supervisor has first been implemented. See the official
[x402 HTTP 402 description](https://docs.x402.org/core-concepts/http-402),
[wallet roles](https://docs.x402.org/core-concepts/wallet), and
[seller quickstart](https://docs.x402.org/getting-started/quickstart-for-sellers).

The current reserve is 0.03 USDC. The template caps the one real proof at 0.01
USDC and preserves at least 0.02 USDC until the exact Stage 15 ticket selects a
smaller useful amount. Owner-funded proof proves plumbing, not customer demand
or revenue. Unknown settlement is quarantined and reconciled before any retry;
no new authorization is created automatically.

## Secure delivery

- Put public values, limits, attestations, resource names, and secret
  **references** only in the ignored owner manifest.
- Put actual secrets directly in an environment secret manager or read-only
  files beneath `/run/secrets/clervo`, mode `0400` where supported.
- Keep the external-authority public trust root and signed revocation state in
  an owner-controlled read-only location outside `/workspace/clervo-next`.
  Never place the owner signing private key in this environment.
- Prefer WIF/OIDC, trusted publishing, managed wallets, KMS/HSM, and short-lived
  credentials over exportable keys.
- Never paste secrets, private keys, seeds, tokens, credential JSON, customer
  payloads, or populated `.env` files into chat, Git, issues, screenshots,
  shell arguments, output, or evidence.
- Keep development, staging, production, provider, customer, payer, receiver,
  and offer/receipt signing identities separate.
- Revoke or rotate bounded credentials after the exact task and record cleanup
  without printing values.

## Templates

- `CLERVO-OWNER-INPUTS.template.json`: the deduplicated one-time intake and
  redacted asset registry. Validate a completed ignored copy with
  `npm run verify:owner-inputs -- private/clervo-owner-inputs.json`; the command
  prints status counts only, never supplied values.
- `CLERVO-EXTERNAL-ACTION-AUTHORITY.template.json`: finite cloud, production,
  domain, registry, outreach, or other external-effect **input**. Set a filled
  copy to `prepared_non_authoritative` and validate it with
  `npm run verify:external-input -- <path>`. The current validator rejects
  `authorized`; the file alone can never activate an action.
- `CLERVO-X402-PROOF-AUTHORITY.template.json`: dormant exact Stage 15 payment
  **input**. Set a filled copy to `prepared_non_authoritative` and validate it
  with `npm run verify:x402-input -- <path>`. The current validator rejects
  `authorized`. A roadmap position, JSON file, or wallet balance never activates
  payment.

The historical N4.23 owner package remains evidence of what was known then. Its
paid-search recommendation, former stage numbering, and raw payer-private-key
environment suggestion are superseded and must not be copied into current
configuration.
