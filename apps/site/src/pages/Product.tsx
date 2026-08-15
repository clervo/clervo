import { useEffect } from 'react';

import { ApexMark } from '../components/ApexMark';
import {
  formatUsdc,
  lifecycleLabels,
  observedProduct,
  publicOperations,
  type ExperiencePhase,
  type ObservedProduct,
} from '../product';
import { Link } from '../router';

interface FamilyCopy {
  id: ObservedProduct['id'];
  title: string;
  description: string;
  example: string;
  href: string;
}

const families: FamilyCopy[] = [
  { id: 'ai', title: 'AI models', description: 'Use chat, embeddings, image, speech, video, music, and virtual try-on models through one catalog and payment contract.', example: 'Ask a model to summarize a document or generate an image.', href: '/products/ai' },
  { id: 'search', title: 'Web Search', description: 'Retrieve fresh ranked web results with citations, with a free entry route and a paid replay-safe route.', example: 'Find the latest primary sources for a research question.', href: '/products/search' },
  { id: 'sandbox', title: 'Secure Sandbox', description: 'Run one bounded Node.js command with no network and strict resource ceilings.', example: 'Execute a short data transformation in isolation.', href: '/products/sandbox' },
  { id: 'rpc', title: 'Multi-chain RPC', description: 'Read allowlisted chain state across eight supported EVM and Solana networks with health-aware failover.', example: 'Read a balance, block, transaction, or contract state.', href: '/products/rpc' },
  { id: 'prediction', title: 'Prediction Intelligence', description: 'Discover, compare, and inspect normalized prediction markets and derived signals.', example: 'Compare equivalent markets across supported venues.', href: '/products/prediction' },
  { id: 'crypto_intelligence', title: 'Crypto Intelligence', description: 'Read wallet balances, tokens, transactions, and bounded reports for Ethereum and Base.', example: 'Summarize recent activity for a public EVM address.', href: '/products/crypto' },
];

function familyPrice(id: ObservedProduct['id']): string {
  const prices = publicOperations
    .filter(({ familyId }) => familyId === id)
    .map(({ pricing }) => pricing.displayPrice)
    .filter((price): price is NonNullable<typeof price> => price !== null)
    .map((price) => Number(price.amountAtomic) / 10 ** price.decimals);
  if (prices.length === 0) return 'Request-priced; shown in the 402 response';
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  return minimum === maximum
    ? `${formatUsdc(String(Math.round(maximum * 1_000_000)), 6)} maximum`
    : `${minimum.toFixed(3)}–${maximum.toFixed(3)} USDC maximum`;
}

export function Product({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('qualified'), [onPhase]);

  return (
    <div className="commercial-page product-page">
      <section className="product-hero" aria-labelledby="products-title">
        <div className="shell product-hero__layout">
          <div className="product-hero__copy">
            <p className="eyebrow">Products / one wallet</p>
            <h1 id="products-title">Useful capabilities.<br />One way to pay.</h1>
            <p className="lede">Choose an available product, send a request, and inspect the quoted maximum before any paid execution. Product state and prices below come from Clervo's generated public catalog.</p>
            <div className="commercial-actions"><Link className="button button--primary" to="/start">Start using Clervo</Link><Link className="button button--secondary" to="/pricing">See pricing</Link></div>
          </div>
          <div className="product-map" aria-label="Clervo product families">
            <div className="product-map__core"><ApexMark size={58} /><span>One wallet</span></div>
            <span data-node="ai">AI models</span><span data-node="search">Research</span><span data-node="prediction">Prediction</span><span data-node="crypto">Crypto</span><span data-node="sandbox">Sandbox</span><span data-node="rpc">RPC</span>
          </div>
        </div>
      </section>

      <section className="commercial-section shell" aria-labelledby="available-products">
        <div className="commercial-heading"><div><p className="eyebrow">Available now</p><h2 id="available-products">Pick what you need to do.</h2></div><a className="text-link" href="/catalog.json">Machine-readable catalog <span aria-hidden="true">→</span></a></div>
        <div className="commercial-family-list">
          {families.map((family) => {
            const observed = observedProduct(family.id);
            const operations = publicOperations.filter(({ familyId }) => family.id === familyId);
            const routes = operations[0]?.routes;
            const primaryRoute = routes?.paidChallenge ?? routes?.execute ?? routes?.freeSample;
            return (
              <article className="commercial-family product-family" data-family={family.id} key={family.id}>
                <div className="commercial-family__title"><span className={`state state--${observed.lifecycleState}`}>{lifecycleLabels[observed.lifecycleState]}</span><h3>{family.title}</h3></div>
                <p>{family.description}</p>
                <dl>
                  <div><dt>Primary route</dt><dd><code>{primaryRoute ?? 'See OpenAPI'}</code></dd></div>
                  <div><dt>Pricing</dt><dd>{familyPrice(family.id)}</dd></div>
                  <div><dt>Example</dt><dd>{family.example}</dd></div>
                </dl>
                <div className="commercial-family__actions"><Link className="text-link" to={family.href}>Product details <span aria-hidden="true">→</span></Link><Link className="text-link" to="/start">Start <span aria-hidden="true">→</span></Link></div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="commercial-section shell commercial-final"><p className="eyebrow">Choose an interface</p><h2>Claude, OpenAI-compatible apps, CLI, TypeScript, or Python.</h2><Link className="button button--primary" to="/start">Choose how to start</Link></section>
    </div>
  );
}
