import { useEffect } from 'react';

import {
  formatUsdc,
  observedTruth,
  onboarding,
  proofLabels,
  quickStartCurl,
  quickStartNeedsNoKey,
  lifecycleLabels,
  observedProduct,
  publishedClients,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';

/*
 * /start — the primary onboarding destination.
 *
 * The locked authority names this route as the single place every primary
 * call to action leads, and it did not exist: the deployed site answered 404.
 *
 * Every step below is rendered from the generated onboarding document and the
 * probed registry, so a step cannot describe an action the deployed system
 * does not support. Steps that depend on capability the system does not yet
 * offer are labelled as such rather than written as if they worked.
 */

const search = observedProduct('search');

const stepTitles: Record<string, string> = {
  install: 'Install a client',
  ask: 'Send one bounded request',
  fund: 'Hold the exact quoted amount',
  approve: 'Approve a visible maximum charge',
  result: 'Read the result and its citations',
  receipt: 'Inspect the receipt and replay it',
};

// The first two steps need nothing but a terminal. The rest need a funded
// wallet, and saying so up front is what keeps the free path free.
const freeSteps = new Set(['install', 'ask']);

export function Start({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('qualified'), [onPhase]);

  const paidAvailable = onboarding.paymentImplemented && search.observedPrice !== null;

  return (
    <>
      <section className="start-intro">
        <p className="eyebrow">Set up Clervo</p>
        <h1>Give your agent a task.<br />Get a verified result.</h1>
        <p>
          {search.freeEntry === null
            ? 'The free entry route is not being served right now, so this page does not publish a command that would fail. The steps below still describe the exact contract.'
            : 'The first call needs no account, no API key and no wallet. Two steps get a cited result back; the remaining steps add payment, and are only needed for paid operations.'}
        </p>
        <div className="cluster start-intro__actions">
          <Link className="button button--primary" to="/docs/quickstart">Open the quickstart</Link>
          <Link className="button button--quiet" to="/catalog">Browse the live catalog</Link>
        </div>
      </section>

      {quickStartCurl === null ? null : (
        <section className="band start-first" aria-labelledby="start-first-call">
          <div className="section-head">
            <p className="eyebrow">Step 0 / one command</p>
            <h2 id="start-first-call">Run this now.</h2>
            <p className="lede">
              {quickStartNeedsNoKey
                ? 'No account, no key, no wallet. The free route generates an idempotency key for you and returns it in the response header, so the same call can be replayed deliberately.'
                : 'No account, no key, no wallet. The free route currently requires an idempotency-key header, so the command below carries one; reuse the same value to replay without a second execution.'}
            </p>
          </div>
          <div className="code">
            <div className="code__head">
              <span>Free Search call</span>
              <span className="state state--live">live</span>
            </div>
            {/*
              * A horizontally scrollable region must be reachable by keyboard,
              * or a keyboard-only reader cannot see the end of a long command.
              * `tabIndex={0}` plus a group role and a label makes it a real
              * stop in the tab order rather than an announced-but-inert box.
              */}
            <pre tabIndex={0} role="group" aria-label="Free Search call, scrollable"><code>{quickStartCurl}</code></pre>
          </div>
        </section>
      )}

      <section className="band band--ruled start-journey" aria-labelledby="start-journey-heading">
        <div className="section-head">
          <p className="eyebrow">The whole path / six steps</p>
          <h2 id="start-journey-heading">What a paid outcome actually involves.</h2>
          <p className="lede">
            Each step below is generated from the deployed onboarding contract.
            Nothing here describes a capability the system was not observed
            offering.
          </p>
        </div>
        <ol className="start-steps">
          {onboarding.journey.map((step, index) => (
            <li key={step.step} className="panel start-step">
              <div className="panel__body stack">
                <p className="eyebrow">
                  {String(index + 1).padStart(2, '0')} / {freeSteps.has(step.step) ? 'free' : 'paid path'}
                </p>
                <h3>{stepTitles[step.step] ?? step.step}</h3>
                <p>{step.action}</p>
                <p className="data quiet">observed state: {step.state}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="band band--ruled start-clients" aria-labelledby="start-clients-heading">
        <div className="section-head">
          <p className="eyebrow">Clients / registry verified</p>
          <h2 id="start-clients-heading">Install whichever one you already use.</h2>
        </div>
        <ul className="start-client-grid">
          {publishedClients.map((client) => (
            <li key={client.id} className="panel panel--raised">
              <div className="panel__body stack stack--tight">
                <h3>{client.label}</h3>
                <p className="data">{client.name}@{client.version}</p>
                <a className="text-link" href={client.url} rel="noreferrer">
                  View on the registry
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="band band--ruled start-price" aria-labelledby="start-price-heading">
        <div className="section-head">
          <p className="eyebrow">Before you approve anything</p>
          <h2 id="start-price-heading">The charge is a ceiling, and it is visible first.</h2>
        </div>
        <dl className="facts">
          <div>
            <dt>Observed Search price</dt>
            <dd>
              {search.observedPrice === null
                ? 'not quoted right now'
                : `${formatUsdc(search.observedPrice.amountAtomic, 6)} maximum`}
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{search.observedPrice?.network ?? 'not quoted right now'}</dd>
          </div>
          <div>
            <dt>Lifecycle state</dt>
            <dd>{lifecycleLabels[search.lifecycleState]}</dd>
          </div>
          <div>
            <dt>Proof level</dt>
            <dd>{proofLabels[search.proofLevel]}</dd>
          </div>
          <div>
            <dt>Paid customer path</dt>
            <dd>{paidAvailable ? 'implemented' : 'not available yet'}</dd>
          </div>
        </dl>
        <p className="quiet start-price__note">
          Observed {observedTruth.provenance.observedAt} from{' '}
          {observedTruth.provenance.source}. Prices on this page are read from
          that observation, never written into the page.
        </p>
      </section>

      <section className="band band--ruled start-recovery" aria-labelledby="start-recovery-heading">
        <div className="section-head">
          <p className="eyebrow">When something goes wrong</p>
          <h2 id="start-recovery-heading">Every failure has a defined next action.</h2>
          <p className="lede">
            Unknown settlement state never retries. It reconciles first, which
            is the one rule that makes a retry safe to publish at all.
          </p>
        </div>
        <dl className="facts">
          {onboarding.recovery.map((item) => (
            <div key={item.code}>
              <dt>{item.code.replaceAll('_', ' ')}</dt>
              <dd>
                {item.action}
                {item.retry === 'prohibited_until_reconciled'
                  ? ' — retry prohibited until reconciled'
                  : ''}
              </dd>
            </div>
          ))}
        </dl>
        <div className="cluster start-recovery__actions">
          <Link className="button button--secondary" to="/docs/failures">Read the failure guide</Link>
          <Link className="button button--quiet" to="/status">Check current status</Link>
        </div>
      </section>
    </>
  );
}
