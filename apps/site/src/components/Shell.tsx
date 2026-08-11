import { useEffect, useId, useRef, useState } from 'react';

import { ApexMark } from './ApexMark';
import { Link, useRouter } from '../router';

/*
 * The global shell.
 *
 * The navigation is the locked one (vault Step 7G): Product, Catalog, Pricing,
 * Docs, Status, and one primary action to /start. The deployed header carried
 * a different set — "Outcome", "How it works", "Proof" — and its primary
 * action was a search trigger, so the site's single most important conversion
 * path was not present in the header at all.
 */

const primaryNav = [
  { to: '/product', label: 'Product' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/docs', label: 'Docs' },
  { to: '/status', label: 'Status' },
];

const secondaryNav = [
  { to: '/proof', label: 'Proof' },
  { to: '/security', label: 'Security' },
  { to: '/benchmarks', label: 'Benchmarks' },
  { to: '/changelog', label: 'Changelog' },
];

export function SiteHeader() {
  const { location } = useRouter();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/u, '');

  const isActive = (to: string) => pathname === to
    || (to !== '/' && pathname.startsWith(`${to}/`));

  // Route change closes the panel. Without this, tapping a link on mobile
  // navigates behind an overlay that is still covering the page.
  useEffect(() => setOpen(false), [pathname]);

  // While the panel is open it owns the viewport: the page beneath must not
  // scroll, Escape must close, and focus must not escape into content the user
  // cannot see.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector<HTMLElement>('a[href], button')?.focus();
    return () => {
      removeEventListener('keydown', onKeyDown);
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <header className="site-header">
        <div className="site-header__inner shell">
          <Link className="site-header__brand" to="/" aria-label="Clervo home">
            <ApexMark size={26} />
            <span className="site-header__wordmark">Clervo</span>
          </Link>

          <nav className="site-header__nav" aria-label="Primary">
            {primaryNav.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={isActive(to) ? 'is-active' : undefined}
                aria-current={isActive(to) ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="site-header__actions">
            <Link className="button button--primary site-header__cta" to="/start">
              Set up Clervo
            </Link>
            <button
              ref={triggerRef}
              className="site-header__menu"
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((value) => !value)}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`mobile-nav${open ? ' is-open' : ''}`}
        id={panelId}
        hidden={!open}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          setOpen(false);
          triggerRef.current?.focus();
        }}
      >
        <div
          className="mobile-nav__panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Clervo navigation"
        >
          <div className="mobile-nav__head">
            <span>Navigation</span>
            <button
              className="mobile-nav__close"
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span aria-hidden="true">×</span>
              <span className="sr-only">Close menu</span>
            </button>
          </div>
          <nav className="mobile-nav__links" aria-label="All pages">
            {[...primaryNav, ...secondaryNav].map(({ to, label }) => (
              <Link key={to} to={to} aria-current={isActive(to) ? 'page' : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <Link className="button button--primary mobile-nav__cta" to="/start">
            Set up Clervo
          </Link>
        </div>
      </div>
    </>
  );
}

export function SiteFooter({ note }: { note: string }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner shell">
        <div className="site-footer__brand">
          <ApexMark size={26} />
          <p className="quiet">Find. Understand. Act.</p>
        </div>

        <div className="site-footer__columns">
          <section>
            <h2>Product</h2>
            <Link to="/product">Overview</Link>
            <Link to="/catalog">Live catalog</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/start">Set up Clervo</Link>
          </section>
          <section>
            <h2>Developers</h2>
            <Link to="/docs">Docs</Link>
            <Link to="/docs/quickstart">Quickstart</Link>
            <a href="/openapi.json">OpenAPI</a>
            <a href="/.well-known/clervo.json">Discovery</a>
          </section>
          <section>
            <h2>Trust</h2>
            <Link to="/proof">Proof</Link>
            <Link to="/status">Status</Link>
            <Link to="/security">Security</Link>
            <Link to="/legal">Legal</Link>
          </section>
        </div>
      </div>
      {/*
        * The footer note is generated from the observed registry, never
        * written by hand. A hand-written availability line is the exact bug
        * the truth spine exists to prevent.
        */}
      <p className="site-footer__note shell quiet">{note}</p>
    </footer>
  );
}