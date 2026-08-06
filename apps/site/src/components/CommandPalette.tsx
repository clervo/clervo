import { useEffect, useMemo, useRef, useState } from 'react';

import { useRouter } from '../router';

const destinations = [
  { title: 'Product and capability families', path: '/product', terms: 'search ai sandbox rpc prediction crypto platform' },
  { title: 'Live catalog structure', path: '/catalog', terms: 'operations lifecycle availability filters' },
  { title: 'Set up Clervo', path: '/start', terms: 'install onboarding activate setup environment' },
  { title: 'Proof', path: '/proof', terms: 'fixture request quote approve verify receipt replay recover' },
  { title: 'Search capability', path: '/capabilities/search', terms: 'web retrieval evidence current information' },
  { title: 'AI capability', path: '/capabilities/ai', terms: 'models inference route provider' },
  { title: 'Secure Sandbox capability', path: '/capabilities/secure-sandbox', terms: 'code execution isolation files' },
  { title: 'Multi-chain RPC capability', path: '/capabilities/multi-chain-rpc', terms: 'blockchain network method chain' },
  { title: 'Prediction capability', path: '/capabilities/prediction', terms: 'markets forecasts evidence' },
  { title: 'Crypto Intelligence capability', path: '/capabilities/crypto-intelligence', terms: 'transactions entities assets tracing' },
  { title: 'Raw HTTP docs', path: '/docs/http', terms: 'curl openapi http rest request idempotency' },
  { title: 'TypeScript docs', path: '/docs/typescript', terms: 'sdk npm javascript client' },
  { title: 'Python docs', path: '/docs/python', terms: 'sdk pip python client' },
  { title: 'MCP docs', path: '/docs/mcp', terms: 'mcp server tool model context protocol' },
  { title: 'Pricing truth', path: '/pricing', terms: 'price quote maximum charge fixture usdc 402' },
  { title: 'Benchmark truth', path: '/benchmarks', terms: 'quality comparison performance evidence' },
  { title: 'Security controls', path: '/security', terms: 'ssrf secrets idempotency isolation cleanup cost' },
  { title: 'Legal boundaries', path: '/legal', terms: 'terms resale privacy retention rights' },
  { title: 'Product status', path: '/status', terms: 'availability preview unavailable release candidate deployment' },
] as const;

export function CommandPalette() {
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
    if (terms.length === 0) return destinations.slice(0, 9);
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
      <button className="command-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span>Search</span><kbd>⌘K</kbd>
      </button>
      {open ? (
        <div className="command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search Clervo" onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-input">
              <label className="sr-only" htmlFor="command-search">Search pages, capabilities, lifecycle states, and errors</label>
              <input
                ref={input}
                id="command-search"
                type="search"
                placeholder="Search pages, capabilities, states, errors…"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(value + 1, results.length - 1)); }
                  else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
                  else if (event.key === 'Enter' && results[active]) { event.preventDefault(); select(results[active].path); }
                }}
              />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close search">ESC</button>
            </div>
            <div className="command-results" role="listbox" aria-label="Search results">
              {results.map((item, index) => (
                <button key={`${item.title}:${item.path}`} type="button" role="option" aria-selected={index === active} onMouseEnter={() => setActive(index)} onClick={() => select(item.path)}>
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
