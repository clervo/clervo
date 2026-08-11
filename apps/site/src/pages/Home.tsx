import { useEffect, useRef, useState } from 'react';

import { B12HeroApex } from '../components/B12HeroApex';
import {
  lifecycleLabels,
  observedTruth,
  pillarLabels,
  publishedClients,
  quickStartCurl,
  type ExperiencePhase,
  type ObservedProduct,
} from '../product';
import { Link } from '../router';

type JourneyState = 'request' | 'qualify' | 'execute' | 'verify' | 'prove';

interface JourneyStep {
  id: JourneyState;
  label: string;
  title: string;
  detail: string;
}

const journeySteps: JourneyStep[] = [
  {
    id: 'request',
    label: 'Request',
    title: 'Bind the task.',
    detail: 'Identity, intent, limits, and failure policy enter together.',
  },
  {
    id: 'qualify',
    label: 'Qualify',
    title: 'Find a route allowed to run.',
    detail: 'Clervo checks capability, availability, policy, and price boundaries.',
  },
  {
    id: 'execute',
    label: 'Execute',
    title: 'Run one bounded operation.',
    detail: 'The selected route keeps the request contract attached.',
  },
  {
    id: 'verify',
    label: 'Verify',
    title: 'Inspect result and evidence.',
    detail: 'The outcome is checked before it is represented as proved.',
  },
  {
    id: 'prove',
    label: 'Prove',
    title: 'Return an inspectable outcome.',
    detail: 'Result, evidence, provenance, and receipt resolve as one contract.',
  },
];

const familyRoutes: Record<ObservedProduct['id'], string> = {
  search: '/products/search',
  ai: '/products/ai',
  sandbox: '/products/sandbox',
  rpc: '/products/rpc',
  prediction: '/products/prediction',
  crypto_intelligence: '/products/crypto',
};

const familyDescriptions: Record<ObservedProduct['id'], string> = {
  search: 'Fresh source retrieval with citations and evidence.',
  ai: 'A qualified model catalog behind one request contract.',
  sandbox: 'Bounded code execution with isolated failure.',
  rpc: 'Chain access held unavailable until commercial rights are cleared.',
  prediction: 'Comparable market context with freshness and attribution.',
  crypto_intelligence: 'Wallet and on-chain signals with evidence attached.',
};

const phaseByState: Record<JourneyState, ExperiencePhase> = {
  request: 'risk',
  qualify: 'qualified',
  execute: 'qualified',
  verify: 'verified',
  prove: 'receipt',
};

const allowedStates = new Set<JourneyState>(journeySteps.map(({ id }) => id));
const familyOrder: ObservedProduct['id'][] = [
  'search', 'ai', 'sandbox', 'prediction', 'crypto_intelligence', 'rpc',
];

const observedAtLabel = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
}).format(new Date(observedTruth.provenance.observedAt));

export function Home({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [state, setState] = useState<JourneyState>('request');
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const timers = useRef<number[]>([]);
  const activeStep = journeySteps.find(({ id }) => id === state) ?? journeySteps[0]!;
  const liveFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live').length;

  const clearTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  const selectState = (next: JourneyState) => {
    setState(next);
    onPhase(phaseByState[next]);
  };

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('state');
    if (requested !== null && allowedStates.has(requested as JourneyState)) {
      selectState(requested as JourneyState);
    } else {
      onPhase('risk');
    }
    return clearTimers;
  }, []);

  const runTrace = () => {
    clearTimers();
    setRunning(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      selectState('prove');
      setRunning(false);
      return;
    }
    journeySteps.forEach(({ id }, index) => {
      timers.current.push(window.setTimeout(() => selectState(id), index * 620));
    });
    timers.current.push(window.setTimeout(() => setRunning(false), journeySteps.length * 620));
  };

  const copyFreeCall = async () => {
    if (quickStartCurl === null) return;
    await navigator.clipboard.writeText(quickStartCurl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="recovery-home" data-running={running} data-state={state}>
      <a className="skip-link" href="#home-title">Skip to main content</a>

      <section className="home-hero shell" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <p className="eyebrow">Outcome infrastructure for agents</p>
          <h1 id="home-title">Give your agent a task.<br />Get a verified result.</h1>
          <p className="home-hero__lede">
            Clervo turns a bounded job into one inspectable outcome—across models,
            data, and runtime—without hiding route, cost, evidence, or recovery.
          </p>
          <div className="home-actions">
            <Link className="button button--primary" to="/start">Set up Clervo</Link>
            <Link className="button button--secondary" to="/product">Explore the product</Link>
          </div>
          <p className="home-free-note">
            <span aria-hidden="true" /> A real free-first Search path is available before wallet setup.
          </p>
        </div>

        <div className="home-hero__mechanism">
          <div className="home-apex-stage" aria-label="Clervo task lifecycle">
            <B12HeroApex />
            <div className="home-stage-readout" aria-live="polite">
              <span>{activeStep.label}</span>
              <strong>{activeStep.title}</strong>
            </div>
          </div>
          <div className="home-trace-control">
            <p className="data">Product model · no request is sent</p>
            <button className="button button--quiet" disabled={running} onClick={runTrace} type="button">
              {running ? 'Tracing task…' : state === 'prove' ? 'Trace again' : 'Trace the contract'}
            </button>
          </div>
        </div>

        <ol className="home-journey" aria-label="Clervo operating sequence">
          {journeySteps.map((step, index) => (
            <li data-active={step.id === state} data-complete={index < journeySteps.indexOf(activeStep)} key={step.id}>
              <button type="button" onClick={() => selectState(step.id)} aria-current={step.id === state ? 'step' : undefined}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{step.label}</strong>
              </button>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-platform" aria-labelledby="home-platform-title">
        <div className="shell home-platform__intro">
          <p className="eyebrow">One operating layer</p>
          <h2 id="home-platform-title">The outcome stays coherent when the provider stack does not.</h2>
          <p className="lede">
            Ask for the job. Clervo discovers the capability, qualifies what can serve,
            holds the spend boundary, and returns the outcome in a common contract.
          </p>
        </div>
        <div className="shell home-capabilities">
          <p className="home-capabilities__status data">
            <span className="state state--live">{liveFamilies} serving</span>
            <time dateTime={observedTruth.provenance.observedAt}>{observedAtLabel} UTC</time>
          </p>
          <ul>
            {familyOrder.map((id, index) => {
              const product = observedTruth.products.find((candidate) => candidate.id === id);
              if (product === undefined) return null;
              return (
              <li key={product.id}>
                <Link to={familyRoutes[product.id]}>
                  <span className="home-capability__index data">{String(index + 1).padStart(2, '0')}</span>
                  <span className="home-capability__body">
                    <strong>{pillarLabels[product.id]}</strong>
                    <small>{familyDescriptions[product.id]}</small>
                  </span>
                  <span className={`state state--${product.lifecycleState}`}>
                    {lifecycleLabels[product.lifecycleState]}
                  </span>
                </Link>
              </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="home-connect shell" aria-labelledby="home-connect-title">
        <div className="home-connect__copy">
          <p className="eyebrow">Free first. Wallet when needed.</p>
          <h2 id="home-connect-title">Start with the client your agent already speaks.</h2>
          <p className="lede">
            Router / CLI, MCP, TypeScript, Python, raw HTTP, and OpenAI-compatible
            clients converge on the same Clervo operating contract.
          </p>
          <div className="home-client-list" aria-label="Released clients">
            <Link to="/docs/cli"><strong>Router / CLI</strong><span>Command line</span></Link>
            {publishedClients.map((client) => (
              <Link to={`/docs/${client.id}`} key={client.id}>
                <strong>{client.label}</strong><span>v{client.version}</span>
              </Link>
            ))}
            <Link to="/docs/openai"><strong>OpenAI-compatible</strong><span>Existing clients</span></Link>
          </div>
          <div className="home-actions">
            <Link className="button button--primary" to="/docs/quickstart">Get a free first result</Link>
            <Link className="text-link" to="/docs">Read the docs <span aria-hidden="true">→</span></Link>
          </div>
        </div>

        <div className="home-free-call" aria-label="Free first Search request">
          <header>
            <span className="data">curl · observed public route</span>
            <button type="button" onClick={copyFreeCall} disabled={quickStartCurl === null}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </header>
          <pre tabIndex={0}><code>{quickStartCurl ?? 'No public free entry is currently observed.'}</code></pre>
          <footer>
            <span>Free Search entry</span>
            <span>Wallet not required</span>
          </footer>
        </div>
      </section>

      <section className="home-proof" aria-labelledby="home-proof-title">
        <div className="shell home-proof__layout">
          <div className="home-proof__copy">
            <p className="eyebrow">Proof is part of the result</p>
            <h2 id="home-proof-title">A successful response should explain itself.</h2>
            <p className="lede">
              Clervo keeps operation identity, evidence, provenance, settlement,
              and replay attached to the result—so an agent can inspect what happened next.
            </p>
            <Link className="text-link" to="/proof">Understand Clervo proof <span aria-hidden="true">→</span></Link>
          </div>
          <div className="home-receipt" aria-label="Verified outcome contract anatomy">
            <p className="home-receipt__status"><span>Verified outcome</span><strong>Receipt resolved</strong></p>
            <dl>
              <div><dt>Operation</dt><dd>Exact work identity</dd></div>
              <div><dt>Result</dt><dd>Returned outcome</dd></div>
              <div><dt>Evidence</dt><dd>Sources and provenance</dd></div>
              <div><dt>Settlement</dt><dd>Charge state and boundary</dd></div>
              <div><dt>Replay</dt><dd>Same request, same receipt</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="home-final shell" aria-labelledby="home-final-title">
        <p className="eyebrow">One useful result is enough to begin.</p>
        <h2 id="home-final-title">Give Clervo the next bounded task.</h2>
        <div className="home-actions">
          <Link className="button button--primary" to="/start">Set up Clervo</Link>
          <Link className="button button--quiet" to="/catalog">Find an AI model</Link>
        </div>
      </section>
    </div>
  );
}
