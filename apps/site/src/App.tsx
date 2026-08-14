import { useCallback, useEffect, useState } from 'react';

import { useCapsuleSheen } from './capsule';
import { SiteFooter, SiteHeader } from './components/Shell';
import { useActivation } from './experience';
import { modelFromSlug } from './models';
import { isCanonicalOperationId } from './operation';
import { Docs } from './pages/Docs';
import { Build } from './pages/Build';
import { Capability } from './pages/Capability';
import { Catalog } from './pages/Catalog';
import { Home } from './pages/Home';
import { Guide, type GuideTopic } from './pages/Guide';
import { ModelPage } from './pages/Model';
import { Operation } from './pages/Operation';
import { ProofLab } from './pages/ProofLab';
import { Product } from './pages/Product';
import { Research } from './pages/Research';
import { Start } from './pages/Start';
import { TrustOverview } from './pages/TrustOverview';
import { TrustSupport, type TrustSupportPage } from './pages/TrustSupport';
import { observedTruth, publicApiCallable, type ExperiencePhase } from './product';
import { Link, useRouter } from './router';

const liveFamilyCount = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live').length;

/*
 * The footer availability line is derived from observed truth rather than
 * written, so it cannot outlive the fact it describes.
 */
const footerNote = publicApiCallable
  ? `${liveFamilyCount} of ${observedTruth.products.length} product families observed serving. Public packages verified.`
  : 'Public packages verified. Public API is currently unavailable.';

const exactTitles: Record<string, string> = {
  '/': 'Outcome infrastructure for agents',
  '/start': 'Set up Clervo',
  '/catalog': 'AI model catalog',
  '/research': 'Research outcome',
  '/platform': 'Clervo Platform',
  '/product': 'Product and capabilities',
  '/build': 'Build with Clervo',
  '/proof-lab': 'Proof Lab',
  '/proof': 'Payment and replay behavior',
  '/docs': 'Developer docs',
  '/docs/quickstart': 'Developer quickstart',
  '/docs/http': 'Raw HTTP developer docs',
  '/docs/typescript': 'TypeScript developer docs',
  '/docs/python': 'Python developer docs',
  '/docs/mcp': 'MCP developer docs',
  '/docs/cli': 'Router and CLI developer docs',
  '/docs/openai': 'OpenAI-compatible client docs',
  '/pricing': 'Pricing truth',
  '/benchmarks': 'Benchmark truth',
  '/security': 'Security controls',
  '/legal': 'Legal boundaries',
  '/status': 'Product status',
  '/changelog': 'Changelog',
  '/products/search': 'Search product family',
  '/products/ai': 'AI product family',
  '/products/sandbox': 'Secure Sandbox product family',
  '/products/rpc': 'Multi-chain RPC product family',
  '/products/prediction': 'Prediction Intelligence product family',
  '/products/crypto': 'Crypto Intelligence product family',
  '/docs/receipts': 'Receipt contract guide',
  '/docs/replay': 'Replay contract guide',
  '/docs/failures': 'Failure recovery guide',
  '/docs/x402': 'x402 contract guide',
  '/docs/catalog': 'Capability catalog guide',
  '/trust': 'Trust center',
};

const exactDescriptions: Record<string, string> = {
  '/': 'Give your agent a task. Get a verified result. Clervo qualifies capability, cost and policy, executes within a bounded contract, and keeps evidence, receipt and replay state inspectable.',
  '/start': 'Set up Clervo in an agent with explicit approval boundaries, environment checks, recovery states and a verified first-task workflow.',
  '/catalog': 'Inspect Clervo model identities, capabilities, current availability and pricing without guessing provider or route state.',
  '/research': 'Use Clervo Research for fresh source retrieval with citations, evidence and explicit outcome boundaries.',
  '/platform': 'One operating contract for bounded requests, capability qualification, execution, verification, evidence and safe replay.',
  '/product': 'Explore ClervoRouter and the six permanent capability families behind one bounded outcome contract.',
  '/build': 'Build agent workflows against Clervo machine contracts, published clients, explicit approvals and inspectable recovery semantics.',
  '/proof-lab': 'Interact with Clervo proof-state fixtures to understand request, qualification, verification, receipt and replay boundaries without creating a live transaction.',
  '/proof': 'Follow Clervo payment requirements, receipts, replay, refusal and unknown-settlement recovery.',
  '/docs': 'Clervo developer documentation for the first free call, exact public operations, clients, wallet opt-in, payment boundaries, receipts, replay and recovery.',
  '/docs/quickstart': 'Install a published Clervo client, make a first free request, inspect the exact operation contract and opt into paid work only when needed.',
  '/docs/http': 'Call Clervo through raw HTTP using the current OpenAPI contract, explicit idempotency and typed payment or recovery states.',
  '/docs/typescript': 'Use the published Clervo TypeScript SDK with explicit base URL, idempotency, payment opt-in and recovery boundaries.',
  '/docs/python': 'Use the published Clervo Python SDK with explicit base URL, idempotency, payment opt-in and recovery boundaries.',
  '/docs/mcp': 'Connect Clervo through the published MCP package while preserving operation identity, approval, evidence and recovery semantics.',
  '/docs/cli': 'Use the Clervo Router and CLI for free Search, catalog inspection, quotes, wallet setup, limits, receipts, replay, reconciliation and diagnostics.',
  '/docs/openai': 'Use the Clervo localhost OpenAI-compatible proxy with canonical model IDs and explicit paid-use opt-in.',
  '/docs/receipts': 'Understand how Clervo receipts bind operation identity, request, evidence, cost and replay state to a returned outcome.',
  '/docs/replay': 'Reuse the same Clervo idempotency key for the identical request and recover the same completed result without a second effect or charge.',
  '/docs/failures': 'Distinguish refused from unresolved Clervo failures and know whether correction, reconciliation or replay is the next safe action.',
  '/docs/x402': 'Inspect Clervo x402 payment challenges, exact maximum charge and approval boundaries before authorization or execution.',
  '/docs/catalog': 'Understand how Clervo projects one canonical registry into capability, lifecycle, pricing, status and discovery surfaces.',
  '/pricing': 'Inspect Clervo operation-level fixed maximums and request-derived quote boundaries without invented subscription tiers or hidden charges.',
  '/benchmarks': 'Clervo benchmark methodology and evidence boundaries: no performance number without the method, scope and reproducible proof behind it.',
  '/security': 'Inspect Clervo authority, wallet, execution, replay and recovery controls with explicit scope and fail-closed boundaries.',
  '/legal': 'Clervo legal and product boundaries for usage, payments, privacy and acceptable operation without overstating unsupported guarantees.',
  '/status': 'Current Clervo product, package, API, route and price availability generated from the observed registry.',
  '/changelog': 'Dated changes to Clervo public product, distribution and runtime behavior.',
  '/trust': 'Inspect Clervo proof, status, security, benchmark, pricing and legal boundaries from one trust center.',
  '/products/search': 'Clervo Research retrieves fresh sources with citations while keeping route, availability and price explicit.',
  '/products/ai': 'Clervo AI exposes a qualified model catalog behind one request contract with exact model identity, capability, price and availability boundaries.',
  '/products/sandbox': 'Clervo Secure Sandbox runs bounded no-network code execution with resource limits, receipt and replay-safe outcome semantics.',
  '/products/rpc': 'Clervo Multi-chain RPC product identity and current public availability boundary.',
  '/products/prediction': 'Clervo Prediction Intelligence returns normalized market context, freshness, evidence and provenance across supported public market data routes.',
  '/products/crypto': 'Clervo Crypto Intelligence returns bounded wallet and on-chain signals with chain coverage, evidence and provenance.',
};

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let node = document.querySelector<HTMLMetaElement>(selector);
  if (node === null) {
    node = document.createElement('meta');
    node.setAttribute(attribute, key);
    document.head.append(node);
  }
  node.content = content;
}

function NotFound() {
  return (
    <section className="not-found">
      <p className="eyebrow">404 / unresolved route</p>
      <h1>This path has no contract.</h1>
      <Link className="button button--primary" to="/">Return home</Link>
    </section>
  );
}

const trustSupportPages = new Set<TrustSupportPage>([
  'pricing', 'proof', 'docs', 'status', 'security', 'benchmarks', 'changelog', 'legal',
]);

export function App() {
  const [phase, setPhase] = useState<ExperiencePhase>('risk');
  const [activation, updateActivation] = useActivation();
  const { location } = useRouter();
  const pathname = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/u, '');
  const updatePhase = useCallback((next: ExperiencePhase) => setPhase(next), []);
  useCapsuleSheen();

  useEffect(() => {
    if (pathname === '/') return;
    if (pathname.startsWith('/proof-lab')) return;
    else if (pathname === '/proof') setPhase('receipt');
    else if (pathname.startsWith('/operations/') || pathname.startsWith('/models/')) setPhase('qualified');
    else if (pathname.startsWith('/docs')) setPhase(activation.receiptInspected ? 'receipt' : 'qualified');
    else if (pathname.startsWith('/products/')) setPhase(pathname === '/products/search' ? 'qualified' : 'risk');
    else if (pathname.startsWith('/product') || pathname === '/platform') setPhase('qualified');
    else if (pathname.startsWith('/build')) setPhase('approval');
    else if (pathname === '/pricing') setPhase('approval');
    else if (pathname.startsWith('/status') || pathname === '/research' || pathname === '/changelog') setPhase('verified');
    else if (['/benchmarks', '/security', '/legal'].includes(pathname)) setPhase('verified');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activation.receiptInspected, pathname]);

  useEffect(() => {
    const operationMatch = pathname.match(/^\/operations\/([^/]+)$/u);
    const modelMatch = pathname.match(/^\/models\/([^/]+)$/u);
    const model = modelMatch?.[1] === undefined ? null : modelFromSlug(modelMatch[1]);
    const operationId = operationMatch?.[1] !== undefined && isCanonicalOperationId(operationMatch[1]) ? operationMatch[1] : null;
    const routeTitle = exactTitles[pathname]
      ?? (model === null ? undefined : `${model.name} API`)
      ?? (operationId === null ? undefined : `Operation ${operationId}`)
      ?? 'Route not found';
    const description = exactDescriptions[pathname]
      ?? (model === null ? undefined : `${model.description} Inspect the exact Clervo model identity, capabilities, availability and published commerce contract.`)
      ?? (operationId === null ? undefined : `Inspect the ${operationId} Clervo operation contract: availability, schemas, price and approval boundary, evidence, receipt, errors and safe replay semantics.`)
      ?? 'This Clervo path does not resolve to a published route.';
    const known = routeTitle !== 'Route not found';
    const canonicalUrl = `https://clervo.dev${pathname === '/' ? '/' : `${pathname}/`}`;

    document.title = `${routeTitle} — Clervo`;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[name="robots"]', 'name', 'robots', known ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' : 'noindex');
    setMeta('meta[property="og:title"]', 'property', 'og:title', `${routeTitle} — Clervo`);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', `${routeTitle} — Clervo`);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!known) canonical?.remove();
    else {
      if (canonical === null) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.append(canonical);
      }
      canonical.href = canonicalUrl;
    }

    let routeJsonLd = document.querySelector<HTMLScriptElement>('script[data-clervo-route-jsonld]');
    if (routeJsonLd === null) {
      routeJsonLd = document.createElement('script');
      routeJsonLd.type = 'application/ld+json';
      routeJsonLd.dataset.clervoRouteJsonld = '';
      document.head.append(routeJsonLd);
    }
    routeJsonLd.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': pathname.startsWith('/docs/') || operationId !== null ? 'TechArticle' : pathname === '/catalog' ? 'CollectionPage' : 'WebPage',
      '@id': `${canonicalUrl}#page`,
      url: canonicalUrl,
      name: routeTitle,
      description,
      inLanguage: 'en',
      isPartOf: { '@id': 'https://clervo.dev/#website' },
      about: { '@id': 'https://clervo.dev/#software' },
      publisher: { '@id': 'https://clervo.dev/#organization' },
    });
  }, [pathname]);

  const route = (() => {
    if (pathname === '/') return <Home onPhase={updatePhase} />;
    if (pathname === '/start') return <Start onPhase={updatePhase} />;
    if (pathname === '/catalog') return <Catalog onPhase={updatePhase} />;
    if (pathname === '/research') return <Research onPhase={updatePhase} />;
    const modelMatch = pathname.match(/^\/models\/([^/]+)$/u);
    if (modelMatch?.[1] !== undefined) {
      const model = modelFromSlug(modelMatch[1]);
      if (model !== null) return <ModelPage model={model} onPhase={updatePhase} />;
    }
    const operationMatch = pathname.match(/^\/operations\/([^/]+)$/u);
    if (operationMatch?.[1] !== undefined && isCanonicalOperationId(operationMatch[1])) {
      return <Operation operationId={operationMatch[1]} onPhase={updatePhase} />;
    }
    const capabilityMatch = pathname.match(/^\/products\/([^/]+)$/u);
    if (capabilityMatch?.[1] !== undefined && ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto'].includes(capabilityMatch[1])) {
      return <Capability routeId={capabilityMatch[1]} onPhase={updatePhase} />;
    }
    if (pathname === '/product' || pathname === '/platform') return <Product onPhase={updatePhase} />;
    if (pathname === '/build') return <Build activation={activation} onPhase={updatePhase} />;
    if (pathname === '/proof-lab') {
      return <ProofLab activation={activation} updateActivation={updateActivation} onPhase={updatePhase} />;
    }
    const trustSupportPage = pathname.slice(1) as TrustSupportPage;
    if (trustSupportPages.has(trustSupportPage)) return <TrustSupport page={trustSupportPage} onPhase={updatePhase} />;
    if (pathname === '/docs/quickstart') {
      return <Docs activation={activation} updateActivation={updateActivation} onPhase={updatePhase} />;
    }
    const docsMatch = pathname.match(/^\/docs\/([^/]+)$/u);
    if (docsMatch?.[1] !== undefined && ['cli', 'http', 'typescript', 'python', 'mcp', 'openai'].includes(docsMatch[1])) {
      return <Docs client={docsMatch[1]} activation={activation} updateActivation={updateActivation} onPhase={updatePhase} />;
    }
    if (docsMatch?.[1] !== undefined && ['receipts', 'replay', 'failures', 'x402', 'catalog'].includes(docsMatch[1])) {
      return <Guide topic={docsMatch[1] as GuideTopic} onPhase={updatePhase} />;
    }
    if (pathname === '/trust') return <TrustOverview onPhase={updatePhase} />;
    return <NotFound />;
  })();

  return (
    <div className={`app app--${phase} ${pathname === '/' ? 'app--home' : 'app--internal'}`}>
      <SiteHeader />
      <main id="main-content">{route}</main>
      <SiteFooter note={footerNote} />
    </div>
  );
}
