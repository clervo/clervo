import { useEffect, useRef, useState } from 'react';

import type { ExperiencePhase } from '../product';

type HeroState = 'request' | 'qualify' | 'execute' | 'verify' | 'prove';

const heroStates: HeroState[] = ['request', 'qualify', 'execute', 'verify', 'prove'];
const allowedStates = new Set<HeroState>(heroStates);

const phaseByState: Record<HeroState, ExperiencePhase> = {
  request: 'risk',
  qualify: 'qualified',
  execute: 'qualified',
  verify: 'verified',
  prove: 'receipt',
};

const stateReadout: Record<HeroState, string[]> = {
  request: ['Route unresolved', 'Evidence pending', 'Proof pending'],
  qualify: ['Route qualifying', 'Evidence pending', 'Proof pending'],
  execute: ['Route selected', 'Execution bounded', 'Proof pending'],
  verify: ['Result returned', 'Evidence checking', 'Proof pending'],
  prove: ['Route resolved', 'Evidence attached', 'Proof verified'],
};

const ecosystemBrands = [
  {
    id: 'openai',
    label: 'OpenAI',
    src: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    src: 'https://upload.wikimedia.org/wikipedia/commons/7/78/Anthropic_logo.svg',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA',
    src: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/NVIDIA_logo.svg',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    src: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Cloudflare_Logo.svg',
  },
  {
    id: 'aws',
    label: 'AWS',
    src: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Amazon_Web_Services_2025.svg',
  },
  {
    id: 'google-cloud',
    label: 'Google Cloud',
    src: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Google_Cloud_logo.svg',
  },
] as const;

const ecosystemLoop = [...ecosystemBrands, ...ecosystemBrands] as const;

/* Same outer Hollow Apex. The inner cutout is opened up for a lighter visual weight. */
const APEX_PATH = 'M32 8L59.5 55H4.5ZM32 18.8L13.7 50.2H50.3Z';

function SignalScene() {
  return (
    <div className="clervo-hero-signal" aria-hidden="true">
      <svg
        className="clervo-hero-signal__beam"
        viewBox="0 0 1400 300"
        preserveAspectRatio="none"
        focusable="false"
      >
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
          <filter id="clervo-hero-blur-8" x="-30%" y="-260%" width="160%" height="620%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="clervo-hero-blur-13" x="-30%" y="-350%" width="160%" height="800%">
            <feGaussianBlur stdDeviation="13" />
          </filter>
          <filter id="clervo-hero-blur-22" x="-80%" y="-120%" width="260%" height="340%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
        </defs>

        <g className="clervo-hero-signal__red-glow">
          <rect x="0" y="144" width="690" height="12" fill="#ff2a23" filter="url(#clervo-hero-blur-13)" />
        </g>
        <g className="clervo-hero-signal__gold-glow">
          <rect x="710" y="144" width="690" height="12" fill="#ffc800" filter="url(#clervo-hero-blur-13)" />
        </g>

        <line className="clervo-hero-signal__red" x1="0" y1="150" x2="690" y2="150" stroke="url(#clervo-hero-red)" strokeWidth="2" />
        <line className="clervo-hero-signal__gold" x1="710" y1="150" x2="1400" y2="150" stroke="url(#clervo-hero-gold)" strokeWidth="2" />

        <g className="clervo-hero-signal__cyan">
          <rect x="600" y="136" width="200" height="28" fill="url(#clervo-hero-cyan)" filter="url(#clervo-hero-blur-8)" />
          <rect x="620" y="147" width="160" height="6" fill="url(#clervo-hero-cyan)" />
        </g>
        <ellipse
          className="clervo-hero-signal__hotspot"
          cx="700"
          cy="150"
          rx="104"
          ry="60"
          fill="url(#clervo-hero-hotspot)"
          filter="url(#clervo-hero-blur-22)"
        />
      </svg>

      <svg className="clervo-hero-apex" viewBox="0 0 64 64" focusable="false">
        <defs>
          <linearGradient id="clervo-apex-surface" x1="0.18" y1="0" x2="0.72" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.62" stopColor="#fdfdff" />
            <stop offset="1" stopColor="#eeeeF0" />
          </linearGradient>
          <filter id="clervo-apex-bloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.35" />
          </filter>
        </defs>
        <path
          className="clervo-hero-apex__bloom"
          d={APEX_PATH}
          fill="#ffffff"
          fillRule="evenodd"
          filter="url(#clervo-apex-bloom)"
        />
        <path
          className="clervo-hero-apex__surface"
          d={APEX_PATH}
          fill="url(#clervo-apex-surface)"
          fillRule="evenodd"
        />
        <path
          className="clervo-hero-apex__edge"
          d={APEX_PATH}
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.34"
          strokeLinejoin="round"
        />
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

  const playTrace = (entryDelay = 0) => {
    clearTimers();
    setRunning(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      selectState('prove');
      setRunning(false);
      return;
    }

    const stepDuration = 560;
    heroStates.forEach((next, index) => {
      timers.current.push(window.setTimeout(() => selectState(next), entryDelay + index * stepDuration));
    });
    timers.current.push(window.setTimeout(
      () => setRunning(false),
      entryDelay + heroStates.length * stepDuration,
    ));
  };

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('state');
    if (requested !== null && allowedStates.has(requested as HeroState)) {
      selectState(requested as HeroState);
      return clearTimers;
    }
    playTrace(720);
    return clearTimers;
  }, []);

  return (
    <section
      className="clervo-home-hero"
      data-running={running}
      data-state={state}
      aria-labelledby="home-title"
    >
      <div className="clervo-home-hero__inner shell">
        <h1 className="clervo-home-hero__promise" id="home-title">
          <span className="clervo-home-hero__promise-left">
            <span>Give your</span>
            <span>agent a task.</span>
          </span>
          <span className="clervo-home-hero__promise-right">
            <span>Get a verified</span>
            <span>result.</span>
          </span>
        </h1>

        <SignalScene />

        <span className="clervo-home-hero__signal-label clervo-home-hero__signal-label--request">Request</span>
        <span className="clervo-home-hero__signal-label clervo-home-hero__signal-label--verified">Verified</span>

        <p className="clervo-home-hero__state" aria-live="polite">
          {stateReadout[state].map((item) => <span key={item}>{item}</span>)}
        </p>

        <button
          className="clervo-home-hero__trace"
          disabled={running}
          onClick={() => playTrace()}
          type="button"
        >
          <span>{running ? 'Tracing task…' : 'Trace the contract'}</span>
          <span aria-hidden="true">→</span>
        </button>

        <div className="clervo-home-hero__ecosystem-viewport">
          <ul className="clervo-home-hero__ecosystem" aria-label="Clervo technology ecosystem">
            {ecosystemLoop.map((brand, index) => {
              const clone = index >= ecosystemBrands.length;
              return (
                <li
                  className={clone ? 'is-clone' : undefined}
                  data-brand={brand.id}
                  key={`${brand.id}-${index}`}
                  aria-hidden={clone || undefined}
                >
                  <img src={brand.src} alt={clone ? '' : brand.label} decoding="async" />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
