import { useEffect, useState } from 'react';

import { ModeBadge } from '../components/Navigation';
import type { ActivationState } from '../experience';
import { onboarding, type ExperiencePhase } from '../product';
import { Link } from '../router';

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
      evidence: crypto?.subtle !== undefined ? 'window.crypto.subtle available' : 'Web Crypto unavailable',
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
  const completed = {
    install: activation.selectedClient !== null,
    ask: activation.proofCompleted,
    fund: false,
    approve: activation.proofCompleted,
    result: activation.proofCompleted,
    receipt: activation.receiptInspected,
  } as const;
  const current = activation.selectedClient === null
    ? 'install'
    : !activation.proofCompleted ? 'ask'
      : !activation.receiptInspected ? 'receipt'
        : null;
  const journeyLink = (step: keyof typeof completed) => {
    if (step === 'install') return { to: '/docs/http', label: activation.selectedClient ? 'Review client choices' : 'Choose an access path' };
    if (step === 'fund') return { to: '/status', label: 'Read the payment boundary' };
    return { to: '/proof-lab', label: activation.proofCompleted ? 'Review fixture evidence' : 'Start Proof Lab' };
  };
  return (
    <section className="build-page">
      <header className="page-intro">
        <ModeBadge>Local activation path · public endpoint not deployed</ModeBadge>
        <p className="eyebrow">Build / evidence-backed setup</p>
        <h1>Prove the path.<br />Then connect it.</h1>
        <p>
          Start with the deterministic lifecycle, inspect its receipt, choose a
          tested client, then supply an explicit endpoint after deployment is
          verified. No package or endpoint is presented here as publicly live.
        </p>
      </header>

      <ol className="activation-journey">
        {onboarding.journey.map((item, index) => {
          const link = journeyLink(item.step);
          const isComplete = completed[item.step];
          return (
            <li
              key={item.step}
              className={isComplete ? 'is-complete' : current === item.step ? 'is-current' : item.state === 'unavailable' ? 'is-blocked' : ''}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2>{item.step}</h2>
                <p>{item.action}</p>
                <Link to={link.to}>{link.label}</Link>
              </div>
              <b>{isComplete ? 'proven locally' : item.state.replaceAll('_', ' ')}</b>
            </li>
          );
        })}
      </ol>

      <section className="recovery-contract">
        <header>
          <div>
            <p className="eyebrow">One failure / one next action</p>
            <h2>Recovery never guesses.</h2>
          </div>
          <p>
            These actions are prepared for the future payable path. They do not
            imply that funding, signing, or settlement is available today.
          </p>
        </header>
        <div>
          {onboarding.recovery.map((item, index) => (
            <article key={item.code}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.code.replaceAll('_', ' ')}</h3>
              <p>{item.action}</p>
              <b>{item.retry.replaceAll('_', ' ')}</b>
            </article>
          ))}
        </div>
      </section>

      <section className="browser-preflight">
        <div>
          <p className="eyebrow">This browser only</p>
          <h2>Inspect fixture prerequisites.</h2>
          <p>This does not inspect Node, Python, MCP, a wallet, or a public Clervo service.</p>
          <button className="button button--quiet" type="button" onClick={() => setChecks(inspectBrowser())}>
            Run browser preflight
          </button>
        </div>
        <div aria-live="polite">
          {checks === null ? <p>No checks run.</p> : checks.map((check) => (
            <article key={check.label} className={check.passed ? 'is-pass' : 'is-fail'}>
              <span aria-hidden="true" />
              <div><b>{check.label}</b><small>{check.evidence}</small></div>
              <strong>{check.passed ? 'PASS' : 'FAIL'}</strong>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
