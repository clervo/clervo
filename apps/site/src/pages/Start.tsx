import { useEffect } from 'react';

import { observedRoutes, publicStatus, type ExperiencePhase } from '../product';
import { Link } from '../router';

const packageByName = new Map(publicStatus.packages.items.map((item) => [item.name, item]));
const freeModel = observedRoutes.find(({ sellable, billingMode }) => sellable && billingMode === 'free')?.id;
const paidModel = observedRoutes.find(({ sellable, billingMode }) => sellable && billingMode === 'metered')?.id;
const claudeCommand = 'claude mcp add clervo -s user -- npx -y @clervo/mcp';

const firstAiCall = `curl -sS https://api.clervo.dev/v1/chat/completions \\
  -H 'content-type: application/json' \\
  -d '{"model":"${freeModel ?? 'clervo/laguna-s-2.1'}","messages":[{"role":"user","content":"Reply with ready."}],"max_completion_tokens":16}'`;

const paidBoundary = `curl -i https://api.clervo.dev/v1/chat/completions \\
  -H 'content-type: application/json' \\
  -H 'idempotency-key: replace-with-a-unique-key' \\
  -d '{"model":"${paidModel ?? 'clervo/allam-2-7b'}","messages":[{"role":"user","content":"Reply with ready."}],"max_completion_tokens":16}'`;

export function Start({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('qualified'), [onPhase]);

  const sdk = packageByName.get('@clervo/sdk');
  const mcp = packageByName.get('@clervo/mcp');
  const python = packageByName.get('clervo-sdk');

  return (
    <main className="commercial-page">
      <section className="commercial-page-lead shell" aria-labelledby="start-title">
        <p className="eyebrow">Start</p>
        <h1 id="start-title">Choose how you want<br />to use Clervo.</h1>
        <p className="lede">Make a free AI call against the hosted API, connect Claude through MCP, or install a client. No account, API key, or wallet is required to start.</p>
      </section>

      <section className="commercial-section shell" id="ai-call" aria-labelledby="first-ai-title">
        <div className="commercial-heading"><div><p className="eyebrow">Fastest path</p><h2 id="first-ai-title">Make your first AI call.</h2></div><span className="commercial-free-badge">Free model · no wallet</span></div>
        <pre className="code-block" tabIndex={0}><code>{firstAiCall}</code></pre>
        <p className="quiet">This calls the hosted production API at <code>https://api.clervo.dev</code>. The current free-model list lives at <a href="https://api.clervo.dev/v1/models">/v1/models</a>.</p>
      </section>

      <section className="commercial-section commercial-section--tint" aria-labelledby="start-clients">
        <div className="shell">
          <div className="commercial-heading"><div><p className="eyebrow">Choose your interface</p><h2 id="start-clients">Five supported ways to start.</h2></div></div>
          <div className="commercial-start-grid">
            <article className="commercial-start-card commercial-start-card--featured"><span>Claude / MCP</span><h3>Add Clervo to Claude Code</h3><pre tabIndex={0}><code>{claudeCommand}</code></pre><p>Restart or reconnect MCP, then ask Claude to list Clervo tools. Payment remains off by default.</p><div><Link className="text-link" to="/docs/mcp">MCP guide <span aria-hidden="true">→</span></Link><a className="text-link" href={mcp?.url}>npm v{mcp?.version}</a></div></article>
            <article className="commercial-start-card"><span>OpenAI-compatible app</span><h3>Use the hosted API</h3><pre tabIndex={0}><code>{'Base URL: https://api.clervo.dev/v1\nAPI key: not required'}</code></pre><p>Hosted Chat Completions, Responses, and Anthropic Messages are supported. Use the local Router proxy when an app needs wallet-backed automatic payment.</p><Link className="text-link" to="/docs/openai">Compatibility guide <span aria-hidden="true">→</span></Link></article>
            <article className="commercial-start-card"><span>CLI / Router</span><h3>Run from a terminal</h3><pre tabIndex={0}><code>{'npx -y @clervo/router search "current x402 documentation"'}</code></pre><p>The local proxy runs at <code>http://127.0.0.1:8402/v1</code>. That loopback address is not the hosted API.</p><Link className="text-link" to="/docs/cli">CLI and proxy guide <span aria-hidden="true">→</span></Link></article>
            <article className="commercial-start-card"><span>TypeScript</span><h3>Install the SDK</h3><pre tabIndex={0}><code>{`npm install @clervo/sdk@${sdk?.version}`}</code></pre><p>Use typed operations, explicit payment policy, receipts, and safe replay.</p><a className="text-link" href={sdk?.url}>npm package <span aria-hidden="true">→</span></a></article>
            <article className="commercial-start-card"><span>Python</span><h3>Install the SDK</h3><pre tabIndex={0}><code>{`python -m pip install clervo-sdk==${python?.version}`}</code></pre><p>Use the same public API and explicit payment boundary from Python.</p><a className="text-link" href={python?.url}>PyPI package <span aria-hidden="true">→</span></a></article>
          </div>
        </div>
      </section>

      <section className="commercial-section shell" aria-labelledby="paid-boundary-title">
        <p className="eyebrow">See payment before paying</p><h2 id="paid-boundary-title">Stop safely at the real 402 boundary.</h2>
        <p className="lede">Send a paid-model request without a payment header. Clervo returns the exact x402 requirement; nothing is charged and the model does not run.</p>
        <pre className="code-block" tabIndex={0}><code>{paidBoundary}</code></pre>
        <ol className="commercial-payment-steps"><li>Inspect the amount, USDC asset, Base network, recipient, and expiry.</li><li>Choose whether to approve it with a Clervo client.</li><li>Reuse the same idempotency key and body after authorization.</li><li>If settlement is ever unknown, reconcile before retrying.</li></ol>
        <div className="commercial-actions"><Link className="button button--primary" to="/docs/x402">Read the payment guide</Link><Link className="button button--secondary" to="/pricing">See prices</Link></div>
      </section>
    </main>
  );
}
