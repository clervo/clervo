import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { discovery, pillarLabels, type ExperiencePhase } from '../product';

export function Status({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  return (
    <section className="status-page">
      <header className="page-intro">
        <ModeBadge>Evidence-backed status · not a launch claim</ModeBadge>
        <p className="eyebrow">Current engineering state</p>
        <h1>Private core frozen.<br />Public release incomplete.</h1>
        <p>{discovery.description}</p>
      </header>

      <div className="status-summary">
        <article>
          <span>06</span>
          <h2>Private cores qualified</h2>
          <p>Compatibility and interfaces are frozen under the current release candidate.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Projected operations</h2>
          <p>Only search.web and search.answer enter the distribution candidate.</p>
        </article>
        <article>
          <span>00</span>
          <h2>Public payment proofs</h2>
          <p>No real settlement or externally useful paid result is claimed.</p>
        </article>
      </div>

      <section className="status-ledger">
        <header>
          <h2>Lifecycle ledger</h2>
          <span>Private qualification and public lifecycle are separate.</span>
        </header>
        {discovery.releaseScope.pillars.map((pillar) => (
          <div key={pillar.pillarId}>
            <span className={`status-dot status-dot--${pillar.lifecycle}`} aria-hidden="true" />
            <h3>{pillarLabels[pillar.pillarId]}</h3>
            <b>{pillar.lifecycle}</b>
            <small>private qualified</small>
          </div>
        ))}
      </section>

      <section className="status-contract">
        <p className="eyebrow">Frozen interface</p>
        <dl>
          <div><dt>Release candidate</dt><dd>{discovery.distribution.releaseCandidateId}</dd></div>
          <div><dt>Interface hash</dt><dd>{discovery.distribution.interfaceHash}</dd></div>
          <div><dt>Public distribution</dt><dd>false</dd></div>
          <div><dt>Public callable</dt><dd>false</dd></div>
          <div><dt>First Revenue Release</dt><dd>not ready</dd></div>
        </dl>
      </section>
    </section>
  );
}
