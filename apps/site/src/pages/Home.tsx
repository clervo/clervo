import { useEffect, useRef } from 'react';

import { Worlds } from '../components/Worlds';
import {
  formatUsdc,
  launchState,
  lifecycleLabels,
  observedProduct,
  observedRoutes,
  observedTruth,
  phases,
  proofLabels,
  publicApiCallable,
  quickStartCurl,
  quickStartNeedsNoKey,
  installExamples,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';

/*
 * The homepage.
 *
 * The first five seconds have to answer three questions: what this is, what it
 * does for the reader, and what to do next. Everything below the hero exists to
 * support one of those three answers, and every number on the page is read from
 * the observed registry rather than written into the markup — the previous
 * homepage carried a "packages published, API not callable" badge that had
 * outlived the deployment it described.
 */

const liveFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live');
const liveLabels = liveFamilies.map(({ label }) => label).join(', ');
const liveRouteCount = observedRoutes.filter(({ lifecycleState }) => lifecycleState === 'live').length;
const search = observedProduct('search');

// The cheapest observed price across every serving route. It is a real quoted
// ceiling, so it can be shown as one; if nothing is quoting, nothing is shown.
const quotedPrices = observedRoutes
  .filter(({ lifecycleState, observedPrice }) => lifecycleState === 'live' && observedPrice !== null)
  .map(({ observedPrice }) => observedPrice!);
const cheapestQuote = quotedPrices.length === 0
  ? null
  : quotedPrices.reduce((low, price) => (BigInt(price.amountAtomic) < BigInt(low.amountAtomic) ? price : low));

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
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">{launchState.identity.category}</p>
          <h1>Give your agent a task.<br />Get a verified result.</h1>
          <p className="hero__deck">
            Clervo finds the right capability for a bounded job, runs it inside
            an approved price ceiling, and returns the result with its evidence,
            its cost, and a replay-safe receipt. {launchState.identity.commercialPromise}
          </p>
          <div className="cluster hero__actions">
            <Link className="button button--primary" to="/start">Set up Clervo</Link>
            <Link className="button button--secondary" to="/catalog">See what is serving now</Link>
          </div>
          {/*
            * The free path is the strongest thing this page can offer, so it is
            * stated as a fact only while the deployed system is observed
            * serving it. If the free route disappears, this line disappears
            * with it rather than becoming a promise the site cannot keep.
            */}
          <p className="hero__free">
            {search.freeEntry === null
              ? 'The free entry route is not serving right now. The catalog below shows exactly what is.'
              : 'The first call needs no account, no API key and no wallet.'}
          </p>
        </div>

        {/*
          * The observed strip. Four facts, each of them probed: how many routes
          * are serving, what the cheapest quoted ceiling is, what the proof
          * level actually reaches, and when it was all observed. A marketing
          * statistic would go here on most sites; this is the version that
          * cannot go stale, because nothing in it is typed by hand.
          */}
        <dl className="hero__observed" aria-label="Observed deployment state">
          <div>
            <dt>Routes serving</dt>
            <dd>{liveRouteCount}</dd>
          </div>
          <div>
            <dt>Product families live</dt>
            <dd>{liveFamilies.length} of {observedTruth.products.length}</dd>
          </div>
          <div>
            <dt>Lowest quoted ceiling</dt>
            <dd>{cheapestQuote === null ? 'none quoted' : formatUsdc(cheapestQuote.amountAtomic, cheapestQuote.decimals)}</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>
              <time dateTime={observedTruth.provenance.observedAt}>
                {observedTruth.provenance.observedAt.slice(0, 10)}
              </time>
            </dd>
          </div>
        </dl>
      </section>

      {/* Find, Understand, Act. The permanent mechanism, stated once. */}
      <section className="band band--ruled mechanism" aria-labelledby="mechanism-heading">
        <div className="section-head shell">
          <p className="eyebrow">{launchState.identity.architectureNarrative}</p>
          <h2 id="mechanism-heading">Three steps, and none of them are yours to build.</h2>
        </div>
        <ol className="mechanism__steps shell">
          <li className="panel">
            <div className="panel__body stack stack--tight">
              <p className="eyebrow">01 / Find</p>
              <h3>The job picks its route.</h3>
              <p>
                A bounded request is matched against the routes the deployed
                catalog is observed serving, with the contract, the supplier and
                the price ceiling attached to the choice.
              </p>
            </div>
          </li>
          <li className="panel">
            <div className="panel__body stack stack--tight">
              <p className="eyebrow">02 / Understand</p>
              <h3>Cost and limits are visible first.</h3>
              <p>
                The maximum charge, the network, the asset and the failure policy
                are all returned before anything executes. Approval is a
                deliberate act, not a default.
              </p>
            </div>
          </li>
          <li className="panel">
            <div className="panel__body stack stack--tight">
              <p className="eyebrow">03 / Act</p>
              <h3>The result arrives with its receipt.</h3>
              <p>
                Output, evidence, exact cost and a request hash come back
                together. Replaying the receipt returns the same result without a
                second charge.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* The free first call, exactly as the deployed route accepts it. */}
      <section className="band band--ruled home-first" aria-labelledby="home-first-heading">
        <div className="home-first__inner shell">
          <div className="stack">
            <p className="eyebrow">First call / one command</p>
            <h2 id="home-first-heading">Run one command.<br />Read a cited result.</h2>
            <p className="lede">
              {quickStartCurl === null
                ? 'The clients are public and registry-verified. No free command is published here, because the deployed system is not currently serving one and a command that fails is worse than no command at all.'
                : quickStartNeedsNoKey
                  ? 'No account, no API key, no wallet, no idempotency key. The free route generates the key and returns it in the response header, so the same call can be replayed deliberately.'
                  : 'No account, no API key, no wallet. The free route currently requires an idempotency-key header, so the command carries one; reuse the same value to replay without a second execution.'}
            </p>
            <div className="cluster">
              <Link className="button button--primary" to="/start">Set up Clervo</Link>
              <Link className="button button--quiet" to="/docs/quickstart">Open the quickstart</Link>
            </div>
          </div>
          <div className="code">
            <div className="code__head">
              <span>{quickStartCurl === null ? 'TypeScript client' : 'Free Search call'}</span>
              <span className={`state state--${search.lifecycleState}`}>
                {lifecycleLabels[search.lifecycleState]}
              </span>
            </div>
            {/* Scrollable, so it is a real stop in the keyboard tab order. */}
            <pre
              tabIndex={0}
              role="group"
              aria-label={quickStartCurl === null ? 'TypeScript client example, scrollable' : 'Free Search call, scrollable'}
            >
              <code>{quickStartCurl ?? installExamples.typescript}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* The lifecycle. Drives the Apex instrument as the reader scrolls. */}
      <div className="phase-sequence" aria-label="Clervo outcome lifecycle">
        {phases.map((phase) => (
          <PhaseSection key={phase.id} {...phase} onPhase={onPhase} />
        ))}
      </div>

      {/* The six permanent families, with their observed state on each card. */}
      <section className="band band--ruled families" aria-labelledby="families-heading">
        <div className="section-head shell">
          <p className="eyebrow">One outcome layer / six capability families</p>
          <h2 id="families-heading">Cross the worlds without stitching them yourself.</h2>
          <p className="lede">
            Research, AI, secure execution, RPC, prediction and crypto
            intelligence share one bounded contract. Engineering state and
            customer availability are reported separately, because they are
            separate facts.
          </p>
        </div>
        <ul className="families__grid shell">
          {observedTruth.products.map((product) => (
            <li key={product.id} className="panel families__card">
              <div className="panel__body stack stack--tight">
                <div className="families__head">
                  <h3>{product.label}</h3>
                  <span className={`state state--${product.lifecycleState}`}>
                    {lifecycleLabels[product.lifecycleState]}
                  </span>
                </div>
                <p className="data quiet">{product.operations.join(' · ')}</p>
                <p className="quiet">Proof: {proofLabels[product.proofLevel]}</p>
                {product.observedPrice === null ? null : (
                  <p className="data">
                    {formatUsdc(product.observedPrice.amountAtomic, 6)} maximum on {product.observedPrice.network}
                  </p>
                )}
                {product.reason === null ? null : <p className="quiet">{product.reason}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="cluster families__actions shell">
          <Link className="button button--secondary" to="/catalog">Open the live catalog</Link>
          <Link className="button button--quiet" to="/product">Read the product overview</Link>
        </div>
      </section>

      <section className="band band--ruled worlds-section" aria-label="Capability worlds">
        <Worlds products={launchState.products} />
      </section>

      {/* Proof, stated at exactly the strength the evidence supports. */}
      <section className="band band--ruled home-proof" aria-labelledby="home-proof-heading">
        <div className="section-head shell">
          <p className="eyebrow">Proof / what is actually demonstrated</p>
          <h2 id="home-proof-heading">Evidence travels with the claim.</h2>
          <p className="lede">
            {publicApiCallable
              ? `${liveLabels} are publicly reachable and quote a price. A payment settled once on ${proof.network}, returned a useful result, and replayed against the same receipt without a second charge.`
              : `A payment settled once on ${proof.network}, returned a useful result, and replayed against the same receipt without a second charge. The public customer API is not reachable yet.`}
          </p>
        </div>
        <dl className="facts shell home-proof__facts">
          <div>
            <dt>Settled charge</dt>
            <dd>{proof.amountDisplay} on {proof.network}</dd>
          </div>
          <div>
            <dt>Result</dt>
            <dd>useful, with citations</dd>
          </div>
          <div>
            <dt>Replay</dt>
            <dd>same receipt, no second charge</dd>
          </div>
          <div>
            <dt>Strongest proof level reached</dt>
            <dd>{proofLabels[search.proofLevel]}</dd>
          </div>
          <div>
            <dt>Customer revenue evidence</dt>
            <dd>{proof.revenueEvidence ? 'recorded' : 'none claimed'}</dd>
          </div>
        </dl>
        <ul className="home-proof__links shell">
          <li>
            <Link className="panel panel--interactive" to="/proof">
              <div className="panel__body stack stack--tight">
                <p className="eyebrow">01 / Proof</p>
                <h3>Settlement and no-charge replay</h3>
                <p className="quiet">What it proves, and what it does not.</p>
              </div>
            </Link>
          </li>
          <li>
            <Link className="panel panel--interactive" to="/security">
              <div className="panel__body stack stack--tight">
                <p className="eyebrow">02 / Security</p>
                <h3>Fail-closed invariants</h3>
                <p className="quiet">Payment, secrets, isolation and cost ceilings.</p>
              </div>
            </Link>
          </li>
          <li>
            <Link className="panel panel--interactive" to="/status">
              <div className="panel__body stack stack--tight">
                <p className="eyebrow">03 / Status</p>
                <h3>Availability without launch theatre</h3>
                <p className="quiet">Engineering, customer and commercial state, kept apart.</p>
              </div>
            </Link>
          </li>
        </ul>
      </section>

      <section className="band home-cta" aria-labelledby="home-cta-heading">
        <div className="home-cta__inner shell stack">
          <p className="eyebrow">{launchState.identity.commercialPromise}</p>
          <h2 id="home-cta-heading">Give your agent a task.<br />Get a verified result.</h2>
          <div className="cluster">
            <Link className="button button--primary" to="/start">Set up Clervo</Link>
            <Link className="button button--quiet" to="/status">Read current status</Link>
          </div>
          <p className="quiet">
            Observed {observedTruth.provenance.observedAt.slice(0, 10)} from{' '}
            {observedTruth.provenance.source}. No customer revenue or demand is claimed.
          </p>
        </div>
      </section>
    </>
  );
}
