import type { CSSProperties } from 'react';

import type { ActivationState } from '../experience';
import { phases, type ExperiencePhase } from '../product';
import { Link, useRouter } from '../router';
import { CommandPalette } from './CommandPalette';

export function Navigation({ activation }: { activation: ActivationState }) {
  const completed = Number(activation.proofCompleted) + Number(activation.receiptInspected);
  const { location } = useRouter();
  const active = (path: string) => location.pathname === path || location.pathname === `${path}/`
    || (path === '/docs' && location.pathname.startsWith('/docs/'));
  return (
    <header className="site-header">
      <Link className="wordmark" to="/" aria-label="Clervo home">
        <span className="wordmark-mark" aria-hidden="true">C</span>
        <span>CLERVO</span>
      </Link>
      <nav className="global-nav" aria-label="Primary navigation">
        <Link className={active('/research') ? 'active' : ''} to="/research">Outcome</Link>
        <Link className={active('/platform') ? 'active' : ''} to="/platform"><span className="nav-long">How it works</span><span className="nav-short">How</span></Link>
        <Link className={active('/pricing') ? 'active' : ''} to="/pricing">Pricing</Link>
        <Link className={active('/proof') || active('/proof-lab') ? 'active' : ''} to="/proof">Proof</Link>
        <Link className={active('/docs') ? 'active' : ''} to="/docs">Docs</Link>
        <Link className={active('/status') ? 'active' : ''} to="/status">Status</Link>
      </nav>
      <div className="header-actions">
        <CommandPalette />
        <div className="activation-meter" aria-label={`${completed} of 2 activation proofs complete`}>
          <span>{completed}/2</span>
          <i style={{ '--progress': `${completed / 2}` } as CSSProperties} />
        </div>
      </div>
    </header>
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
