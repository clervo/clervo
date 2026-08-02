import { useEffect, useRef } from 'react';

import { ModeBadge } from '../components/Navigation';
import { discovery, phases, pillarLabels, type ExperiencePhase } from '../product';
import { Link } from '../router';

function PhaseSection({
  id,
  eyebrow,
  title,
  detail,
  onPhase,
}: {
  id: ExperiencePhase;
  eyebrow: string;
  title: string;
  detail: string;
  onPhase(phase: ExperiencePhase): void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onPhase(id);
      },
      { rootMargin: '-38% 0px -38% 0px', threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, onPhase]);
  return (
    <section ref={ref} id={id} className={`phase-section phase-section--${id}`}>
      <div className="phase-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      <div className="phase-evidence" aria-label={`${id} evidence`}>
        <span>{id === 'risk' ? 'UNRESOLVED' : id.toUpperCase()}</span>
        <dl>
          <div><dt>Contract</dt><dd>{discovery.contractVersion}</dd></div>
          <div><dt>State</dt><dd>{id}</dd></div>
          <div><dt>Mode</dt><dd>deterministic</dd></div>
        </dl>
      </div>
    </section>
  );
}

export function Home({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <ModeBadge />
          <p className="eyebrow">Outcome infrastructure for agents</p>
          <h1>Find.<br />Understand.<br />Act.</h1>
          <p className="hero-deck">
            One bounded path from request to evidence and receipt. The private
            product core is frozen; public distribution and real payment are not.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/proof-lab">Enter Proof Lab</Link>
            <Link className="button button--quiet" to="/docs">Read the contracts</Link>
          </div>
        </div>
        <div className="hero-proof">
          <span>PRIVATE CORE / FROZEN</span>
          <strong>{discovery.distribution.releaseCandidateId}</strong>
          <small>Public API callable: no · Payment implemented: no</small>
        </div>
      </section>

      <div className="phase-sequence" aria-label="Clervo outcome lifecycle">
        {phases.map((phase) => (
          <PhaseSection key={phase.id} {...phase} onPhase={onPhase} />
        ))}
      </div>

      <section className="scope-section">
        <div className="section-heading">
          <p className="eyebrow">Six private cores / honest public state</p>
          <h2>Qualified beneath the surface.<br />Unavailable until proven outside it.</h2>
          <p>
            Private qualification does not become a launch claim. Each public
            lifecycle remains bound to deployment, terms, operations, and proof.
          </p>
        </div>
        <div className="pillar-list">
          {discovery.releaseScope.pillars.map((pillar, index) => (
            <article key={pillar.pillarId}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{pillarLabels[pillar.pillarId]}</h3>
              <div>
                <b className={`state state--${pillar.lifecycle}`}>{pillar.lifecycle}</b>
                <small>private core qualified</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="distribution-section">
        <div>
          <p className="eyebrow">Frozen external projection</p>
          <h2>Two operations. No hidden expansion.</h2>
        </div>
        <div className="operation-list">
          {discovery.products.map((product) => (
            <article key={product.productId}>
              <span>{product.productId}</span>
              <h3>{product.title}</h3>
              <p>{product.summary}</p>
              <footer>
                <b>{product.lifecycle}</b>
                <small>publicly callable: no</small>
              </footer>
            </article>
          ))}
        </div>
        <div className="next-action">
          <p>Inspect the complete request-to-receipt behavior without a wallet or network call.</p>
          <Link className="button button--primary" to="/proof-lab">Run the fixture</Link>
        </div>
      </section>
    </>
  );
}
