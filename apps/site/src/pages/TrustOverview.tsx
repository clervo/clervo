import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import type { ExperiencePhase } from '../product';
import { Link } from '../router';

export function TrustOverview({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  return (
    <section className="trust-page">
      <header className="page-intro">
        <ModeBadge>Evidence before assertion</ModeBadge>
        <p className="eyebrow">Trust / current boundaries</p>
        <h1>Inspect the mechanism.<br />Keep the non-claims.</h1>
        <p>Clervo separates engineering state, customer lifecycle, commercial proof, security controls, supplier rights, and incident status so one kind of readiness cannot impersonate another.</p>
      </header>
      <section className="trust-map">
        {[
          ['/proof', 'Proof', 'Recorded private settlement and replay evidence.'],
          ['/security', 'Security', 'Fail-closed controls and permanent safety boundaries.'],
          ['/pricing', 'Pricing', 'Recorded proof amount separated from any future public offer.'],
          ['/benchmarks', 'Benchmarks', 'What has and has not been comparatively established.'],
          ['/legal', 'Rights', 'Supplier-rights and customer-document boundaries.'],
          ['/status', 'Status', 'Current availability without launch theater.'],
        ].map(([to, label, detail]) => <Link key={to} to={to}><span>{label}</span><p>{detail}</p></Link>)}
      </section>
    </section>
  );
}
