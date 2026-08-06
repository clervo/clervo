import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { launchState, observedTruth, publicApiCallable, type ExperiencePhase } from '../product';

// The public API row is read from observed truth, not written by hand. It said
// "Not publicly callable" while the deployed API was returning real payment
// challenges.
const liveCount = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live').length;
const publicApiRow = publicApiCallable
  ? `Publicly callable; ${liveCount} of ${observedTruth.products.length} families serving`
  : 'Not publicly callable';

const comparison = [
  ['Product frame', 'Outcome infrastructure with result evidence and receipt', 'Routing and payment product surfaces'],
  ['Public SDKs', 'TypeScript, Python, MCP, and raw HTTP contract', 'Documented public integrations'],
  ['Payment proof', 'One owner-funded private settlement; no public customer payment', 'Not asserted here without current proof'],
  ['Public API', publicApiRow, 'See the linked current official documentation'],
  ['Commercial proof', 'No revenue or demand claim', 'Not asserted here without current proof'],
] as const;

export function Compare({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  return (
    <section className="compare-page">
      <header className="page-intro">
        <ModeBadge>Dated comparison · volatile counts suppressed</ModeBadge>
        <p className="eyebrow">Compare / BlockRun</p>
        <h1>Compare mechanisms.<br />Not marketing arithmetic.</h1>
        <p>
          This page records what Clervo can prove and links to BlockRun’s own
          current surfaces. Model counts, free-tier counts, prices, latency,
          availability, and savings claims do not render while revalidation is pending.
        </p>
      </header>

      <div className="comparison-meta">
        <span>Observed {launchState.competitors.blockrun.observedAt.slice(0, 10)}</span>
        <b>{launchState.competitors.blockrun.state.replaceAll('_', ' ')}</b>
        <p>{launchState.competitors.blockrun.reason}</p>
      </div>

      <div className="comparison-table" role="table" aria-label="Clervo and BlockRun mechanism comparison">
        <div role="row" className="comparison-table__head"><b role="columnheader">Dimension</b><b role="columnheader">Clervo today</b><b role="columnheader">BlockRun source boundary</b></div>
        {comparison.map(([dimension, clervo, blockrun]) => (
          <div role="row" key={dimension}><b role="cell">{dimension}</b><span role="cell">{clervo}</span><span role="cell">{blockrun}</span></div>
        ))}
      </div>

      <section className="source-list">
        <h2>Primary surfaces for review</h2>
        <a href="https://blockrun.ai/" target="_blank" rel="noreferrer">BlockRun homepage</a>
        <a href="https://blockrun.ai/docs" target="_blank" rel="noreferrer">BlockRun documentation</a>
        <a href="https://blockrun.ai/docs/mcp/blockrun-mcp" target="_blank" rel="noreferrer">BlockRun MCP documentation</a>
        <a href="https://github.com/BlockRunAI/ClawRouter" target="_blank" rel="noreferrer">ClawRouter source</a>
      </section>

      <section className="comparison-policy">
        <article><span>METHODOLOGY</span><h2>Mechanism before counts</h2><p>Compare only visible product behavior and primary-source documentation observed on the recorded date. Suppress changing model counts, free tiers, prices, latency, availability, and savings until a reproducible observation is current.</p></article>
        <article><span>CORRECTIONS</span><h2>Update the evidence, then the copy</h2><p>Corrections must change the dated source object and regenerate this page. Report a stale or incorrect observation through the public repository; marketing copy is never patched independently.</p><a href="https://github.com/clervo/clervo/issues" target="_blank" rel="noreferrer">Open a correction issue →</a></article>
        <article><span>COMPARISON LOG</span><h2>2026-08-04</h2><p>Initial launch comparison recorded. All volatile numerical claims remain suppressed pending revalidation.</p></article>
      </section>
    </section>
  );
}
