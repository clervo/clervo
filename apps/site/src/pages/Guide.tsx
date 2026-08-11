import { useEffect } from 'react';

import {
  discovery,
  launchState,
  lifecycleLabels,
  observedTruth,
  onboarding,
  proofLabels,
  publicApiCallable,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';

export type GuideTopic = 'receipts' | 'replay' | 'failures' | 'x402' | 'catalog';

/*
 * The five contract guides: /docs/receipts, /docs/replay, /docs/failures,
 * /docs/x402, /docs/catalog.
 *
 * The recovery guide is the one that has to be exactly right. A buyer's most
 * expensive question after a failure is "was I charged", and the two answers
 * are not interchangeable:
 *
 *   refused    — declined before anything executed. No charge, no side effect,
 *                and retrying is safe once the request is corrected.
 *   unresolved — execution began and the settlement state is unknown. It never
 *                retries; it reconciles first.
 *
 * Those two states carry a shape as well as a colour, so the difference
 * survives a greyscale display, and the retry rule is rendered in words next to
 * the pill rather than implied by it.
 */

const guideCopy: Record<GuideTopic, { eyebrow: string; title: string; intro: string }> = {
  receipts: {
    eyebrow: 'Docs / inspectable receipts',
    title: 'The result keeps its boundary.',
    intro: 'A Clervo receipt binds operation identity, declared checks, cost state, evidence, timestamps, and replay behaviour, so a result can be re-examined later without trusting the page that displayed it. Public receipt issuance is not available yet.',
  },
  replay: {
    eyebrow: 'Docs / replay',
    title: 'Same request. No second effect.',
    intro: `The recorded ${launchState.paymentProof.productId} proof replayed to the same receipt with no second authorization, execution, or charge. That proves one bounded mechanism, not public availability.`,
  },
  failures: {
    eyebrow: 'Docs / recovery',
    title: 'One failure. One bounded action.',
    intro: 'Every recovery message names the next safe action and says whether retrying is allowed. It never hides settlement uncertainty and never silently creates a second authorization.',
  },
  x402: {
    eyebrow: 'Docs / x402 boundary',
    title: 'Inspect before authorization.',
    intro: 'Deployed routes issue typed x402 challenges carrying an exact maximum charge. Nothing here signs an authorization on your behalf: the browser, the SDK and the MCP server all stop at the challenge and hand it to you.',
  },
  catalog: {
    eyebrow: 'Docs / machine catalog',
    title: 'One registry drives every surface.',
    intro: 'Capabilities, claims, lifecycle, prices, packages and discovery are all generated from the probed release candidate. Private qualification and customer availability stay different fields.',
  },
};

const steps: Record<Exclude<GuideTopic, 'failures' | 'catalog'>, Array<[string, string]>> = {
  receipts: [
    ['Operation', 'Exact product and operation identity, so a result cannot be attributed to a route that did not produce it.'],
    ['Request', 'Stable idempotency and input binding, which is what makes a replay identifiable as the same request.'],
    ['Evidence', 'Declared checks and bounded source references.'],
    ['Cost', 'The quoted maximum alongside the settled charge, never one standing in for the other.'],
    ['Replay', 'The prior receipt returns without a duplicate effect.'],
  ],
  replay: [
    ['Identity', 'Reuse the original idempotency key only for the identical request.'],
    ['Conflict', 'A different request under the same key fails with 409 rather than executing.'],
    ['Settlement', 'Unknown state is reconciled before any retry, never after.'],
    ['Result', 'A completed replay returns the durable prior evidence.'],
  ],
  x402: [
    ['Challenge', 'Binds network, asset, recipient, operation, amount, expiry and typed-data domain.'],
    ['Approve', 'Shows the exact maximum charge and allows cancellation before anything is signed.'],
    ['Settle', 'Verifies the authorization and records one durable result.'],
    ['Reconcile', 'Quarantines unknown state rather than guessing or signing again.'],
  ],
};

const topics: GuideTopic[] = ['receipts', 'replay', 'failures', 'x402', 'catalog'];

export function Guide({ topic, onPhase }: { topic: GuideTopic; onPhase(phase: ExperiencePhase): void }) {
  const guide = guideCopy[topic];
  useEffect(() => onPhase(topic === 'receipts' || topic === 'replay' ? 'receipt' : 'qualified'), [onPhase, topic]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">{guide.eyebrow}</p>
        <h1>{guide.title}</h1>
        <p className="lede">{guide.intro}</p>
      </section>

      {topic === 'failures' ? (
        <section className="band band--ruled guide-body" aria-labelledby="recovery-heading">
          <div className="section-head">
            <p className="eyebrow">Recovery</p>
            <h2 id="recovery-heading">Whether a retry is safe is part of the error.</h2>
            <p className="lede">
              Refused means nothing executed and nothing was charged, so the
              request can be corrected and sent again. Unresolved means execution
              began and the settlement state is not known, so it is reconciled
              rather than retried.
            </p>
          </div>
          <ul className="recovery-list">
            {onboarding.recovery.map(({ code, action, retry }) => {
              const reconciles = retry === 'prohibited_until_reconciled';
              return (
                <li key={code} className="panel">
                  <div className="panel__body stack stack--tight">
                    <div className="recovery-list__head">
                      <h3>{code.replaceAll('_', ' ')}</h3>
                      <span className={reconciles ? 'state state--unresolved' : 'state state--refused'}>
                        {reconciles ? 'unresolved' : 'refused'}
                      </span>
                    </div>
                    <p>{action}</p>
                    <p className="quiet">
                      {reconciles
                        ? 'Retry is prohibited until the settlement state is reconciled.'
                        : 'Retry is safe once the action above is taken.'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {topic === 'catalog' ? (
        <section className="band band--ruled guide-body" aria-labelledby="catalog-heading">
          <div className="section-head">
            <p className="eyebrow">Generated surface</p>
            <h2 id="catalog-heading">Two fields per family, never merged.</h2>
            <p className="lede">
              Observed at {observedTruth.provenance.observedAt} from{' '}
              {observedTruth.provenance.source}. Lifecycle says whether a family
              serves requests now; proof says what has been demonstrated.
            </p>
          </div>
          <ul className="guide-catalog">
            {observedTruth.products.map(({ id, label, lifecycleState, proofLevel }) => (
              <li key={id}>
                <b>{label}</b>
                <span className={`state state--${lifecycleState}`}>{lifecycleLabels[lifecycleState]}</span>
                <span className="quiet">{proofLabels[proofLevel]}</span>
              </li>
            ))}
          </ul>
          <p className="cluster machine-links">
            <a className="text-link" href="/capabilities.json">Capabilities JSON</a>
            <a className="text-link" href="/.well-known/clervo.json">Clervo discovery</a>
            <a className="text-link" href="/models.json">Observed routes</a>
          </p>
        </section>
      ) : null}

      {topic === 'receipts' || topic === 'replay' || topic === 'x402' ? (
        <section className="band band--ruled guide-body" aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="sr-only">What the contract binds</h2>
          <ol className="guide-steps">
            {steps[topic].map(([name, detail], index) => (
              <li key={name}>
                <span className="data">{String(index + 1).padStart(2, '0')}</span>
                <div className="stack stack--tight">
                  <h3>{name}</h3>
                  <p className="quiet">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="band guide-body" aria-labelledby="guide-contract-heading">
        <div className="section-head">
          <p className="eyebrow">Frozen interface</p>
          <h2 id="guide-contract-heading">What these guides describe.</h2>
        </div>
        <dl className="facts">
          <div>
            <dt>Observed runtime revision</dt>
            <dd>{discovery.runtimeRelease.sourceCommit.slice(0, 12)}</dd>
          </div>
          <div>
            <dt>Callable operation IDs</dt>
            <dd>{discovery.runtimeRelease.operationIds.length}</dd>
          </div>
          <div>
            <dt>Public callable</dt>
            <dd>{publicApiCallable ? 'yes' : 'no'}</dd>
          </div>
        </dl>
        <nav className="cluster guide-links" aria-label="Contract guides">
          {topics.map((value) => (
            <Link
              key={value}
              className={value === topic ? 'is-active' : ''}
              aria-current={value === topic ? 'page' : undefined}
              to={`/docs/${value}`}
            >
              {value}
            </Link>
          ))}
        </nav>
      </section>
    </>
  );
}
