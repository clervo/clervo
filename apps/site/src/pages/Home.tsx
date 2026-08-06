import { useEffect, useRef } from 'react';

import { HollowApex } from '../components/HollowApex';
import { ModeBadge } from '../components/Navigation';
import { familyProfiles } from '../content';
import { discovery, phases, type ExperiencePhase } from '../product';
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
      ([entry]) => { if (entry?.isIntersecting) onPhase(id); },
      { rootMargin: '-38% 0px -38% 0px', threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, onPhase]);
  return (
    <section ref={ref} id={id} className={`phase-section phase-section--${id}`}>
      <div className="phase-copy"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{detail}</p></div>
      <div className="phase-evidence" aria-label={`${id} evidence`}>
        <span>{id === 'risk' ? 'REQUEST' : id.toUpperCase()}</span>
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
      <section className="hero authority-home-hero">
        <div className="hero-copy">
          <ModeBadge>Repository-local preview · public execution not deployed</ModeBadge>
          <p className="eyebrow">Outcome infrastructure for AI agents</p>
          <h1>Give your agent a task.<br />Get a verified result.</h1>
          <p className="hero-deck">Clervo qualifies the route, keeps cost and execution inside explicit boundaries, and returns the result with evidence. Current public data remains a truthful release-candidate fixture.</p>
          <div className="hero-actions">
            <Link className="liquid-capsule liquid-capsule--primary" to="/start">Set up Clervo</Link>
            <Link className="liquid-capsule liquid-capsule--secondary" to="/catalog">Browse the catalog</Link>
          </div>
          <p className="hero-mechanism"><span>Find</span><i>→</i><span>Understand</span><i>→</i><span>Act</span></p>
        </div>
        <div className="authority-hero-mark" aria-label="Request, qualification, and verified proof mechanism">
          <HollowApex decorative={false} className="authority-hero-apex" />
          <div><span>Request</span><span>Qualify and execute</span><span>Verified proof</span></div>
        </div>
        <div className="hero-proof">
          <span>RELEASE CANDIDATE / FIXTURE</span>
          <strong>{discovery.distribution.releaseCandidateId}</strong>
          <small>Public API callable: no · Payment implemented: no</small>
        </div>
      </section>

      <div className="phase-sequence" aria-label="Clervo outcome lifecycle">
        {phases.map((phase) => <PhaseSection key={phase.id} {...phase} onPhase={onPhase} />)}
      </div>

      <section className="scope-section authority-family-section">
        <div className="section-heading">
          <p className="eyebrow">Permanent platform</p>
          <h2>Six capability families.<br />One outcome layer.</h2>
          <p>The platform identity remains complete even while public lifecycle and callable operations stay narrow and evidence-bound.</p>
        </div>
        <div className="pillar-list">
          {familyProfiles.map((family, index) => {
            const pillar = discovery.releaseScope.pillars.find((item) => item.pillarId === family.id);
            return (
              <article key={family.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{family.title}</h3>
                <div><b className={`state state--${pillar?.lifecycle ?? 'unavailable'}`}>{pillar?.lifecycle ?? 'unavailable'}</b><Link to={`/capabilities/${family.slug}`}>Inspect family</Link></div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="distribution-section">
        <div><p className="eyebrow">Current distribution candidate</p><h2>Inspectable operations.<br />No hidden launch claim.</h2></div>
        <div className="operation-list">
          {discovery.products.map((product) => (
            <article key={product.productId}>
              <span>{product.productId}</span><h3>{product.title}</h3><p>{product.summary}</p>
              <footer><b>{product.lifecycle}</b><Link to={`/operations/${product.operationId}`}>Inspect contract →</Link></footer>
            </article>
          ))}
        </div>
        <div className="next-action"><p>Inspect the complete request-to-receipt behavior without a wallet or network call.</p><Link className="liquid-capsule liquid-capsule--primary" to="/proof">Open Proof</Link></div>
      </section>
    </>
  );
}
