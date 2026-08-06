import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { discovery, pillarLabels, type ExperiencePhase } from '../product';
import { Link } from '../router';

export function Status({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  const previewCount = discovery.releaseScope.pillars.filter((pillar) => pillar.lifecycle === 'preview').length;
  const unavailableCount = discovery.releaseScope.pillars.filter((pillar) => pillar.lifecycle === 'unavailable').length;
  return (
    <section className="status-page authority-status-page">
      <header className="page-intro">
        <ModeBadge>Canonical repository projection · not a public uptime claim</ModeBadge>
        <p className="eyebrow">Status · canonical public state</p>
        <h1>Current truth without marketing interpretation.</h1>
        <p>Operation availability, family health, payments, settlement, catalog generation, incidents, maintenance, limitations, and versions belong in one timestamped public system. This page currently reflects repository-generated release-candidate truth.</p>
        <div className="authority-actions"><a className="liquid-capsule liquid-capsule--primary" href="#current-state">Inspect current state</a><Link className="liquid-capsule liquid-capsule--secondary" to="/security">Read security boundaries</Link></div>
      </header>
      <section id="current-state" className="status-overview">
        <header><p className="eyebrow">Current release candidate</p><h2>Public release remains incomplete.</h2><p>{discovery.description}</p></header>
        <div className="status-summary">
          <article><span>{String(discovery.releaseScope.pillars.length).padStart(2, '0')}</span><h2>Permanent families</h2><p>{previewCount} preview · {unavailableCount} unavailable.</p></article>
          <article><span>{String(discovery.products.length).padStart(2, '0')}</span><h2>Projected operations</h2><p>Inspectable contracts in the current candidate.</p></article>
          <article><span>00</span><h2>Public payment proofs</h2><p>No real settlement or paid external outcome is claimed.</p></article>
          <article><span>00</span><h2>Published incidents</h2><p>No canonical public incident feed is connected yet.</p></article>
        </div>
      </section>
      <section className="status-ledger"><header><h2>Family health</h2><span>Permanent architecture and current callable readiness remain separate.</span></header>{discovery.releaseScope.pillars.map((pillar) => <div key={pillar.pillarId}><span className={`status-dot status-dot--${pillar.lifecycle}`} aria-hidden="true" /><h3>{pillarLabels[pillar.pillarId]}</h3><b>{pillar.lifecycle}</b><small>private core qualified</small></div>)}</section>
      <section className="status-limitations"><div><p className="eyebrow">Current limitations</p><h2>Truth that belongs above the fold.</h2></div><ul><li><b>Public API</b><span>Not deployed or publicly callable.</span></li><li><b>Payments</b><span>Challenge shape exists; payable production settlement does not.</span></li><li><b>Catalog</b><span>Two Search operations are projected; five family lifecycles remain unavailable.</span></li><li><b>Incidents</b><span>No live public incident ingestion or maintenance schedule is connected.</span></li><li><b>Benchmarks</b><span>No public superiority or parity claim is approved.</span></li></ul></section>
      <section className="status-contract"><p className="eyebrow">Frozen interface</p><dl><div><dt>Release candidate</dt><dd>{discovery.distribution.releaseCandidateId}</dd></div><div><dt>Interface hash</dt><dd>{discovery.distribution.interfaceHash}</dd></div><div><dt>Public distribution</dt><dd>false</dd></div><div><dt>Public callable</dt><dd>false</dd></div><div><dt>First Revenue Release</dt><dd>not ready</dd></div></dl></section>
    </section>
  );
}
