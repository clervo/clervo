import { useEffect, useState } from 'react';

import type { ActivationState } from '../experience';
import {
  observedApiOrigin,
  observedProduct,
  onboarding,
  publicApiCallable,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';

/*
 * /build — what this browser has actually done.
 *
 * /start describes the contract. This page describes the reader's own progress
 * through it, which is the one thing on the site that is not generated from the
 * probe: it is local state, held in this browser and sent nowhere.
 *
 * The distinction has to stay visible, because a mark here means "you did
 * this", never "the system supports this". The two are rendered as separate
 * columns for exactly that reason, a step the deployed system does not offer
 * cannot be marked done by local activity, and none of it uses the state pills
 * or the gold token, which belong to observed and verified facts alone.
 */

interface BrowserCheck {
  label: string;
  passed: boolean;
  evidence: string;
}

function inspectBrowser(): BrowserCheck[] {
  return [
    {
      label: 'Deterministic hashing',
      passed: crypto?.subtle !== undefined,
      evidence: crypto?.subtle === undefined ? 'Web Crypto unavailable' : 'window.crypto.subtle available',
    },
    {
      label: 'Bounded cancellation',
      passed: typeof AbortController === 'function',
      evidence: typeof AbortController === 'function' ? 'AbortController available' : 'AbortController unavailable',
    },
    {
      label: 'Contract transport',
      passed: typeof fetch === 'function',
      evidence: typeof fetch === 'function' ? 'Fetch API available' : 'Fetch API unavailable',
    },
  ];
}

const stepTitles: Record<string, string> = {
  install: 'Install a client',
  ask: 'Send one bounded request',
  fund: 'Hold the quoted amount',
  approve: 'Approve a visible maximum',
  result: 'Read the result',
  receipt: 'Inspect and replay the receipt',
};

const search = observedProduct('search');

export function Build({
  activation,
  onPhase,
}: {
  activation: ActivationState;
  onPhase(phase: ExperiencePhase): void;
}) {
  const [checks, setChecks] = useState<BrowserCheck[] | null>(null);
  useEffect(() => onPhase(activation.receiptInspected ? 'receipt' : 'approval'), [
    activation.receiptInspected,
    onPhase,
  ]);

  // Local evidence only. Funding and approval happen in a wallet this page
  // cannot see, so they are never marked done from browser state.
  const done: Record<string, boolean> = {
    install: activation.selectedClient !== null,
    ask: activation.proofCompleted,
    fund: false,
    approve: false,
    result: activation.proofCompleted,
    receipt: activation.receiptInspected,
  };

  const nextStep = onboarding.journey.find(({ step }) => !done[step])?.step ?? null;
  const doneCount = onboarding.journey.filter(({ step }) => done[step]).length;

  const stepLink = (step: string): { to: string; label: string } => {
    if (step === 'install') return { to: '/docs', label: 'Open the quickstart' };
    if (step === 'fund' || step === 'approve') return { to: '/pricing', label: 'Read the payment boundary' };
    return { to: '/proof-lab', label: 'Open Proof Lab' };
  };

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Build / your progress in this browser</p>
        <h1>What you have done.<br />What the system offers.</h1>
        <p className="lede">
          {doneCount === 0
            ? 'Nothing is recorded yet. Copying a client snippet or completing a Proof Lab run marks a step below. That record is held in this browser and is never sent anywhere.'
            : `${doneCount} of ${onboarding.journey.length} steps are recorded in this browser. The record is local, is never sent anywhere, and clearing site data removes it.`}
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--primary" to="/start">Set up Clervo</Link>
          <Link className="button button--quiet" to="/proof-lab">Run the no-payment fixture</Link>
        </div>
      </section>

      <section className="band band--ruled build-body" aria-labelledby="build-progress">
        <div className="section-head">
          <p className="eyebrow">Local progress</p>
          <h2 id="build-progress">Two columns, never merged.</h2>
          <p className="lede">
            The left column is what this browser has recorded you doing. The
            right is what the deployed system offers for that step. A step can be
            offered and not done, or done against a local fixture while the
            public path is unavailable.
          </p>
        </div>
        <ol className="build-steps">
          {onboarding.journey.map(({ step, state, action }, index) => {
            const isDone = done[step] === true;
            const link = stepLink(step);
            return (
              <li key={step} className={step === nextStep ? 'is-next' : undefined}>
                <span className="data build-steps__index">{String(index + 1).padStart(2, '0')}</span>
                <div className="stack stack--tight">
                  <h3>{stepTitles[step] ?? step}</h3>
                  <p className="quiet">{action}</p>
                  <Link className="text-link" to={link.to}>{link.label}</Link>
                </div>
                {/* A local record is not proof of anything the system did, so
                  * it never renders as a state pill and never renders in gold.
                  * The word carries the meaning; the mark only repeats it. */}
                <div className="build-steps__marks">
                  <b className={isDone ? 'is-done' : undefined}>
                    {isDone ? 'done here' : 'not done here'}
                  </b>
                  <span className="quiet">{state.replaceAll('_', ' ')}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="band band--ruled build-body" aria-labelledby="build-preflight">
        <div className="section-head">
          <p className="eyebrow">This browser only</p>
          <h2 id="build-preflight">Check the fixture prerequisites.</h2>
          <p className="lede">
            This inspects the browser you are reading in. It does not inspect
            Node, Python, an MCP host, a wallet, or any Clervo service.
          </p>
        </div>
        <button className="button button--secondary" type="button" onClick={() => setChecks(inspectBrowser())}>
          Run browser preflight
        </button>
        <div aria-live="polite">
          {checks === null ? (
            <p className="quiet">No checks run.</p>
          ) : (
            <ul className="build-checks">
              {checks.map(({ label, passed, evidence }) => (
                <li key={label} className={passed ? 'is-pass' : 'is-fail'}>
                  {/* A browser feature check is a local observation, not a
                    * verified outcome, so it stays off the gold token too. */}
                  <b>{passed ? 'available' : 'missing'}</b>
                  <span>{label}</span>
                  <span className="quiet">{evidence}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="band build-body" aria-labelledby="build-endpoint">
        <div className="section-head">
          <p className="eyebrow">Where a client points</p>
          <h2 id="build-endpoint">Package availability is not endpoint availability.</h2>
        </div>
        <dl className="facts">
          <div>
            <dt>Observed API origin</dt>
            <dd>{publicApiCallable ? observedApiOrigin : 'none observed'}</dd>
          </div>
          <div>
            <dt>Free entry route</dt>
            <dd>{search.freeEntry === null ? 'not served right now' : search.freeEntry.route}</dd>
          </div>
          <div>
            <dt>Public payment quoted</dt>
            <dd>{search.observedPrice === null ? 'no' : 'yes'}</dd>
          </div>
          <div>
            <dt>Local record</dt>
            <dd>{doneCount} of {onboarding.journey.length} steps, this browser only</dd>
          </div>
        </dl>
        <p className="quiet build-note">
          Every published client takes its base URL explicitly, so the endpoint a
          snippet calls is never implicit and never inherited from a default that
          may have moved.
        </p>
      </section>
    </>
  );
}
