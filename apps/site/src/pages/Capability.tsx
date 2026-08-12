import { useEffect } from 'react';

import {
  capabilityLabel,
  attributionLabel,
  discovery,
  familyOf,
  formatUsdc,
  launchState,
  lifecycleLabels,
  observedProduct,
  observedRoutes,
  observedTruth,
  proofLabels,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';
import '../styles/b12/product-catalog.css';
import {
  FAMILY_CODE,
  FAMILY_DISPLAY,
  FAMILY_FIXTURE,
  FAMILY_ORDER,
  FAMILY_ROUTE,
  ROUTE_FAMILY,
} from './b12Slice4';

export function Capability({ routeId, onPhase }: { routeId: string; onPhase(phase: ExperiencePhase): void }) {
  const familyId = ROUTE_FAMILY[routeId];
  useEffect(() => onPhase(familyId === 'search' ? 'qualified' : 'risk'), [familyId, onPhase]);
  if (familyId === undefined) return null;

  const observed = observedProduct(familyId);
  const launch = launchState.products.find((product) => product.id === familyId);
  if (launch === undefined) return null;

  const published = discovery.products.filter((entry) => familyOf(entry.operationId) === familyId);
  const routes = observedRoutes.filter((route) => route.productIds.some((id) => {
    try { return familyOf(id) === familyId; } catch { return false; }
  }));
  const fixture = FAMILY_FIXTURE[familyId];

  return (
    <div className="b12-slice4 b12-family" data-family={familyId}>
      <section className="s4-family-hero shell" aria-labelledby="s4-family-title">
        <Link className="s4-back-link" to="/catalog">← Back to catalog</Link>
        <div className="s4-family-hero-grid">
          <div>
            <p className="s4-eyebrow">Capability family · {FAMILY_CODE[familyId]}</p>
            <h1 id="s4-family-title">{FAMILY_DISPLAY[familyId]}</h1>
            <p className="s4-lede">{fixture.promise}</p>
            <p className="s4-truth-note">Editorial family promise from the locked design. Current lifecycle and proof are shown separately.</p>
          </div>
          <dl className="s4-family-summary">
            <div><dt>Observed lifecycle</dt><dd>{lifecycleLabels[observed.lifecycleState]}</dd></div>
            <div><dt>Observed proof</dt><dd className={observed.proofLevel === 'paid_outcome_verified' || observed.proofLevel === 'externally_repeated' ? 'proof-word' : undefined}>{proofLabels[observed.proofLevel]}</dd></div>
            <div><dt>Published operation identities</dt><dd>{published.length}</dd></div>
            <div><dt>Observed routes</dt><dd>{routes.length}</dd></div>
          </dl>
        </div>
      </section>

      <section className="s4-family-content shell" aria-label={`${FAMILY_DISPLAY[familyId]} family contract`}>
        <div className="s4-family-grid">
          <article className="s4-family-panel">
            <p className="s4-kicker">Common tasks · design fixture</p>
            <h2>What agents ask this family to do.</h2>
            <div className="s4-task-list">{fixture.tasks.map((task) => <div key={task}>{task}</div>)}</div>
          </article>

          <article className="s4-family-panel">
            <p className="s4-kicker">How Clervo qualifies · design fixture</p>
            <h2>Route logic stays inspectable.</h2>
            <p>{fixture.qualify}</p>
            <div className="s4-task-list"><div>{fixture.limitation}</div><div>Pricing specifics are not inferred from this design fixture.</div></div>
          </article>

          <article className="s4-family-panel">
            <p className="s4-kicker">Example request → result · fixture</p>
            <h2>One bounded outcome contract.</h2>
            <div className="s4-example-contract">
              <div><span>Request</span><strong>{fixture.example[0]}</strong></div>
              <div><span>Qualify</span><strong>{fixture.example[1]}</strong></div>
              <div className="result"><span>Return</span><strong>{fixture.example[2]}</strong></div>
            </div>
          </article>

          <article className="s4-family-panel">
            <p className="s4-kicker">Permanent page rule</p>
            <h2>The family stays. Operations evolve.</h2>
            <p>Permanent family identity is presentation authority. Lifecycle, route, price, proof, and supplier state below remain canonical observations.</p>
            <Link className="b12-button b12-button-secondary b12-liquid" to="/catalog">Open observed catalog</Link>
          </article>
        </div>

        <section className="s4-family-operations" aria-labelledby="s4-family-published-title">
          <div className="s4-catalog-head"><h2 id="s4-family-published-title">Published operation identities</h2><span>{published.length} in the current contract</span></div>
          <div className="s4-operation-list s4-published-operations">
            {published.map((entry) => (
              <article className="s4-operation-card" key={entry.operationId}>
                <div className="s4-op-title"><div className="s4-op-top"><span className="s4-live-label">Canonical contract</span></div><h3>{entry.operationId}</h3><p>{entry.summary}</p></div>
                <div className="s4-op-description"><div className="s4-op-meta"><div><small>Published maximum</small><strong>{entry.pricing.displayPrice === null ? 'request-time quote' : formatUsdc(entry.pricing.displayPrice.amountAtomic, entry.pricing.displayPrice.decimals)}</strong></div><div><small>Attribution</small><strong>{entry.attribution === undefined ? 'not published' : attributionLabel(entry.attribution)}</strong></div><div><small>Observed family</small><strong>{lifecycleLabels[observed.lifecycleState]}</strong></div></div></div>
                <div className="s4-op-action"><Link className="b12-button b12-button-secondary b12-liquid" to={`/operations/${entry.operationId}`}>Inspect</Link></div>
              </article>
            ))}
          </div>
        </section>

        <section className="s4-family-operations" aria-labelledby="s4-family-operations-title">
          <div className="s4-catalog-head"><h2 id="s4-family-operations-title">Operations in this family</h2><span>{routes.length} observed {routes.length === 1 ? 'route' : 'routes'}</span></div>
          {routes.length === 0 ? (
            <div className="s4-empty"><h3>No observed route for this family.</h3><p>The permanent family remains in the platform. Current availability is not invented.</p></div>
          ) : (
            <div className="s4-operation-list">
              {routes.map((route) => <article className="s4-operation-card" key={route.routeId} data-lifecycle={route.lifecycleState}>
                <div className="s4-op-title"><div className="s4-op-top"><span className={`s4-lifecycle ${route.lifecycleState}`}><i />{lifecycleLabels[route.lifecycleState]}</span><span className="s4-live-label">Observed</span></div><h3>{route.id}</h3><code>{route.route}</code></div>
                <div className="s4-op-description"><p>{route.capabilities.map(capabilityLabel).join(' · ') || 'No capability tags observed'}</p><div className="s4-op-meta"><div><small>Maximum charge</small><strong>{route.observedPrice == null ? 'request a quote' : formatUsdc(route.observedPrice.amountAtomic, route.observedPrice.decimals)}</strong></div><div><small>Proof</small><strong className={route.proofLevel === 'paid_outcome_verified' || route.proofLevel === 'externally_repeated' ? 'proof-word' : undefined}>{proofLabels[route.proofLevel]}</strong></div><div><small>Registry sellable</small><strong>{route.sellable ? 'yes' : 'no'}</strong></div></div>{route.reason == null ? null : <div className="s4-proof-flags"><span>{route.reason.replaceAll('_', ' ')}</span></div>}</div>
                <div className="s4-op-action"><Link className="b12-button b12-button-secondary b12-liquid" to="/catalog">Catalog</Link></div>
              </article>)}
            </div>
          )}
        </section>

        <section className="s4-claim-boundary" aria-labelledby="s4-family-claim-title">
          <div className="s4-section-head"><div><p className="s4-kicker">Claim boundary</p><h2 id="s4-family-claim-title">What current authority allows—and refuses.</h2></div><p className="s4-section-copy">These lists are live-bound to the current launch-state authority, separate from the design-fixture task examples above.</p></div>
          <div className="s4-claims-grid">
            <article><p className="s4-kicker">Supported by current authority</p><ul>{launch.allowedClaims.map((claim) => <li key={claim}>{claim}</li>)}</ul></article>
            <article className="refused"><p className="s4-kicker">Explicitly not claimed</p><ul>{launch.prohibitedClaims.map((claim) => <li key={claim}>{claim}</li>)}</ul></article>
          </div>
          <p className="s4-provenance">Observed at {observedTruth.provenance.observedAt}. Supplier rights: {launch.supplierRights.replaceAll('_', ' ')}. Payment state: {launch.paymentState.replaceAll('_', ' ')}.</p>
        </section>

        <nav className="s4-family-strip s4-family-strip--footer" aria-label="All product families">
          {FAMILY_ORDER.map((id) => {
            const current = observedProduct(id);
            return <Link key={id} className={id === familyId ? 'is-active' : undefined} aria-current={id === familyId ? 'page' : undefined} to={`/products/${FAMILY_ROUTE[id]}`}><span>{FAMILY_DISPLAY[id]}</span><small>{lifecycleLabels[current.lifecycleState]}</small></Link>;
          })}
        </nav>
      </section>
    </div>
  );
}
