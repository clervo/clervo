import { useEffect } from 'react';

import { discovery, observedRoutes, type ExperiencePhase } from '../product';
import { Link } from '../router';

const sellableModels = observedRoutes.filter(({ sellable }) => sellable).length;
const freeModels = observedRoutes.filter(({ sellable, billingMode }) => sellable && billingMode === 'free').length;

export function HomeHero({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('qualified'), [onPhase]);

  return (
    <section className="commercial-hero" aria-labelledby="home-title">
      <div className="shell commercial-hero__layout">
        <div className="commercial-hero__copy">
          <p className="eyebrow">AI and agent tools, paid per call</p>
          <h1 id="home-title">One wallet.<br />AI and tools on demand.</h1>
          <p className="lede">{discovery.description}</p>
          <div className="commercial-actions">
            <Link className="button button--primary" to="/start#ai-call">Make your first AI call</Link>
            <Link className="button button--secondary" to="/product">Browse live products</Link>
          </div>
          <p className="commercial-hero__safety">Automatic payment is off by default. Every paid call shows its maximum price before execution.</p>
        </div>

        <aside className="commercial-hero__card" aria-label="Clervo at a glance">
          <span className="commercial-hero__card-kicker">Available now</span>
          <dl>
            <div><dt>AI models</dt><dd>{sellableModels}</dd></div>
            <div><dt>Free AI models</dt><dd>{freeModels}</dd></div>
            <div><dt>API origin</dt><dd><code>api.clervo.dev</code></dd></div>
            <div><dt>Payment</dt><dd>x402 · USDC</dd></div>
          </dl>
          <Link className="text-link" to="/catalog">Explore the live model list <span aria-hidden="true">→</span></Link>
        </aside>
      </div>
    </section>
  );
}
