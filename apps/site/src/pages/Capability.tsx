import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { launchState, lifecycleLabels, observedProduct, proofLabels, type ExperiencePhase, type LaunchProductId } from '../product';
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
  // The lifecycle shown here is the probed one, not the frozen prose in
  // launch-state. Those two disagreed for as long as the API quoted prices
  // while this page said "preview_not_publicly_callable".
  const observed = observedProduct(productId);
  return (
    <section className="capability-page">
      <header className="page-intro">
        <ModeBadge>{`${product.engineeringState.replaceAll('_', ' ')} · ${lifecycleLabels[observed.lifecycleState]}`}</ModeBadge>
        <p className="eyebrow">Product core / {routeId}</p>
        <h1>{product.label}.<br />State before promise.</h1>
        <p>{product.allowedClaims[0]}</p>
      </header>

      <section className="capability-state-grid">
        <article><span>ENGINEERING</span><h2>{product.engineeringState.replaceAll('_', ' ')}</h2><p>Private contract and qualification state.</p></article>
        <article>
          <span>OBSERVED LIFECYCLE</span>
          <h2>{lifecycleLabels[observed.lifecycleState]}</h2>
          <p>
            {observed.publiclyReachable
              ? 'A public route answers this family right now.'
              : observed.reason === null
                ? 'No public route is served.'
                : `No public route is served: ${observed.reason.replaceAll('_', ' ')}.`}
          </p>
        </article>
        <article>
          <span>OBSERVED PROOF</span>
          <h2>{proofLabels[observed.proofLevel]}</h2>
          <p>Proof level is separate from lifecycle; a served quote is not a paid outcome.</p>
        </article>
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
        <div><span>PUBLIC ACTION</span><strong>{observed.publiclyReachable ? 'call the deployed route' : 'inspect only'}</strong></div>
      </section>

      <div className="next-action">
        <p>{observed.publiclyReachable ? 'Call the deployed route directly, or inspect the recorded Research path first.' : 'Read the platform contract; no fake start flow is exposed.'}</p>
        <Link className="button button--primary" to={observed.publiclyReachable ? '/docs/quickstart' : '/platform'}>{observed.publiclyReachable ? 'Install a client' : 'Back to platform'}</Link>
      </div>
    </section>
  );
}
