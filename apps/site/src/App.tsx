import { useCallback, useEffect, useState } from 'react';

import { Instrument } from './components/Instrument';
import { LifecycleRail, Navigation } from './components/Navigation';
import { useActivation } from './experience';
import { Build } from './pages/Build';
import { Capability } from './pages/Capability';
import { Catalog } from './pages/Catalog';
import { Changelog } from './pages/Changelog';
import { Docs } from './pages/Docs';
import { Home } from './pages/Home';
import { Operation } from './pages/Operation';
import { Product } from './pages/Product';
import { ProofLab } from './pages/ProofLab';
import { Status } from './pages/Status';
import { Trust, type TrustTopic } from './pages/Trust';
import type { ExperiencePhase } from './product';
import { Link, useRouter } from './router';

function NotFound() {
  return <section className="not-found"><p className="eyebrow">404 / unresolved route</p><h1>This path has no contract.</h1><Link className="liquid-capsule liquid-capsule--primary" to="/catalog">Browse the catalog</Link></section>;
}

export function App() {
  const [phase, setPhase] = useState<ExperiencePhase>('risk');
  const [activation, updateActivation] = useActivation();
  const { location } = useRouter();
  const updatePhase = useCallback((next: ExperiencePhase) => setPhase(next), []);

  useEffect(() => {
    if (location.pathname === '/') return;
    if (location.pathname.startsWith('/proof')) return;
    if (location.pathname.startsWith('/docs')) setPhase(activation.receiptInspected ? 'receipt' : 'qualified');
    else if (location.pathname.startsWith('/product') || location.pathname.startsWith('/catalog') || location.pathname.startsWith('/capabilities') || location.pathname.startsWith('/operations')) setPhase('qualified');
    else if (location.pathname === '/start' || location.pathname === '/build' || location.pathname === '/pricing') setPhase('approval');
    else if (location.pathname.startsWith('/status') || ['/benchmarks', '/security', '/legal', '/changelog'].includes(location.pathname)) setPhase('verified');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activation.receiptInspected, location.pathname]);

  useEffect(() => {
    const exactTitles: Record<string, string> = {
      '/': 'Outcome infrastructure for AI agents', '/product': 'Product and capabilities', '/catalog': 'Catalog', '/start': 'Set up Clervo', '/build': 'Set up Clervo', '/proof': 'Proof', '/proof-lab': 'Proof', '/docs': 'Developer docs', '/docs/http': 'Raw HTTP developer docs', '/docs/typescript': 'TypeScript developer docs', '/docs/python': 'Python developer docs', '/docs/mcp': 'MCP developer docs', '/pricing': 'Pricing truth', '/benchmarks': 'Benchmark truth', '/security': 'Security controls', '/legal': 'Legal boundaries', '/status': 'Product status', '/changelog': 'Changelog',
    };
    let routeTitle = exactTitles[location.pathname];
    if (routeTitle === undefined && location.pathname.startsWith('/capabilities/')) routeTitle = 'Capability family';
    if (routeTitle === undefined && location.pathname.startsWith('/operations/')) routeTitle = 'Operation contract';
    document.title = `${routeTitle ?? 'Route not found'} — Clervo`;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical === null) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = `https://clervo.dev${location.pathname}`;
  }, [location.pathname]);

  const route = (() => {
    if (location.pathname === '/') return <Home onPhase={updatePhase} />;
    if (location.pathname === '/product') return <Product onPhase={updatePhase} />;
    if (location.pathname === '/catalog') return <Catalog onPhase={updatePhase} />;
    if (location.pathname === '/start' || location.pathname === '/build') return <Build activation={activation} onPhase={updatePhase} />;
    if (location.pathname === '/proof' || location.pathname === '/proof-lab') return <ProofLab activation={activation} updateActivation={updateActivation} onPhase={updatePhase} />;
    const capabilityMatch = location.pathname.match(/^\/capabilities\/([^/]+)\/?$/u);
    if (capabilityMatch?.[1] !== undefined) return <Capability slug={decodeURIComponent(capabilityMatch[1])} onPhase={updatePhase} />;
    const operationMatch = location.pathname.match(/^\/operations\/([^/]+)\/?$/u);
    if (operationMatch?.[1] !== undefined) return <Operation operationId={decodeURIComponent(operationMatch[1])} onPhase={updatePhase} />;
    if (location.pathname === '/docs') return <Docs activation={activation} updateActivation={updateActivation} onPhase={updatePhase} />;
    const docsMatch = location.pathname.match(/^\/docs\/([^/]+)\/?$/u);
    if (docsMatch?.[1] !== undefined && ['http', 'typescript', 'python', 'mcp'].includes(docsMatch[1])) return <Docs client={docsMatch[1]} activation={activation} updateActivation={updateActivation} onPhase={updatePhase} />;
    if (location.pathname === '/status') return <Status onPhase={updatePhase} />;
    if (location.pathname === '/changelog') return <Changelog onPhase={updatePhase} />;
    const trustPath = location.pathname.startsWith('/legal/') ? 'legal' : location.pathname.slice(1);
    if (['pricing', 'benchmarks', 'security', 'legal'].includes(trustPath)) return <Trust topic={trustPath as TrustTopic} onPhase={updatePhase} />;
    return <NotFound />;
  })();

  return (
    <div className={`app app--${phase} ${location.pathname === '/' ? 'app--home' : 'app--internal'}`}>
      <Navigation activation={activation} />
      <Instrument phase={phase} />
      <LifecycleRail phase={phase} />
      <main id="main-content">{route}</main>
      <footer className="site-footer authority-footer">
        <span>CLERVO / FIND · UNDERSTAND · ACT</span>
        <nav aria-label="Footer">
          <Link to="/product">Product</Link><Link to="/catalog">Catalog</Link><Link to="/start">Set up Clervo</Link><Link to="/pricing">Pricing</Link><Link to="/proof">Proof</Link><Link to="/docs">Docs</Link><Link to="/security">Security</Link><Link to="/status">Status</Link><Link to="/changelog">Changelog</Link><Link to="/legal">Legal</Link><a href="/openapi.json">OpenAPI</a><a href="/.well-known/clervo.json">Discovery</a>
        </nav>
        <small>Repository-local release candidate. Public distribution, payment, and production execution are not yet verified.</small>
      </footer>
    </div>
  );
}
