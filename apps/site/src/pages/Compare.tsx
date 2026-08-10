import { useEffect } from 'react';

import type { ExperiencePhase } from '../product';
import { Link } from '../router';

/*
 * Comparison methodology is intentionally provider-neutral. Clervo should be
 * evaluated against dated, reproducible evidence rather than positioned as a
 * derivative of any single competitor. No competitor-specific comparison is
 * currently published as a site route.
 */

export function Compare({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Comparison method</p>
        <h1>Compare evidence.<br />Not marketing arithmetic.</h1>
        <p className="lede">
          Product comparisons are useful only when the observation, environment,
          source and metric are current. Clervo does not publish a standing
          competitor-specific comparison when those conditions are not met.
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--secondary" to="/proof">See Clervo proof</Link>
          <Link className="button button--quiet" to="/benchmarks">Read the benchmark boundary</Link>
        </div>
      </section>

      <section className="band band--ruled compare-body" aria-labelledby="compare-method">
        <div className="section-head">
          <p className="eyebrow">Method</p>
          <h2 id="compare-method">A claim needs a reproducible boundary.</h2>
          <p className="lede">
            Any future comparison should name the exact workflow, corpus, date,
            environment and metric, link to primary sources, and suppress values
            that cannot be revalidated. Product truth comes before positioning.
          </p>
        </div>
      </section>
    </>
  );
}