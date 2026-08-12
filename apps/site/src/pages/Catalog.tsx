import { useEffect, useMemo } from 'react';

import {
  aiModels,
  aliasModelCount,
  canonicalModelCount,
  capabilityName,
  creatorIdentities,
  modelPath,
  modelPriceLines,
  sellableModelCount,
  type AiModel,
} from '../models';
import { attributionLabel, discovery, familyOf, formatUsdc, lifecycleLabels, observedTruth, type ExperiencePhase } from '../product';
import { Link, useRouter } from '../router';
import '../styles/b12/product-catalog.css';
import { FAMILY_DISPLAY, FAMILY_ORDER, FAMILY_ROUTE } from './b12Slice4';

type FilterKey = 'q' | 'creator' | 'modality' | 'state' | 'kind';

const modalityOptions = [
  ['all', 'All modalities'],
  ['chat', 'Chat'],
  ['embed', 'Embedding'],
  ['image', 'Image'],
  ['speech', 'Speech'],
  ['video', 'Video'],
  ['music', 'Music'],
  ['virtual_try_on', 'Virtual try-on'],
] as const;

function modality(model: AiModel): string {
  return model.productIds[0]?.replace(/^ai\./u, '') ?? 'unknown';
}

function creatorLabel(model: AiModel): string {
  if (model.identityKind === 'alias') return 'Clervo routing profile';
  return model.creator?.name ?? 'Creator not yet reviewed';
}

export function Catalog({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const { location, navigate } = useRouter();
  useEffect(() => onPhase('qualified'), [onPhase]);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const query = params.get('q') ?? '';
  const creator = params.get('creator') ?? 'all';
  const selectedModality = params.get('modality') ?? 'all';
  const state = params.get('state') ?? 'all';
  const kind = params.get('kind') ?? 'all';

  const update = (key: FilterKey, value: string) => {
    const next = new URLSearchParams(location.search);
    if (value === '' || value === 'all') next.delete(key);
    else next.set(key, value);
    const search = next.toString();
    navigate(`/catalog${search === '' ? '' : `?${search}`}`);
  };
  const reset = () => navigate('/catalog');

  const filtered = aiModels.filter((model) => {
    if (creator !== 'all' && model.creator?.id !== creator) return false;
    if (selectedModality !== 'all' && modality(model) !== selectedModality) return false;
    if (state === 'live' && (!model.publicSellable || model.availability !== 'available')) return false;
    if (state === 'paused' && model.publicSellable) return false;
    if (kind !== 'all' && model.identityKind !== kind) return false;
    const normalized = query.trim().toLowerCase();
    if (normalized === '') return true;
    return [
      model.name,
      model.id,
      creatorLabel(model),
      ...model.productIds,
      ...model.capabilities,
    ].join(' ').toLowerCase().includes(normalized);
  });

  const usedCreators = creatorIdentities.filter(({ id }) => aiModels.some((model) => model.creator?.id === id));

  return (
    <div className="b12-slice4 b12-catalog model-catalog">
      <section className="s4-catalog-hero shell" aria-labelledby="s4-catalog-title">
        <p className="s4-eyebrow">Canonical AI model catalog</p>
        <h1 id="s4-catalog-title">Choose the exact model.</h1>
        <p className="s4-lede">
          Search every current Clervo model by human name, creator, modality, and state.
          Canonical identities stay pinned; Clervo routing profiles are labelled separately.
        </p>

        <div className="s4-search-stage">
          <div className="s4-search-main">
            <span className="s4-search-icon" aria-hidden="true">⌕</span>
            <label className="sr-only" htmlFor="s4-catalog-search">Search models</label>
            <input
              id="s4-catalog-search"
              value={query}
              onChange={(event) => update('q', event.currentTarget.value)}
              placeholder="Claude, GPT, Gemini, Llama, DeepSeek, Qwen…"
              type="search"
            />
            <button className="b12-button b12-button-primary b12-liquid" type="button" onClick={() => document.getElementById('s4-catalog-results')?.scrollIntoView({ block: 'start' })}>Show models</button>
          </div>
          <div className="s4-search-presets" aria-label="Popular model families">
            {['Claude', 'GPT', 'Gemini', 'Llama', 'DeepSeek', 'Qwen'].map((preset) => (
              <button key={preset} type="button" onClick={() => update('q', preset)}>{preset}</button>
            ))}
          </div>
        </div>

        <div className="s4-catalog-meta">
          <div className="s4-catalog-stamp">
            <span>Generated from the current catalog</span>
            <span>{observedTruth.provenance.observedAt}</span>
            <strong>{aiModels.length} callable IDs · {sellableModelCount} sellable</strong>
          </div>
          <div className="s4-legend" aria-label="Identity legend">
            <span className="live"><i />{canonicalModelCount} canonical</span>
            <span className="paused"><i />{aliasModelCount} routing profiles</span>
          </div>
        </div>
      </section>

      <section className="s4-catalog-area shell" aria-labelledby="s4-catalog-results">
        <div className="s4-catalog-layout">
          <aside className="s4-filter-rail" aria-label="Model filters">
            <div className="s4-filter-group">
              <label htmlFor="model-creator-filter">Creator</label>
              <select id="model-creator-filter" value={creator} onChange={(event) => update('creator', event.currentTarget.value)}>
                <option value="all">All reviewed creators</option>
                {usedCreators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="s4-filter-group">
              <label htmlFor="model-modality-filter">Modality</label>
              <select id="model-modality-filter" value={selectedModality} onChange={(event) => update('modality', event.currentTarget.value)}>
                {modalityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="s4-filter-group">
              <label htmlFor="model-state-filter">Availability</label>
              <select id="model-state-filter" value={state} onChange={(event) => update('state', event.currentTarget.value)}>
                <option value="all">Every current state</option>
                <option value="live">Available and sellable</option>
                <option value="paused">Paused or blocked</option>
              </select>
            </div>
            <div className="s4-filter-group">
              <label htmlFor="model-kind-filter">Identity</label>
              <select id="model-kind-filter" value={kind} onChange={(event) => update('kind', event.currentTarget.value)}>
                <option value="all">Canonical and profiles</option>
                <option value="canonical">Canonical only</option>
                <option value="alias">Routing profiles only</option>
              </select>
            </div>
            <div className="s4-filter-boundary">
              <span>Creator ≠ supplier</span>
              <p>Creator identity is reviewed separately from the execution route. Internal suppliers are not inferred or exposed by this page.</p>
            </div>
            <button className="s4-reset" type="button" onClick={reset}>Reset all filters</button>
          </aside>

          <div className="s4-catalog-results">
            <div className="s4-catalog-head">
              <h2 id="s4-catalog-results">Matching models</h2>
              <span aria-live="polite">{filtered.length} of {aiModels.length}</span>
            </div>

            {filtered.length === 0 ? (
              <div className="s4-empty"><h3>No model matches these filters.</h3><p>The current canonical catalog has no matching identity. No substitute is invented.</p><button className="b12-button b12-button-secondary b12-liquid" type="button" onClick={reset}>Reset filters</button></div>
            ) : (
              <div className="s4-operation-list model-list">
                {filtered.map((model) => {
                  const price = modelPriceLines(model)[0];
                  return (
                    <article className="s4-operation-card model-card" key={model.id} data-lifecycle={model.publicSellable ? 'live' : 'supply_paused'}>
                      <div className="s4-op-title">
                        <div className="s4-op-top"><span className={`s4-lifecycle ${model.publicSellable ? 'live' : 'supply_paused'}`}><i />{model.publicSellable ? 'Available' : 'Paused'}</span><span className="s4-live-label">{model.identityKind === 'alias' ? 'Routing profile' : 'Canonical'}</span></div>
                        <h3>{model.name}</h3>
                        <code>{model.id}</code>
                      </div>
                      <div className="s4-op-description">
                        <p className="model-card-creator">{creatorLabel(model)}</p>
                        <div className="s4-op-meta">
                          <div><small>Modality</small><strong>{capabilityName(modality(model))}</strong></div>
                          <div><small>Published rate</small><strong>{price}</strong></div>
                          <div><small>Health</small><strong>{model.health}</strong></div>
                        </div>
                        <div className="s4-proof-flags">{model.capabilities.slice(0, 4).map((capability) => <span key={capability}>{capabilityName(capability)}</span>)}</div>
                      </div>
                      <div className="s4-op-action"><Link className="b12-button b12-button-secondary b12-liquid" to={modelPath(model)}>Model details</Link></div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="s4-catalog-head family-catalog-head"><h2>All six product families</h2><span>Models are one part of Clervo</span></div>
        <nav className="s4-family-strip" aria-label="Product families">
          {FAMILY_ORDER.map((id) => {
            const product = observedTruth.products.find((item) => item.id === id)!;
            return <Link key={id} to={`/products/${FAMILY_ROUTE[id]}`}><span>{FAMILY_DISPLAY[id]}</span><small>{lifecycleLabels[product.lifecycleState]}</small></Link>;
          })}
        </nav>

        <section className="s4-family-contracts" aria-labelledby="s4-family-contracts-title">
          <div className="s4-catalog-head"><h2 id="s4-family-contracts-title">Current product contracts</h2><span>Published operation identities</span></div>
          <div className="catalog-contract-list">
            {discovery.products.map((entry) => {
              const family = observedTruth.products.find((item) => item.id === familyOf(entry.operationId));
              return <Link className="catalog-contract-row" key={entry.operationId} to={`/operations/${entry.operationId}`}><code>{entry.operationId}</code><span>{entry.summary}</span><strong>{entry.pricing.displayPrice === null ? 'request-time quote' : formatUsdc(entry.pricing.displayPrice.amountAtomic, entry.pricing.displayPrice.decimals)}</strong><small>{entry.attribution === undefined ? 'attribution not published' : attributionLabel(entry.attribution)} · {family === undefined ? 'not observed' : lifecycleLabels[family.lifecycleState]}</small></Link>;
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
