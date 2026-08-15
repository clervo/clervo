import { useEffect, useRef, useState } from 'react';

import type { ExperiencePhase } from '../product';

type HeroState = 'request' | 'qualify' | 'execute' | 'result';

const heroStates: HeroState[] = ['request', 'qualify', 'execute', 'result'];
const allowedStates = new Set<HeroState>(heroStates);

const phaseByState: Record<HeroState, ExperiencePhase> = {
  request: 'risk',
  qualify: 'qualified',
  execute: 'qualified',
  result: 'verified',
};

const stateReadout: Record<HeroState, string[]> = {
  request: ['Task received', 'No spend authorized'],
  qualify: ['Capability matched', 'Maximum checked'],
  execute: ['Route selected', 'Work in progress'],
  result: ['Useful result returned', 'Replay ready'],
};

const capabilityRail = [
  { id: 'ai', label: 'AI models' },
  { id: 'research', label: 'Current research' },
  { id: 'prediction', label: 'Prediction intelligence' },
  { id: 'crypto', label: 'Crypto intelligence' },
  { id: 'sandbox', label: 'Secure execution' },
  { id: 'payment', label: 'Pay per call' },
] as const;

const capabilityLoop = [...capabilityRail, ...capabilityRail] as const;
const APEX_PATH = 'M32 8L59.5 55H4.5ZM32 18.8L13.7 50.2H50.3Z';

function SignalScene() {
  return (
    <div className="clervo-hero-signal" aria-hidden="true">
      <svg className="clervo-hero-signal__beam" viewBox="0 0 1400 300" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id="clervo-hero-red" gradientUnits="userSpaceOnUse" x1="0" y1="150" x2="690" y2="150">
            <stop offset="0" stopColor="#710000" />
            <stop offset="0.24" stopColor="#ff1710" />
            <stop offset="0.78" stopColor="#ff504a" />
            <stop offset="1" stopColor="#fff7f7" />
          </linearGradient>
          <linearGradient id="clervo-hero-cyan" gradientUnits="userSpaceOnUse" x1="590" y1="150" x2="810" y2="150">
            <stop offset="0" stopColor="#00e5ff" stopOpacity="0" />
            <stop offset="0.23" stopColor="#ffffff" stopOpacity="0.88" />
            <stop offset="0.48" stopColor="#67f6ff" />
            <stop offset="0.7" stopColor="#00e5ff" />
            <stop offset="1" stopColor="#00e5ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="clervo-hero-gold" gradientUnits="userSpaceOnUse" x1="710" y1="150" x2="1400" y2="150">
            <stop offset="0" stopColor="#fffdf5" />
            <stop offset="0.13" stopColor="#f9efbd" />
            <stop offset="0.3" stopColor="#ffd744" />
            <stop offset="0.63" stopColor="#ffc800" />
            <stop offset="1" stopColor="#8d5b00" />
          </linearGradient>
          <radialGradient id="clervo-hero-hotspot">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="0.16" stopColor="#d8feff" stopOpacity="0.76" />
            <stop offset="0.5" stopColor="#00e5ff" stopOpacity="0.24" />
            <stop offset="1" stopColor="#00e5ff" stopOpacity="0" />
          </radialGradient>
          <filter id="clervo-hero-blur-8" x="-30%" y="-260%" width="160%" height="620%"><feGaussianBlur stdDeviation="8" /></filter>
          <filter id="clervo-hero-blur-13" x="-30%" y="-350%" width="160%" height="800%"><feGaussianBlur stdDeviation="13" /></filter>
          <filter id="clervo-hero-blur-22" x="-80%" y="-120%" width="260%" height="340%"><feGaussianBlur stdDeviation="22" /></filter>
        </defs>
        <g className="clervo-hero-signal__red-glow"><rect x="0" y="144" width="690" height="12" fill="#ff2a23" filter="url(#clervo-hero-blur-13)" /></g>
        <g className="clervo-hero-signal__gold-glow"><rect x="710" y="144" width="690" height="12" fill="#ffc800" filter="url(#clervo-hero-blur-13)" /></g>
        <line className="clervo-hero-signal__red" x1="0" y1="150" x2="690" y2="150" stroke="url(#clervo-hero-red)" strokeWidth="2" />
        <line className="clervo-hero-signal__gold" x1="710" y1="150" x2="1400" y2="150" stroke="url(#clervo-hero-gold)" strokeWidth="2" />
        <g className="clervo-hero-signal__cyan">
          <rect x="600" y="136" width="200" height="28" fill="url(#clervo-hero-cyan)" filter="url(#clervo-hero-blur-8)" />
          <rect x="620" y="147" width="160" height="6" fill="url(#clervo-hero-cyan)" />
        </g>
        <ellipse className="clervo-hero-signal__hotspot" cx="700" cy="150" rx="104" ry="60" fill="url(#clervo-hero-hotspot)" filter="url(#clervo-hero-blur-22)" />
      </svg>

      <svg className="clervo-hero-apex" viewBox="0 0 64 64" focusable="false">
        <defs>
          <linearGradient id="clervo-apex-surface" x1="0.18" y1="0" x2="0.72" y2="1">
            <stop offset="0" stopColor="#ffffff" /><stop offset="0.62" stopColor="#fdfdff" /><stop offset="1" stopColor="#eeeef0" />
          </linearGradient>
          <filter id="clervo-apex-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.35" /></filter>
        </defs>
        <path className="clervo-hero-apex__bloom" d={APEX_PATH} fill="#ffffff" fillRule="evenodd" filter="url(#clervo-apex-bloom)" />
        <path className="clervo-hero-apex__surface" d={APEX_PATH} fill="url(#clervo-apex-surface)" fillRule="evenodd" />
        <path className="clervo-hero-apex__edge" d={APEX_PATH} fill="none" stroke="#ffffff" strokeWidth="0.34" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function HomeHero({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [state, setState] = useState<HeroState>('request');
  const [running, setRunning] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  const selectState = (next: HeroState) => {
    setState(next);
    onPhase(phaseByState[next]);
  };

  const playSequence = (entryDelay = 0) => {
    clearTimers();
    setRunning(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      selectState('result');
      setRunning(false);
      return;
    }
    const stepDuration = 680;
    heroStates.forEach((next, index) => {
      timers.current.push(window.setTimeout(() => selectState(next), entryDelay + index * stepDuration));
    });
    timers.current.push(window.setTimeout(() => setRunning(false), entryDelay + heroStates.length * stepDuration));
  };

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('state');
    if (requested !== null && allowedStates.has(requested as HeroState)) {
      selectState(requested as HeroState);
      return clearTimers;
    }
    playSequence(720);
    return clearTimers;
  }, []);

  return (
    <section className="clervo-home-hero" data-running={running} data-state={state} aria-labelledby="home-title">
      <div className="clervo-home-hero__inner shell">
        <p className="clervo-home-hero__kicker">One wallet · tools on demand</p>
        <h1 className="clervo-home-hero__promise" id="home-title">
          <span className="clervo-home-hero__promise-left"><span>Give your</span><span>agent a task.</span></span>
          <span className="clervo-home-hero__promise-right"><span>Clervo gets</span><span>it done.</span></span>
        </h1>

        <SignalScene />
        <span className="clervo-home-hero__signal-label clervo-home-hero__signal-label--request">Intent</span>
        <span className="clervo-home-hero__signal-label clervo-home-hero__signal-label--verified">Result</span>

        <p className="clervo-home-hero__state" aria-live="polite">
          {stateReadout[state].map((item) => <span key={item}>{item}</span>)}
        </p>
        <button className="clervo-home-hero__trace" disabled={running} onClick={() => playSequence()} type="button">
          <span>{running ? 'Clervo is working…' : 'Watch Clervo work'}</span><span aria-hidden="true">→</span>
        </button>

        <div className="clervo-home-hero__ecosystem-viewport">
          <ul className="clervo-home-hero__ecosystem" aria-label="Clervo capabilities">
            {capabilityLoop.map((item, index) => {
              const clone = index >= capabilityRail.length;
              return <li className={clone ? 'is-clone' : undefined} data-brand={item.id} key={`${item.id}-${index}`} aria-hidden={clone || undefined}><span className="clervo-home-hero__ecosystem-mark">{item.label}</span></li>;
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
