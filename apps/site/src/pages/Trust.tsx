import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { discovery, launchState, type ExperiencePhase } from '../product';
import { Link } from '../router';

export type TrustTopic = 'pricing' | 'benchmarks' | 'security' | 'legal';

const topicCopy: Record<TrustTopic, {
  eyebrow: string;
  title: string;
  intro: string;
}> = {
  pricing: {
    eyebrow: 'Pricing / candidate truth',
    title: 'Proof amount is not public price.',
    intro: 'The private proof settled for 0.006 USDC. No public customer offer exists, and fixture amounts remain explicitly non-payable.',
  },
  benchmarks: {
    eyebrow: 'Benchmarks / claim boundary',
    title: 'No superiority claim without proof.',
    intro: 'Private qualification establishes engineering readiness, not public comparative performance. No “best,” “better,” or BlockRun-parity claim is approved.',
  },
  security: {
    eyebrow: 'Security / enforced invariants',
    title: 'Failure closes the boundary.',
    intro: 'The frozen private core preserves request identity, idempotency, secret protection, sandbox isolation, SSRF controls, cleanup, and hard cost ceilings.',
  },
  legal: {
    eyebrow: 'Legal / review boundary',
    title: 'Availability follows rights.',
    intro: 'Provider terms, resale rights, privacy, and customer-facing legal language remain release inputs. This page records current constraints; it is not legal advice.',
  },
};

export function Trust({
  topic,
  onPhase,
}: {
  topic: TrustTopic;
  onPhase(phase: ExperiencePhase): void;
}) {
  const copy = topicCopy[topic];
  useEffect(() => onPhase(topic === 'pricing' ? 'approval' : 'verified'), [onPhase, topic]);
  return (
    <section className="trust-page">
      <header className="page-intro">
        <ModeBadge>Current claim boundary · generated state</ModeBadge>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
      </header>

      {topic === 'pricing' ? (
        <><section className="private-price-proof">
          <span>RECORDED PRIVATE PROOF AMOUNT</span>
          <strong>{launchState.paymentProof.amountDisplay}</strong>
          <p>Owner-funded · {launchState.paymentProof.productId} · not a public customer offer</p>
        </section><section className="truth-table">
          <header><h2>Non-payable fixture ledger</h2><span>Interface testing only</span></header>
          {discovery.products.map((product) => (
            <div key={product.productId}>
              <code>{product.productId}</code>
              <span>{product.pricing.displayPrice.amountAtomic} atomic {product.pricing.displayPrice.asset}</span>
              <b>{product.pricing.priceVersion}</b>
              <strong>payable: false</strong>
            </div>
          ))}
        </section></>
      ) : null}

      {topic === 'benchmarks' ? (
        <section className="truth-panels">
          <article><span>APPROVED</span><h2>Private core qualification</h2><p>Six pillars and combined workflows passed their bounded internal contract and stabilization gates.</p></article>
          <article><span>NOT APPROVED</span><h2>Public comparative claim</h2><p>No current external corpus, alternative, environment, sample size, and published metric support a superiority statement.</p></article>
          <article><span>PROVEN PRIVATELY</span><h2>Bounded settlement mechanics</h2><p>One owner-funded useful result settled and replayed safely. An external customer outcome remains unproven.</p></article>
        </section>
      ) : null}

      {topic === 'security' ? (
        <section className="control-ledger">
          {[
            ['Payment idempotency', 'Replay-safe identity and unknown-settlement quarantine remain required.'],
            ['Secret protection', 'Credentials and wallet material are excluded from chat, source, logs, commits, reports, and fixtures.'],
            ['Execution isolation', 'The qualified sandbox boundary includes gVisor, network denial, limits, descendant cleanup, and image provenance.'],
            ['Request safety', 'SSRF, redirect, origin, schema, response, and cost ceilings fail closed.'],
            ['Truth synchronization', 'Contracts, lifecycle, prices, discovery, clients, and claims derive from the frozen release candidate.'],
          ].map(([name, detail], index) => (
            <article key={name}><span>{String(index + 1).padStart(2, '0')}</span><h2>{name}</h2><p>{detail}</p></article>
          ))}
        </section>
      ) : null}

      {topic === 'legal' ? (
        <section className="truth-panels">
          <article><span>CURRENT</span><h2>Terms-aware routing</h2><p>RPC, Prediction, and Crypto public routing remain unavailable where resale or commercial reuse rights are not qualified.</p></article>
          <article><span>PENDING</span><h2>Customer documents</h2><p>Production privacy, terms, support, retention, and pricing language require reviewed release text before launch.</p></article>
          <article><span>BOUNDARY</span><h2>Protected infrastructure</h2><p>The existing model gateway is protected infrastructure and is not changed, exposed, or represented as this public candidate.</p></article>
        </section>
      ) : null}

      <div className="trust-links">
        {(['pricing', 'benchmarks', 'security', 'legal'] as TrustTopic[]).map((value) => (
          <Link key={value} className={value === topic ? 'is-active' : ''} to={`/${value}`}>{value}</Link>
        ))}
      </div>
    </section>
  );
}
