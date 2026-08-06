import { type CSSProperties, lazy, Suspense, useEffect, useRef, useState } from 'react';

import { lifecycleLabels, observedTruth, type LifecycleState } from '../product';
import { MediaBoundary } from './MediaBoundary';

/*
 * The capability worlds stage.
 *
 * The render behind the six cards is a system model, not telemetry: it is a
 * fixed artwork and it describes nothing about what the deployed system is
 * doing right now. The cards in front of it are the opposite — each one carries
 * the family's observed lifecycle, read from the probe.
 *
 * Those two facts have to stay distinguishable, which is why the stage says so
 * in words rather than relying on the reader to infer it, and why the card
 * state renders through the shared state pill: the pill carries a shape as well
 * as a colour, so the meaning survives a reader who cannot separate cyan from
 * red. The previous version tinted card borders by position in the list, which
 * made an arbitrary layout decision look like a status signal.
 */

const WebGLWorlds = lazy(async () => {
  const module = await import('./WebGLWorlds');
  return { default: module.WebGLWorlds };
});

// Where each card sits on the desktop stage. Position is composition only; it
// carries no meaning and is deliberately not derived from lifecycle state.
const placement: Array<CSSProperties> = [
  { left: '3%', bottom: '12%' },
  { left: '20%', top: '28%' },
  { left: '40%', bottom: '8%' },
  { right: '27%', top: '36%' },
  { right: '3%', bottom: '10%' },
  { right: '5%', top: '14%' },
];

function WorldsStill() {
  return (
    <picture className="worlds-still">
      <source media="(max-width: 900px)" srcSet="/assets/renders/clervo-worlds-portrait.webp" />
      <img src="/assets/renders/clervo-worlds-desktop.webp" alt="" decoding="async" loading="lazy" />
    </picture>
  );
}

export function Worlds() {
  const root = useRef<HTMLDivElement>(null);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const media = matchMedia('(max-width: 900px), (prefers-reduced-motion: reduce)');
    if (media.matches || root.current === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setEnhanced(true);
        observer.disconnect();
      },
      { rootMargin: '240px' },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="worlds-stage" ref={root}>
      <WorldsStill />
      {enhanced && (
        <MediaBoundary>
          <Suspense fallback={null}>
            <WebGLWorlds />
          </Suspense>
        </MediaBoundary>
      )}
      <ol className="worlds-nodes" aria-label="Six Clervo capability families, with observed state">
        {observedTruth.products.map((product, index) => {
          const state = product.lifecycleState as LifecycleState;
          return (
            <li key={product.id} style={placement[index]}>
              <b>{product.label}</b>
              <span className={`state state--${state}`}>{lifecycleLabels[state]}</span>
            </li>
          );
        })}
      </ol>
      <p className="worlds-stage__boundary">
        The artwork is a system model. The state on each card is observed.
      </p>
    </div>
  );
}
