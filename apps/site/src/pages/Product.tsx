import { useEffect } from 'react';

import {
  discovery,
  familyOf,
  formatUsdc,
  lifecycleLabels,
  observedProduct,
  observedTruth,
  pillarLabels,
  proofLabels,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';

/*
 * /product and /platform — what the system is, and what it is currently doing.
 *
 * Two facts are kept apart on every card here, because collapsing them is the
 * easiest way for a product page to start lying: lifecycle state says whether a
 * family answers requests right now, and proof level says what has actually
 * been demonstrated. A family can be live and still have proven nothing beyond
 * a quote.
 */

const liveFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live');

export function Product({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('qualified'), [onPhase]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">How Clervo works</p>
        <h1>One platform.<br />No borrowed readiness.</h1>
        <p className="lede">
          Six product families share one frozen compatibility surface, so a
          client written against one of them already speaks to all of them.
          {' '}{liveFamilies.length} of {observedTruth.products.length} families
          were observed serving at {observedTruth.provenance.observedAt}. Every
          state on this page is read from that probe.
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--primary" to="/start">Set up Clervo</Link>
          <Link className="button button--quiet" to="/catalog">See every route</Link>
        </div>
      </section>

      <section className="band band--ruled product-operations" aria-labelledby="operations-heading">
        <div className="section-head">
          <p className="eyebrow">Published operations</p>
          <h2 id="operations-heading">Serving is one fact. Proven is another.</h2>
          <p className="lede">
            These are the operations the deployed system publishes today. The
            lifecycle and proof rows beneath each one come from the probe, not
            from this page.
          </p>
        </div>
        <ul className="operation-grid">
          {discovery.products.map((product) => {
            const observed = observedProduct(familyOf(product.productId));
            return (
              <li key={product.productId} className="panel">
                <div className="panel__body stack">
                  <div className="operation-grid__head">
                    <h3 className="operation-grid__id">{product.operationId}</h3>
                    <span className={`state state--${observed.lifecycleState}`}>
                      {lifecycleLabels[observed.lifecycleState]}
                    </span>
                  </div>
                  <p className="quiet">{product.summary}</p>
                  <dl className="facts">
                    <div>
                      <dt>Proof</dt>
                      <dd>{proofLabels[observed.proofLevel]}</dd>
                    </div>
                    <div>
                      <dt>Delivery</dt>
                      <dd>{product.deliveryModes.join(', ')}</dd>
                    </div>
                    <div>
                      <dt>Publicly callable</dt>
                      <dd>{observed.publiclyReachable ? 'yes' : 'no'}</dd>
                    </div>
                    <div>
                      <dt>Maximum charge</dt>
                      <dd>
                        {observed.observedPrice === null
                          ? 'not quoted'
                          : formatUsdc(observed.observedPrice.amountAtomic, 6)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="band band--ruled capability-ledger" aria-labelledby="ledger-heading">
        <div className="section-head">
          <p className="eyebrow">The full surface</p>
          <h2 id="ledger-heading">Every capability, including the dark ones.</h2>
          <p className="lede">
            A family that is not serving keeps its entry and its reason rather
            than disappearing. A route that never existed and a route that is
            temporarily unfunded are different facts.
          </p>
        </div>
        {discovery.releaseScope.pillars.map((pillar, index) => {
          const observed = observedProduct(pillar.pillarId);
          return (
            <details
              key={pillar.pillarId}
              className="ledger-row"
              open={observed.lifecycleState === 'live'}
            >
              <summary>
                <span className="data">{String(index + 1).padStart(2, '0')}</span>
                <b>{pillarLabels[pillar.pillarId]}</b>
                <i className={`state state--${observed.lifecycleState}`}>
                  {lifecycleLabels[observed.lifecycleState]}
                </i>
              </summary>
              <div className="ledger-row__body">
                <dl className="facts">
                  <div>
                    <dt>Observed proof</dt>
                    <dd>{proofLabels[observed.proofLevel]}</dd>
                  </div>
                  {observed.reason === null ? null : (
                    <div>
                      <dt>Not serving because</dt>
                      <dd>{observed.reason.replaceAll('_', ' ')}</dd>
                    </div>
                  )}
                </dl>
                <ul className="ledger-row__capabilities" aria-label={`${pillarLabels[pillar.pillarId]} capabilities`}>
                  {pillar.capabilityIds.map((capability) => <li key={capability}>{capability}</li>)}
                </ul>
                <Link
                  className="text-link"
                  to={`/products/${pillar.pillarId === 'crypto_intelligence' ? 'crypto' : pillar.pillarId}`}
                >
                  Open exact product state
                </Link>
              </div>
            </details>
          );
        })}
      </section>

      <section className="band product-next">
        <div className="section-head">
          <p className="eyebrow">Next</p>
          <h2>Operate the lifecycle yourself.</h2>
          <p className="lede">
            Proof Lab runs the whole request, approval, verification and receipt
            sequence against a deterministic local fixture. No network, no
            payment, no account.
          </p>
        </div>
        <div className="cluster">
          <Link className="button button--primary" to="/proof-lab">Enter Proof Lab</Link>
          <Link className="button button--quiet" to="/docs/quickstart">Read the quickstart</Link>
        </div>
      </section>
    </>
  );
}
