import { useEffect, useState } from 'react';

import { ModeBadge } from '../components/Navigation';
import type { ActivationState } from '../experience';
import { type ExperiencePhase } from '../product';
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
        <li className={activation.proofCompleted ? 'is-complete' : 'is-current'}>
          <span>01</span>
          <div>
            <h2>Run a bounded request</h2>
            <p>Complete the local Proof Lab fixture with zero provider and wallet calls.</p>
            <Link to="/proof-lab">{activation.proofCompleted ? 'Review completed fixture' : 'Start Proof Lab'}</Link>
          </div>
          <b>{activation.proofCompleted ? 'proven locally' : 'next action'}</b>
        </li>
        <li className={activation.receiptInspected ? 'is-complete' : activation.proofCompleted ? 'is-current' : ''}>
          <span>02</span>
          <div>
            <h2>Inspect the receipt</h2>
            <p>Confirm request identity, non-payable price, evidence links, and replay boundary.</p>
            <Link to="/proof-lab">Open fixture state</Link>
          </div>
          <b>{activation.receiptInspected ? 'proven locally' : 'pending evidence'}</b>
        </li>
        <li className={activation.selectedClient ? 'is-complete' : activation.receiptInspected ? 'is-current' : ''}>
          <span>03</span>
          <div>
            <h2>Choose a client candidate</h2>
            <p>TypeScript, Python, and MCP share the same frozen transcript and explicit endpoint rule.</p>
            <Link to="/docs">{activation.selectedClient ? `Review ${activation.selectedClient}` : 'Choose a client'}</Link>
          </div>
          <b>{activation.selectedClient ? 'snippet copied' : 'pending evidence'}</b>
        </li>
        <li>
          <span>04</span>
          <div>
            <h2>Connect after deployment proof</h2>
            <p>Public API deployment and real payment remain later gates. No connection action is enabled now.</p>
            <Link to="/status">Read current status</Link>
          </div>
          <b>externally blocked</b>
        </li>
      </ol>

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
