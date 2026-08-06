import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { discovery, type ExperiencePhase } from '../product';
import { Link } from '../router';

export function Operation({ operationId, onPhase }: { operationId: string; onPhase(phase: ExperiencePhase): void }) {
  const product = discovery.products.find((item) => item.operationId === operationId);
  useEffect(() => onPhase('qualified'), [onPhase]);
  if (product === undefined) return <section className="authority-page"><header className="authority-intro"><p className="eyebrow">Operation / unresolved</p><h1>This operation has no projected contract.</h1><p>Only repository-generated operation identities may appear as current product truth.</p><Link className="liquid-capsule liquid-capsule--primary" to="/catalog">Browse catalog</Link></header></section>;
  const displayAmount = product.pricing.displayPrice.amountAtomic;
  return (
    <section className="authority-page operation-page">
      <header className="authority-intro operation-intro">
        <ModeBadge>Operation contract fixture · not publicly callable</ModeBadge>
        <p className="eyebrow">Operation / {product.operationId}</p>
        <h1>{product.title}</h1>
        <p>{product.summary}</p>
        <div className="operation-status-line">
          <b className={`state state--${product.lifecycle}`}>{product.lifecycle}</b>
          <span>public callable: no</span><span>payable: no</span>
        </div>
      </header>

      <section className="operation-contract-grid">
        <article><span>Identity</span><h2>What this operation does</h2><p>{product.summary}</p><code>{product.operationId}</code></article>
        <article><span>Price boundary</span><h2>Maximum charge remains a fixture</h2><p>{displayAmount} atomic {product.pricing.displayPrice.asset}</p><small>{product.pricing.priceVersion} · not a customer offer</small></article>
        <article><span>Delivery</span><h2>Supported interface projections</h2><p>{product.deliveryModes.join(', ')}</p><small>Public endpoint deployment is not verified.</small></article>
        <article><span>Evidence</span><h2>Result and source stay attached</h2><p>Output, citations or source records, request identity, and lifecycle state remain inspectable together.</p></article>
        <article><span>Errors</span><h2>Failure returns one bounded next action</h2><p>Invalid scope, unavailable route, expired approval, timeout, and unresolved settlement fail without inventing completion.</p></article>
        <article><span>Replay</span><h2>Idempotency remains part of the contract</h2><p>A repeated request must preserve identity and cannot silently create a second charge or conflicting result.</p></article>
      </section>

      <section className="operation-interface-panel">
        <div><p className="eyebrow">Inspect the behavior</p><h2>Run the deterministic fixture before any network or wallet path.</h2></div>
        <div className="authority-actions">
          <Link className="liquid-capsule liquid-capsule--primary" to="/proof">Open Proof</Link>
          <Link className="liquid-capsule liquid-capsule--secondary" to="/docs/http">Read HTTP contract</Link>
        </div>
      </section>
    </section>
  );
}
