# Owner-only prerequisites

Internal engineering continues without task-by-task owner approval. Pause only
the affected work when it genuinely requires one of these owner actions:

- choose between materially different paid providers when technical evaluation
  produces no clear winner;
- provide a missing external account or credential reference;
- complete login, CAPTCHA, MFA, email confirmation, account verification, OAuth,
  or provider approval;
- approve real financial spending or sign a wallet transaction;
- authorize an irreversible production, customer-data, or unrelated
  infrastructure operation; or
- make a legal, contractual, branding, pricing, or business decision that cannot
  be inferred from product and technical requirements.

Block only the dependent external step. Continue independent repository-local
implementation, mocks, contracts, tests, documentation, and safe technical
qualification.

## Secure handoff

- Send only public values, limits, and opaque secret references through normal
  planning channels. Never paste tokens, keys, seeds, signatures, credential
  JSON, populated payment headers, customer payloads, or populated `.env` files.
- Put secrets in an approved secret manager or protected runtime secret mount.
- Prefer WIF/OIDC, short-lived credentials, trusted publishing, managed wallets,
  and KMS/HSM signers over exportable keys.
- Keep development, staging, production, provider, customer, payer, receiver,
  and signing identities separate.
- A receiver needs to provide only its public `payTo` address. A separate payer
  signs through an opaque restricted signer after explicit approval.
- Unknown payment or destructive-operation outcome is reconciled before retry.
