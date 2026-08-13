import { useEffect } from 'react';

import type { ExperiencePhase } from '../product';
import { Link } from '../router';

/*
 * /trust — the index of the claim-boundary pages.
 *
 * It exists so that the six kinds of readiness Clervo tracks are visible as six
 * separate things. Collapsing them is how one kind of readiness starts to
 * impersonate another: a published package standing in for a live API, a
 * settled proof standing in for revenue.
 */

const map: Array<{ to: string; label: string; detail: string }> = [
  { to: '/status', label: 'Status', detail: 'What the deployed system was observed doing, probed rather than asserted.' },
  { to: '/proof', label: 'Proof', detail: 'The recorded settlement and replay evidence, and what it does not establish.' },
  { to: '/pricing', label: 'Pricing', detail: 'Observed maximum charges, kept separate from the recorded proof amount.' },
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
        <h1>Inspect the mechanism.</h1>
        <p className="lede">
          Clervo keeps runtime status, payment verification, pricing,
          security controls, legal boundaries and observed capability state as
          separate facts, so one kind of evidence cannot impersonate another.
        </p>
      </section>

      <section className="band band--ruled trust-body" aria-labelledby="trust-map-heading">
        <h2 id="trust-map-heading" className="sr-only">Claim boundary pages</h2>
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
