import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { launchState, type ExperiencePhase } from '../product';

export function Changelog({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  return (
    <section className="changelog-page">
      <header className="page-intro">
        <ModeBadge>Evidence-backed release notes</ModeBadge>
        <p className="eyebrow">Changelog / current verified state</p>
        <h1>What changed.<br />What it actually means.</h1>
      </header>
      <article className="release-entry">
        <time dateTime={launchState.observedAt}>{launchState.observedAt.slice(0, 10)}</time>
        <div>
          <p className="eyebrow">Private production proof</p>
          <h2>Bounded x402 settlement and no-charge replay verified</h2>
          <p>One owner-funded Search request settled for {launchState.paymentProof.amountDisplay}, returned a useful result, and replayed with no second authorization, execution, or charge.</p>
          <small>Public API availability, customer revenue, and market demand remain unproven.</small>
        </div>
      </article>
      <article className="release-entry">
        <time dateTime={launchState.distribution.packages.verifiedAt}>{launchState.distribution.packages.verifiedAt.slice(0, 10)}</time>
        <div>
          <p className="eyebrow">Developer distribution</p>
          <h2>Public packages verified from one source commit</h2>
          <p>@clervo/sdk 0.3.0, @clervo/mcp 0.3.0, and clervo-sdk 0.2.0 are published with registry provenance or trusted-publisher attestations.</p>
          <small>The packages require an explicit base URL and do not make the API public.</small>
        </div>
      </article>
    </section>
  );
}
