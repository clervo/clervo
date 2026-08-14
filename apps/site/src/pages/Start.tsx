import { useEffect } from 'react';

import { publicStatus, quickStartCurl, type ExperiencePhase } from '../product';
import { Link } from '../router';
import '../styles/b12/start.css';

const packageByName = new Map(publicStatus.packages.items.map((item) => [item.name, item]));

export function Start({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('qualified'), [onPhase]);

  const sdk = packageByName.get('@clervo/sdk');
  const mcp = packageByName.get('@clervo/mcp');
  const python = packageByName.get('clervo-sdk');

  return (
    <div className="b12-start">
      <section className="page-lead">
        <p className="eyebrow">Get started</p>
        <h1>Make the first call.<br />Add payment only when needed.</h1>
        <p className="lede">
          Clervo supports raw HTTP, TypeScript, Python, MCP, and the local
          Router/CLI. Start with free Search; paid routes return a binding 402
          challenge before any authorization.
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--primary" to="/docs/quickstart">Open the quickstart</Link>
          <a className="button button--secondary" href="/openapi.json">OpenAPI</a>
        </div>
      </section>

      <section className="band band--ruled docs-body" aria-labelledby="start-free-call">
        <div className="section-head">
          <p className="eyebrow">No account or wallet</p>
          <h2 id="start-free-call">Run a useful free Search request.</h2>
          <p className="lede">The response includes the idempotency key to reuse for an exact replay.</p>
        </div>
        <pre className="code-block"><code>{quickStartCurl}</code></pre>
      </section>

      <section className="band band--ruled docs-body" aria-labelledby="start-clients">
        <div className="section-head">
          <p className="eyebrow">Published clients</p>
          <h2 id="start-clients">Choose the interface your agent already uses.</h2>
        </div>
        <div className="card-grid">
          <article className="panel"><div className="panel__body stack stack--tight"><h3>TypeScript</h3><code>npm install @clervo/sdk@{sdk?.version}</code><a href={sdk?.url}>npm package</a></div></article>
          <article className="panel"><div className="panel__body stack stack--tight"><h3>Python</h3><code>python -m pip install clervo-sdk=={python?.version}</code><a href={python?.url}>PyPI package</a></div></article>
          <article className="panel"><div className="panel__body stack stack--tight"><h3>MCP</h3><code>npx -y @clervo/mcp@{mcp?.version}</code><a href={mcp?.url}>npm package</a></div></article>
          <article className="panel"><div className="panel__body stack stack--tight"><h3>HTTP</h3><code>https://api.clervo.dev</code><Link to="/docs/http">HTTP guide</Link></div></article>
        </div>
      </section>

      <section className="band band--ruled docs-body" aria-labelledby="start-paid">
        <div className="section-head">
          <p className="eyebrow">Paid requests</p>
          <h2 id="start-paid">Inspect, approve, execute, and replay safely.</h2>
        </div>
        <ol className="claim-list">
          <li>Send the intended request with one idempotency key.</li>
          <li>Inspect the returned 402 resource, recipient, network, asset, amount, and expiry.</li>
          <li>Authorize only that bounded challenge.</li>
          <li>Reuse the same key and body to retrieve a completed result.</li>
          <li>If settlement is unknown, reconcile before any retry or new authorization.</li>
        </ol>
        <div className="cluster">
          <Link className="button button--primary" to="/docs/x402">Read the payment guide</Link>
          <Link className="button button--secondary" to="/docs/failures">Recovery actions</Link>
        </div>
      </section>
    </div>
  );
}
