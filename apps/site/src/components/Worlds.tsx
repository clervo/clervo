import { type CSSProperties, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MediaBoundary } from './MediaBoundary';

type WorldProduct = {
  id: string;
  label: string;
  customerLifecycle: string;
};

const WebGLWorlds = lazy(async () => {
  const module = await import('./WebGLWorlds');
  return { default: module.WebGLWorlds };
});

function WorldsStill() {
  return (
    <picture className="worlds-still">
      <source media="(max-width: 900px)" srcSet="/assets/renders/clervo-worlds-portrait.webp" />
      <img src="/assets/renders/clervo-worlds-desktop.webp" alt="" decoding="async" loading="lazy" />
    </picture>
  );
}

export function Worlds({ products }: { products: WorldProduct[] }) {
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
      <div className="worlds-stage__legend" aria-hidden="true">
        <span>CYAN / QUALIFY</span>
        <span>RED / RECOVER</span>
        <span>GOLD / DELIVER</span>
      </div>
      <ol className="worlds-nodes" aria-label="Six Clervo capability cores">
        {products.map((product, index) => (
          <li key={product.id} style={{ '--world-index': index } as CSSProperties}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <b>{product.label}</b>
            <small>{product.customerLifecycle.replaceAll('_', ' ')}</small>
          </li>
        ))}
      </ol>
      <p className="worlds-stage__boundary">Cinematic system model · not live telemetry</p>
    </div>
  );
}
