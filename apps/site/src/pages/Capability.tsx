import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { launchState, type ExperiencePhase, type LaunchProductId } from '../product';
import { Link } from '../router';

const routeToProduct: Record<string, LaunchProductId> = {
  search: 'search',
  ai: 'ai',
  sandbox: 'sandbox',
  rpc: 'rpc',
  prediction: 'prediction',
  crypto: 'crypto_intelligence',
};

export function Capability({ routeId, onPhase }: { routeId: string; onPhase(phase: ExperiencePhase): void }) {
  const productId = routeToProduct[routeId];
  const product = launchState.products.find(({ id }) => id === productId);
  useEffect(() => onPhase(productId === 'search' ? 'qualified' : 'risk'), [onPhase, productId]);
  if (product === undefined) return null;
  const publicPreview = product.customerLifecycle === 'preview_not_publicly_callable';
  return (
    <section className="capability-page">
      <header className="page-intro">
        <ModeBadge>{`${product.engineeringState.replaceAll('_', ' ')} · ${product.customerLifecycle.replaceAll('_', ' ')}`}</ModeBadge>
        <p className="eyebrow">Product core / {routeId}</p>
        <h1>{product.label}.<br />State before promise.</h1>
        <p>{product.allowedClaims[0]}</p>
      </header>

      <section className="capability-state-grid">
        <article><span>ENGINEERING</span><h2>{product.engineeringState.replaceAll('_', ' ')}</h2><p>Private contract and qualification state.</p></article>
        <article><span>CUSTOMER LIFECYCLE</span><h2>{product.customerLifecycle.replaceAll('_', ' ')}</h2><p>{publicPreview ? 'Inspectable preview; no public customer endpoint.' : 'No customer workflow is offered.'}</p></article>
        <article><span>COMMERCIAL PROOF</span><h2>{product.commercialProof.replaceAll('_', ' ')}</h2><p>No broader revenue or demand claim follows.</p></article>
      </section>

      <section className="capability-contract">
        <header><p className="eyebrow">Exact capability identities</p><h2>Named routes, no silent substitution.</h2></header>
        <div>{product.operations.map((operation) => <code key={operation}>{operation}</code>)}</div>
      </section>

      <section className="claim-boundary">
        <article><span>SUPPORTED COPY</span><h2>What the evidence permits</h2><ul>{product.allowedClaims.map((claim) => <li key={claim}>{claim}</li>)}</ul></article>
        <article><span>EXPLICIT NON-CLAIMS</span><h2>What this route will not imply</h2><ul>{product.prohibitedClaims.map((claim) => <li key={claim}>{claim}</li>)}</ul></article>
      </section>

      <section className="source-boundary">
        <div><span>SUPPLIER RIGHTS</span><strong>{product.supplierRights.replaceAll('_', ' ')}</strong></div>
        <div><span>PAYMENT</span><strong>{product.paymentState.replaceAll('_', ' ')}</strong></div>
        <div><span>PUBLIC ACTION</span><strong>{publicPreview ? 'inspect only' : 'none'}</strong></div>
      </section>

      <div className="next-action">
        <p>{publicPreview ? 'Inspect the recorded Research path without implying public access.' : 'Read the platform contract; no fake start flow is exposed.'}</p>
        <Link className="button button--primary" to={publicPreview ? '/research' : '/platform'}>{publicPreview ? 'Inspect Research' : 'Back to platform'}</Link>
      </div>
    </section>
  );
}
