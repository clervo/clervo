import { useEffect } from 'react';

import { launchState, observedTruth, publicApiCallable, type ExperiencePhase } from '../product';
import { Link } from '../router';

/*
 * /compare/blockrun — a dated, source-bounded comparison.
 *
 * The rule this page exists to enforce is that a comparison is only as current
 * as its observation. Model counts, free tiers, prices, latency, availability
 * and savings all move faster than a static page can track, so none of them
 * render while revalidation is pending; what remains is mechanism, which
 * changes slowly and can be checked against primary sources.
 *
 * The Clervo column is read from the probe rather than written by hand. It
 * asserted "Not publicly callable" for as long as the deployed API was
 * returning real payment challenges.
 */

const liveCount = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live').length;

const publicApiRow = publicApiCallable
  ? `Publicly callable. ${liveCount} of ${observedTruth.products.length} families observed serving.`
  : 'No public route observed serving.';

const comparison: Array<[string, string, string]> = [
  ['Product frame', 'Outcome infrastructure with result evidence and a receipt.', 'Routing and payment product surfaces.'],
  ['Public clients', 'TypeScript, Python, MCP and the raw HTTP contract.', 'Documented public integrations.'],
  ['Payment proof', 'One owner-funded settlement. No customer payment.', 'Not asserted here without a current observation.'],
  ['Public API', publicApiRow, 'See the linked official documentation.'],
  ['Commercial proof', 'No revenue and no demand claim.', 'Not asserted here without a current observation.'],
];

const sources: Array<[string, string]> = [
  ['BlockRun homepage', 'https://blockrun.ai/'],
  ['BlockRun documentation', 'https://blockrun.ai/docs'],
  ['BlockRun MCP documentation', 'https://blockrun.ai/docs/mcp/blockrun-mcp'],
  ['ClawRouter source', 'https://github.com/BlockRunAI/ClawRouter'],
];

// What this page will not print until an observation is current. Naming the
// suppressed dimensions is the honest version of omitting them: a reader can
// see the comparison is partial and why.
const suppressed = [
  'Model counts',
  'Free-tier limits',
  'Prices',
  'Latency',
  'Availability',
  'Savings claims',
];

export function Compare({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  const { observedAt, state, reason } = launchState.competitors.blockrun;

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Compare / BlockRun</p>
        <h1>Compare mechanisms.<br />Not marketing arithmetic.</h1>
        <p className="lede">
          This page records what Clervo can prove and links to BlockRun&rsquo;s
          own current surfaces. Every dimension that moves faster than a static
          page can track is suppressed rather than guessed.
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--secondary" to="/proof">See what Clervo has proven</Link>
          <Link className="button button--quiet" to="/benchmarks">Read the benchmark boundary</Link>
        </div>
      </section>

      <section className="band band--ruled compare-body" aria-labelledby="compare-observation">
        <div className="section-head">
          <p className="eyebrow">Observation</p>
          <h2 id="compare-observation">Dated {observedAt.slice(0, 10)}, and marked stale.</h2>
        </div>
        <dl className="facts">
          <div>
            <dt>Observed</dt>
            <dd>{observedAt.slice(0, 10)}</dd>
          </div>
          <div>
            <dt>State</dt>
            {/* Unresolved rather than refused: the observation is not wrong, it
              * is out of date, and the page has not reached a conclusion. */}
            <dd className="state state--unresolved">{state.replaceAll('_', ' ')}</dd>
          </div>
        </dl>
        <p className="quiet compare-note">{reason}</p>
      </section>

      <section className="band band--ruled compare-body" aria-labelledby="compare-table">
        <div className="section-head">
          <p className="eyebrow">Mechanism</p>
          <h2 id="compare-table">Five dimensions, both columns bounded.</h2>
          <p className="lede">
            The Clervo column is read from the probe. The BlockRun column states
            only what its own primary sources say, and defers to the links below
            for anything that could have changed since the observation date.
          </p>
        </div>
        <table className="compare-table">
          <caption className="sr-only">Clervo and BlockRun mechanism comparison</caption>
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col">Clervo, observed</th>
              <th scope="col">BlockRun, source boundary</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map(([dimension, clervo, blockrun]) => (
              <tr key={dimension}>
                <th scope="row">{dimension}</th>
                {/* data-column carries the column heading into the stacked
                  * mobile layout, where the header row is not displayed. */}
                <td data-column="Clervo, observed">{clervo}</td>
                <td data-column="BlockRun, source boundary">{blockrun}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="band band--ruled compare-body" aria-labelledby="compare-suppressed">
        <div className="section-head">
          <p className="eyebrow">Deliberately absent</p>
          <h2 id="compare-suppressed">What this page refuses to print.</h2>
          <p className="lede">
            These move faster than a static page can track. Publishing a stale
            number as a current one is the failure mode this comparison exists to
            avoid, so each stays absent until a reproducible observation is
            current.
          </p>
        </div>
        <ul className="claim-list claim-list--refused compare-suppressed">
          {suppressed.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="band band--ruled compare-body" aria-labelledby="compare-sources">
        <div className="section-head">
          <p className="eyebrow">Primary surfaces</p>
          <h2 id="compare-sources">Check it yourself.</h2>
          <p className="lede">
            Every BlockRun statement above is bounded by these. If one has moved,
            the source is right, and this page is what needs correcting.
          </p>
        </div>
        <ul className="compare-sources">
          {sources.map(([label, url]) => (
            <li key={url}>
              <a href={url} rel="noreferrer" target="_blank">
                <b>{label}</b>
                <span className="quiet">{url}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="band compare-body" aria-labelledby="compare-method">
        <div className="section-head">
          <p className="eyebrow">Method</p>
          <h2 id="compare-method">How a correction reaches this page.</h2>
        </div>
        <ol className="guide-steps">
          <li>
            <span className="data">01</span>
            <div className="stack stack--tight">
              <h3>Mechanism before counts</h3>
              <p className="quiet">
                Compare visible product behaviour and primary-source
                documentation observed on the recorded date. Nothing volatile is
                compared at all.
              </p>
            </div>
          </li>
          <li>
            <span className="data">02</span>
            <div className="stack stack--tight">
              <h3>Update the evidence, then the copy</h3>
              <p className="quiet">
                A correction changes the dated source object and regenerates this
                page. Marketing copy is never patched on its own, because that
                would leave the evidence and the claim disagreeing.
              </p>
            </div>
          </li>
          <li>
            <span className="data">03</span>
            <div className="stack stack--tight">
              <h3>Report what looks wrong</h3>
              <p className="quiet">
                A stale or incorrect observation is a defect. Report it through
                the public repository and it is fixed at the source.
              </p>
            </div>
          </li>
        </ol>
        <div className="cluster compare-actions">
          <a
            className="button button--quiet"
            href="https://github.com/clervo/clervo/issues"
            rel="noreferrer"
            target="_blank"
          >
            Open a correction issue
          </a>
        </div>
      </section>
    </>
  );
}
