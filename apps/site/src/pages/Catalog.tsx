import { useEffect, useMemo, useState } from 'react';

import {
  capabilityLabel,
  familyOf,
  formatUsdc,
  lifecycleLabels,
  observedRoutes,
  observedTruth,
  proofLabels,
  supplyFamilyLabel,
  type ExperiencePhase,
  type LifecycleState,
  type ProofLevel,
} from '../product';
import { Link } from '../router';
import '../styles/b12/product-catalog.css';
import { FAMILY_DISPLAY, FAMILY_ORDER, FAMILY_ROUTE, type Slice4FamilyId } from './b12Slice4';

type LifecycleFilter = 'all' | LifecycleState;
type ProofFilter = 'all' | ProofLevel;
type FamilyFilter = 'all' | Slice4FamilyId;

const lifecycleOptions: Array<{ value: LifecycleFilter; label: string }> = [
  { value: 'all', label: 'All lifecycle states' },
  { value: 'live', label: 'Live' },
  { value: 'supply_paused', label: 'Supply paused' },
  { value: 'unavailable', label: 'Unavailable' },
];
const proofOptions: Array<{ value: ProofFilter; label: string }> = [
  { value: 'all', label: 'Any proof level' },
  { value: 'none', label: 'Nothing demonstrated' },
  { value: 'quote_observed_unpaid', label: 'Quote observed, unpaid' },
  { value: 'paid_outcome_verified', label: 'Paid outcome verified' },
  { value: 'externally_repeated', label: 'Externally repeated' },
];

function routeFamily(routeProductIds: string[]): Slice4FamilyId | null {
  for (const id of routeProductIds) {
    try { return familyOf(id) as Slice4FamilyId; } catch { /* continue */ }
  }
  return null;
}

export function Catalog({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<FamilyFilter>('all');
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('all');
  const [proof, setProof] = useState<ProofFilter>('all');
  useEffect(() => onPhase('qualified'), [onPhase]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return observedRoutes.filter((route) => {
      const familyId = routeFamily(route.productIds);
      if (family !== 'all' && familyId !== family) return false;
      if (lifecycle !== 'all' && route.lifecycleState !== lifecycle) return false;
      if (proof !== 'all' && route.proofLevel !== proof) return false;
      if (normalized === '') return true;
      const haystack = [
        route.id,
        route.routeId,
        route.route,
        supplyFamilyLabel(route.supplyFamilyId),
        familyId === null ? '' : FAMILY_DISPLAY[familyId],
        ...route.productIds,
        ...route.capabilities.map(capabilityLabel),
      ].join(' ').toLowerCase();
      return normalized.split(/\s+/u).every((term) => haystack.includes(term));
    });
  }, [family, lifecycle, proof, query]);

  const reset = () => { setQuery(''); setFamily('all'); setLifecycle('all'); setProof('all'); };
  const showResults = () => document.getElementById('s4-catalog-results')?.scrollIntoView({ block: 'start' });

  return (
    <div className="b12-slice4 b12-catalog">
      <section className="s4-catalog-hero shell" aria-labelledby="s4-catalog-title">
        <p className="s4-eyebrow">Observed capability catalog</p>
        <h1 id="s4-catalog-title">What does your agent need to do?</h1>
        <p className="s4-lede">
          Describe the outcome. Clervo searches the canonical observed catalog and keeps lifecycle,
          proof, price boundary, capabilities, and current route identity beside the action.
        </p>

        <div className="s4-search-stage">
          <div className="s4-search-main">
            <span className="s4-search-icon" aria-hidden="true">⌕</span>
            <label className="sr-only" htmlFor="s4-catalog-search">Search observed catalog</label>
            <input
              id="s4-catalog-search"
              data-slice4-search
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') showResults(); }}
              placeholder="Research a company, run code safely, inspect a wallet…"
            />
            <button className="b12-button b12-button-primary b12-liquid" type="button" onClick={showResults}>Search catalog</button>
          </div>
          <div className="s4-search-presets" aria-label="Example searches">
            {['research sources', 'code sandbox', 'multi-chain', 'wallet risk', 'prediction'].map((preset) => (
              <button key={preset} type="button" onClick={() => setQuery(preset)}>{preset}</button>
            ))}
          </div>
        </div>

        <div className="s4-catalog-meta">
          <div className="s4-catalog-stamp">
            <span>Canonical observed snapshot</span>
            <span>{observedTruth.provenance.observedAt}</span>
            <strong>{observedRoutes.length} observed {observedRoutes.length === 1 ? 'route' : 'routes'}</strong>
          </div>
          <div className="s4-legend" aria-label="Lifecycle legend">
            <span className="live"><i />Live</span>
            <span className="paused"><i />Supply paused</span>
            <span className="unavailable"><i />Unavailable</span>
          </div>
        </div>
      </section>

      <section className="s4-catalog-area shell" aria-labelledby="s4-catalog-results">
        <div className="s4-catalog-layout">
          <aside className="s4-filter-rail" aria-label="Catalog filters">
            <div className="s4-filter-group">
              <label htmlFor="s4-family-filter">Family</label>
              <select id="s4-family-filter" value={family} onChange={(event) => setFamily(event.currentTarget.value as FamilyFilter)}>
                <option value="all">All families</option>
                {FAMILY_ORDER.map((id) => <option key={id} value={id}>{FAMILY_DISPLAY[id]}</option>)}
              </select>
            </div>
            <div className="s4-filter-group">
              <label htmlFor="s4-lifecycle-filter">Lifecycle</label>
              <select id="s4-lifecycle-filter" value={lifecycle} onChange={(event) => setLifecycle(event.currentTarget.value as LifecycleFilter)}>
                {lifecycleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="s4-filter-group">
              <label htmlFor="s4-proof-filter">Proof</label>
              <select id="s4-proof-filter" value={proof} onChange={(event) => setProof(event.currentTarget.value as ProofFilter)}>
                {proofOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="s4-filter-boundary">
              <span>Not bound</span>
              <p>Latency, action class, interface compatibility, quote behavior, and provider availability are not exposed as filters without canonical fields.</p>
            </div>
            <button className="s4-reset" type="button" onClick={reset}>Reset all filters</button>
          </aside>

          <div className="s4-catalog-results">
            <div className="s4-catalog-head">
              <h2 id="s4-catalog-results">Matching operations</h2>
              <span aria-live="polite">{filtered.length} of {observedRoutes.length} observed</span>
            </div>

            {filtered.length === 0 ? (
              <div className="s4-empty"><h3>No matching observed route.</h3><p>The current canonical observation does not contain a route matching this query and filter set. No replacement is invented.</p><button className="b12-button b12-button-secondary b12-liquid" type="button" onClick={reset}>Reset search and filters</button></div>
            ) : (
              <div className="s4-operation-list">
                {filtered.map((route) => {
                  const familyId = routeFamily(route.productIds);
                  return (
                    <article className="s4-operation-card" key={route.routeId} data-lifecycle={route.lifecycleState}>
                      <div className="s4-op-title">
                        <div className="s4-op-top"><span className={`s4-lifecycle ${route.lifecycleState}`}><i />{lifecycleLabels[route.lifecycleState]}</span><span className="s4-live-label">Observed</span></div>
                        <h3>{route.id}</h3>
                        <code>{route.route}</code>
                      </div>
                      <div className="s4-op-description">
                        <p>{familyId === null ? 'Observed route' : FAMILY_DISPLAY[familyId]} · {route.capabilities.map(capabilityLabel).join(' · ') || 'No capability tags observed'}</p>
                        <div className="s4-op-meta">
                          <div><small>Maximum charge</small><strong>{route.observedPrice === null ? 'not quoted' : formatUsdc(route.observedPrice.amountAtomic, route.observedPrice.decimals)}</strong></div>
                          <div><small>Proof</small><strong className={route.proofLevel === 'paid_outcome_verified' || route.proofLevel === 'externally_repeated' ? 'proof-word' : undefined}>{proofLabels[route.proofLevel]}</strong></div>
                          <div><small>Supply</small><strong>{supplyFamilyLabel(route.supplyFamilyId)}</strong></div>
                        </div>
                        <div className="s4-proof-flags"><span>{route.productIds.length} operation {route.productIds.length === 1 ? 'identity' : 'identities'}</span><span>{route.sellable ? 'registry sellable' : 'not sellable'}</span>{route.reason === null ? null : <span>{route.reason.replaceAll('_', ' ')}</span>}</div>
                      </div>
                      <div className="s4-op-action">
                        {familyId === null ? <span className="s4-unresolved">Family unresolved</span> : <Link className="b12-button b12-button-secondary b12-liquid" to={`/products/${FAMILY_ROUTE[familyId]}`}>Open family</Link>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <nav className="s4-family-strip" aria-label="Permanent product families">
          {FAMILY_ORDER.map((id) => <Link key={id} to={`/products/${FAMILY_ROUTE[id]}`}><span>{FAMILY_DISPLAY[id]}</span><small>{lifecycleLabels[observedTruth.products.find((product) => product.id === id)!.lifecycleState]}</small></Link>)}
        </nav>
      </section>
    </div>
  );
}
