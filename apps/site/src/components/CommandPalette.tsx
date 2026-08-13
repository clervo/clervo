import { useEffect, useMemo, useRef, useState } from 'react';

import { useRouter } from '../router';

const destinations = [
  { title: 'Research outcome', path: '/research', terms: 'search answer current sources evidence outcome' },
  { title: 'Platform and capabilities', path: '/platform', terms: 'catalog search ai sandbox rpc prediction crypto lifecycle' },
  { title: 'Research product core', path: '/products/search', terms: 'search exact operations lifecycle source boundary' },
  { title: 'AI product core', path: '/products/ai', terms: 'chat embed image speech unavailable' },
  { title: 'Secure Sandbox product core', path: '/products/sandbox', terms: 'gvisor isolation execution unavailable' },
  { title: 'Multi-chain RPC product core', path: '/products/rpc', terms: 'chain rpc archive broadcast rights unavailable' },
  { title: 'Prediction product core', path: '/products/prediction', terms: 'market signals rights unavailable' },
  { title: 'Crypto Intelligence product core', path: '/products/crypto', terms: 'wallet token transaction read only unavailable' },
  { title: 'Build and get started', path: '/build', terms: 'install onboarding activate setup environment' },
  { title: 'Proof Lab', path: '/proof-lab', terms: 'fixture request quote approve verify receipt replay recover' },
  { title: 'Payment and replay proof', path: '/proof', terms: 'x402 settlement receipt payment verification replay no charge' },
  { title: 'Developer quickstart', path: '/docs/quickstart', terms: 'install sdk mcp python http onboarding' },
  { title: 'Raw HTTP docs', path: '/docs/http', terms: 'curl openapi http rest request idempotency' },
  { title: 'TypeScript docs', path: '/docs/typescript', terms: 'sdk npm javascript client' },
  { title: 'Python docs', path: '/docs/python', terms: 'sdk pip python client' },
  { title: 'MCP docs', path: '/docs/mcp', terms: 'mcp server tool model context protocol' },
  { title: 'Receipt contract', path: '/docs/receipts', terms: 'receipt evidence charge operation identity' },
  { title: 'Replay contract', path: '/docs/replay', terms: 'idempotency replay no second charge' },
  { title: 'Failure recovery', path: '/docs/failures', terms: 'errors retry reconcile recovery' },
  { title: 'x402 boundary', path: '/docs/x402', terms: 'payment approve settlement challenge authorization' },
  { title: 'Capability catalog', path: '/docs/catalog', terms: 'catalog claims lifecycle machine discovery' },
  { title: 'Pricing truth', path: '/pricing', terms: 'price quote maximum charge mock usdc 402' },
  { title: 'Benchmark truth', path: '/benchmarks', terms: 'quality comparison performance evidence' },
  { title: 'Security controls', path: '/security', terms: 'ssrf secrets idempotency isolation cleanup cost' },
  { title: 'Legal boundaries', path: '/legal', terms: 'terms resale privacy retention rights' },
  { title: 'Product status', path: '/status', terms: 'availability preview unavailable release candidate deployment' },
  { title: 'Changelog', path: '/changelog', terms: 'release changes packages payment proof' },
  { title: 'Trust center', path: '/trust', terms: 'proof security pricing benchmarks rights status' },
  { title: 'Error: request rejected', path: '/docs#errors', terms: '400 schema invalid request error' },
  { title: 'Error: payment required', path: '/pricing', terms: '402 payment quote non payable error' },
  { title: 'Error: replay conflict', path: '/security', terms: '409 idempotency replay conflict error' },
  { title: 'Error: quota exhausted', path: '/docs#errors', terms: '429 rate limit quota error' },
  { title: 'Error: executor failed closed', path: '/security', terms: '502 executor provider contract error' },
] as const;

export function CommandPalette() {
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
    if (terms.length === 0) return destinations.slice(0, 8);
    return destinations.filter((item) => {
      const haystack = `${item.title} ${item.path} ${item.terms}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [query]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    addEventListener('keydown', keydown);
    return () => removeEventListener('keydown', keydown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    window.setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  const select = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <button
        className="command-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>Search</span><kbd>⌘K</kbd>
      </button>
      {open ? (
        <div className="command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search Clervo"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="command-input">
              <label className="sr-only" htmlFor="command-search">Search pages, capabilities, lifecycle states, and errors</label>
              <input
                ref={input}
                id="command-search"
                type="search"
                placeholder="Search pages, capabilities, states, errors…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActive((value) => Math.min(value + 1, results.length - 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActive((value) => Math.max(value - 1, 0));
                  } else if (event.key === 'Enter' && results[active]) {
                    event.preventDefault();
                    select(results[active].path);
                  }
                }}
              />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close search">ESC</button>
            </div>
            <div className="command-results" role="listbox" aria-label="Search results">
              {results.map((item, index) => (
                <button
                  key={`${item.title}:${item.path}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(item.path)}
                >
                  <span>{item.title}</span><code>{item.path}</code>
                </button>
              ))}
              {results.length === 0 ? <p>No matching contract or destination.</p> : null}
            </div>
            <footer><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}