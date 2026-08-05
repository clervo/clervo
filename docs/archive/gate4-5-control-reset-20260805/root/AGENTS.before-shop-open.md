# Clervo Next engineering instructions

## Product direction

- The one-time supply-foundation program in
  `docs/product/CLERVO-SUPPLY-FOUNDATION.md` is complete. Continue the master
  roadmap from the next unfinished product-core work; keep isolated owner
  blockers explicit without pausing unrelated engineering.
- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md` defines product scope,
  roadmap order, correctness, security, truthful claims, and launch gates.
- `docs/product/FULL-PLATFORM-REVENUE-FINISH-LINE.md` defines the active
  customer-functional execution order: public Search revenue first, then the
  shared commerce gateway and the other five payable product releases. Its
  readiness data is `packages/catalog/full-platform-readiness.v1.json`.
- `docs/product/CURRENT-ENGINEERING-STATE.md` is the compact resumable handoff;
  read it before selecting the next unfinished roadmap work.
- The master plan's embedded historical "Current stage" and ticket-era
  authorization text do not describe current execution state. They do not
  override this file, the current-state handoff, or the active finish line.
- The roadmap's stages and ticket labels are an implementation checklist, not
  authorization boundaries. Read the current status and relevant sections;
  do not reread the complete roadmap or historical evidence for ordinary work.
- Continue through the next unfinished active-priority work automatically.
  Completing a task, ticket, stage, test run, journal entry, or commit is not a
  stop point.
- Proven contracts, tests, deployed behavior, prices, receipts, and observed
  results outrank plans, copy, assumptions, and memory.

## V6 experience direction

- The verified V6 handoff is the visual and experiential north star only:
  physical art direction, the persistent 3D instrument, cinematography, motion,
  layout quality, responsive composition, navigation feel, and proof UX.
- V6 reference copy and its historical product snapshot are not product
  authority. Do not copy their claims, catalog counts, lifecycle labels,
  prices, providers, commands, availability, or launch status.
- Current repository contracts and evidence control what the experience says
  and what every visible action may do. Generated art and rendered media never
  establish product truth.
- Preserve semantic HTML and deterministic behavior beneath the cinematic
  layer. Proof, quotes, approval, evidence, receipts, errors, and recovery stay
  DOM-owned and usable without WebGL or motion.
- Use the V6 visual system without turning it into a static mockup, generic AI
  landing page, ornamental dashboard, or prerendered-video substitute for the
  functional product.

## Engineering workflow

- Inspect Git state before editing and preserve unrelated work.
- Make the smallest coherent production-quality change, including refactoring
  when needed. Fix ordinary failures without requesting approval.
- Use focused build, typecheck, unit, integration, and smoke checks while
  implementing. At a full-stage boundary run one consolidated stage check, fix
  meaningful failures, and rerun affected checks.
- Do not rerun the entire historical suite, rebuild proof packages, or append an
  extensive journal entry after every small change.
- Keep commits small enough to recover or review, then continue. Record only
  meaningful decisions, stage outcomes, external effects, costs, and risks.
- Research current primary sources when a material technical or provider choice
  depends on changing facts. Prefer a clear technical winner and keep moving.

## Delegation

- Keep the primary Sol agent responsible for intent, architecture, integration,
  safety, product truth, and final acceptance.
- Use `luna_worker` for explicit, boundary-clear exploration, repetitive edits,
  focused implementations, test debugging, and other independently verifiable
  work. Give it exact ownership and review its diff and verification afterward.
- Do not delegate security, payment, cloud, provider, pricing, legal, product
  truth, or visual-direction decisions to `luna_worker`.

## Owner-only blockers

Pause only when progress genuinely requires the owner to:

- choose between materially different paid providers with no clear winner;
- supply a missing account or credential, or complete login, CAPTCHA, MFA,
  email confirmation, or account approval;
- approve real spending or sign a wallet transaction;
- authorize an irreversible production, customer-data, or unrelated
  infrastructure operation; or
- make a legal, contractual, branding, pricing, or business decision that
  cannot be inferred technically.

Continue independent local work when only a later external step is blocked.

## Permanent safety and truth boundaries

- Never expose secrets, credentials, wallet material, customer payloads, or
  authentication files in chat, source, logs, commits, reports, or test output.
- Never spend real money or sign a real payment without explicit owner approval.
  Unknown payment or settlement state fails closed and is reconciled before any
  new authorization or retry.
- Never destructively modify unrelated infrastructure, production/customer
  data, legacy projects, backups, IAM, billing, domains, or registries.
- `ai.clervo.dev` and its model gateway run on the Clervo VM. Treat that runtime,
  process, configuration, data, and network binding as protected infrastructure:
  never stop, delete, replace, reconfigure, or include it in cleanup without
  explicit owner authorization for that exact action.
- Treat `/workspace/x402-platform`, older Clervo runtimes, and legacy state as
  read-only evidence. Never import, execute, mount, link, or connect them.
- Preserve `docs/decisions/ADR-0001-clean-room-repository-boundary.md` and run
  `./scripts/verify-clean-room-boundary.sh` after boundary-relevant changes.
- Maintain payment idempotency, secret protection, sandbox isolation, SSRF and
  redirect protection, resource cleanup, hard cost ceilings, and provider terms.
- Never weaken schemas, delete useful tests, fabricate provider results or proof,
  hide failures, or claim preview/unavailable work is production-ready.
- Keep contracts, lifecycle, prices, receipts, discovery, documentation, and
  public claims synchronized with proven behavior.
