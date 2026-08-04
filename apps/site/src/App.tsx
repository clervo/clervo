import { useCallback, useEffect, useState } from 'react';

import { Instrument } from './components/Instrument';
import { LifecycleRail, Navigation } from './components/Navigation';
import { useActivation } from './experience';
import { Docs } from './pages/Docs';
import { Build } from './pages/Build';
import { Capability } from './pages/Capability';
import { Changelog } from './pages/Changelog';
import { Compare } from './pages/Compare';
import { Home } from './pages/Home';
import { Guide, type GuideTopic } from './pages/Guide';
import { Proof } from './pages/Proof';
import { ProofLab } from './pages/ProofLab';
import { Product } from './pages/Product';
import { Research } from './pages/Research';
import { Status } from './pages/Status';
import { Trust, type TrustTopic } from './pages/Trust';
import { TrustOverview } from './pages/TrustOverview';
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
  const pathname = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/u, '');
  const updatePhase = useCallback((next: ExperiencePhase) => setPhase(next), []);

  useEffect(() => {
    if (pathname === '/') return;
    if (pathname.startsWith('/proof-lab')) return;
    else if (pathname === '/proof') setPhase('receipt');
    else if (pathname.startsWith('/docs')) setPhase(activation.receiptInspected ? 'receipt' : 'qualified');
    else if (pathname.startsWith('/products/')) setPhase(pathname === '/products/search' ? 'qualified' : 'risk');
    else if (pathname.startsWith('/product') || pathname === '/platform') setPhase('qualified');
    else if (pathname.startsWith('/build')) setPhase('approval');
    else if (pathname === '/pricing') setPhase('approval');
    else if (pathname.startsWith('/status') || pathname === '/research' || pathname === '/changelog' || pathname === '/compare/blockrun') setPhase('verified');
    else if (['/benchmarks', '/security', '/legal'].includes(pathname)) setPhase('verified');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activation.receiptInspected, pathname]);

  useEffect(() => {
    const exactTitles: Record<string, string> = {
      '/': 'Outcome infrastructure for agents',
      '/research': 'Research outcome',
      '/platform': 'Clervo Platform',
      '/product': 'Product and capabilities',
      '/build': 'Build with Clervo',
      '/proof-lab': 'Proof Lab',
      '/proof': 'Payment and replay proof',
      '/docs': 'Developer docs',
      '/docs/quickstart': 'Developer quickstart',
      '/docs/http': 'Raw HTTP developer docs',
      '/docs/typescript': 'TypeScript developer docs',
      '/docs/python': 'Python developer docs',
      '/docs/mcp': 'MCP developer docs',
      '/pricing': 'Pricing truth',
      '/benchmarks': 'Benchmark truth',
      '/security': 'Security controls',
      '/legal': 'Legal boundaries',
      '/status': 'Product status',
      '/changelog': 'Changelog',
      '/compare/blockrun': 'Clervo and BlockRun',
      '/products/search': 'Research product core',
      '/products/ai': 'AI product core',
      '/products/sandbox': 'Secure Sandbox product core',
      '/products/rpc': 'Multi-chain RPC product core',
      '/products/prediction': 'Prediction Intelligence product core',
      '/products/crypto': 'Crypto Intelligence product core',
      '/docs/receipts': 'Receipt contract guide',
      '/docs/replay': 'Replay contract guide',
      '/docs/failures': 'Failure recovery guide',
      '/docs/x402': 'x402 contract guide',
      '/docs/catalog': 'Capability catalog guide',
      '/trust': 'Trust center',
    };
    const routeTitle = exactTitles[pathname] ?? 'Route not found';
    document.title = `${routeTitle} — Clervo`;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical === null) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = `https://clervo.dev${pathname === '/' ? '/' : `${pathname}/`}`;
    const description = pathname === '/'
      ? 'Clervo is outcome infrastructure for agents: one bounded job in, one inspectable result out.'
      : `${routeTitle} from Clervo, with engineering state, customer lifecycle, and commercial proof kept separate.`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta !== null) meta.content = description;
  }, [pathname]);

  const route = (() => {
    if (pathname === '/') return <Home onPhase={updatePhase} />;
    if (pathname === '/research') return <Research onPhase={updatePhase} />;
    const capabilityMatch = pathname.match(/^\/products\/([^/]+)$/u);
    if (capabilityMatch?.[1] !== undefined && ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto'].includes(capabilityMatch[1])) {
      return <Capability routeId={capabilityMatch[1]} onPhase={updatePhase} />;
    }
    if (pathname === '/product' || pathname === '/platform') return <Product onPhase={updatePhase} />;
    if (pathname === '/build') {
      return <Build activation={activation} onPhase={updatePhase} />;
    }
    if (pathname === '/proof-lab') {
      return (
        <ProofLab
          activation={activation}
          updateActivation={updateActivation}
          onPhase={updatePhase}
        />
      );
    }
    if (pathname === '/proof') return <Proof onPhase={updatePhase} />;
    if (pathname === '/docs' || pathname === '/docs/quickstart') {
      return (
        <Docs
          activation={activation}
          updateActivation={updateActivation}
          onPhase={updatePhase}
        />
      );
    }
    const docsMatch = pathname.match(/^\/docs\/([^/]+)$/u);
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
    if (docsMatch?.[1] !== undefined && ['receipts', 'replay', 'failures', 'x402', 'catalog'].includes(docsMatch[1])) {
      return <Guide topic={docsMatch[1] as GuideTopic} onPhase={updatePhase} />;
    }
    if (pathname === '/status') return <Status onPhase={updatePhase} />;
    if (pathname === '/changelog') return <Changelog onPhase={updatePhase} />;
    if (pathname === '/compare/blockrun') return <Compare onPhase={updatePhase} />;
    if (pathname === '/trust') return <TrustOverview onPhase={updatePhase} />;
    const trustTopic = pathname.slice(1) as TrustTopic;
    if (['pricing', 'benchmarks', 'security', 'legal'].includes(trustTopic)) {
      return <Trust topic={trustTopic} onPhase={updatePhase} />;
    }
    return <NotFound />;
  })();

  return (
    <div className={`app app--${phase} ${pathname === '/' ? 'app--home' : 'app--internal'}`}>
      <Navigation activation={activation} />
      <Instrument phase={phase} />
      <LifecycleRail phase={phase} />
      <main id="main-content">{route}</main>
      <footer className="site-footer">
        <span>CLERVO / FIND · UNDERSTAND · ACT</span>
        <nav aria-label="Footer">
          <Link to="/research">Research</Link>
          <Link to="/platform">Platform</Link>
          <Link to="/build">Build</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/security">Security</Link>
          <Link to="/legal">Legal</Link>
          <Link to="/status">Truth status</Link>
          <Link to="/trust">Trust</Link>
          <Link to="/changelog">Changelog</Link>
          <Link to="/compare/blockrun">Compare</Link>
          <a href="/openapi.json">OpenAPI</a>
          <a href="/.well-known/clervo.json">Discovery</a>
        </nav>
        <small>Public packages verified. Private payment plumbing proven once. Public API and customer payment remain unavailable.</small>
      </footer>
    </div>
  );
}
