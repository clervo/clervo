import { useEffect, useMemo, useState } from 'react';

import {
  capabilityLabel,
  formatUsdc,
  lifecycleLabels,
  observedRoutes,
  observedTruth,
  proofLabels,
  supplyFamilyLabel,
  type ExperiencePhase,
  type LifecycleState,
} from '../product';
import { Link } from '../router';

/*
 * /catalog — every route the deployed system was observed serving.
 *
 * This is the page a buyer opens to answer "what can I actually call today".
 * It renders the probed registry directly: a paused route keeps its reason and
 * its expected return date rather than disappearing, because an owned route
 * that is temporarily unfunded is a different fact from one that does not
 * exist, and hiding the difference is how a catalog starts lying.
 */

type Filter = 'all' | LifecycleState;

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All routes' },
  { id: 'live', label: 'Serving now' },
  { id: 'supply_paused', label: 'Supply paused' },
];

const liveCount = observedRoutes.filter(({ lifecycleState }) => lifecycleState === 'live').length;
const pausedCount = observedRoutes.filter(({ lifecycleState }) => lifecycleState === 'supply_paused').length;

export function Catalog({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => onPhase('qualified'), [onPhase]);

  const shown = useMemo(
    () => (filter === 'all'
      ? observedRoutes
      : observedRoutes.filter(({ lifecycleState }) => lifecycleState === filter)),
    [filter],
  );

  return (
    <>
      <section className="catalog-intro">
        <p className="eyebrow">Live capability catalog</p>
        <h1>Every route, and what it costs.</h1>
        <p>
          {liveCount} routes were observed serving and {pausedCount} are supply
          paused, as probed at {observedTruth.provenance.observedAt}. Prices are
          maximum charges, quoted by the deployed system rather than published
          here.
        </p>
      </section>

      <section className="band catalog-body" aria-labelledby="catalog-heading">
        <div className="catalog-toolbar">
          <h2 id="catalog-heading" className="sr-only">Observed routes</h2>
          {/*
            * A filter group rather than a select: three options that each
            * change the count of a visible list are faster to operate as
            * buttons, and the pressed state is announced without a label.
            */}
          <div className="catalog-filters" role="group" aria-label="Filter routes by state">
            {filters.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className="catalog-filter"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="data quiet" aria-live="polite">
            {shown.length} of {observedRoutes.length} shown
          </p>
        </div>

        <ul className="catalog-grid">
          {shown.map((route) => (
            <li key={route.routeId} className="panel catalog-card">
              <div className="panel__body stack">
                <div className="catalog-card__head">
                  <h3 className="catalog-card__id">{route.id}</h3>
                  <span className={`state state--${route.lifecycleState}`}>
                    {lifecycleLabels[route.lifecycleState]}
                  </span>
                </div>

                <p className="quiet">{supplyFamilyLabel(route.supplyFamilyId)}</p>

                <ul className="catalog-card__tags" aria-label="Capabilities">
                  {route.capabilities.map((capability) => (
                    <li key={capability}>{capabilityLabel(capability)}</li>
                  ))}
                </ul>

                <dl className="facts">
                  <div>
                    <dt>Operations</dt>
                    <dd>{route.productIds.join(', ')}</dd>
                  </div>
                  <div>
                    <dt>Endpoint</dt>
                    <dd>{route.route}</dd>
                  </div>
                  <div>
                    <dt>Maximum charge</dt>
                    <dd>
                      {route.observedPrice === null
                        ? 'not quoted'
                        : formatUsdc(route.observedPrice.amountAtomic, route.observedPrice.decimals)}
                    </dd>
                  </div>
                  <div>
                    <dt>Proof</dt>
                    <dd>{proofLabels[route.proofLevel]}</dd>
                  </div>
                  {route.reason === null ? null : (
                    <div>
                      <dt>Paused because</dt>
                      <dd>{route.reason.replaceAll('_', ' ')}</dd>
                    </div>
                  )}
                  {route.expectedReturnAt === null ? null : (
                    <div>
                      <dt>Expected back</dt>
                      <dd>{route.expectedReturnAt}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </li>
          ))}
        </ul>

        <p className="quiet catalog-note">
          Generated by {observedTruth.provenance.generatedBy} from{' '}
          {observedTruth.provenance.source} at release{' '}
          {observedTruth.provenance.releaseId.slice(0, 7)}. A route that stops
          serving leaves this page on the next probe, not on an edit.
        </p>

        <div className="cluster catalog-actions">
          <Link className="button button--primary" to="/start">Set up Clervo</Link>
          <Link className="button button--quiet" to="/pricing">See pricing truth</Link>
          <a className="text-link" href="/models.json">Read the raw catalog</a>
        </div>
      </section>
    </>
  );
}
