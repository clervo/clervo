import { useEffect } from 'react';

import {
  capabilityLabel,
  discovery,
  familyOf,
  formatUsdc,
  launchState,
  lifecycleLabels,
  observedProduct,
  observedRoutes,
  observedTruth,
  proofLabels,
  supplyFamilyLabel,
  type ExperiencePhase,
  type LaunchProductId,
} from '../product';
import { Link } from '../router';

/*
 * /products/:family — the exact state of one product family.
 *
 * Three facts are kept apart here, because a family page is where they are most
 * tempting to collapse into a single "ready" badge:
 *
 *   engineering state — whether the private core passed its contract gate
 *   lifecycle state   — whether a public route answers requests right now
 *   proof level       — what has actually been demonstrated by paying for it
 *
 * The first two come from different sources and have disagreed before: the
 * frozen prose in launch-state said "preview_not_publicly_callable" for as long
 * as the deployed API was returning real quotes. Where they disagree, the probe
 * is what this page renders.
 */

const routeToProduct: Record<string, LaunchProductId> = {
  search: 'search',
  ai: 'ai',
  sandbox: 'sandbox',
  rpc: 'rpc',
  prediction: 'prediction',
  crypto: 'crypto_intelligence',
};

/** Route ids the caller can navigate to, in the order the shell lists them. */
const familyOrder = Object.keys(routeToProduct);

export function Capability({ routeId, onPhase }: { routeId: string; onPhase(phase: ExperiencePhase): void }) {
  const productId = routeToProduct[routeId];
  const product = launchState.products.find(({ id }) => id === productId);
  useEffect(() => onPhase(productId === 'search' ? 'qualified' : 'risk'), [onPhase, productId]);
  if (product === undefined || productId === undefined) return null;

  const observed = observedProduct(productId);

  // Operations the discovery document actually publishes for this family, as
  // opposed to the capability identifiers the family owns. A capability that is
  // named but not published is not the same fact as one that is callable.
  const published = discovery.products.filter((entry) => familyOf(entry.operationId) === productId);
  const publishedIds = new Set(published.map(({ operationId }) => operationId));

  // Routes the probe saw serving this family. AI carries twenty-one of them, so
  // this section states the shape and defers the full list to /catalog rather
  // than reprinting the catalog on six separate pages.
  const routes = observedRoutes.filter((route) => route.productIds.some((id) => familyOf(id) === productId));
  const supplies = [...new Set(routes.map(({ supplyFamilyId }) => supplyFamilyId))];
  const capabilities = [...new Set(routes.flatMap(({ capabilities: list }) => list))].sort();

  const facts: Array<{ label: string; value: string; detail: string; verified?: boolean }> = [
    {
      label: 'Engineering',
      value: product.engineeringState.replaceAll('_', ' '),
      detail: 'Whether the private core passed its contract and stabilization gate.',
    },
    {
      label: 'Observed lifecycle',
      value: lifecycleLabels[observed.lifecycleState],
      detail: observed.publiclyReachable
        ? 'A public route answers this family right now.'
        : observed.reason === null
          ? 'No public route is served.'
          : `No public route is served: ${observed.reason.replaceAll('_', ' ')}.`,
    },
    {
      label: 'Observed proof',
      value: proofLabels[observed.proofLevel],
      detail: 'A served quote is not a paid outcome, and is never counted as one.',
      verified: observed.proofLevel === 'paid_outcome_verified' || observed.proofLevel === 'externally_repeated',
    },
  ];

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Product family / {routeId}</p>
        <h1>{product.label}.</h1>
        <p className="lede">{product.allowedClaims[0]}</p>
        <div className="cluster page-lead__actions">
          {observed.publiclyReachable ? (
            <>
              <Link className="button button--primary" to="/start">Set up Clervo</Link>
              <Link className="button button--quiet" to="/catalog">See every route</Link>
            </>
          ) : (
            <>
              <Link className="button button--secondary" to="/product">Back to the platform</Link>
              <Link className="button button--quiet" to="/status">See observed status</Link>
            </>
          )}
        </div>
      </section>

      <section className="band band--ruled family-body" aria-labelledby="family-state">
        <h2 id="family-state" className="sr-only">Observed state</h2>
        <dl className="family-facts">
          {facts.map(({ label, value, detail, verified }) => (
            <div key={label}>
              <dt>{label}</dt>
              {/* The explanation lives inside the dd, because a definition list
                * may only contain dt, dd and grouping divs. */}
              <dd>
                <b className={verified === true ? 'state state--verified' : undefined}>{value}</b>
                <span className="quiet">{detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="band band--ruled family-body" aria-labelledby="family-operations">
        <div className="section-head">
          <p className="eyebrow">Capability identities</p>
          <h2 id="family-operations">Named operations, no silent substitution.</h2>
          <p className="lede">
            {published.length === 0
              ? 'None of these operations are published on the discovery document yet. They are named so a caller can see what the family owns, not what it currently answers.'
              : `${published.length} of ${product.operations.length} operations are published on the discovery document. The rest are owned by this family and not currently offered.`}
          </p>
        </div>
        <ul className="family-operations">
          {product.operations.map((operation) => {
            const entry = published.find(({ operationId }) => operationId === operation);
            return (
              <li key={operation} className={publishedIds.has(operation) ? 'is-published' : undefined}>
                <code>{operation}</code>
                <span className="quiet">
                  {entry === undefined
                    ? 'not published'
                    : entry.publicAvailable
                      ? entry.summary
                      : `${entry.summary} Not publicly available.`}
                </span>
                {entry?.pricing.displayPrice == null ? null : (
                  <span className="data family-operations__price">
                    max {formatUsdc(entry.pricing.displayPrice.amountAtomic, entry.pricing.displayPrice.decimals)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {routes.length === 0 ? null : (
        <section className="band band--ruled family-body" aria-labelledby="family-routes">
          <div className="section-head">
            <p className="eyebrow">Observed routes</p>
            <h2 id="family-routes">What the probe saw serving.</h2>
            <p className="lede">
              {routes.length} {routes.length === 1 ? 'route' : 'routes'} answered
              for this family at {observedTruth.provenance.observedAt}
              {supplies.length === 0
                ? '.'
                : `, across ${supplies.map((id) => supplyFamilyLabel(id)).join(', ')}.`}
              {' '}Each one quotes its own maximum charge, listed on the catalog.
            </p>
          </div>
          {capabilities.length === 0 ? null : (
            <ul className="family-tags" aria-label="Observed capabilities">
              {capabilities.map((capability) => <li key={capability}>{capabilityLabel(capability)}</li>)}
            </ul>
          )}
          <div className="cluster family-actions">
            <Link className="button button--quiet" to="/catalog">Open the catalog</Link>
            <a className="text-link" href="/models.json">Read the raw observation</a>
          </div>
        </section>
      )}

      <section className="band band--ruled family-body" aria-labelledby="family-boundary">
        <div className="section-head">
          <p className="eyebrow">Claim boundary</p>
          <h2 id="family-boundary">What is claimed, and what is refused.</h2>
        </div>
        <div className="family-claims">
          <div className="panel">
            <div className="panel__body stack stack--tight">
              <p className="eyebrow">Supported by evidence</p>
              <ul className="claim-list">
                {product.allowedClaims.map((claim) => <li key={claim}>{claim}</li>)}
              </ul>
            </div>
          </div>
          <div className="panel">
            <div className="panel__body stack stack--tight">
              <p className="eyebrow">Explicitly not claimed</p>
              <ul className="claim-list claim-list--refused">
                {product.prohibitedClaims.map((claim) => <li key={claim}>{claim}</li>)}
              </ul>
            </div>
          </div>
        </div>
        <dl className="facts family-rights">
          <div>
            <dt>Supplier rights</dt>
            <dd>{product.supplierRights.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>{product.paymentState.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt>Commercial proof</dt>
            <dd>{product.commercialProof.replaceAll('_', ' ')}</dd>
          </div>
        </dl>
      </section>

      <section className="band family-body" aria-labelledby="family-next">
        <div className="section-head">
          <p className="eyebrow">Other families</p>
          <h2 id="family-next">The other five, in the same terms.</h2>
        </div>
        <nav className="cluster family-links" aria-label="Product families">
          {familyOrder.map((id) => {
            const other = observedProduct(routeToProduct[id]!);
            return (
              <Link
                key={id}
                className={id === routeId ? 'is-active' : ''}
                aria-current={id === routeId ? 'page' : undefined}
                to={`/products/${id}`}
              >
                {other.label}
                <i className={`state state--${other.lifecycleState}`}>
                  {lifecycleLabels[other.lifecycleState]}
                </i>
              </Link>
            );
          })}
        </nav>
      </section>
    </>
  );
}
