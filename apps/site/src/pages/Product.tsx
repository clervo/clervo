import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { familyProfiles } from '../content';
import { discovery, type ExperiencePhase } from '../product';
import { Link } from '../router';

export function Product({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('qualified'), [onPhase]);
  return (
    <section className="product-page">
      <header className="page-intro">
        <ModeBadge>Frozen private core · public lifecycle shown separately</ModeBadge>
        <p className="eyebrow">Product / outcome infrastructure</p>
        <h1>Buy outcomes.<br />Not integrations.</h1>
        <p>Clervo keeps six permanent capability families behind one request-to-proof contract. Current repository truth still controls what is callable, payable, and externally verified.</p>
        <div className="authority-actions"><Link className="liquid-capsule liquid-capsule--primary" to="/start">Set up Clervo</Link><Link className="liquid-capsule liquid-capsule--secondary" to="/catalog">Browse catalog</Link></div>
      </header>

      <section className="capability-ledger">
        <header><p className="eyebrow">Permanent platform</p><h2>Six families. One bounded operating model.</h2><p>Acquire the route, operate inside explicit constraints, and prove the result.</p></header>
        {familyProfiles.map((family, index) => {
          const pillar = discovery.releaseScope.pillars.find((item) => item.pillarId === family.id);
          return (
            <details key={family.id} open={family.id === 'search'}>
              <summary><span>{String(index + 1).padStart(2, '0')}</span><b>{family.title}</b><i className={`state state--${pillar?.lifecycle ?? 'unavailable'}`}>{pillar?.lifecycle ?? 'unavailable'}</i></summary>
              <div><p>{family.description}</p><ul>{pillar?.capabilityIds.map((capability) => <li key={capability}><code>{capability}</code></li>)}</ul><Link to={`/capabilities/${family.slug}`}>Inspect {family.title} →</Link></div>
            </details>
          );
        })}
      </section>

      <section className="product-operations">
        <header><p className="eyebrow">Projected operations</p><h2>Preview means inspectable.<br />It does not mean launched.</h2></header>
        <div className="operation-list">
          {discovery.products.map((product) => (
            <article key={product.productId}>
              <span>{product.operationId}</span><h3>{product.title}</h3><p>{product.summary}</p>
              <dl><div><dt>Lifecycle</dt><dd>{product.lifecycle}</dd></div><div><dt>Delivery</dt><dd>{product.deliveryModes.join(', ')}</dd></div><div><dt>Public callable</dt><dd>false</dd></div><div><dt>Payment</dt><dd>non-payable fixture only</dd></div></dl>
              <Link to={`/operations/${product.operationId}`}>Inspect contract →</Link>
            </article>
          ))}
        </div>
      </section>

      <div className="next-action"><p>Operate the lifecycle with a deterministic, non-payable fixture.</p><Link className="liquid-capsule liquid-capsule--primary" to="/proof">Open Proof</Link></div>
    </section>
  );
}
