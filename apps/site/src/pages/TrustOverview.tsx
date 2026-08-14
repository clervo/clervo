import { useEffect } from 'react';

import type { ExperiencePhase } from '../product';
import { Link } from '../router';

const map: Array<{ to: string; label: string; detail: string }> = [
  { to: '/status', label: 'Status', detail: 'Current API, family, route, and package availability.' },
  { to: '/proof', label: 'Payments and replay', detail: 'How request identity, challenges, receipts, replay, and reconciliation work.' },
  { to: '/pricing', label: 'Pricing', detail: 'Published fixed maximums and request-derived quotes.' },
  { to: '/security', label: 'Security', detail: 'The controls that fail closed, including unknown-settlement quarantine.' },
  { to: '/benchmarks', label: 'Benchmarks', detail: 'What has and has not been comparatively established.' },
  { to: '/legal', label: 'Legal', detail: 'Usage, payment, privacy and acceptable-operation boundaries.' },
];

export function TrustOverview({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Trust</p>
        <h1>Understand the operating boundaries.</h1>
        <p className="lede">
          Find current availability, payment behavior, prices, security and
          privacy controls, and usage terms in one place.
        </p>
      </section>

      <section className="band band--ruled trust-body" aria-labelledby="trust-map-heading">
        <h2 id="trust-map-heading" className="sr-only">Trust and support pages</h2>
        <ul className="trust-map">
          {map.map(({ to, label, detail }) => (
            <li key={to}>
              <Link className="panel panel--interactive" to={to}>
                <div className="panel__body stack stack--tight">
                  <h3>{label}</h3>
                  <p className="quiet">{detail}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
