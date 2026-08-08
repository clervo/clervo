import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { B12HeroApex } from '../components/B12HeroApex';
import {
  discovery,
  familyOf,
  formatUsdc,
  launchState,
  lifecycleLabels,
  observedApiOrigin,
  observedProduct,
  observedRoutes,
  observedTruth,
  proofLabels,
  publicApiCallable,
  quickStartCurl,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';
import '../styles/b12/trust-support.css';
import { FAMILY_CODE, FAMILY_DISPLAY, FAMILY_ORDER } from './b12Slice4';

export type TrustSupportPage = 'pricing' | 'proof' | 'docs' | 'status' | 'security' | 'benchmarks' | 'changelog' | 'legal';

type QuoteState = 'idle' | 'approved' | 'refused';
type ProofClass = 'engineering' | 'runtime' | 'owner' | 'fixture' | 'unproven';
type DocsObjective = 'coding' | 'agent' | 'backend' | 'http' | 'provider';
type BenchmarkTopic = 'qualification' | 'replay' | 'evidence';
type LegalTopic = 'terms' | 'privacy' | 'payments' | 'acceptable';

const SUPPORT_PAGES: Array<{ id: TrustSupportPage; label: string }> = [
  { id: 'pricing', label: 'Pricing' },
  { id: 'proof', label: 'Proof' },
  { id: 'docs', label: 'Docs' },
  { id: 'status', label: 'Status' },
  { id: 'security', label: 'Security' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'changelog', label: 'Changelog' },
  { id: 'legal', label: 'Legal' },
];

const priceProducts = discovery.products;
const liveFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live');
const liveRoutes = observedRoutes.filter(({ lifecycleState }) => lifecycleState === 'live');
const unavailableFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'unavailable');
const proof = launchState.paymentProof;

function humanize(value: string) {
  return value.replaceAll('_', ' ');
}

function displayPrice(product: (typeof discovery.products)[number]) {
  const price = product.pricing.displayPrice;
  return price === null ? 'request-time / not bound' : formatUsdc(price.amountAtomic, price.decimals);
}

function phaseFor(page: TrustSupportPage): ExperiencePhase {
  if (page === 'pricing') return 'approval';
  if (page === 'proof') return 'receipt';
  if (page === 'docs') return 'qualified';
  return 'verified';
}

function SupportNav({ page }: { page: TrustSupportPage }) {
  return (
    <nav className="s6-subnav" aria-label="Trust and support pages">
      <div className="s6-shell s6-subnav__inner">
        {SUPPORT_PAGES.map((item) => (
          <Link key={item.id} className={item.id === page ? 'is-active' : ''} aria-current={item.id === page ? 'page' : undefined} to={`/${item.id}`}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Hero({
  page,
  eyebrow,
  title,
  lede,
  visual = false,
  centered = false,
  aside,
  children,
}: {
  page: TrustSupportPage;
  eyebrow: string;
  title: string;
  lede: string;
  visual?: boolean;
  centered?: boolean;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`s6-hero ${centered ? 's6-hero--centered' : ''} ${visual ? 's6-hero--visual' : 's6-hero--text'}`}>
      <div className="s6-shell s6-hero__grid">
        <div className="s6-hero__copy">
          <p className="s6-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="s6-lede">{lede}</p>
          {children}
        </div>
        {visual ? (
          <div className="s6-core-orbit" aria-label="Clervo Apex Core mechanism">
            <span className="s6-orbit-ring s6-orbit-ring--one" />
            <span className="s6-orbit-ring s6-orbit-ring--two" />
            <div className="s6-core"><B12HeroApex /></div>
            <span className="s6-orbit-label s6-orbit-label--one">request bound</span>
            <span className="s6-orbit-label s6-orbit-label--two">route qualified</span>
            <span className="s6-orbit-label s6-orbit-label--three">proof after verify</span>
          </div>
        ) : null}
        {aside == null ? null : <aside className="s6-hero__aside">{aside}</aside>}
      </div>
    </section>
  );
}

function Section({ eyebrow, title, copy, children, narrow = false, className = '', id }: {
  eyebrow: string;
  title: string;
  copy?: string;
  children: ReactNode;
  narrow?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`s6-section ${className}`} id={id}>
      <div className={narrow ? 's6-narrow' : 's6-shell'}>
        <div className="s6-section-head">
          <div>
            <p className="s6-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          {copy == null ? null : <p>{copy}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function PricingPage() {
  const [selectedId, setSelectedId] = useState(priceProducts[0]?.productId ?? '');
  const [quoteState, setQuoteState] = useState<QuoteState>('idle');
  const selected = useMemo(() => priceProducts.find(({ productId }) => productId === selectedId) ?? priceProducts[0], [selectedId]);
  const observed = selected == null ? null : observedProduct(familyOf(selected.productId));

  useEffect(() => setQuoteState('idle'), [selectedId]);

  const pricingAside = (
    <div className="s6-fact-stack">
      <div><span>Published price list</span><strong>none</strong></div>
      <div><span>Observed pricing mode</span><strong>operation / request bound</strong></div>
      <div><span>Owner-funded proof</span><strong>{proof.amountDisplay}</strong></div>
      <div><span>Customer revenue evidence</span><strong>{String(proof.revenueEvidence)}</strong></div>
    </div>
  );

  return (
    <>
      <Hero page="pricing" eyebrow="Pricing / approval boundary" title="Know the maximum before Clervo acts." lede="Clervo does not publish subscription tiers or a universal price sheet. A paid operation either exposes a current fixed maximum charge or returns a request-time quote before execution. The owner-funded proof amount is evidence, not a customer price." visual aside={pricingAside}>
        <div className="s6-hero-actions">
          <a className="s6-button s6-button--primary" href="#s6-pricing-ledger">Inspect operation prices</a>
          <Link className="s6-button s6-button--secondary" to="/proof">See payment proof</Link>
        </div>
      </Hero>

      <Section eyebrow="Pricing model" title="Three boundaries before money can move." copy="The locked pricing structure stays intact, while values come only from canonical generated pricing and observed operation truth.">
        <div className="s6-principles">
          <article><span>01</span><strong>Inspect metadata</strong><p>Operation identity, lifecycle, proof level, and any published pricing metadata are visible before approval.</p></article>
          <article><span>02</span><strong>Execute fixed-price</strong><p>Where a fixed maximum is published, the exact current amount is shown as an operation boundary—not a platform-wide rate.</p></article>
          <article><span>03</span><strong>Qualify dynamic quote</strong><p>Where the amount is request-derived, this page says so instead of inventing a pre-request number.</p></article>
        </div>
      </Section>

      <Section id="s6-pricing-ledger" eyebrow="Canonical offers" title="Operation-level pricing, not tiers." copy={`Generated contract ${discovery.contractVersion}. Values below are read from the current discovery document; a missing amount remains missing.`}>
        <div className="s6-ledger" role="table" aria-label="Current operation pricing">
          <div className="s6-ledger-row s6-ledger-row--head" role="row">
            <span role="columnheader">Operation</span><span role="columnheader">Model</span><span role="columnheader">Maximum</span><span role="columnheader">Lifecycle</span><span role="columnheader">Public</span>
          </div>
          {priceProducts.map((product) => {
            const family = observedProduct(familyOf(product.productId));
            return (
              <Link className="s6-ledger-row" role="row" key={product.productId} to={`/operations/${product.operationId}`}>
                <code role="cell">{product.operationId}</code>
                <span role="cell">{humanize(product.pricing.model)}</span>
                <strong role="cell">{displayPrice(product)}</strong>
                <span role="cell" className={`s6-state s6-state--${family.lifecycleState}`}>{lifecycleLabels[family.lifecycleState]}</span>
                <span role="cell">{product.publicAvailable ? 'yes' : 'no'}</span>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section eyebrow="Quote anatomy" title="Approval is visible. This demonstration does not pay." copy="The interaction below is a design-state fixture. It never contacts the API, signs a wallet request, authorizes payment, or creates settlement.">
        <div className="s6-quote-shell" data-quote-state={quoteState}>
          <div className="s6-quote-copy">
            <span className="s6-fixture"><i />Design fixture · no network call</span>
            <h3>One quote. One bounded approval.</h3>
            <p>Use the selector to inspect how the locked quote surface handles a current operation. Only fields published by canonical truth receive values.</p>
            <label className="s6-field-label" htmlFor="s6-price-operation">Operation</label>
            <select id="s6-price-operation" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {priceProducts.map((product) => <option key={product.productId} value={product.productId}>{product.operationId}</option>)}
            </select>
          </div>
          <div className="s6-quote-card">
            <div className="s6-quote-top"><span className="s6-eyebrow">Maximum charge boundary</span><span className={`s6-state ${quoteState === 'refused' ? 's6-state--refused' : quoteState === 'approved' ? 's6-state--qualified' : ''}`}>{quoteState === 'idle' ? 'not approved' : quoteState === 'approved' ? 'approval fixture' : 'refused fixture'}</span></div>
            <p className="s6-quote-number">{selected == null ? 'not bound' : displayPrice(selected)} <small>{selected?.pricing.displayPrice == null ? '' : 'maximum'}</small></p>
            <div className="s6-quote-lines">
              <div><span>Operation</span><code>{selected?.operationId ?? 'not bound'}</code></div>
              <div><span>Pricing model</span><strong>{selected == null ? 'not bound' : humanize(selected.pricing.model)}</strong></div>
              <div><span>Observed family lifecycle</span><strong>{observed == null ? 'not bound' : lifecycleLabels[observed.lifecycleState]}</strong></div>
              <div><span>Network / asset</span><strong>{observed?.observedPrice == null ? 'not bound in current observation' : `${observed.observedPrice.network} · ${observed.observedPrice.asset}`}</strong></div>
              <div><span>Provider / expiry / budget</span><strong>not bound in published pricing metadata</strong></div>
            </div>
            <div className="s6-button-row">
              <button className="s6-button s6-button--secondary" type="button" onClick={() => setQuoteState('approved')}>Preview approval boundary</button>
              <button className="s6-button s6-button--quiet" type="button" onClick={() => setQuoteState('refused')}>Preview refusal</button>
            </div>
            <p className="s6-local-note" aria-live="polite">Local browser state only. No wallet, payment, settlement, or receipt action occurs.</p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Settlement states" title="Receipt and replay are separate from price." copy="Gold is reserved for the one owner-funded settlement that is actually verified. Refused and unresolved examples remain structural states.">
        <div className="s6-state-grid">
          <article className="s6-state-card s6-state-card--verified" data-proof="verified"><span className="s6-state s6-state--verified">verified private proof</span><h3>{proof.amountDisplay} settled</h3><p>{proof.productId} on {proof.network}. Useful result returned; replay reused the existing proof without a second authorization, execution, or charge.</p><small>Owner-funded plumbing proof · not customer revenue.</small></article>
          <article className="s6-state-card s6-state-card--refused"><span className="s6-state s6-state--refused">refused · structural</span><h3>No authority granted.</h3><p>Rejection or an invalid boundary stops before approved execution. This is not a transaction record.</p><small>Design structure only.</small></article>
          <article className="s6-state-card s6-state-card--unresolved"><span className="s6-state s6-state--unresolved">unresolved · structural</span><h3>Reconcile before retry.</h3><p>Unknown settlement does not earn proof color and does not authorize an automatic retry.</p><small>Design structure only.</small></article>
        </div>
      </Section>
    </>
  );
}

const proofClassCopy: Record<ProofClass, { label: string; title: string; intro: string }> = {
  engineering: { label: 'Engineering proof', title: 'A bounded interface passed its internal qualification.', intro: 'This demonstrates repository-defined engineering readiness. It is not runtime uptime, customer usage, or commercial proof.' },
  runtime: { label: 'Observed runtime proof', title: 'The deployed registry answered a probe.', intro: 'Lifecycle and returned quote observations show what the deployed system exposed at one observation time. A quote is not a paid outcome.' },
  owner: { label: 'Private owner-funded proof', title: 'One paid Search outcome settled and replayed safely.', intro: 'This is the strongest verified payment evidence currently bound to the site. It was funded by the owner and does not establish customer revenue or demand.' },
  fixture: { label: 'Fixture / design proof', title: 'A deterministic visual state demonstrates the contract shape.', intro: 'Fixture records help explain approval, refusal, unresolved settlement, and replay. They are not production transactions or receipts.' },
  unproven: { label: 'Unproven claims', title: 'Credibility is not filled in by design.', intro: 'Customer traction, comparative benchmarks, uptime, certifications, and broad commercial claims remain unproven or unbound here.' },
};

function ProofPage() {
  const [selected, setSelected] = useState<ProofClass>('owner');
  const current = proofClassCopy[selected];
  const runtimeQuotes = observedTruth.products.filter(({ proofLevel }) => proofLevel === 'quote_observed_unpaid').length;
  const engineering = discovery.releaseScope.productCore;

  return (
    <>
      <Hero page="proof" eyebrow="Proof / evidence classes" title="Proof when work succeeds—and when it doesn’t." lede="Clervo separates engineering qualification, observed runtime state, private owner-funded payment proof, design fixtures, and claims that remain unproven. Gold appears only on directly verified proof.">
        <div className="s6-hero-actions"><a className="s6-button s6-button--primary" href="#s6-proof-library">Inspect proof records</a><Link className="s6-button s6-button--secondary" to="/status">View current status</Link></div>
      </Hero>

      <Section id="s6-proof-library" eyebrow="Proof library" title="One record class at a time." copy="A record must say what it proves, which evidence supports it, and what conclusions remain outside its boundary.">
        <div className="s6-proof-layout">
          <div className="s6-proof-menu" role="tablist" aria-label="Proof classes">
            {(Object.keys(proofClassCopy) as ProofClass[]).map((key) => <button key={key} role="tab" aria-selected={selected === key} className={selected === key ? 'is-active' : ''} type="button" onClick={() => setSelected(key)}>{proofClassCopy[key].label}</button>)}
          </div>
          <article className={`s6-proof-record s6-proof-record--${selected}`} data-proof={selected === 'owner' ? 'verified' : undefined}>
            <span className={`s6-state ${selected === 'owner' ? 's6-state--verified' : selected === 'runtime' ? 's6-state--qualified' : ''}`}>{current.label}</span>
            <h3>{current.title}</h3>
            <p>{current.intro}</p>
            {selected === 'owner' ? (
              <>
                <div className="s6-record-grid">
                  <div><span>Operation</span><strong>{proof.productId}</strong></div>
                  <div><span>Network</span><strong>{proof.network}</strong></div>
                  <div><span>Amount</span><strong className="s6-gold">{proof.amountDisplay}</strong></div>
                  <div><span>Settlement</span><strong>{proof.settlementConfirmed ? 'confirmed' : 'not confirmed'}</strong></div>
                  <div><span>Useful result</span><strong>{String(proof.usefulResult)}</strong></div>
                  <div><span>Replay</span><strong>{proof.replaySameReceipt ? 'same proof reused' : 'not proven'}</strong></div>
                </div>
                <div className="s6-evidence-list">
                  {[['Settlement confirmed', proof.settlementConfirmed], ['Useful result returned', proof.usefulResult], ['Same receipt on replay', proof.replaySameReceipt], ['No second authorization', !proof.secondAuthorization], ['No second execution', !proof.secondExecution], ['No second charge', !proof.secondCharge]].map(([label, passed], index) => <div className="s6-evidence-item" key={String(label)}><b>{String(index + 1).padStart(2, '0')}</b><p>{String(label)}</p><span className={passed ? 's6-state s6-state--verified' : 's6-state s6-state--refused'}>{passed ? 'verified' : 'failed'}</span></div>)}
                </div>
                <p className="s6-boundary-note">Classification: owner-funded private proof. Customer revenue evidence: {String(proof.revenueEvidence)}. Demand evidence: {String(proof.demandEvidence)}.</p>
              </>
            ) : null}
            {selected === 'runtime' ? <div className="s6-record-grid"><div><span>Observed at</span><strong>{observedTruth.provenance.observedAt}</strong></div><div><span>Serving families</span><strong>{liveFamilies.length}</strong></div><div><span>Live routes</span><strong>{liveRoutes.length}</strong></div><div><span>Quote-observed families</span><strong>{runtimeQuotes}</strong></div><div><span>Source</span><strong>{observedTruth.provenance.source}</strong></div><div><span>Paid outcome claim</span><strong>not implied</strong></div></div> : null}
            {selected === 'engineering' ? <div className="s6-record-grid"><div><span>Interfaces frozen</span><strong>{String(engineering.interfacesFrozen)}</strong></div><div><span>Compatibility verified</span><strong>{String(engineering.compatibilityVerified)}</strong></div><div><span>Core ready</span><strong>{String(engineering.ready)}</strong></div><div><span>Customer readiness</span><strong>{discovery.releaseScope.firstRevenueRelease.ready ? 'ready' : 'not ready'}</strong></div></div> : null}
            {selected === 'fixture' ? <div className="s6-fixture-box"><span className="s6-fixture"><i />Structural fixture</span><p>Approval, refusal, unresolved settlement, replay, and evidence layouts may be demonstrated without creating or implying a real transaction, wallet state, or receipt.</p></div> : null}
            {selected === 'unproven' ? <ul className="s6-claim-list"><li>No external customer count or customer revenue claim is bound.</li><li>No public comparative benchmark result is bound.</li><li>No uptime/SLA series is bound.</li><li>No independent audit or security certification is claimed.</li></ul> : null}
          </article>
        </div>
      </Section>

      <Section eyebrow="Proof contract" title="The record keeps its boundary." copy="Operation identity, quote state, evidence, settlement/replay state, and classification are kept separate so one strong fact cannot imply another.">
        <div className="s6-proof-contract">
          {['Task boundary','Operation / version','Quote / price boundary','Execution state','Evidence','Receipt / settlement','Replay state','Limitations','Record classification'].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong></div>)}
        </div>
      </Section>
    </>
  );
}

const docsObjectives: Record<DocsObjective, { number: string; title: string; kicker: string; body: string; code: string }> = {
  coding: { number: '01', title: 'Set up a coding agent', kicker: 'Skill setup', body: 'Give the coding environment the canonical Clervo setup instruction, then let current capability discovery remain machine-readable instead of hard-coding provider assumptions.', code: 'Set up Clervo using https://clervo.dev/skill.md' },
  agent: { number: '02', title: 'Build an autonomous agent', kicker: 'Agent integration', body: 'Start from catalog and operation contracts. Qualification, price boundaries, evidence, errors, and replay should remain explicit agent inputs.', code: 'GET https://clervo.dev/catalog.json\nGET https://clervo.dev/openapi.yaml\n\n# Select a current operation by task, not vendor.' },
  backend: { number: '03', title: 'Integrate a backend', kicker: 'First callable path', body: publicApiCallable ? `The observed public origin is ${observedApiOrigin}. The current quickstart below is generated from the observed free Search entry.` : 'No public origin is currently observed serving, so a callable backend example is intentionally omitted.', code: quickStartCurl ?? '# No current public callable quickstart is bound.' },
  http: { number: '04', title: 'Use raw HTTP / OpenAPI', kicker: 'Machine contract', body: 'Read the generated discovery, OpenAPI, pricing, and status surfaces directly. Human documentation must not contradict these generated contracts.', code: 'GET /openapi.yaml\nGET /catalog.json\nGET /pricing.json\nGET /status.json\nGET /models.json' },
  provider: { number: '05', title: 'Publish a provider or service', kicker: 'Provider integration', body: 'The locked design includes a provider publication path, but a public provider-admission contract is not currently bound. Do not infer one from internal supplier identifiers.', code: '# Provider publication contract: not publicly bound\n# Required before publication:\n# capability · schema · rights · health · pricing · evidence · recovery' },
};

function DocsPage() {
  const [objective, setObjective] = useState<DocsObjective>('coding');
  const current = docsObjectives[objective];
  const packageLine = launchState.distribution.packages.items.map(({ name, version }) => `${name}@${version}`).join(' · ');
  return (
    <>
      <Hero page="docs" eyebrow="Docs / task-first" title="Start from what your agent needs to do." lede="Clervo documentation starts from task and authority, then exposes the exact interface contract underneath. Published clients, current API reachability, pricing, and operation availability remain separate facts.">
        <div className="s6-hero-actions"><a className="s6-button s6-button--primary" href="#s6-docs-objectives">Choose a path</a><Link className="s6-button s6-button--secondary" to="/pricing">Understand paid use</Link></div>
      </Hero>

      <Section id="s6-docs-objectives" eyebrow="Choose a path" title="Five ways into the same contract." copy="Each path points to current generated truth or an explicitly unbound boundary; none assumes a package, provider, wallet, or route that has not been proven.">
        <div className="s6-objective-grid" role="tablist" aria-label="Documentation objectives">
          {(Object.keys(docsObjectives) as DocsObjective[]).map((key) => <button key={key} role="tab" aria-selected={objective === key} className={objective === key ? 'is-active' : ''} type="button" onClick={() => setObjective(key)}><b>{docsObjectives[key].number}</b><strong>{docsObjectives[key].title}</strong><span>Open path →</span></button>)}
        </div>
      </Section>

      <Section eyebrow="Developer workspace" title="Human guidance beside machine truth." copy="The locked three-pane documentation grammar is preserved: navigation, explanation, and exact code/data stay visible together.">
        <div className="s6-docs-shell">
          <nav className="s6-docs-tree" aria-label="Documentation tree">
            <p className="s6-label">Documentation</p>
            <Link to="/docs/quickstart">Quickstart</Link>
            <Link to="/start">Skill setup</Link>
            <Link to="/docs/mcp">MCP</Link>
            <Link to="/docs/typescript">TypeScript SDK</Link>
            <Link to="/docs/python">Python SDK</Link>
            <Link to="/docs/http">HTTP / OpenAPI</Link>
            <Link to="/docs/catalog">Catalog discovery</Link>
            <Link to="/docs/x402">Quotes and payment</Link>
            <Link to="/docs/receipts">Evidence and receipts</Link>
            <Link to="/docs/replay">Idempotency and replay</Link>
            <Link to="/docs/failures">Errors and recovery</Link>
            <Link to="/changelog">Changelog</Link>
          </nav>
          <article className="s6-docs-copy">
            <span className="s6-eyebrow">{current.kicker}</span>
            <h3>{current.title}</h3>
            <p>{current.body}</p>
            <div className="s6-docs-facts"><span>Package publication</span><strong>{launchState.distribution.packages.state.replaceAll('_', ' ')}</strong><span>Verified versions</span><code>{packageLine}</code><span>Observed API</span><strong>{publicApiCallable ? observedApiOrigin : 'none observed'}</strong></div>
          </article>
          <div className="s6-code-panel">
            <div className="s6-code-head"><span>{current.kicker}</span><Link to="/docs/quickstart">full guide ↗</Link></div>
            <pre><code>{current.code}</code></pre>
          </div>
        </div>
      </Section>
    </>
  );
}

function StatusPage() {
  const pausedRoutes = observedRoutes.filter(({ lifecycleState }) => lifecycleState === 'supply_paused');
  return (
    <>
      <Hero page="status" eyebrow={`Status / observed ${observedTruth.provenance.observedAt}`} title="Current truth without marketing interpretation." lede="This page reports the latest generated observation available to the website. It does not infer uptime, incident-free history, or a service-level agreement from a successful probe." centered>
        <div className="s6-hero-actions"><a className="s6-button s6-button--primary" href="#s6-status-current">Inspect current state</a><Link className="s6-button s6-button--secondary" to="/security">Read security boundaries</Link></div>
      </Hero>

      <Section id="s6-status-current" eyebrow="Observed snapshot" title="Lifecycle and proof stay separate." copy="A family can serve requests while having demonstrated only a returned quote. The status surface never collapses those facts into one green label.">
        <dl className="s6-status-strip">
          <div><dt>Public callable</dt><dd>{publicApiCallable ? 'observed yes' : 'observed no'}</dd></div>
          <div><dt>Families serving</dt><dd>{liveFamilies.length} / {FAMILY_ORDER.length}</dd></div>
          <div><dt>Routes answering</dt><dd>{liveRoutes.length}</dd></div>
          <div><dt>Incident history feed</dt><dd>not bound</dd></div>
        </dl>
      </Section>

      <Section eyebrow="Family health" title="Six permanent families. Current observed state." copy={`Source: ${observedTruth.provenance.source}. Permanent product names stay frozen even when generated registry labels differ.`}>
        <div className="s6-health-ledger">
          {FAMILY_ORDER.map((familyId) => {
            const item = observedProduct(familyId);
            return <div className="s6-health-row" key={familyId}><b>{FAMILY_CODE[familyId]}</b><strong>{FAMILY_DISPLAY[familyId]}</strong><span>{proofLabels[item.proofLevel]}</span><em className={`s6-state s6-state--${item.lifecycleState}`}>{lifecycleLabels[item.lifecycleState]}</em>{item.reason == null ? <small>no current reason published</small> : <small>{humanize(item.reason)}</small>}</div>;
          })}
        </div>
      </Section>

      <Section eyebrow="Incidents and limitations" title="No history feed means no invented history." copy="A current probe is not an uptime series. Without a canonical incident/history source, this page cannot truthfully say “zero incidents” or “all systems operational.”">
        <div className="s6-two-col">
          <article className="s6-panel s6-panel--unbound"><span className="s6-state">not bound</span><h3>No canonical incident/history feed.</h3><p>The frontend has no authoritative incident chronology, uptime percentage, SLA window, or maintenance feed to publish. Nothing is inferred from absence.</p></article>
          <article className="s6-panel"><span className="s6-state s6-state--unresolved">current limitations</span><h3>Observed constraints remain visible.</h3><p>{unavailableFamilies.length} families are currently unavailable in observed truth; {pausedRoutes.length} routes are supply paused; First Revenue Release readiness is {discovery.releaseScope.firstRevenueRelease.ready ? 'ready' : 'not ready'}.</p></article>
        </div>
      </Section>
    </>
  );
}

const securityControls = [
  ['01', 'Cost ceilings & approval', 'live-bound', 'Current paid operations expose a maximum-charge requirement or request-time pricing model. Approval remains a separate caller boundary.'],
  ['02', 'Action classification', 'unresolved', 'A public operation-level read/write/irreversible classification is not bound across the current catalog. This page does not invent one.'],
  ['03', 'Provider identity & route policy', 'bounded', 'Observed routes expose supply-family identity and lifecycle. Internal route policy and supplier-rights evidence are not published here as a security certification.'],
  ['04', 'Sandbox isolation', 'live-bound', 'The canonical sandbox.run contract states pinned gVisor execution, denied network access, strict resource ceilings, cleanup, receipt, and replay semantics.'],
  ['05', 'Idempotency & replay', 'verified', 'The owner-funded Search proof verified same-result replay without a second authorization, execution, or charge.'],
  ['06', 'Settlement reconciliation', 'live-bound', 'Unknown settlement is represented as a recovery state that prohibits retry until reconciliation.'],
  ['07', 'Evidence & provenance', 'live-bound', 'Generated observations retain source, generator, timestamp, release identity, lifecycle, and proof level rather than hand-written status claims.'],
  ['08', 'Independent assurance', 'not claimed', 'No SOC 2, ISO 27001, penetration-test result, independent security audit, bug bounty, or compliance certification is claimed on this surface.'],
] as const;

function SecurityPage() {
  const sandbox = discovery.products.find(({ operationId }) => operationId === 'sandbox.run');
  const aside = <div className="s6-fact-stack"><div><span>Third-party certification</span><strong>none claimed</strong></div><div><span>Independent audit</span><strong>not bound</strong></div><div><span>Replay proof</span><strong>owner-funded verified</strong></div><div><span>Sandbox contract</span><strong>{sandbox == null ? 'not bound' : 'published preview'}</strong></div></div>;
  return (
    <>
      <Hero page="security" eyebrow="Security / authority boundary" title="Authority is explicit, scoped, and inspectable." lede="Security on this site means specific implemented or contract-bound controls with visible limitations. It does not mean a certification badge, audit opinion, or compliance status that Clervo has not published evidence for." visual aside={aside}>
        <div className="s6-hero-actions"><a className="s6-button s6-button--primary" href="#s6-security-controls">Inspect controls</a><Link className="s6-button s6-button--secondary" to="/proof">See failure proof</Link></div>
      </Hero>

      <Section id="s6-security-controls" eyebrow="Control surface" title="Eight boundaries, each with an evidence state." copy="A control can be live-bound, directly verified, bounded but incomplete, unresolved, or explicitly not claimed. Those states are not interchangeable.">
        <div className="s6-control-grid">
          {securityControls.map(([number, title, status, body]) => <article className="s6-control" data-proof={status === 'verified' ? 'verified' : undefined} key={number}><span>{number}</span><em className={status === 'verified' ? 's6-state s6-state--verified' : status === 'unresolved' ? 's6-state s6-state--unresolved' : 's6-state'}>{status}</em><h3>{title}</h3><p>{body}</p></article>)}
        </div>
      </Section>

      <Section eyebrow="Claims ledger" title="Implemented control is not third-party assurance." copy="The page names the strongest available evidence source beside each claim and leaves missing assurance missing.">
        <div className="s6-security-ledger">
          <div><strong>Maximum-charge boundary</strong><span>Generated discovery / pricing metadata</span><Link to="/pricing">Inspect pricing</Link></div>
          <div><strong>Replay without second charge</strong><span>Owner-funded private proof</span><Link to="/proof">Inspect proof</Link></div>
          <div><strong>Unknown settlement retry prohibition</strong><span>Generated onboarding recovery contract</span><Link to="/docs/failures">Inspect recovery</Link></div>
          <div><strong>Independent certification</strong><span>Not bound</span><span className="s6-state">no claim</span></div>
        </div>
      </Section>
    </>
  );
}

const benchmarkTopics: Record<BenchmarkTopic, { label: string; hypothesis: string; workload: string; baseline: string; evidence: string }> = {
  qualification: { label: 'Qualification', hypothesis: 'Qualification should reduce invalid or unavailable paid attempts.', workload: 'No public benchmark workload is bound.', baseline: 'No comparative baseline is bound.', evidence: 'No public measured result is bound.' },
  replay: { label: 'Replay', hypothesis: 'Same-key same-input replay should avoid a duplicate effect.', workload: 'The owner-funded proof verifies one replay behavior; it is not a benchmark corpus.', baseline: 'No naive-retry comparison corpus is published.', evidence: 'One private proof exists; no aggregate performance metric is published.' },
  evidence: { label: 'Evidence', hypothesis: 'Structured evidence contracts should improve inspectability.', workload: 'No public scoring corpus or rubric is bound.', baseline: 'No free-form comparison baseline is bound.', evidence: 'No public measured result is bound.' },
};

function BenchmarksPage() {
  const [topic, setTopic] = useState<BenchmarkTopic>('qualification');
  const current = benchmarkTopics[topic];
  return (
    <>
      <Hero page="benchmarks" eyebrow="Benchmarks / method before number" title="No number without the method behind it." lede="Clervo does not publish comparative performance bars, latency claims, percentage improvements, or superiority statements without a reproducible public method and evidence bundle.">
        <div className="s6-hero-actions"><a className="s6-button s6-button--primary" href="#s6-benchmark-record">Inspect benchmark format</a><Link className="s6-button s6-button--secondary" to="/proof">Inspect task proof</Link></div>
      </Hero>

      <Section id="s6-benchmark-record" eyebrow="Benchmark publication contract" title="Method first. Result only when earned." copy="The locked benchmark surface is preserved, but invented fixture bars are removed because no public measured benchmark authority is currently bound.">
        <div className="s6-benchmark-shell">
          <div className="s6-benchmark-menu" role="tablist" aria-label="Benchmark topics">
            {(Object.keys(benchmarkTopics) as BenchmarkTopic[]).map((key) => <button key={key} role="tab" aria-selected={topic === key} className={topic === key ? 'is-active' : ''} onClick={() => setTopic(key)} type="button">{benchmarkTopics[key].label}</button>)}
          </div>
          <article className="s6-benchmark-record">
            <span className="s6-state">measured result not bound</span>
            <h3>{current.label}</h3>
            <p>{current.hypothesis}</p>
            <dl className="s6-method-grid">
              <div><dt>Environment</dt><dd>Must be published with any future result.</dd></div>
              <div><dt>Workload</dt><dd>{current.workload}</dd></div>
              <div><dt>Baseline</dt><dd>{current.baseline}</dd></div>
              <div><dt>Method</dt><dd>Must define sampling, failure accounting, and raw evidence.</dd></div>
            </dl>
            <div className="s6-empty-result"><span className="s6-eyebrow">Result</span><strong>No public measured benchmark record is bound.</strong><p>{current.evidence} No superiority number is published.</p></div>
            <p className="s6-boundary-note">Private engineering qualification is not a public comparative benchmark and is not rendered as one.</p>
          </article>
        </div>
      </Section>
    </>
  );
}

function ChangelogPage() {
  const entries = [
    {
      at: observedTruth.provenance.observedAt,
      type: 'Observation',
      title: 'Public catalog observation regenerated from the deployed registry.',
      body: `Lifecycle, proof levels, and observed route prices are generated from ${observedTruth.provenance.source} by ${observedTruth.provenance.generatedBy}.`,
      boundary: 'This is an observation timestamp, not an uptime or release-history claim.',
    },
    {
      at: launchState.observedAt,
      type: 'Private production proof',
      title: 'Owner-funded Search settlement and no-charge replay recorded.',
      body: `${proof.amountDisplay} on ${proof.network} settled, returned a useful result, and replayed without a second authorization, execution, or charge.`,
      boundary: 'Customer revenue and demand remain unproven.',
    },
    {
      at: launchState.distribution.packages.verifiedAt,
      type: 'Developer distribution',
      title: 'Published client versions verified.',
      body: launchState.distribution.packages.items.map(({ name, version }) => `${name} ${version}`).join(', '),
      boundary: 'Package publication and live API availability remain separate facts.',
    },
  ].sort((left, right) => right.at.localeCompare(left.at));
  return (
    <>
      <Hero page="changelog" eyebrow="Changelog / evidence-backed chronology" title="What changed, what broke, and what replaces it." lede="Only dated evidence already present in canonical generated truth appears here. This is not an invented marketing release log, and current operational truth remains on Status.">
        <div className="s6-hero-actions"><a className="s6-button s6-button--primary" href="#s6-changelog-records">Read releases</a><Link className="s6-button s6-button--secondary" to="/status">Current status</Link></div>
      </Hero>
      <Section id="s6-changelog-records" eyebrow="Chronology" title="Evidence-backed changes only." copy="Each row carries both the evidence-backed event and the boundary of what that event does not prove.">
        <ol className="s6-changelog-list">
          {entries.map((entry) => <li key={`${entry.at}-${entry.type}`}><time dateTime={entry.at}>{entry.at.slice(0, 10)}</time><div><span className="s6-eyebrow">{entry.type}</span><h3>{entry.title}</h3><p>{entry.body}</p><small>{entry.boundary}</small></div><Link to="/status">current truth →</Link></li>)}
        </ol>
      </Section>
    </>
  );
}

const legalTopics: Record<LegalTopic, { label: string; scope: string }> = {
  terms: { label: 'Terms of Service', scope: 'Service scope, operation contracts, user authority, lifecycle states, provider boundaries, suspension, termination, disclaimers, liability, and dispute structure.' },
  privacy: { label: 'Privacy', scope: 'Data categories, task inputs, provider routing, logs, evidence, receipts, secrets, retention, subprocessors, user controls, deletion, international handling, and incident notice.' },
  payments: { label: 'Payments', scope: 'Quote creation, maximum charge, asset, network, expiry, approval, settlement, receipts, refunds or credits, unknown settlement, reconciliation, replay, taxes, and standing-authority boundaries.' },
  acceptable: { label: 'Acceptable Use', scope: 'Prohibited tasks, abuse, fraud, harmful code, unauthorized access, illegal activity, evasion, harassment, privacy violations, provider restrictions, enforcement, and reporting.' },
};

function LegalPage() {
  const [topic, setTopic] = useState<LegalTopic>('terms');
  const current = legalTopics[topic];
  return (
    <>
      <Hero page="legal" eyebrow="Legal / structural authority only" title="Terms should explain how the system actually works." lede="The Vault defines the policy surfaces the product eventually needs. It does not provide final legal entity, jurisdiction, governing law, privacy, retention, regulatory, or contractual authority—and this implementation does not invent them.">
        <div className="s6-hero-actions"><a className="s6-button s6-button--primary" href="#s6-legal-docs">Inspect legal structure</a><Link className="s6-button s6-button--secondary" to="/security">Security model</Link></div>
      </Hero>

      <Section id="s6-legal-docs" eyebrow="Policy structure" title="Four documents. No pretend legal authority." copy="This is a structural implementation for review. It is not legal advice and must not be published as final terms without qualified counsel and exact company, payment, data, and jurisdiction facts.">
        <div className="s6-legal-alert"><span className="s6-state s6-state--refused">structural draft only</span><strong>Not final legal terms.</strong><p>No legal entity, registered address, jurisdiction, governing law, regulatory status, retention period, or final privacy/payment promise is bound by this page.</p></div>
        <div className="s6-legal-shell">
          <div className="s6-legal-menu" role="tablist" aria-label="Legal document structures">
            {(Object.keys(legalTopics) as LegalTopic[]).map((key) => <button key={key} role="tab" aria-selected={topic === key} className={topic === key ? 'is-active' : ''} onClick={() => setTopic(key)} type="button">{legalTopics[key].label}</button>)}
          </div>
          <article className="s6-legal-document">
            <span className="s6-eyebrow">Structural placeholder / requires counsel</span>
            <h3>{current.label}</h3>
            <h4>Required scope</h4><p>{current.scope}</p>
            <h4>Product truth requirement</h4><p>Any final policy must match live catalog, operation contracts, pricing, payment/replay behavior, status, security controls, evidence, receipts, and recovery. It may not create broader authority than the product interface.</p>
            <h4>Before publication</h4>
            <ul><li>Qualified legal review in actual launch jurisdictions.</li><li>Exact company identity, contact, data, provider, payment, tax, and dispute facts.</li><li>Version, effective date, change-notice, archive, retention, and deletion process.</li></ul>
          </article>
        </div>
      </Section>
    </>
  );
}

export function TrustSupport({ page, onPhase }: { page: TrustSupportPage; onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase(phaseFor(page)), [onPhase, page]);
  return (
    <div className={`b12-trust-support s6-page s6-page--${page}`} data-support-page={page}>
      <SupportNav page={page} />
      {page === 'pricing' ? <PricingPage /> : null}
      {page === 'proof' ? <ProofPage /> : null}
      {page === 'docs' ? <DocsPage /> : null}
      {page === 'status' ? <StatusPage /> : null}
      {page === 'security' ? <SecurityPage /> : null}
      {page === 'benchmarks' ? <BenchmarksPage /> : null}
      {page === 'changelog' ? <ChangelogPage /> : null}
      {page === 'legal' ? <LegalPage /> : null}
    </div>
  );
}
