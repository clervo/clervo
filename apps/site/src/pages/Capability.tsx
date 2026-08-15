import { useEffect } from 'react';

import { ApexMark } from '../components/ApexMark';
import {
  attributionLabel,
  discovery,
  familyOf,
  formatUsdc,
  lifecycleLabels,
  observedProduct,
  observedRoutes,
  type ExperiencePhase,
  type ObservedProduct,
} from '../product';
import { Link } from '../router';
import { FAMILY_DISPLAY, FAMILY_ORDER, FAMILY_ROUTE, ROUTE_FAMILY } from './b12Slice4';

const descriptions: Record<ObservedProduct['id'], string> = {
  search: 'Retrieve fresh ranked web results with citations through free and paid routes.',
  ai: 'Use chat, embeddings, and multimodal models through one catalog and execution API.',
  sandbox: 'Run one bounded Node.js command with no network and strict resource ceilings.',
  rpc: 'Multi-chain RPC has no public execution route at this time.',
  prediction: 'Discover, compare, and inspect normalized prediction markets and derived signals.',
  crypto_intelligence: 'Read wallet balances, tokens, transactions, and bounded reports for Ethereum and Base.',
};

function CapabilityVisual({ familyId, modelCount }: { familyId: ObservedProduct['id']; modelCount: number }) {
  if (familyId === 'ai') return <div className="capability-visual capability-visual--ai" aria-label={`${modelCount} current sellable AI model identities`}><div className="capability-visual__core"><ApexMark size={44} /><span>Clervo route</span></div><span data-node="chat">Chat</span><span data-node="embed">Embeddings</span><span data-node="image">Image</span><span data-node="speech">Speech</span><span data-node="media">Video · music</span><strong>{modelCount}<small>sellable IDs</small></strong></div>;
  if (familyId === 'search') return <div className="capability-visual capability-visual--search" aria-label="Research source topology"><span data-node="query">Task</span><span data-node="source-a">Source</span><span data-node="source-b">Source</span><span data-node="citation">Citations</span><strong>Current research<small>ranked sources · explicit citations</small></strong></div>;
  if (familyId === 'sandbox') return <div className="capability-visual capability-visual--sandbox" aria-label="Bounded sandbox execution frame"><header><span>Execution boundary</span><em>no network</em></header><pre><code>{`$ node task.js\n\n// bounded input\n// isolated process\n// captured result`}</code></pre><footer><span>Node.js</span><span>strict ceilings</span><span>cleanup</span></footer></div>;
  if (familyId === 'prediction') return <div className="capability-visual capability-visual--prediction" aria-label="Prediction market structure"><div className="capability-visual__axis"><span>Market</span><span>Probability</span><span>Source</span></div><div className="capability-visual__signal"><i /><i /><i /></div><strong>Comparable context<small>normalized markets · freshness · provenance</small></strong></div>;
  if (familyId === 'crypto_intelligence') return <div className="capability-visual capability-visual--crypto" aria-label="Wallet evidence timeline"><div><span>01</span><strong>Wallet</strong><small>Ethereum · Base</small></div><div><span>02</span><strong>Activity</strong><small>balances · tokens · transactions</small></div><div><span>03</span><strong>Report</strong><small>read-only · bounded</small></div></div>;
  return <div className="capability-visual capability-visual--rpc" aria-label="Multi-chain RPC unavailable"><span>Public route</span><strong>Unavailable</strong><small>No reachable execution route is advertised.</small></div>;
}

export function Capability({ routeId, onPhase }: { routeId: string; onPhase(phase: ExperiencePhase): void }) {
  const familyId = ROUTE_FAMILY[routeId];
  useEffect(() => onPhase(familyId === undefined || observedProduct(familyId).lifecycleState === 'unavailable' ? 'risk' : 'qualified'), [familyId, onPhase]);
  if (familyId === undefined) return null;

  const observed = observedProduct(familyId);
  const operations = discovery.products.filter((entry) => familyOf(entry.operationId) === familyId);
  const models = familyId === 'ai' ? observedRoutes : [];

  return (
    <main className="commercial-page capability-page" data-family={familyId}>
      <section className="capability-hero" aria-labelledby="capability-title">
        <div className="shell capability-hero__layout">
          <div className="capability-hero__copy">
            <Link className="text-link" to="/product">← All products</Link>
            <p className="eyebrow">Product / {FAMILY_DISPLAY[familyId]}</p>
            <h1 id="capability-title">{FAMILY_DISPLAY[familyId]}</h1>
            <p className="lede">{descriptions[familyId]}</p>
            <div className="commercial-actions">
              <span className={`state state--${observed.lifecycleState}`}>{lifecycleLabels[observed.lifecycleState]}</span>
              {observed.lifecycleState === 'unavailable' ? null : <Link className="button button--primary" to="/start">Start using this product</Link>}
            </div>
          </div>
          <CapabilityVisual familyId={familyId} modelCount={models.filter(({ sellable }) => sellable).length} />
        </div>
      </section>

      <section className="commercial-section commercial-section--tint" aria-labelledby="capability-operations">
        <div className="shell">
          <div className="commercial-heading"><div><p className="eyebrow">Routes and prices</p><h2 id="capability-operations">What you can call.</h2></div><a className="text-link" href="/openapi.json">OpenAPI <span aria-hidden="true">→</span></a></div>
          {operations.length === 0 ? (
            <div className="commercial-empty"><h3>No public execution route.</h3><p>This product is not advertised as available. Check status for future changes.</p></div>
          ) : (
            <div className="commercial-family-list">
              {operations.map((operation) => {
                const route = operation.routes?.paidChallenge ?? operation.routes?.execute ?? operation.routes?.freeSample;
                const price = operation.pricing.displayPrice;
                return <article className="commercial-family commercial-family--operation" key={operation.operationId}>
                  <div className="commercial-family__title"><h3>{operation.title}</h3><code>{operation.operationId}</code></div>
                  <p>{operation.summary}</p>
                  <dl>
                    <div><dt>Route</dt><dd><code>{route ?? 'See OpenAPI'}</code></dd></div>
                    <div><dt>Price</dt><dd>{price === null ? 'Request-priced; shown before payment' : `${formatUsdc(price.amountAtomic, price.decimals)} maximum`}</dd></div>
                    {operation.attribution === undefined ? null : <div><dt>Source</dt><dd>{attributionLabel(operation.attribution)}</dd></div>}
                  </dl>
                  <div className="commercial-family__actions"><Link className="text-link" to={`/operations/${operation.operationId}`}>Technical contract <span aria-hidden="true">→</span></Link></div>
                </article>;
              })}
            </div>
          )}
        </div>
      </section>

      {familyId === 'ai' ? <section className="commercial-section shell" aria-labelledby="capability-models"><p className="eyebrow">Model catalog</p><h2 id="capability-models">{models.filter(({ sellable }) => sellable).length} sellable model IDs.</h2><p className="lede">Choose by capability, availability, free or paid billing, and exact Clervo model identity.</p><Link className="button button--secondary" to="/catalog">Browse models</Link></section> : null}

      <nav className="commercial-family-nav shell" aria-label="Products">
        {FAMILY_ORDER.map((id) => {
          const current = observedProduct(id);
          return <Link key={id} className={id === familyId ? 'is-active' : undefined} aria-current={id === familyId ? 'page' : undefined} to={`/products/${FAMILY_ROUTE[id]}`}><span>{FAMILY_DISPLAY[id]}</span><small>{lifecycleLabels[current.lifecycleState]}</small></Link>;
        })}
      </nav>
    </main>
  );
}
