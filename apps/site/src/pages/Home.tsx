import { useEffect, useRef } from 'react';

import { ModeBadge } from '../components/Navigation';
import { Worlds } from '../components/Worlds';
import { installExamples, launchState, observedProduct, observedTruth, phases, proofLabels, publicApiCallable, type ExperiencePhase } from '../product';
import { Link } from '../router';

// Read from observed truth rather than written by hand: which families the
// deployed system actually serves right now.
const liveLabels = observedTruth.products
  .filter(({ lifecycleState }) => lifecycleState === 'live')
  .map(({ label }) => label)
  .join(', ');

const searchObserved = observedProduct('search');

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
        <span>{id === 'risk' ? 'BOUND' : id.toUpperCase()}</span>
        <dl>
          <div><dt>Layer</dt><dd>{id}</dd></div>
          <div><dt>Behavior</dt><dd>fail closed</dd></div>
          <div><dt>Evidence</dt><dd>inspectable</dd></div>
        </dl>
      </div>
    </section>
  );
}

export function Home({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const proof = launchState.paymentProof;
  return (
    <>
      <section className="hero hero--launch">
        <div className="hero-copy">
          <ModeBadge>Private production candidate · packages published</ModeBadge>
          <p className="eyebrow">{launchState.identity.category}</p>
          <h1><span>One job in.</span><span>One inspectable</span><span>result out.</span></h1>
          <p className="hero-deck">
            Give an agent a bounded job. Clervo is built to find the right
            capability, complete the work within approved limits, and return
            the result with evidence, cost, and a receipt.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/research">See the first outcome</Link>
            <Link className="button button--quiet" to="/docs/quickstart">Install a client</Link>
          </div>
          <p className="hero-boundary">
            {publicApiCallable
              ? `Public packages are verified. ${liveLabels} are callable now over x402 on Base.`
              : 'Public packages are verified. The customer API is not publicly callable yet.'}
          </p>
        </div>
        <aside className="hero-proof hero-proof--settled" aria-label="Latest proof state">
          <span>PRIVATE PAYMENT PROOF / RECONCILED</span>
          <strong>{proof.amountDisplay} · {proof.network}</strong>
          <small>One useful result · exact replay · no second charge</small>
          <Link to="/proof">Inspect what this proves</Link>
        </aside>
      </section>

      <section className="job-strip" aria-label="Clervo outcome path">
        <div><span>01</span><b>Find</b><p>Choose an exact qualified route for the job.</p></div>
        <div><span>02</span><b>Understand</b><p>Preserve sources, limits, identity, and cost.</p></div>
        <div><span>03</span><b>Act</b><p>Return a useful result and replay-safe receipt.</p></div>
      </section>

      <section className="first-outcome">
        <div className="section-heading">
          <p className="eyebrow">First complete outcome / Research</p>
          <h2>Ask a current question.<br />Receive evidence, not a black box.</h2>
          <p>
            Search is the first bounded public-release target. Its private
            production path has settled once and replayed safely.
            {searchObserved.publiclyReachable
              ? ` The public route is reachable and quotes a price; proof level is ${proofLabels[searchObserved.proofLevel]}.`
              : ' Public customer access remains closed until the external release passes.'}
          </p>
        </div>
        <div className="outcome-record">
          <span>RECORDED PRIVATE PROOF</span>
          <dl>
            <div><dt>Job</dt><dd>search.web</dd></div>
            <div><dt>Result</dt><dd>useful</dd></div>
            <div><dt>Charge</dt><dd>{proof.amountDisplay}</dd></div>
            <div><dt>Settlement</dt><dd>confirmed</dd></div>
            <div><dt>Replay</dt><dd>same receipt</dd></div>
            <div><dt>Second charge</dt><dd>none</dd></div>
          </dl>
          <Link className="text-link" to="/proof">Open the evidence ledger →</Link>
        </div>
      </section>

      <div className="phase-sequence" aria-label="Clervo outcome lifecycle">
        {phases.map((phase) => (
          <PhaseSection key={phase.id} {...phase} onPhase={onPhase} />
        ))}
      </div>

      <section className="worlds-section">
        <div>
          <p className="eyebrow">One outcome layer / six capability cores</p>
          <h2>Cross the worlds<br />without stitching them yourself.</h2>
          <p>
            Research, AI, secure execution, RPC, prediction, and crypto
            intelligence share one bounded contract beneath Clervo. Their
            engineering state and customer availability remain deliberately separate.
          </p>
          <Link className="button button--quiet" to="/platform">Inspect the platform</Link>
        </div>
        <Worlds products={launchState.products} />
      </section>

      <section className="home-quickstart">
        <div>
          <p className="eyebrow">Developer quickstart / public clients</p>
          <h2>Install the interface.<br />Bring an explicit endpoint.</h2>
          <p>
            {publicApiCallable
              ? 'The clients are public and registry-verified, and the customer API is publicly callable. The example still takes an explicit base URL so the endpoint you are calling is never implicit.'
              : 'The clients are public and registry-verified. The customer service is not publicly callable, so the example preserves an endpoint placeholder instead of pretending a live API exists.'}
          </p>
          <div className="home-quickstart__links">
            <Link className="button button--primary" to="/docs/quickstart">Open quickstart</Link>
            <Link className="button button--quiet" to="/docs/catalog">Inspect catalog</Link>
          </div>
        </div>
        <pre aria-label="TypeScript installation and bounded request example"><code>{installExamples.typescript}</code></pre>
      </section>

      <section className="home-trust">
        <header><p className="eyebrow">Proof and trust / inspect the boundary</p><h2>Evidence travels with the claim.</h2></header>
        <div>
          <Link to="/proof"><span>01 / PROOF</span><b>Private settlement and no-charge replay</b><small>See what it proves—and what it does not.</small></Link>
          <Link to="/security"><span>02 / SECURITY</span><b>Fail-closed invariants</b><small>Payment, secrets, isolation, requests, and cost.</small></Link>
          <Link to="/status"><span>03 / STATUS</span><b>Availability without launch theater</b><small>Engineering, customer, and commercial state.</small></Link>
          <Link to="/compare/blockrun"><span>04 / COMPARE</span><b>Dated mechanism comparison</b><small>No unsupported model counts or price claims.</small></Link>
        </div>
      </section>

      <section className="launch-cta">
        <p className="eyebrow">Buy outcomes. Not integrations.</p>
        <h2>Install the interface now.<br />Inspect the boundary before launch.</h2>
        <div>
          <Link className="button button--primary" to="/docs/quickstart">Start with the SDK</Link>
          <Link className="button button--quiet" to="/status">Read current status</Link>
        </div>
        <small>No public endpoint or customer payment is represented as live.</small>
      </section>
    </>
  );
}
