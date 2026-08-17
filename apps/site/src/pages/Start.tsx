import { useEffect, useState } from 'react';

import { observedRoutes, publicStatus, type ExperiencePhase } from '../product';
import { Link } from '../router';

const packageByName = new Map(publicStatus.packages.items.map((item) => [item.name, item]));
const freeModel = observedRoutes.find(({ sellable, billingMode }) => sellable && billingMode === 'free')?.id;
const paidModel = observedRoutes.find(({ sellable, billingMode }) => sellable && billingMode === 'metered')?.id;
const claudeCommand = 'claude mcp add clervo -s user -- npx -y @clervo/mcp';
const agentInstruction = 'Set up https://clervo.dev/skill.md';

const firstAiCall = `curl -sS https://api.clervo.dev/v1/chat/completions \\
  -H 'content-type: application/json' \\
  -d '{"model":"${freeModel ?? 'clervo/laguna-s-2.1'}","messages":[{"role":"user","content":"Reply with ready."}],"max_completion_tokens":16}'`;

const paidBoundary = `curl -i https://api.clervo.dev/v1/chat/completions \\
  -H 'content-type: application/json' \\
  -H 'idempotency-key: replace-with-a-unique-key' \\
  -d '{"model":"${paidModel ?? 'clervo/allam-2-7b'}","messages":[{"role":"user","content":"Reply with ready."}],"max_completion_tokens":16}'`;

export function Start({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [copied, setCopied] = useState<'skill' | 'ai' | null>(null);
  useEffect(() => onPhase('qualified'), [onPhase]);

  const sdk = packageByName.get('@clervo/sdk');
  const mcp = packageByName.get('@clervo/mcp');
  const python = packageByName.get('clervo-sdk');

  const copy = async (kind: 'skill' | 'ai', value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="start-page">
      <section className="start-hero" aria-labelledby="start-title">
        <div className="shell start-hero__layout">
          <div className="start-hero__copy">
            <p className="eyebrow">Start</p>
            <h1 id="start-title">Give Clervo<br />to your agent.</h1>
            <p className="lede">Use the canonical setup instruction, make a useful free call, and add payment authority only when the task needs paid work.</p>
            <div className="start-hero__facts"><span>No account</span><span>No API key</span><span>No wallet to start</span></div>
          </div>

          <div className="start-instruction" aria-label="Canonical Clervo agent instruction">
            <header><span className="data">Recommended · agent setup</span><button type="button" onClick={() => copy('skill', agentInstruction)}>{copied === 'skill' ? 'Copied' : 'Copy'}</button></header>
            <div className="start-instruction__command"><span aria-hidden="true">›</span><code>{agentInstruction}</code></div>
            <div className="start-instruction__flow">
              <div><span>01</span><strong>Discover</strong><small>Read current machine truth.</small></div>
              <div><span>02</span><strong>Connect</strong><small>Select a supported interface.</small></div>
              <div><span>03</span><strong>Run free</strong><small>Use a free model where available.</small></div>
              <div><span>04</span><strong>Approve</strong><small>Opt into bounded paid work.</small></div>
            </div>
            <footer><a href="/skill.md">skill.md ↗</a><a href="https://clervo.dev/agents.txt">agents.txt ↗</a><a href="/.well-known/clervo.json">discovery ↗</a></footer>
          </div>
        </div>
      </section>

      <section className="start-free" id="ai-call" aria-labelledby="first-ai-title">
        <div className="shell start-free__layout">
          <div className="start-free__copy"><p className="eyebrow">First useful result</p><h2 id="first-ai-title">Run a free model against the hosted API.</h2><p className="lede">This calls <code>https://api.clervo.dev</code>. It does not use the local Router proxy and requires no provider API key or wallet.</p><a className="text-link" href="https://api.clervo.dev/v1/models">Inspect current models <span aria-hidden="true">↗</span></a></div>
          <div className="start-code"><header><span>bash · hosted production API</span><button type="button" onClick={() => copy('ai', firstAiCall)}>{copied === 'ai' ? 'Copied' : 'Copy'}</button></header><pre tabIndex={0}><code>{firstAiCall}</code></pre><footer><span className="start-code__ready">Free model</span><span>no wallet</span></footer></div>
        </div>
      </section>

      <section className="start-interfaces" aria-labelledby="start-clients">
        <div className="shell">
          <div className="start-section-head"><div><p className="eyebrow">Choose your interface</p><h2 id="start-clients">One service.<br />Six entry points.</h2></div><p>Every path reaches current Clervo product truth. The hosted API and local Router proxy are intentionally distinct.</p></div>
          <div className="start-interface-ledger">
            <article data-interface="mcp"><span>01 / Claude</span><h3>MCP</h3><p>Add Clervo tools to Claude Code. Payment remains off by default.</p><code>{claudeCommand}</code><div><Link to="/docs/mcp">MCP guide →</Link><a href={mcp?.url}>npm v{mcp?.version} ↗</a></div></article>
            <article data-interface="hosted"><span>02 / Compatible apps</span><h3>Hosted API</h3><p>Use Chat Completions, Responses, or Anthropic Messages.</p><code>https://api.clervo.dev/v1</code><Link to="/docs/openai">Compatibility guide →</Link></article>
            <article data-interface="router"><span>03 / Terminal</span><h3>Router / CLI</h3><p>Use local wallet limits, receipts, and automatic payment policy.</p><code>http://127.0.0.1:8402/v1</code><Link to="/docs/cli">CLI and proxy guide →</Link></article>
            <article data-interface="typescript"><span>04 / SDK</span><h3>TypeScript</h3><p>Typed operations, explicit payment policy, receipts, and safe replay.</p><code>npm i @clervo/sdk@{sdk?.version}</code><a href={sdk?.url}>npm package ↗</a></article>
            <article data-interface="python"><span>05 / SDK</span><h3>Python</h3><p>The same public API and explicit payment boundary from Python.</p><code>pip install clervo-sdk=={python?.version}</code><a href={python?.url}>PyPI package ↗</a></article>
            <article data-interface="http"><span>06 / Contract</span><h3>Raw HTTP</h3><p>Integrate directly from the generated OpenAPI and discovery surfaces.</p><code>https://api.clervo.dev</code><Link to="/docs/http">HTTP guide →</Link></article>
          </div>
        </div>
      </section>

      <section className="start-payment" aria-labelledby="paid-boundary-title">
        <div className="shell start-payment__layout">
          <div className="start-payment__copy"><p className="eyebrow">Paid only when needed</p><h2 id="paid-boundary-title">Stop at the quote. Decide with the exact maximum in view.</h2><p className="lede">Send a paid operation request—including a Multi-chain RPC read—without a payment header. Clervo returns HTTP 402; nothing is charged and the operation does not run.</p><div><Link className="button button--primary" to="/docs/x402">Read the payment guide</Link><Link className="button button--secondary" to="/pricing">See prices</Link></div></div>
          <div className="start-payment__contract"><pre tabIndex={0}><code>{paidBoundary}</code></pre><ol><li><span>Request</span><strong>One body · one idempotency key</strong></li><li><span>Quote</span><strong>USDC · Base · recipient · expiry · maximum</strong></li><li><span>Approval</span><strong>Explicit client policy required</strong></li><li><span>Replay</span><strong>Completed result · no second payment</strong></li></ol></div>
        </div>
      </section>
    </div>
  );
}
