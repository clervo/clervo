import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { ActivationState } from '../experience';
import { phases, type ExperiencePhase } from '../product';
import { Link, useRouter } from '../router';
import { CommandPalette } from './CommandPalette';
import { HollowApex } from './HollowApex';

const primary = [
  ['/product', 'Product'],
  ['/catalog', 'Catalog'],
  ['/pricing', 'Pricing'],
  ['/docs', 'Docs'],
  ['/status', 'Status'],
] as const;

const secondary = [
  ['/proof', 'Proof'],
  ['/security', 'Security'],
  ['/benchmarks', 'Benchmarks'],
  ['/changelog', 'Changelog'],
] as const;

export function Navigation({ activation }: { activation: ActivationState }) {
  const completed = Number(activation.proofCompleted) + Number(activation.receiptInspected);
  const { location } = useRouter();
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const active = (path: string) => location.pathname === path
    || (path === '/product' && location.pathname.startsWith('/capabilities/'))
    || (path === '/catalog' && location.pathname.startsWith('/operations/'))
    || (path === '/docs' && location.pathname.startsWith('/docs/'));

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <>
      <header className="site-header authority-header">
        <Link className="wordmark authority-wordmark" to="/" aria-label="Clervo home">
          <HollowApex className="wordmark-apex" />
          <span>CLERVO</span>
        </Link>
        <nav className="global-nav authority-nav" aria-label="Primary navigation">
          {primary.map(([path, label]) => (
            <Link key={path} className={active(path) ? 'active' : ''} to={path}>{label}</Link>
          ))}
        </nav>
        <div className="header-actions authority-header-actions">
          <CommandPalette />
          <div className="activation-meter" aria-label={`${completed} of 2 activation proofs complete`}>
            <span>{completed}/2</span>
            <i style={{ '--progress': `${completed / 2}` } as CSSProperties} />
          </div>
          <Link className="liquid-capsule liquid-capsule--primary setup-action" to="/start">Set up Clervo</Link>
          <button
            className="mobile-menu-trigger"
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => flushSync(() => setOpen(true))}
          >
            <span /><span /><span />
          </button>
        </div>
      </header>
      <div
        id="mobile-navigation"
        className={`mobile-navigation ${open ? 'is-open' : ''}`}
        aria-hidden={!open}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <section className="mobile-navigation-panel" role="dialog" aria-modal="true" aria-label="Clervo navigation">
          <header>
            <span>Clervo navigation</span>
            <button ref={closeButton} type="button" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
          </header>
          <nav aria-label="Mobile navigation">
            {[...primary, ...secondary].map(([path, label]) => (
              <Link key={path} className={active(path) ? 'active' : ''} to={path}>{label}<span>→</span></Link>
            ))}
            <Link className="liquid-capsule liquid-capsule--primary" to="/start">Set up Clervo<span>→</span></Link>
          </nav>
          <footer>
            <span>Activation proof</span><b>{completed}/2 complete</b>
          </footer>
        </section>
      </div>
    </>
  );
}

export function LifecycleRail({ phase }: { phase: ExperiencePhase }) {
  const activeIndex = phases.findIndex(({ id }) => id === phase);
  return (
    <nav className="lifecycle-rail" aria-label="Outcome lifecycle">
      {phases.map((item, index) => (
        <a
          key={item.id}
          className={index === activeIndex ? 'is-active' : index < activeIndex ? 'is-past' : ''}
          href={`/#${item.id}`}
          aria-current={index === activeIndex ? 'step' : undefined}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          <b>{item.id}</b>
        </a>
      ))}
    </nav>
  );
}

export function ModeBadge({ children = 'Repository-local preview' }: { children?: string }) {
  return (
    <div className="mode-badge">
      <span aria-hidden="true" />
      {children}
    </div>
  );
}
