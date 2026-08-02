# Clervo distribution asset inventory

Updated 2026-08-02. This is a compact, redacted working inventory. It contains
identifiers and state only; credentials, tokens, recovery material, and customer
data are prohibited.

## Source and package ownership

| Surface | Existing identity | Observed state | Next action |
| --- | --- | --- | --- |
| GitHub | Organization `clervo`; owner context `moalmohtasib` | Public organization exists with `clervo-waitlist`; this repository has no remote | Reuse the organization, choose/create the canonical repository, then configure protected CI publishing |
| npm account | `clervo` | This workspace is not authenticated | Use interactive login only when package verification/publishing requires it |
| npm package | `clervo@0.0.0` | Name reserved with obsolete wallet-simulation copy | Preserve the name; do not publish new behavior until its CLI/product purpose is explicit |
| npm package | `@clervo/sdk@0.2.0` | Published legacy JavaScript SDK | Rebuild from frozen contracts while retaining sensible compatibility aliases |
| npm package | `@clervo/mcp@0.2.0` | Published legacy stdio MCP server | Rebuild from the frozen operation catalog and test against the same conformance suite |
| npm package | `@clervo/beacon@0.1.0` | Published legacy routing proxy | Keep reserved; do not claim cheapest/best routing until live policy and evidence prove it |
| PyPI account | `Clervo` | Owner reports an account-wide API token exists | Never place the token in chat or Git; prefer GitHub trusted publishing |
| PyPI project | `clervo-sdk@0.1.0` | Sole-owned published Python SDK | Preserve the project name; rebuild from frozen contracts and publish a wheel plus source distribution |

## Infrastructure and customer surfaces

| Surface | Existing state | Missing identifier or verification |
| --- | --- | --- |
| Domain and DNS | `clervo.dev` is managed in Cloudflare | Confirm existing Pages/Workers project names before creating any |
| API model gateway | `ai.clervo.dev` runs on protected Clervo VM infrastructure | Never stop, replace, reconfigure, or include in cleanup |
| Object storage | Cloudflare R2 account and bucket configuration are present | Reuse only after the Stage 13 storage boundary is verified |
| Business email | Google Workspace is configured for the domain | Record active public aliases without exposing administrator identity |
| Transactional email | Owner reports Resend is configured | Record sending domain/project and verify sender/authentication status |
| Monitoring | Owner reports approximately USD 5,000 in Sentry credit | Record organization/project slugs, eligible products, and credit expiry |
| Website | New owner handoff is pending | Treat the new handoff as the sole design authority |

## Legacy-package findings

- Published package archives were inspected as inert read-only evidence and were
  not installed, executed, imported, or copied into this repository.
- Existing npm and PyPI copy contains stale model counts, permanent-free claims,
  retired QuickAI/Tongkhokr routes, and contradictory Solana/Base payment text.
- Package ownership and useful client method shapes may be retained. Provider
  names, model lists, prices, lifecycle, availability, payment recovery, and
  product claims must be generated from current approved truth.
- Existing releases remain historical public artifacts. New releases must
  supersede their copy truthfully; history must not be rewritten or described
  as proof of the rebuilt product.

## Website handoff rule

When the new owner handoff arrives, it becomes the canonical site and design
direction. Retire or archive superseded design-only handoffs, mockups, copy, and
site setup. Preserve unrelated product contracts, security controls, working
code, factual catalog data, domain/email infrastructure, and evidence required
for truthful claims.

## Pending owner identifiers

- Canonical GitHub repository name.
- Cloudflare Pages/Workers project names, if already created.
- Sentry organization slug, project names, and credit expiry.
- Resend sending domain/project and intended public sender addresses.
- Active Google Workspace public aliases.
