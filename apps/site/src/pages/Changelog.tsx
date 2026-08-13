import { useEffect } from 'react';

import { observedTruth, publicApiCallable, publicStatus, type ExperiencePhase } from '../product';
import { Link } from '../router';

/*
 * /changelog — dated, evidence-backed entries.
 *
 * Each entry is anchored to a timestamp that comes from generated data, so an
 * entry cannot claim to have happened on a day the evidence does not support.
 * Entries are not status: what is true right now lives on /status, and this
 * page links there rather than restating it.
 */

const entries: Array<{ at: string; eyebrow: string; title: string; body: string; boundary: string }> = [
  {
    at: observedTruth.provenance.observedAt,
    eyebrow: 'Observation',
    title: 'The public catalog is generated from a probe',
    body: `Lifecycle state, proof level and every quoted ceiling on this site are read from ${observedTruth.provenance.source}, produced by ${observedTruth.provenance.generatedBy} against release ${observedTruth.provenance.releaseId.slice(0, 7)}.`,
    boundary: publicApiCallable
      ? 'A route that stops serving leaves the catalog on the next probe, not on an edit.'
      : 'No public route was observed serving at this observation.',
  },
  {
    at: publicStatus.observedAt,
    eyebrow: 'Payment verification',
    title: 'Bounded settlement and no-charge replay verified',
    body: `${publicStatus.paymentProof.productId} settled for ${publicStatus.paymentProof.amountDisplay}, returned a useful result, and replayed with no second authorization, execution, or charge.`,
    boundary: 'This record represents settlement, useful-result and replay verification for the named operation.',
  },
  {
    at: publicStatus.packages.verifiedAt,
    eyebrow: 'Developer distribution',
    title: 'Public packages verified',
    body: publicStatus.packages.items
      .map(({ name, version }) => `${name} ${version}`)
      .join(', ') + ' are published on their public registries.',
    boundary: 'Package publication and live API availability remain separate facts.',
  },
];

export function Changelog({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Changelog</p>
        <h1>What changed. What it actually means.</h1>
        <p className="lede">
          Each entry below carries the boundary of what it proves. For what is
          true right now rather than what changed, read the observed status.
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--secondary" to="/status">Open observed status</Link>
        </div>
      </section>

      <section className="band band--ruled changelog-body" aria-labelledby="changelog-heading">
        <h2 id="changelog-heading" className="sr-only">Dated entries</h2>
        <ol className="changelog-list">
          {entries.map((entry) => (
            <li key={entry.title} className="changelog-entry">
              <time className="data quiet" dateTime={entry.at}>{entry.at.slice(0, 10)}</time>
              <div className="stack stack--tight">
                <p className="eyebrow">{entry.eyebrow}</p>
                <h3>{entry.title}</h3>
                <p>{entry.body}</p>
                <p className="quiet">{entry.boundary}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
