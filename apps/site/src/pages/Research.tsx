import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { launchState, type ExperiencePhase } from '../product';
import { Link } from '../router';

const journey = [
  ['Install', 'Use a verified public SDK, MCP server, or the raw HTTP contract.'],
  ['Ask', 'Bind one current question to one operation and idempotency key.'],
  ['Fund', 'Use the quoted network and asset only when a public payable route exists.'],
  ['Approve', 'See the exact maximum before any authorization leaves the wallet.'],
  ['Result', 'Receive the bounded result with its supporting evidence.'],
  ['Receipt', 'Keep an inspectable record that replays without another charge.'],
] as const;

export function Research({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  const proof = launchState.paymentProof;
  return (
    <section className="research-page">
      <header className="page-intro page-intro--outcome">
        <ModeBadge>First release target · recorded private proof</ModeBadge>
        <p className="eyebrow">Research / a complete agent job</p>
        <h1>Ask now.<br />Know what came back.</h1>
        <p>
          The Research outcome is designed to return current evidence or a
          cited answer inside one explicit cost boundary. The public customer
          route is not open yet; the private production path has completed one
          bounded, reconciled payment proof.
        </p>
      </header>

      <div className="journey-grid">
        {journey.map(([name, detail], index) => (
          <article key={name} className={name === 'Fund' ? 'is-gated' : ''}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h2>{name}</h2>
            <p>{detail}</p>
            <small>{name === 'Fund' ? 'public path unavailable' : 'contract prepared'}</small>
          </article>
        ))}
      </div>

      <section className="proof-window">
        <header>
          <p className="eyebrow">What exists today</p>
          <h2>One useful result. One settlement. One safe replay.</h2>
        </header>
        <dl>
          <div><dt>Operation</dt><dd>{proof.productId}</dd></div>
          <div><dt>Network</dt><dd>{proof.network}</dd></div>
          <div><dt>Bounded charge</dt><dd>{proof.amountDisplay}</dd></div>
          <div><dt>Result</dt><dd>{proof.usefulResult ? 'useful' : 'not proven'}</dd></div>
          <div><dt>Replay</dt><dd>{proof.replaySameReceipt ? 'same receipt' : 'not proven'}</dd></div>
          <div><dt>Additional charge</dt><dd>{proof.secondCharge ? 'observed' : 'none'}</dd></div>
        </dl>
        <p>
          This was funded by the owner to verify payment plumbing. It is not a
          customer transaction, revenue, demand, or public availability.
        </p>
        <div>
          <Link className="button button--primary" to="/proof">Inspect proof</Link>
          <Link className="button button--quiet" to="/proof-lab">Run the no-payment fixture</Link>
        </div>
      </section>
    </section>
  );
}
