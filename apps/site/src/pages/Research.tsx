import { useEffect } from 'react';

import {
  formatUsdc,
  lifecycleLabels,
  observedProduct,
  observedTruth,
  quickStartCurl,
  quickStartNeedsNoKey,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';

/*
 * /research — one complete outcome, end to end.
 *
 * The other pages describe the mechanism. This one describes a job: what you
 * ask for, what comes back, what it costs at most, and what it deliberately
 * does not do. It is the page a buyer reads to decide whether the thing is
 * worth calling at all.
 *
 * The six-step path lives on /start, which is where every primary call to
 * action leads. Repeating it here would make two pages that both look like the
 * onboarding page and neither of which is.
 */

const search = observedProduct('search');

// What the outcome contains, and what it does not. Raw evidence and a
// synthesized answer are different products with different availability, and
// the difference is the single most misread thing about this family.
const returns: Array<[string, string]> = [
  ['Ranked evidence', 'Normalized retrieval results in a stable shape, ordered by relevance rather than by whoever paid for placement.'],
  ['Source citations', 'Every result carries the source it came from, so the answer can be checked rather than trusted.'],
  ['No synthesized prose', 'The publicly available operation returns evidence, not an essay. Synthesis is a separate operation and is not publicly available.'],
  ['A bounded cost', 'The maximum charge is quoted before anything runs, and the settled amount is never higher.'],
];

export function Research({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Research / one complete agent job</p>
        <h1>Ask now.<br />Know what came back.</h1>
        <p className="lede">
          {search.freeEntry === null
            ? 'Research returns current evidence with its sources inside one explicit cost boundary. The free entry route is not being served right now, so this page publishes no command that would fail.'
            : 'Research returns current evidence with its sources inside one explicit cost boundary. The first call needs no account, no key and no wallet.'}
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--primary" to="/start">Set up Clervo</Link>
          <Link className="button button--quiet" to="/products/search">See the family state</Link>
        </div>
      </section>

      {quickStartCurl === null ? null : (
        <section className="band band--ruled research-body" aria-labelledby="research-call">
          <div className="section-head">
            <p className="eyebrow">The whole job / one command</p>
            <h2 id="research-call">This is the entire integration.</h2>
            <p className="lede">
              {quickStartNeedsNoKey
                ? 'No account, no key, no wallet. The free route generates an idempotency key and returns it in the response header, so the same call can be replayed deliberately.'
                : 'No account, no key, no wallet. The free route currently requires an idempotency-key header, so the command below carries one; reuse the same value to replay without a second execution.'}
            </p>
          </div>
          <div className="code">
            <div className="code__head">
              <span>Free Research call</span>
              <span className={`state state--${search.lifecycleState}`}>
                {lifecycleLabels[search.lifecycleState]}
              </span>
            </div>
            {/*
              * A horizontally scrollable region must be a real stop in the tab
              * order, or a keyboard-only reader cannot reach the end of a long
              * command.
              */}
            <pre tabIndex={0} role="group" aria-label="Free Research call, scrollable"><code>{quickStartCurl}</code></pre>
          </div>
        </section>
      )}

      <section className="band band--ruled research-body" aria-labelledby="research-returns">
        <div className="section-head">
          <p className="eyebrow">What comes back</p>
          <h2 id="research-returns">Evidence you can check, not prose you must trust.</h2>
        </div>
        <ul className="research-returns">
          {returns.map(([name, detail]) => (
            <li key={name} className="panel">
              <div className="panel__body stack stack--tight">
                <h3>{name}</h3>
                <p className="quiet">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="band band--ruled research-body" aria-labelledby="research-cost">
        <div className="section-head">
          <p className="eyebrow">What it costs</p>
          <h2 id="research-cost">A ceiling, quoted before anything runs.</h2>
        </div>
        <dl className="facts">
          <div>
            <dt>Observed maximum charge</dt>
            <dd>
              {search.observedPrice === null
                ? 'not quoted right now'
                : formatUsdc(search.observedPrice.amountAtomic, 6)}
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{search.observedPrice?.network ?? 'not quoted right now'}</dd>
          </div>
          <div>
            <dt>Free entry route</dt>
            <dd>{search.freeEntry === null ? 'not served right now' : search.freeEntry.route}</dd>
          </div>
          <div>
            <dt>Lifecycle state</dt>
            <dd>{lifecycleLabels[search.lifecycleState]}</dd>
          </div>
          <div><dt>Paid behavior</dt><dd>{search.observedPrice === null ? 'not offered' : '402 quote before execution'}</dd></div>
        </dl>
        <p className="quiet research-note">
          Observed {observedTruth.provenance.observedAt} from{' '}
          {observedTruth.provenance.source}. A price that changes on the deployed
          system changes here on the next probe, not on an edit.
        </p>
      </section>

      <section className="band research-body" aria-labelledby="research-payment">
        <div className="section-head">
          <p className="eyebrow">Payment behavior</p>
          <h2 id="research-payment">Inspect the quote before authorizing it.</h2>
          <p className="lede">
            The paid route returns HTTP 402 with the maximum charge, network,
            asset, recipient, resource, and expiry. Reuse the same idempotency
            key to recover or replay without creating a second logical charge.
          </p>
        </div>
        <dl className="facts">
          <div><dt>Paid route</dt><dd>/v1/search/paid</dd></div>
          <div><dt>Payment response</dt><dd>HTTP 402 before execution</dd></div>
          <div><dt>Binding amount</dt><dd>The request-specific 402 challenge</dd></div>
          <div><dt>Unknown settlement</dt><dd>Reconcile; do not authorize again</dd></div>
          <div><dt>Replay</dt><dd>Same key and body return the completed result</dd></div>
        </dl>
        <div className="cluster research-actions">
          <Link className="button button--secondary" to="/docs/x402">Read the x402 guide</Link>
          <Link className="button button--quiet" to="/docs/replay">Read replay semantics</Link>
        </div>
      </section>
    </>
  );
}
