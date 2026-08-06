import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { findFamilyBySlug } from '../content';
import { discovery, type ExperiencePhase } from '../product';
import { Link } from '../router';

export function Capability({ slug, onPhase }: { slug: string; onPhase(phase: ExperiencePhase): void }) {
  const family = findFamilyBySlug(slug);
  useEffect(() => onPhase('qualified'), [onPhase]);
  if (family === undefined) return <section className="authority-page"><header className="authority-intro"><p className="eyebrow">Capability / unresolved</p><h1>This family has no public contract.</h1><p>Use the locked six-family platform catalog rather than inventing a new capability identity.</p><Link className="liquid-capsule liquid-capsule--primary" to="/catalog">Browse catalog</Link></header></section>;
  const pillar = discovery.releaseScope.pillars.find((item) => item.pillarId === family.id);
  return (
    <section className="authority-page capability-page">
      <header className="authority-intro capability-intro">
        <ModeBadge>Permanent family · current lifecycle shown separately</ModeBadge>
        <p className="eyebrow">Capability / {family.title}</p>
        <h1>{family.promise}</h1>
        <p>{family.description}</p>
        <div className="authority-actions">
          <Link className="liquid-capsule liquid-capsule--primary" to="/start">Set up Clervo</Link>
          <Link className="liquid-capsule liquid-capsule--secondary" to="/catalog">Browse catalog</Link>
        </div>
      </header>

      <section className="contract-spine">
        <article><span>01</span><h2>Request</h2><p>The task, scope, identity, budget ceiling, and failure policy enter explicitly.</p></article>
        <article><span>02</span><h2>Qualify</h2><p>Capability, provider terms, route health, price boundary, and evidence requirements are checked before execution.</p></article>
        <article><span>03</span><h2>Execute</h2><p>The selected route operates inside its declared contract. Unsupported or disallowed work fails closed.</p></article>
        <article><span>04</span><h2>Verify and prove</h2><p>The result closes with attributable evidence, cost context, and a replay-safe receipt when the operational path supports it.</p></article>
      </section>

      <section className="authority-section capability-ledger-panel">
        <header><p className="eyebrow">Current repository truth</p><h2>Family readiness is not a launch claim.</h2></header>
        <dl>
          <div><dt>Family</dt><dd>{family.title}</dd></div>
          <div><dt>Lifecycle</dt><dd>{pillar?.lifecycle ?? 'unavailable'}</dd></div>
          <div><dt>Private core qualified</dt><dd>{pillar?.coreQualified ? 'yes' : 'not recorded'}</dd></div>
          <div><dt>Public callable</dt><dd>no</dd></div>
        </dl>
        <div className="capability-identifiers">
          <h3>Frozen capability identifiers</h3>
          <ul>{pillar?.capabilityIds.map((id) => <li key={id}><code>{id}</code></li>)}</ul>
        </div>
      </section>
    </section>
  );
}
