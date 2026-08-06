import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { discovery, type ExperiencePhase } from '../product';
import { Link } from '../router';

export type TrustTopic = 'pricing' | 'benchmarks' | 'security' | 'legal';
export type LegalSection = 'overview' | 'terms' | 'privacy' | 'payments' | 'acceptable-use';
const topicCopy: Record<TrustTopic, { eyebrow: string; title: string; intro: string }> = {
  pricing: { eyebrow: 'Pricing · operating contract', title: 'Know the maximum before Clervo acts.', intro: 'Inspect catalog metadata for free. When an operation costs money, Clervo exposes the price or quote, asset, network, route, expiry, approval boundary, settlement state, receipt, and replay behavior before execution.' },
  benchmarks: { eyebrow: 'Benchmarks · reproducible records', title: 'No number without the method behind it.', intro: 'Every public benchmark includes the hypothesis, date, environment, workload, baselines, methodology, result, limitations, reproduction instructions, and raw evidence.' },
  security: { eyebrow: 'Security · bounded action', title: 'Authority is explicit, scoped, and inspectable.', intro: 'Clervo classifies actions, limits cost, qualifies routes, isolates execution, protects secrets, preserves idempotency, reconciles settlement, and returns provenance. Claims remain qualified until backed by evidence.' },
  legal: { eyebrow: 'Legal · product boundaries', title: 'Terms should explain how the system actually works.', intro: 'Terms, privacy, payments, and acceptable-use policies must match the operation contract: explicit approval, truthful lifecycle, scoped data handling, settlement uncertainty, receipts, replay, provider boundaries, and prohibited use.' },
};
const legalCopy: Record<Exclude<LegalSection, 'overview'>, { title: string; points: string[] }> = {
  terms: { title: 'Terms of Service structure', points: ['Describe the outcome contract and user responsibilities.', 'Tie availability and pricing to canonical product state.', 'Explain provider, resale, suspension, support, and change boundaries.'] },
  privacy: { title: 'Privacy structure', points: ['Describe task data, evidence, receipts, logs, and retention separately.', 'State which processors and providers receive data for an approved route.', 'Explain deletion, access, security, and jurisdiction boundaries.'] },
  payments: { title: 'Payments structure', points: ['Show asset, network, maximum, expiry, and approval scope before execution.', 'Explain settlement uncertainty, reconciliation, receipt identity, refunds, and dispute paths.', 'Never treat wallet connection as standing spending authority.'] },
  'acceptable-use': { title: 'Acceptable Use structure', points: ['Classify prohibited, restricted, and review-required tasks.', 'Bind enforcement to operation capabilities and provider policies.', 'Explain refusal records, appeals, abuse handling, and account consequences.'] },
};

export function Trust({ topic, legalSection = 'overview', onPhase }: { topic: TrustTopic; legalSection?: LegalSection; onPhase(phase: ExperiencePhase): void }) {
  const copy = topicCopy[topic];
  useEffect(() => onPhase(topic === 'pricing' ? 'approval' : 'verified'), [onPhase, topic]);
  return (
    <section className="trust-page authority-trust-page">
      <header className="page-intro"><ModeBadge>Repository-local release candidate · claims remain bounded</ModeBadge><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.intro}</p><div className="authority-actions">{topic === 'pricing' ? <><a className="liquid-capsule liquid-capsule--primary" href="#operation-prices">Inspect operation prices</a><Link className="liquid-capsule liquid-capsule--secondary" to="/proof">See payment proof structure</Link></> : null}{topic === 'security' ? <><a className="liquid-capsule liquid-capsule--primary" href="#control-ledger">Inspect controls</a><Link className="liquid-capsule liquid-capsule--secondary" to="/status">Current status</Link></> : null}</div></header>
      {topic === 'pricing' ? <>
        <section className="authority-section pricing-principle"><header><p className="eyebrow">Pricing principle</p><h2>Pricing belongs to the operation contract.</h2><p>No generic subscription card appears unless a real subscription product exists. Operations publish fixed prices or dynamic quote rules individually.</p></header></section>
        <section id="operation-prices" className="truth-table"><header><h2>Operation-level truth.</h2><span>Design fixtures · not live prices</span></header>{discovery.products.map((product) => <div key={product.productId}><code>{product.productId}</code><span>{product.pricing.displayPrice.amountAtomic} atomic {product.pricing.displayPrice.asset}</span><b>{product.pricing.priceVersion}</b><strong>payable: false</strong></div>)}</section>
        <section className="quote-anatomy"><div><p className="eyebrow">Quote anatomy</p><h2>Approval is scoped. Never standing authority.</h2><p>Maximum charge, asset, network, route, expiry, and budget ceiling stay visible together. Current values below describe structure only.</p></div><dl><div><dt>Maximum</dt><dd>fixture amount</dd></div><div><dt>Asset</dt><dd>mock:usdc</dd></div><div><dt>Network</dt><dd>not selected</dd></div><div><dt>Expiry</dt><dd>required in production</dd></div><div><dt>Approval</dt><dd>single quote only</dd></div><div><dt>Payable</dt><dd>false</dd></div></dl></section>
        <section className="settlement-states"><header><p className="eyebrow">Settlement, receipt & replay</p><h2>Unknown is a state. Not a reason to charge twice.</h2></header><div><article><b>VERIFIED</b><h3>Completed within maximum.</h3><p>Result, evidence, exact charge, settlement, and receipt identity return together.</p></article><article><b>REFUSED</b><h3>No execution. No charge.</h3><p>Policy, cost, network, lifecycle, or expired-quote boundaries return the next action.</p></article><article><b>UNRESOLVED</b><h3>Reconcile before retry.</h3><p>Clervo contains uncertainty and prevents duplicate execution or settlement.</p></article></div></section>
      </> : null}
      {topic === 'benchmarks' ? <section className="benchmark-records"><header><p className="eyebrow">Required record</p><h2>Reproduction before promotion.</h2></header><div>{['Hypothesis and scope', 'Date and environment', 'Workload and sample', 'Named baselines', 'Methodology', 'Raw result', 'Limitations', 'Reproduction instructions', 'Evidence artifacts'].map((item, index) => <article key={item}><span>{String(index + 1).padStart(2, '0')}</span><h3>{item}</h3></article>)}</div><aside><b>Current public comparison</b><p>No “best,” “better,” parity, or superiority claim is approved by the repository.</p></aside></section> : null}
      {topic === 'security' ? <section id="control-ledger" className="control-ledger">{[
        ['Authority classification', 'Read, write, spend, broadcast, and irreversible actions require explicit operation-level policy.'],
        ['Payment idempotency', 'Replay-safe identity and unknown-settlement quarantine remain required.'],
        ['Secret protection', 'Credentials and wallet material are excluded from source, logs, commits, reports, and fixtures.'],
        ['Execution isolation', 'Sandbox boundaries include network policy, resource limits, cleanup, and image provenance.'],
        ['Request safety', 'SSRF, redirect, origin, schema, response, and cost ceilings fail closed.'],
        ['Truth synchronization', 'Contracts, lifecycle, prices, discovery, clients, and claims derive from the release candidate.'],
      ].map(([name, detail], index) => <article key={name}><span>{String(index + 1).padStart(2, '0')}</span><h2>{name}</h2><p>{detail}</p></article>)}</section> : null}
      {topic === 'legal' ? <><section className="legal-navigation">{(['terms', 'privacy', 'payments', 'acceptable-use'] as const).map((section) => <Link key={section} className={legalSection === section ? 'is-active' : ''} to={`/legal/${section}`}>{section.replace('-', ' ')}<span>→</span></Link>)}</section><section className="legal-structure"><header><p className="eyebrow">Structural draft only</p><h2>{legalSection === 'overview' ? 'Four policy surfaces tied to the product contract.' : legalCopy[legalSection].title}</h2><p>Requires qualified legal counsel before publication as binding customer terms.</p></header>{legalSection === 'overview' ? <div>{Object.entries(legalCopy).map(([section, value]) => <article key={section}><span>{section.replace('-', ' ')}</span><h3>{value.title}</h3><p>{value.points[0]}</p><Link to={`/legal/${section}`}>Inspect structure →</Link></article>)}</div> : <ol>{legalCopy[legalSection].points.map((point) => <li key={point}>{point}</li>)}</ol>}</section></> : null}
      <div className="trust-links">{(['pricing', 'benchmarks', 'security', 'legal'] as TrustTopic[]).map((value) => <Link key={value} className={value === topic ? 'is-active' : ''} to={`/${value}`}>{value}</Link>)}</div>
    </section>
  );
}
