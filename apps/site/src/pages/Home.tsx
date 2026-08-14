import { HomeHero } from '../components/HomeHero';
import {
  lifecycleLabels,
  observedTruth,
  pillarLabels,
  publishedClients,
  type ExperiencePhase,
  type ObservedProduct,
} from '../product';
import { Link } from '../router';

const familyRoutes: Record<ObservedProduct['id'], string> = {
  search: '/products/search',
  ai: '/products/ai',
  sandbox: '/products/sandbox',
  rpc: '/products/rpc',
  prediction: '/products/prediction',
  crypto_intelligence: '/products/crypto',
};

const familyDescriptions: Record<ObservedProduct['id'], string> = {
  search: 'Fresh web results with citations.',
  ai: 'Chat, embeddings, and multimodal models through one API.',
  sandbox: 'One-shot, isolated Node.js execution.',
  rpc: 'Multi-chain RPC is not currently offered.',
  prediction: 'Normalized prediction-market data and signals.',
  crypto_intelligence: 'Read-only wallet balances, activity, and reports.',
};

const familyOrder: ObservedProduct['id'][] = ['ai', 'search', 'sandbox', 'prediction', 'crypto_intelligence', 'rpc'];
const flow = ['Install', 'Make request', 'See the price', 'Approve safely', 'Receive result'];

export function Home({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  return (
    <main className="commercial-home">
      <a className="skip-link" href="#home-title">Skip to main content</a>
      <HomeHero onPhase={onPhase} />

      <section className="commercial-section shell" aria-labelledby="home-flow-title">
        <p className="eyebrow">How it works</p>
        <h2 id="home-flow-title">From install to result in one clear flow.</h2>
        <ol className="commercial-flow">
          {flow.map((item, index) => <li key={item}><span>{index + 1}</span><strong>{item}</strong></li>)}
        </ol>
        <p className="quiet">Free operations skip the payment steps. Paid operations return HTTP 402 with the exact request-specific requirement before anything runs.</p>
      </section>

      <section className="commercial-section commercial-section--tint" aria-labelledby="home-products-title">
        <div className="shell">
          <div className="commercial-heading">
            <div><p className="eyebrow">Products</p><h2 id="home-products-title">Use the capability, not another provider account.</h2></div>
            <Link className="text-link" to="/product">See routes and prices <span aria-hidden="true">→</span></Link>
          </div>
          <div className="commercial-product-grid">
            {familyOrder.map((id) => {
              const product = observedTruth.products.find((candidate) => candidate.id === id);
              if (product === undefined) return null;
              return (
                <Link className="commercial-product-card" key={id} to={familyRoutes[id]}>
                  <span className={`state state--${product.lifecycleState}`}>{lifecycleLabels[product.lifecycleState]}</span>
                  <h3>{pillarLabels[id]}</h3>
                  <p>{familyDescriptions[id]}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="commercial-section shell commercial-integrate" aria-labelledby="home-integrate-title">
        <div>
          <p className="eyebrow">Use what you already have</p>
          <h2 id="home-integrate-title">Claude, OpenAI-compatible apps, CLI, TypeScript, or Python.</h2>
          <p className="lede">Connect through MCP, point a compatible client at the hosted API, or use a published Clervo package. The local Router shares wallet limits, receipts, and replay state across tools.</p>
          <div className="commercial-actions"><Link className="button button--primary" to="/start">Choose how to start</Link><Link className="text-link" to="/docs">Read the reference <span aria-hidden="true">→</span></Link></div>
        </div>
        <ul className="commercial-client-list">
          <li><strong>Claude / MCP</strong><span>@clervo/mcp</span></li>
          <li><strong>OpenAI-compatible</strong><span>Hosted API or local proxy</span></li>
          <li><strong>Router / CLI</strong><span>@clervo/router</span></li>
          {publishedClients.filter(({ id }) => id !== 'mcp').map((client) => <li key={client.id}><strong>{client.label}</strong><span>v{client.version}</span></li>)}
        </ul>
      </section>

      <section className="commercial-section commercial-payment" aria-labelledby="home-payment-title">
        <div className="shell commercial-payment__layout">
          <div><p className="eyebrow">Payment you control</p><h2 id="home-payment-title">No silent spend.</h2></div>
          <ul>
            <li>Price shown before payment</li><li>Automatic payment requires explicit opt-in</li><li>Per-operation and daily limits</li><li>Same-key replay never pays twice</li>
          </ul>
          <Link className="button button--secondary" to="/pricing">Understand pricing</Link>
        </div>
      </section>

      <section className="commercial-section shell commercial-final" aria-labelledby="home-final-title">
        <p className="eyebrow">Ready when you are</p><h2 id="home-final-title">Make your first AI call.</h2>
        <p className="lede">Start free, then stop at the real 402 boundary before deciding whether to pay.</p>
        <Link className="button button--primary" to="/start#ai-call">Get started</Link>
      </section>
    </main>
  );
}
