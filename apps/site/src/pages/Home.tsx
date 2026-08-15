import { useState } from 'react';

import { HomeHero } from '../components/HomeHero';
import {
  lifecycleLabels,
  observedRoutes,
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
  search: 'Fresh web results with sources and citations.',
  ai: 'Chat, embeddings, image, speech, and multimodal models.',
  sandbox: 'Bounded, isolated Node.js execution with no network.',
  rpc: 'No public execution route is currently advertised.',
  prediction: 'Normalized markets, comparisons, and derived signals.',
  crypto_intelligence: 'Read-only wallet activity, balances, and reports.',
};

const familyOrder: ObservedProduct['id'][] = ['ai', 'search', 'prediction', 'crypto_intelligence', 'sandbox', 'rpc'];
const freeModel = observedRoutes.find(({ sellable, billingMode }) => sellable && billingMode === 'free')?.id;
const firstAiCall = `curl -sS https://api.clervo.dev/v1/chat/completions \\
  -H 'content-type: application/json' \\
  -d '{"model":"${freeModel ?? 'clervo/laguna-s-2.1'}","messages":[{"role":"user","content":"Reply with ready."}],"max_completion_tokens":16}'`;

export function Home({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [copied, setCopied] = useState(false);
  const liveFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live').length;

  const copyFreeCall = async () => {
    await navigator.clipboard.writeText(firstAiCall);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="recovery-home">
      <a className="skip-link" href="#home-title">Skip to main content</a>
      <HomeHero onPhase={onPhase} />

      <section className="home-platform" aria-labelledby="home-platform-title">
        <div className="shell home-platform__intro">
          <p className="eyebrow">One operating layer</p>
          <h2 id="home-platform-title">More than models. The tools an agent needs to finish the task.</h2>
          <p className="lede">Clervo understands the job, selects a current capability, keeps paid work bounded, and returns a useful result through one public interface.</p>
        </div>
        <div className="shell home-capabilities">
          <p className="home-capabilities__status data"><span className="state state--live">{liveFamilies} available</span><span>Catalog-derived public state</span></p>
          <ul>
            {familyOrder.map((id, index) => {
              const product = observedTruth.products.find((candidate) => candidate.id === id);
              if (product === undefined) return null;
              return (
                <li key={product.id}>
                  <Link to={familyRoutes[product.id]}>
                    <span className="home-capability__index data">{String(index + 1).padStart(2, '0')}</span>
                    <span className="home-capability__body"><strong>{pillarLabels[product.id]}</strong><small>{familyDescriptions[product.id]}</small></span>
                    <span className={`state state--${product.lifecycleState}`}>{lifecycleLabels[product.lifecycleState]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="home-skill" aria-labelledby="home-skill-title">
        <div className="shell home-skill__layout">
          <div className="home-skill__copy">
            <p className="eyebrow">Give Clervo to your agent</p>
            <h2 id="home-skill-title">One instruction.<br />A current setup path.</h2>
            <p className="lede">Point your agent at Clervo’s canonical skill file. It can discover the supported interfaces and current machine-readable contracts without you copying a fragile setup guide into the prompt.</p>
            <Link className="button button--primary" to="/start">Open guided setup</Link>
          </div>
          <div className="home-skill__terminal" aria-label="Agent setup instruction">
            <header><span className="data">Agent instruction</span><span className="home-skill__live">public</span></header>
            <div className="home-skill__prompt"><span aria-hidden="true">›</span><code>Set up https://clervo.dev/skill.md</code></div>
            <ol>
              <li><span>01</span><div><strong>Read the current skill</strong><small>One canonical setup instruction.</small></div><em>clervo.dev</em></li>
              <li><span>02</span><div><strong>Choose the interface</strong><small>MCP, hosted API, Router, CLI, TypeScript, or Python.</small></div><em>current</em></li>
              <li><span>03</span><div><strong>Start without a wallet</strong><small>Use a current free model where available.</small></div><em>free first</em></li>
              <li><span>04</span><div><strong>Approve paid work explicitly</strong><small>Maximum quote visible before execution.</small></div><em>opt in</em></li>
            </ol>
            <footer><a href="/skill.md">View skill.md <span aria-hidden="true">↗</span></a><a href="https://clervo.dev/agents.txt">Agent discovery <span aria-hidden="true">↗</span></a></footer>
          </div>
        </div>
      </section>

      <section className="home-connect shell" aria-labelledby="home-connect-title">
        <div className="home-connect__copy">
          <p className="eyebrow">Use what your agent already speaks</p>
          <h2 id="home-connect-title">Hosted when you want it. Local when you need control.</h2>
          <p className="lede">Call <code>https://api.clervo.dev</code> directly, connect Claude through MCP, or run the local Router proxy at <code>http://127.0.0.1:8402/v1</code> for wallet-backed automatic payment.</p>
          <div className="home-client-list" aria-label="Supported clients">
            <Link to="/docs/mcp"><strong>Claude / MCP</strong><span>@clervo/mcp</span></Link>
            <Link to="/docs/openai"><strong>OpenAI-compatible</strong><span>Hosted or local</span></Link>
            <Link to="/docs/cli"><strong>Router / CLI</strong><span>Local proxy</span></Link>
            {publishedClients.filter(({ id }) => id !== 'mcp').map((client) => <Link to={`/docs/${client.id}`} key={client.id}><strong>{client.label}</strong><span>v{client.version}</span></Link>)}
          </div>
          <div className="home-actions"><Link className="button button--primary" to="/start">Choose how to start</Link><Link className="text-link" to="/docs">Read the docs <span aria-hidden="true">→</span></Link></div>
        </div>

        <div className="home-free-call" aria-label="Free hosted AI request">
          <header><span className="data">Hosted API · free model</span><button type="button" onClick={copyFreeCall}>{copied ? 'Copied' : 'Copy'}</button></header>
          <pre tabIndex={0}><code>{firstAiCall}</code></pre>
          <footer><span>No provider API key</span><span>No wallet required</span></footer>
        </div>
      </section>

      <section className="home-payment" aria-labelledby="home-payment-title">
        <div className="shell home-payment__layout">
          <div className="home-payment__copy"><p className="eyebrow">Payment stays bounded</p><h2 id="home-payment-title">See the maximum before paid work runs.</h2><p className="lede">Free calls run immediately where available. Paid calls stop at an exact x402 quote until you deliberately authorize them.</p><Link className="text-link" to="/pricing">Inspect current pricing <span aria-hidden="true">→</span></Link></div>
          <ol className="home-payment__sequence">
            <li data-tone="request"><span>01</span><strong>Request</strong><small>Your intended task and one idempotency key.</small></li>
            <li data-tone="qualify"><span>02</span><strong>Qualify</strong><small>Current route, exact asset, recipient, network, and maximum.</small></li>
            <li data-tone="execute"><span>03</span><strong>Execute</strong><small>Only after your client’s explicit payment policy allows it.</small></li>
            <li data-tone="result"><span>04</span><strong>Result</strong><small>Same-key replay returns the completed result without paying again.</small></li>
          </ol>
        </div>
      </section>

      <section className="home-final shell" aria-labelledby="home-final-title">
        <p className="eyebrow">One useful result is enough to begin</p>
        <h2 id="home-final-title">Give Clervo the next task.</h2>
        <p className="lede">Start free. Add payment authority only when the work needs it.</p>
        <div className="home-actions"><Link className="button button--primary" to="/start">Set up Clervo</Link><Link className="button button--quiet" to="/product">Explore products</Link></div>
      </section>
    </div>
  );
}
