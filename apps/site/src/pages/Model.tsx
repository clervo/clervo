import { useEffect } from 'react';

import { CodeBlock } from '../components/CodeBlock';
import {
  aiModels,
  capabilityName,
  modelExample,
  modelPath,
  modelPriceLines,
  type AiModel,
} from '../models';
import type { ExperiencePhase } from '../product';
import { Link } from '../router';
import '../styles/b12/models.css';

function Creator({ model }: { model: AiModel }) {
  if (model.identityKind === 'alias') return <span>Clervo routing profile</span>;
  if (model.creator === null) return <span>Creator not yet reviewed</span>;
  return (
    <a className="model-creator" href={model.creator.officialUrl} rel="noreferrer">
      {model.creator.logoAsset === null ? null : (
        <img src={model.creator.logoAsset} alt="" aria-hidden="true" />
      )}
      <span>{model.creator.name}</span>
    </a>
  );
}

export function ModelPage({ model, onPhase }: { model: AiModel; onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase(model.publicSellable ? 'qualified' : 'risk'), [model.publicSellable, onPhase]);
  const target = model.aliasFor === null ? null : aiModels.find(({ id }) => id === model.aliasFor) ?? null;
  const related = aiModels
    .filter((candidate) => candidate.id !== model.id && (
      model.creator !== null && candidate.creator?.id === model.creator.id
      || candidate.productIds.some((id) => model.productIds.includes(id))
    ))
    .slice(0, 6);
  const priceLines = modelPriceLines(model);
  const canonicalUrl = `https://clervo.dev${modelPath(model)}/`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: model.name,
    alternateName: model.id,
    url: canonicalUrl,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web API',
    description: model.description,
    provider: { '@type': 'Organization', name: 'Clervo', url: 'https://clervo.dev/' },
    ...(model.creator === null ? {} : {
      author: { '@type': 'Organization', name: model.creator.name, url: model.creator.officialUrl },
    }),
    offers: {
      '@type': 'Offer',
      availability: model.publicSellable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      priceCurrency: 'USD',
      description: `${priceLines.join('; ')}. A live request-bound quote is authoritative before paid execution.`,
    },
  };

  return (
    <div className="model-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="model-hero shell" aria-labelledby="model-title">
        <div className="model-breadcrumbs"><Link to="/catalog">Models</Link><span>/</span><span>{model.name}</span></div>
        <div className="model-hero-grid">
          <div>
            <p className="s4-eyebrow">{model.identityKind === 'alias' ? 'Clervo routing profile' : 'Canonical model'}</p>
            <h1 id="model-title">{model.name}</h1>
            <p className="model-description">{model.description}</p>
            <div className="model-id-line"><span>Clervo ID</span><code>{model.id}</code></div>
          </div>
          <dl className="model-summary">
            <div><dt>Creator</dt><dd><Creator model={model} /></dd></div>
            <div><dt>Availability</dt><dd>{model.availability}</dd></div>
            <div><dt>Health</dt><dd>{model.health}</dd></div>
            <div><dt>Sellable now</dt><dd>{model.publicSellable ? 'Yes' : 'No'}</dd></div>
          </dl>
        </div>
        {target === null ? null : (
          <p className="model-alias-note">
            This is a stable Clervo routing profile, not a proprietary model. It currently resolves to{' '}
            <Link to={modelPath(target)}>{target.name}</Link> with {model.reasoningEffort ?? 'published'} reasoning effort.
          </p>
        )}
      </section>

      <section className="model-band shell" aria-labelledby="model-contract-title">
        <div className="model-section-head"><p className="s4-kicker">Current contract</p><h2 id="model-contract-title">Identity, capability, and commerce stay together.</h2></div>
        <div className="model-contract-grid">
          <article>
            <h3>What it accepts</h3>
            <ul>{model.inputTypes.map((type) => <li key={type}>{capabilityName(type)}</li>)}</ul>
          </article>
          <article>
            <h3>What it returns</h3>
            <ul>{model.outputTypes.map((type) => <li key={type}>{capabilityName(type)}</li>)}</ul>
          </article>
          <article>
            <h3>Capabilities</h3>
            <ul>{model.capabilities.map((capability) => <li key={capability}>{capabilityName(capability)}</li>)}</ul>
          </article>
          <article>
            <h3>Execution</h3>
            <p><code>{model.executionPath}</code></p>
            <p>{model.replaySafe ? 'Replay-safe with the original idempotency key.' : 'Replay safety is not published.'}</p>
          </article>
        </div>
      </section>

      <section className="model-band shell" aria-labelledby="model-price-title">
        <div className="model-section-head"><p className="s4-kicker">Published pricing</p><h2 id="model-price-title">Rates describe usage. The live quote binds the request.</h2></div>
        <div className="model-price-grid">
          <ul>{priceLines.map((line) => <li key={line}>{line}</li>)}</ul>
          <p>
            Billing mode: <strong>{model.billingMode}</strong>. Payment: <strong>{model.payment.replaceAll('_', ' ')}</strong>.
            For a paid call, inspect the exact request-bound challenge before authorizing it. Internal serving suppliers are not publicly disclosed.
          </p>
        </div>
        {model.publicationBlockers.length === 0 ? null : (
          <div className="model-blocked" role="status"><strong>Unavailable</strong><span>{model.publicationBlockers.map(capabilityName).join('; ')}</span></div>
        )}
      </section>

      <section className="model-band shell" aria-labelledby="model-example-title">
        <div className="model-section-head"><p className="s4-kicker">B11 TypeScript client</p><h2 id="model-example-title">Use the exact model ID.</h2></div>
        <CodeBlock label={`${model.name} · TypeScript`} code={modelExample(model)} />
        <p className="model-example-note">Automatic payment remains off unless explicitly enabled. Reuse the same idempotency key to recover or replay; reconcile unknown settlement before retrying.</p>
      </section>

      <section className="model-band shell" aria-labelledby="model-related-title">
        <div className="model-section-head"><p className="s4-kicker">Related inventory</p><h2 id="model-related-title">Compare exact identities, not labels.</h2></div>
        <div className="model-related">
          {related.map((candidate) => (
            <Link key={candidate.id} to={modelPath(candidate)}>
              <strong>{candidate.name}</strong>
              <code>{candidate.id}</code>
              <span>{candidate.identityKind === 'alias' ? 'Routing profile' : candidate.creator?.name ?? 'Creator unreviewed'}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
