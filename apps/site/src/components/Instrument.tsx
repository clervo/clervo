import { lazy, Suspense, useEffect, useState } from 'react';

import type { ExperiencePhase } from '../product';

const WebGLInstrument = lazy(async () => {
  const module = await import('./WebGLInstrument');
  return { default: module.WebGLInstrument };
});

function useStaticInstrument(): boolean {
  const [value, setValue] = useState(true);
  useEffect(() => {
    const query = matchMedia('(max-width: 900px), (prefers-reduced-motion: reduce)');
    const update = () => setValue(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return value;
}

function CanonicalStill({ phase }: { phase: ExperiencePhase }) {
  return (
    <picture className="instrument-still">
      <source
        media="(max-width: 900px)"
        srcSet={`/assets/renders/clervo-prism-portrait-${phase}.webp`}
      />
      <img
        src={`/assets/renders/clervo-prism-desktop-${phase}.webp`}
        alt=""
        decoding="async"
        fetchPriority={phase === 'risk' ? 'high' : 'auto'}
      />
    </picture>
  );
}

export function Instrument({ phase }: { phase: ExperiencePhase }) {
  const staticInstrument = useStaticInstrument();
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    if (staticInstrument || enhanced) return;
    const activate = () => setEnhanced(true);
    const events: Array<keyof WindowEventMap> = ['pointermove', 'pointerdown', 'wheel', 'keydown'];
    for (const event of events) addEventListener(event, activate, { passive: true, once: true });
    return () => {
      for (const event of events) removeEventListener(event, activate);
    };
  }, [enhanced, staticInstrument]);
  return (
    <div className="instrument" aria-hidden="true">
      <CanonicalStill phase={phase} />
      {!staticInstrument && enhanced && (
        <Suspense fallback={null}>
          <WebGLInstrument phase={phase} />
        </Suspense>
      )}
    </div>
  );
}
