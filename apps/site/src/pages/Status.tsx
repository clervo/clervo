import { useEffect } from 'react';

import {
  discovery,
  launchState,
  lifecycleLabels,
  observedRoutes,
  observedTruth,
  proofLabels,
  publicApiCallable,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';

/*
 * /status — observed state, never asserted state.
 *
 * Every number and label on this page is read from the observed truth block the
 * generator renders from the probed registry. Writing a status into this file
 * is a bug, not a shortcut.
 *
 * Lifecycle state and proof level are deliberately kept in separate columns.
 * They answer different questions — "does this answer requests now" and "what
 * has actually been demonstrated" — and a family can be live while having
 * proven nothing beyond a returned quote.
 */

const live = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live');
const paused = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'supply_paused');
const proven = observedTruth.products.filter(
  ({ proofLevel }) => proofLevel === 'paid_outcome_verified' || proofLevel === 'externally_repeated',
);
const liveRoutes = observedRoutes.filter(({ lifecycleState }) => lifecycleState === 'live');

const summary: Array<{ value: string; label: string; detail: string }> = [
  {
    value: String(live.length),
    label: 'Families serving now',
    detail: `Of ${observedTruth.products.length} permanent families, observed against release ${observedTruth.provenance.releaseId.slice(0, 7)}.`,
  },
  {
    value: String(liveRoutes.length),
    label: 'Routes answering',
    detail: 'Each one appears on the catalog with its own maximum charge.',
  },
  {
    value: String(paused.length),
    label: 'Families supply paused',
    detail: 'Still in the catalog, temporarily not serving; each carries its reason.',
  },
  {
    value: String(proven.length),
    label: 'Paid outcomes verified',
    detail: 'A returned quote is not a proven paid outcome, and is never counted as one.',
  },
];

export function Status({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Observed at {observedTruth.provenance.observedAt}</p>
        <h1>Probed, not asserted.</h1>
        <p className="lede">
          {publicApiCallable
            ? 'The deployed system answers public requests right now.'
            : 'The deployed system answers no public request right now.'}{' '}
          Every state below was observed by probing it. Lifecycle state says
          whether a family serves requests now; proof level says what has been
          demonstrated, which is a different and usually smaller claim.
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--secondary" to="/catalog">Open the catalog</Link>
          <a className="text-link" href="/models.json">Read the raw observation</a>
        </div>
      </section>

      <section className="band band--ruled status-body" aria-labelledby="status-summary-heading">
        <h2 id="status-summary-heading" className="sr-only">Observed summary</h2>
        <dl className="status-summary">
          {summary.map(({ value, label, detail }) => (
            <div key={label}>
              <dt>{label}</dt>
              {/* A definition list may only contain dt, dd and grouping divs,
                * so the explanatory line lives inside the dd rather than beside
                * it. */}
              <dd>
                <b>{value}</b>
                <span className="quiet">{detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="band band--ruled status-body" aria-labelledby="status-ledger-heading">
        <div className="section-head">
          <p className="eyebrow">Per family</p>
          <h2 id="status-ledger-heading">Two facts, never collapsed into one.</h2>
        </div>
        <ul className="status-ledger">
          {observedTruth.products.map((product) => (
            <li key={product.id} className="panel">
              <div className="panel__body stack stack--tight">
                <div className="status-ledger__head">
                  <h3>{product.label}</h3>
                  <span className={`state state--${product.lifecycleState}`}>
                    {lifecycleLabels[product.lifecycleState]}
                  </span>
                </div>
                <p className="quiet">{proofLabels[product.proofLevel]}</p>
                {product.reason === null ? null : (
                  <p className="quiet">Not serving because: {product.reason.replaceAll('_', ' ')}</p>
                )}
                {product.expectedReturnAt === null ? null : (
                  <p className="quiet">Expected back {product.expectedReturnAt.slice(0, 10)}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="band status-body" aria-labelledby="status-contract-heading">
        <div className="section-head">
          <p className="eyebrow">Frozen interface</p>
          <h2 id="status-contract-heading">What this observation was taken against.</h2>
        </div>
        <dl className="facts">
          <div><dt>Release candidate</dt><dd>{discovery.distribution.releaseCandidateId}</dd></div>
          <div><dt>Interface hash</dt><dd>{discovery.distribution.interfaceHash}</dd></div>
          <div><dt>Public distribution</dt><dd>{discovery.distribution.publicAvailable ? 'available' : 'not available'}</dd></div>
          <div><dt>Public callable</dt><dd>{discovery.distribution.callable ? 'yes' : 'no'}</dd></div>
          <div><dt>Public packages</dt><dd>{launchState.distribution.packages.state.replaceAll('_', ' ')}</dd></div>
          <div><dt>Owner-funded x402 proof</dt><dd>{launchState.paymentProof.amountDisplay}, settled</dd></div>
          <div><dt>Customer revenue evidence</dt><dd>{String(launchState.paymentProof.revenueEvidence)}</dd></div>
          <div><dt>First Revenue Release</dt><dd>{discovery.releaseScope.firstRevenueRelease.ready ? 'ready' : 'not ready'}</dd></div>
          <div><dt>Status source</dt><dd>{observedTruth.provenance.source}</dd></div>
        </dl>
      </section>
    </>
  );
}
