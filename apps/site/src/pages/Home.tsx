import { useEffect, useRef, useState } from 'react';

import { B12HeroApex } from '../components/B12HeroApex';
import { B12HomepageBelowHero } from '../components/B12HomepageBelowHero';
import type { ExperiencePhase } from '../product';
import { Link } from '../router';

type DemoState = 'rest' | 'request' | 'qualify' | 'execute' | 'verify' | 'prove' | 'refused' | 'unresolved';
type Truth = readonly [main: string, small: string];

const labels: Record<DemoState, string> = {
  rest: 'Ready for an agent task.',
  request: 'Task received.',
  qualify: 'Qualifying capability, availability, policy, and cost.',
  execute: 'Executing the selected route.',
  verify: 'Verifying result and evidence.',
  prove: 'Verified result. Evidence and receipt resolved.',
  refused: 'Task refused. No execution and no charge.',
  unresolved: 'Unresolved state. Retry blocked pending reconciliation.',
};

const truths: Record<DemoState, readonly Truth[]> = {
  rest: [
    ['For AI agents', 'Task-native interface'],
    ['Across six capabilities', 'One operating layer'],
    ['With bounded cost and proof', 'Evidence + receipt'],
  ],
  request: [
    ['Task accepted', 'Bounded request'],
    ['Six routes evaluated', 'No route chosen yet'],
    ['No payment initiated', 'Approval remains external'],
  ],
  qualify: [
    ['Route qualified', 'Search + RPC + intelligence'],
    ['Maximum ≤ $0.02 USDC', 'Demo fixture'],
    ['Approval required', 'Before any paid execution'],
  ],
  execute: [
    ['Route executing', 'Selected capabilities'],
    ['Maximum ≤ $0.02 USDC', 'Demo fixture'],
    ['Evidence collecting', 'Sources + chain checks'],
  ],
  verify: [
    ['Result returned', 'Now verifying'],
    ['12 sources checked', '3 chain checks'],
    ['Receipt preparing', 'Replay state binding'],
  ],
  prove: [
    ['Verified outcome', 'Search + RPC + intelligence'],
    ['Maximum ≤ $0.02 USDC', 'Demo fixture'],
    ['Evidence + receipt', 'No additional replay charge'],
  ],
  refused: [
    ['Request refused', 'Policy or availability boundary'],
    ['No execution', 'No provider call'],
    ['No charge', 'No gold outcome'],
  ],
  unresolved: [
    ['Outcome unresolved', 'Execution or settlement uncertain'],
    ['Retry blocked', 'Reconciliation required'],
    ['No gold outcome', 'Proof not complete'],
  ],
};

const allowedStates = new Set<DemoState>([
  'rest',
  'request',
  'qualify',
  'execute',
  'verify',
  'prove',
  'refused',
  'unresolved',
]);

export function Home({ onPhase: _onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [state, setState] = useState<DemoState>('rest');
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('state');
    if (requested !== null && allowedStates.has(requested as DemoState)) {
      setState(requested as DemoState);
      if (requested !== 'rest') setHasRun(true);
    }
    return clearTimers;
  }, []);

  const runSuccess = () => {
    clearTimers();
    setRunning(true);
    setHasRun(true);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState('prove');
      setRunning(false);
      return;
    }

    const sequence: readonly [DemoState, number][] = [
      ['request', 0],
      ['qualify', 620],
      ['execute', 1430],
      ['verify', 2310],
      ['prove', 3070],
    ];

    sequence.forEach(([next, delay]) => {
      timers.current.push(window.setTimeout(() => setState(next), delay));
    });
    timers.current.push(window.setTimeout(() => setRunning(false), 3700));
  };

  return (
    <div className="b12-home" data-running={running} data-state={state}>
      <a className="b12-skip" href="#b12-title">Skip to main content</a>
      <section className="b12-hero shell" aria-labelledby="b12-title">
        <section className="b12-copy" aria-labelledby="b12-title">
          <p className="b12-eyebrow">Agent outcome infrastructure</p>
          <h1 id="b12-title">Give your agent a task.<br />Get a verified result.</h1>
          <div className="b12-actions">
            <Link className="b12-button b12-button-primary b12-liquid" data-liquid="primary" to="/start">
              Set up Clervo
            </Link>
            <button
              className="b12-button b12-button-secondary b12-run b12-liquid"
              data-liquid="secondary"
              disabled={running}
              onClick={runSuccess}
              type="button"
            >
              {hasRun ? 'Run again' : 'Run a task'}
            </button>
          </div>
        </section>

        <section aria-label="Clervo Apex Core" className="b12-stage">
          <B12HeroApex />
          <p aria-live="polite" className="b12-stage-state">{labels[state]}</p>
        </section>

        <aside aria-label="Clervo outcome contract" className="b12-truths">
          {truths[state].map(([main, small]) => (
            <p className="b12-truth" key={main}>
              {main}
              <small>{small}</small>
            </p>
          ))}
        </aside>

        <section aria-label="Demonstration task" className="b12-task-contract">
          <span className="b12-task-label">Demo task · no payment</span>
          <p className="b12-task-text">
            Research an on-chain protocol, verify its current claims, and return cited evidence. Fixture values are clearly labeled and do not represent a live customer transaction.
          </p>
        </section>
      </section>

      <div className="b12-rail shell" aria-label="Capability families">
        <span>Search</span><i>·</i><span>AI</span><i>·</i><span>Secure Sandbox</span><i>·</i>
        <span>Multi-chain RPC</span><i>·</i><span>Prediction</span><i>·</i><span>Crypto Intelligence</span>
      </div>

      <B12HomepageBelowHero />
    </div>
  );
}
