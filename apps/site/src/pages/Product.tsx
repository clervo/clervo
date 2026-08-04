import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { discovery, pillarLabels, type ExperiencePhase } from '../product';
import { Link } from '../router';

export function Product({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('qualified'), [onPhase]);
  return (
    <section className="product-page">
      <header className="page-intro">
        <ModeBadge>Frozen private core · public lifecycle shown separately</ModeBadge>
        <p className="eyebrow">Product / capability truth</p>
        <h1>One platform.<br />No borrowed readiness.</h1>
        <p>
          Six product cores share one frozen compatibility surface. Only the
          two Search operations below are projected into the distribution
          candidate, and neither is publicly callable yet.
        </p>
      </header>

      <section className="product-operations">
        <header>
          <p className="eyebrow">Projected operations</p>
          <h2>Preview means inspectable.<br />It does not mean launched.</h2>
        </header>
        <div className="operation-list">
          {discovery.products.map((product) => (
            <article key={product.productId}>
              <span>{product.operationId}</span>
              <h3>{product.title}</h3>
              <p>{product.summary}</p>
              <dl>
                <div><dt>Lifecycle</dt><dd>{product.lifecycle}</dd></div>
                <div><dt>Delivery</dt><dd>{product.deliveryModes.join(', ')}</dd></div>
                <div><dt>Public callable</dt><dd>false</dd></div>
                <div><dt>Payment</dt><dd>non-payable fixture only</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="capability-ledger">
        <header>
          <p className="eyebrow">Private qualification ledger</p>
          <h2>The full system beneath the projection.</h2>
          <p>
            These capability identifiers are frozen private-core interfaces.
            Unavailable products remain dark until their external launch
            requirements are proven.
          </p>
        </header>
        {discovery.releaseScope.pillars.map((pillar, index) => (
          <details key={pillar.pillarId} open={pillar.pillarId === 'search'}>
            <summary>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <b>{pillarLabels[pillar.pillarId]}</b>
              <i className={`state state--${pillar.lifecycle}`}>{pillar.lifecycle}</i>
            </summary>
            <div>
              <p>Private core qualified: yes</p>
              <ul>
                {pillar.capabilityIds.map((capability) => <li key={capability}><code>{capability}</code></li>)}
              </ul>
              <Link className="text-link" to={`/products/${pillar.pillarId === 'crypto_intelligence' ? 'crypto' : pillar.pillarId}`}>Open exact product state →</Link>
            </div>
          </details>
        ))}
      </section>

      <div className="next-action">
        <p>Operate the lifecycle with a deterministic, non-payable fixture.</p>
        <Link className="button button--primary" to="/proof-lab">Enter Proof Lab</Link>
      </div>
    </section>
  );
}
