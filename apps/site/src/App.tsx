import { useCallback, useEffect, useState } from 'react';

import { Instrument } from './components/Instrument';
import { LifecycleRail, Navigation } from './components/Navigation';
import { useActivation } from './experience';
import { Docs } from './pages/Docs';
import { Build } from './pages/Build';
import { Home } from './pages/Home';
import { ProofLab } from './pages/ProofLab';
import { Product } from './pages/Product';
import { Status } from './pages/Status';
import { Trust, type TrustTopic } from './pages/Trust';
import type { ExperiencePhase } from './product';
import { Link, useRouter } from './router';

function NotFound() {
  return (
    <section className="not-found">
      <p className="eyebrow">404 / unresolved route</p>
      <h1>This path has no contract.</h1>
      <Link className="button button--primary" to="/">Return home</Link>
    </section>
  );
}

export function App() {
  const [phase, setPhase] = useState<ExperiencePhase>('risk');
  const [activation, updateActivation] = useActivation();
  const { location } = useRouter();
  const updatePhase = useCallback((next: ExperiencePhase) => setPhase(next), []);

  useEffect(() => {
    if (location.pathname === '/') return;
    if (location.pathname.startsWith('/proof-lab')) return;
    else if (location.pathname.startsWith('/docs')) setPhase(activation.receiptInspected ? 'receipt' : 'qualified');
    else if (location.pathname.startsWith('/product')) setPhase('qualified');
    else if (location.pathname.startsWith('/build')) setPhase('approval');
    else if (location.pathname === '/pricing') setPhase('approval');
    else if (location.pathname.startsWith('/status')) setPhase('verified');
    else if (['/benchmarks', '/security', '/legal'].includes(location.pathname)) setPhase('verified');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activation.receiptInspected, location.pathname]);

  useEffect(() => {
    const exactTitles: Record<string, string> = {
      '/': 'Outcome infrastructure for agents',
      '/product': 'Product and capabilities',
      '/build': 'Build with Clervo',
      '/proof-lab': 'Proof Lab',
      '/docs': 'Developer docs',
      '/docs/http': 'Raw HTTP developer docs',
      '/docs/typescript': 'TypeScript developer docs',
      '/docs/python': 'Python developer docs',
      '/docs/mcp': 'MCP developer docs',
      '/pricing': 'Pricing truth',
      '/benchmarks': 'Benchmark truth',
      '/security': 'Security controls',
      '/legal': 'Legal boundaries',
      '/status': 'Product status',
    };
    const routeTitle = exactTitles[location.pathname] ?? 'Route not found';
    document.title = `${routeTitle} — Clervo`;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical === null) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = `https://clervo.dev${location.pathname}`;
  }, [location.pathname]);

  const route = (() => {
    if (location.pathname === '/') return <Home onPhase={updatePhase} />;
    if (location.pathname === '/product') return <Product onPhase={updatePhase} />;
    if (location.pathname === '/build') {
      return <Build activation={activation} onPhase={updatePhase} />;
    }
    if (location.pathname === '/proof-lab') {
      return (
        <ProofLab
          activation={activation}
          updateActivation={updateActivation}
          onPhase={updatePhase}
        />
      );
    }
    if (location.pathname === '/docs') {
      return (
        <Docs
          activation={activation}
          updateActivation={updateActivation}
          onPhase={updatePhase}
        />
      );
    }
    const docsMatch = location.pathname.match(/^\/docs\/([^/]+)\/?$/u);
    if (docsMatch?.[1] !== undefined && ['http', 'typescript', 'python', 'mcp'].includes(docsMatch[1])) {
      return (
        <Docs
          client={docsMatch[1]}
          activation={activation}
          updateActivation={updateActivation}
          onPhase={updatePhase}
        />
      );
    }
    if (location.pathname === '/status') return <Status onPhase={updatePhase} />;
    const trustTopic = location.pathname.slice(1) as TrustTopic;
    if (['pricing', 'benchmarks', 'security', 'legal'].includes(trustTopic)) {
      return <Trust topic={trustTopic} onPhase={updatePhase} />;
    }
    return <NotFound />;
  })();

  return (
    <div className={`app app--${phase} ${location.pathname === '/' ? 'app--home' : 'app--internal'}`}>
      <Navigation activation={activation} />
      <Instrument phase={phase} />
      <LifecycleRail phase={phase} />
      <main id="main-content">{route}</main>
      <footer className="site-footer">
        <span>CLERVO / FIND · UNDERSTAND · ACT</span>
        <nav aria-label="Footer">
          <Link to="/product">Product</Link>
          <Link to="/build">Build</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/security">Security</Link>
          <Link to="/legal">Legal</Link>
          <Link to="/status">Truth status</Link>
          <a href="/openapi.json">OpenAPI</a>
          <a href="/.well-known/clervo.json">Discovery</a>
        </nav>
        <small>Private core frozen. Public distribution and payment are not yet verified.</small>
      </footer>
    </div>
  );
}
