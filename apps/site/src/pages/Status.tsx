import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import {
  discovery,
  launchState,
  lifecycleLabels,
  observedTruth,
  proofLabels,
  publicApiCallable,
  type ExperiencePhase,
} from '../product';

// Nothing on this page is a hand-written status claim. Every lifecycle state
// and proof level below is read from the observed truth block that the
// generator renders from packages/catalog/live-registry.json, which is produced
// by probing the deployed system. Editing a status into this file is a bug.
export function Status({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  const live = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live');
  const paused = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'supply_paused');
  const proven = observedTruth.products.filter(({ proofLevel }) => proofLevel === 'paid_outcome_verified' || proofLevel === 'externally_repeated');
  return (
    <section className="status-page">
      <header className="page-intro">
        <ModeBadge>Observed status · probed, not asserted</ModeBadge>
        <p className="eyebrow">Observed at {observedTruth.provenance.observedAt}</p>
        <h1>Probed, not asserted.<br />State and proof kept apart.</h1>
        <p>
          {publicApiCallable
            ? 'The deployed system answers public requests right now.'
            : 'The deployed system answers no public request right now.'}{' '}
          Every state below was observed by probing it, not written by hand.
          Lifecycle state says whether a family serves requests now. Proof level
          says what has actually been demonstrated, which is a different and
          usually smaller claim.
        </p>
      </header>

      <div className="status-summary">
        <article>
          <span>{String(live.length).padStart(2, '0')}</span>
          <h2>Families serving now</h2>
          <p>Observed live against release {observedTruth.provenance.releaseId.slice(0, 12)}.</p>
        </article>
        <article>
          <span>{String(paused.length).padStart(2, '0')}</span>
          <h2>Families supply paused</h2>
          <p>In the catalog, temporarily not serving; each carries its reason.</p>
        </article>
        <article>
          <span>{String(proven.length).padStart(2, '0')}</span>
          <h2>Paid outcomes verified</h2>
          <p>A returned quote is not a proven paid outcome, and is never counted as one.</p>
        </article>
      </div>

      <section className="status-ledger">
        <header>
          <h2>Observed lifecycle and proof</h2>
          <span>Two separate facts, never collapsed into one.</span>
        </header>
        {observedTruth.products.map((product) => (
          <div key={product.id}>
            <span className={`status-dot status-dot--${product.lifecycleState}`} aria-hidden="true" />
            <h3>{product.label}</h3>
            <b>{lifecycleLabels[product.lifecycleState]}</b>
            <small>
              {proofLabels[product.proofLevel]}
              {product.reason === null ? '' : ` · ${product.reason.replaceAll('_', ' ')}`}
              {product.expectedReturnAt === null ? '' : ` · expected back ${product.expectedReturnAt.slice(0, 10)}`}
            </small>
          </div>
        ))}
      </section>

      <section className="status-contract">
        <p className="eyebrow">Frozen interface</p>
        <dl>
          <div><dt>Release candidate</dt><dd>{discovery.distribution.releaseCandidateId}</dd></div>
          <div><dt>Interface hash</dt><dd>{discovery.distribution.interfaceHash}</dd></div>
          <div><dt>Public distribution</dt><dd>{String(discovery.distribution.publicAvailable)}</dd></div>
          <div><dt>Public callable</dt><dd>{String(discovery.distribution.callable)}</dd></div>
          <div><dt>Public packages</dt><dd>{launchState.distribution.packages.state.replaceAll('_', ' ')}</dd></div>
          <div><dt>Owner-funded x402 proof</dt><dd>{launchState.paymentProof.amountDisplay}, settled</dd></div>
          <div><dt>Customer revenue evidence</dt><dd>{String(launchState.paymentProof.revenueEvidence)}</dd></div>
          <div><dt>First Revenue Release</dt><dd>{discovery.releaseScope.firstRevenueRelease.ready ? 'ready' : 'not ready'}</dd></div>
          <div><dt>Status source</dt><dd>{observedTruth.provenance.source}</dd></div>
        </dl>
      </section>
    </section>
  );
}
