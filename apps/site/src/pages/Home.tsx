import { useState } from 'react';

import { HomeHero } from '../components/HomeHero';
import {
  lifecycleLabels,
  observedTruth,
  pillarLabels,
  publishedClients,
  quickStartCurl,
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
  search: 'Fresh source retrieval with citations and evidence.',
  ai: 'A qualified model catalog behind one request contract.',
  sandbox: 'Bounded code execution with isolated failure.',
  rpc: 'Chain access is currently unavailable on the public API.',
  prediction: 'Comparable market context with freshness and attribution.',
  crypto_intelligence: 'Wallet and on-chain signals with evidence attached.',
};

const familyOrder: ObservedProduct['id'][] = [
  'search', 'ai', 'sandbox', 'prediction', 'crypto_intelligence', 'rpc',
];

const observedAtLabel = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
}).format(new Date(observedTruth.provenance.observedAt));

export function Home({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [copied, setCopied] = useState(false);
  const liveFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live').length;

  const copyFreeCall = async () => {
    if (quickStartCurl === null) return;
    await navigator.clipboard.writeText(quickStartCurl);
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
          <h2 id="home-platform-title">The outcome stays coherent when the provider stack does not.</h2>
          <p className="lede">
            Ask for the job. Clervo discovers the capability, qualifies what can serve,
            holds the spend boundary, and returns the outcome in a common contract.
          </p>
        </div>
        <div className="shell home-capabilities">
          <p className="home-capabilities__status data">
            <span className="state state--live">{liveFamilies} serving</span>
            <time dateTime={observedTruth.provenance.observedAt}>{observedAtLabel} UTC</time>
          </p>
          <ul>
            {familyOrder.map((id, index) => {
              const product = observedTruth.products.find((candidate) => candidate.id === id);
              if (product === undefined) return null;
              return (
                <li key={product.id}>
                  <Link to={familyRoutes[product.id]}>
                    <span className="home-capability__index data">{String(index + 1).padStart(2, '0')}</span>
                    <span className="home-capability__body">
                      <strong>{pillarLabels[product.id]}</strong>
                      <small>{familyDescriptions[product.id]}</small>
                    </span>
                    <span className={`state state--${product.lifecycleState}`}>
                      {lifecycleLabels[product.lifecycleState]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="home-connect shell" aria-labelledby="home-connect-title">
        <div className="home-connect__copy">
          <p className="eyebrow">Free first. Wallet when needed.</p>
          <h2 id="home-connect-title">Start with the client your agent already speaks.</h2>
          <p className="lede">
            Router / CLI, MCP, TypeScript, Python, raw HTTP, and OpenAI-compatible
            clients converge on the same Clervo operating contract.
          </p>
          <div className="home-client-list" aria-label="Released clients">
            <Link to="/docs/cli"><strong>Router / CLI</strong><span>Command line</span></Link>
            {publishedClients.map((client) => (
              <Link to={`/docs/${client.id}`} key={client.id}>
                <strong>{client.label}</strong><span>v{client.version}</span>
              </Link>
            ))}
            <Link to="/docs/openai"><strong>OpenAI-compatible</strong><span>Existing clients</span></Link>
          </div>
          <div className="home-actions">
            <Link className="button button--primary" to="/docs/quickstart">Get a free first result</Link>
            <Link className="text-link" to="/docs">Read the docs <span aria-hidden="true">→</span></Link>
          </div>
        </div>

        <div className="home-free-call" aria-label="Free first Search request">
          <header>
            <span className="data">curl · observed public route</span>
            <button type="button" onClick={copyFreeCall} disabled={quickStartCurl === null}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </header>
          <pre tabIndex={0}><code>{quickStartCurl ?? 'No public free entry is currently observed.'}</code></pre>
          <footer>
            <span>Free Search entry</span>
            <span>Wallet not required</span>
          </footer>
        </div>
      </section>

      <section className="home-proof" aria-labelledby="home-proof-title">
        <div className="shell home-proof__layout">
          <div className="home-proof__copy">
            <p className="eyebrow">Proof is part of the result</p>
            <h2 id="home-proof-title">A successful response should explain itself.</h2>
            <p className="lede">
              Clervo keeps operation identity, evidence, provenance, settlement,
              and replay attached to the result—so an agent can inspect what happened next.
            </p>
            <Link className="text-link" to="/proof">Understand Clervo proof <span aria-hidden="true">→</span></Link>
          </div>
          <div className="home-receipt" aria-label="Verified outcome contract anatomy">
            <p className="home-receipt__status"><span>Verified outcome</span><strong>Receipt resolved</strong></p>
            <dl>
              <div><dt>Operation</dt><dd>Exact work identity</dd></div>
              <div><dt>Result</dt><dd>Returned outcome</dd></div>
              <div><dt>Evidence</dt><dd>Sources and provenance</dd></div>
              <div><dt>Settlement</dt><dd>Charge state and boundary</dd></div>
              <div><dt>Replay</dt><dd>Same request, same receipt</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="home-final shell" aria-labelledby="home-final-title">
        <p className="eyebrow">One useful result is enough to begin.</p>
        <h2 id="home-final-title">Give Clervo the next bounded task.</h2>
        <div className="home-actions">
          <Link className="button button--primary" to="/start">Set up Clervo</Link>
          <Link className="button button--quiet" to="/catalog">Find an AI model</Link>
        </div>
      </section>
    </div>
  );
}
