import { useEffect, useMemo, useState } from 'react';

import { ModeBadge } from '../components/Navigation';
import { familyProfiles } from '../content';
import { discovery, type ExperiencePhase } from '../product';
import { Link } from '../router';

export function Catalog({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [query, setQuery] = useState('');
  const [lifecycle, setLifecycle] = useState<'all' | 'preview' | 'unavailable'>('all');
  useEffect(() => onPhase('qualified'), [onPhase]);

  const operations = useMemo(() => discovery.products.filter((product) => {
    const matchesQuery = `${product.title} ${product.summary} ${product.operationId}`.toLowerCase().includes(query.toLowerCase().trim());
    const matchesLifecycle = lifecycle === 'all' || product.lifecycle === lifecycle;
    return matchesQuery && matchesLifecycle;
  }), [lifecycle, query]);

  return (
    <section className="authority-page catalog-page">
      <header className="authority-intro">
        <ModeBadge>Catalog fixture · lifecycle truth preserved</ModeBadge>
        <p className="eyebrow">Catalog / find a qualified route</p>
        <h1>Describe the outcome.<br />Inspect the contract.</h1>
        <p>Search the current distribution candidate and the permanent six-family platform. Preview is inspectable, not publicly callable.</p>
      </header>

      <section className="catalog-search" aria-label="Catalog search and filters">
        <label>
          <span>What should the agent accomplish?</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Research a claim, run code, inspect a chain…" />
        </label>
        <label>
          <span>Lifecycle</span>
          <select value={lifecycle} onChange={(event) => setLifecycle(event.target.value as typeof lifecycle)}>
            <option value="all">All current states</option>
            <option value="preview">Preview</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </section>

      <section className="authority-section">
        <header><p className="eyebrow">Permanent platform</p><h2>Six families. One outcome layer.</h2></header>
        <div className="family-grid">
          {familyProfiles.map((family, index) => {
            const pillar = discovery.releaseScope.pillars.find((item) => item.pillarId === family.id);
            return (
              <Link className="family-card" key={family.id} to={`/capabilities/${family.slug}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{family.title}</h3>
                <p>{family.promise}</p>
                <footer><b className={`state state--${pillar?.lifecycle ?? 'unavailable'}`}>{pillar?.lifecycle ?? 'unavailable'}</b><small>View family →</small></footer>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="authority-section">
        <header><p className="eyebrow">Projected operation contracts</p><h2>{operations.length} matching operation{operations.length === 1 ? '' : 's'}.</h2></header>
        <div className="catalog-operation-list">
          {operations.map((product) => (
            <article key={product.productId}>
              <div><code>{product.operationId}</code><b className={`state state--${product.lifecycle}`}>{product.lifecycle}</b></div>
              <h3>{product.title}</h3>
              <p>{product.summary}</p>
              <dl>
                <div><dt>Delivery</dt><dd>{product.deliveryModes.join(', ')}</dd></div>
                <div><dt>Public callable</dt><dd>no</dd></div>
                <div><dt>Payment</dt><dd>fixture only</dd></div>
              </dl>
              <Link className="liquid-capsule liquid-capsule--secondary" to={`/operations/${product.operationId}`}>Inspect operation</Link>
            </article>
          ))}
          {operations.length === 0 ? <p className="empty-state">No current operation contract matches this filter. The family architecture remains visible above.</p> : null}
        </div>
      </section>
    </section>
  );
}
