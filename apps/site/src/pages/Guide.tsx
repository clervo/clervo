import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { discovery, onboarding, launchState, type ExperiencePhase } from '../product';
import { Link } from '../router';

export type GuideTopic = 'receipts' | 'replay' | 'failures' | 'x402' | 'catalog';

const guideCopy: Record<GuideTopic, { eyebrow: string; title: string; intro: string; items: Array<[string, string]> }> = {
  receipts: {
    eyebrow: 'Docs / inspectable receipts',
    title: 'The result keeps its boundary.',
    intro: 'A Clervo receipt binds operation identity, declared checks, cost state, evidence, timestamps, and replay behavior. Public receipt issuance is not available yet.',
    items: [['Operation', 'Exact product and operation identity.'], ['Request', 'Stable idempotency and input binding.'], ['Evidence', 'Declared checks and bounded source references.'], ['Cost', 'Quoted maximum and settled charge when payable.'], ['Replay', 'The prior receipt returns without a duplicate effect.']],
  },
  replay: {
    eyebrow: 'Docs / replay',
    title: 'Same request. No second effect.',
    intro: `The recorded private ${launchState.paymentProof.productId} proof replayed to the same receipt with no second authorization, execution, or charge. That proves one bounded mechanism, not public availability.`,
    items: [['Identity', 'Reuse the original idempotency key only for the identical request.'], ['Conflict', 'A different request under the same key fails with 409.'], ['Settlement', 'Unknown state must be reconciled before any retry.'], ['Result', 'A completed replay returns durable prior evidence.']],
  },
  failures: {
    eyebrow: 'Docs / recovery',
    title: 'One failure. One bounded action.',
    intro: 'Recovery messages describe the next safe action. They never hide settlement uncertainty or silently create a second authorization.',
    items: onboarding.recovery.map(({ code, action }) => [code.replaceAll('_', ' '), action]),
  },
  x402: {
    eyebrow: 'Docs / x402 boundary',
    title: 'Inspect before authorization.',
    intro: 'The private payment path has one reconciled owner-funded proof. The public candidate is non-payable and no browser or client may represent a real authorization flow today.',
    items: [['Challenge', 'Bind network, asset, recipient, operation, amount, expiry, and typed-data domain.'], ['Approve', 'Show the exact maximum and allow cancellation before signing.'], ['Settle', 'Verify the authorization and record one durable result.'], ['Reconcile', 'Quarantine unknown state; never guess or automatically sign again.']],
  },
  catalog: {
    eyebrow: 'Docs / machine catalog',
    title: 'One registry drives every surface.',
    intro: 'Capabilities, claims, lifecycle, prices, packages, and discovery are generated from repository truth. Private qualification and customer availability remain different fields.',
    items: launchState.products.map(({ label, engineeringState, customerLifecycle }) => [label, `${engineeringState.replaceAll('_', ' ')} / ${customerLifecycle.replaceAll('_', ' ')}`]),
  },
};

export function Guide({ topic, onPhase }: { topic: GuideTopic; onPhase(phase: ExperiencePhase): void }) {
  const guide = guideCopy[topic];
  useEffect(() => onPhase(topic === 'receipts' || topic === 'replay' ? 'receipt' : 'qualified'), [onPhase, topic]);
  return (
    <section className="guide-page">
      <header className="page-intro">
        <ModeBadge>{`${discovery.distribution.releaseCandidateId} · public callable false`}</ModeBadge>
        <p className="eyebrow">{guide.eyebrow}</p>
        <h1>{guide.title}</h1>
        <p>{guide.intro}</p>
      </header>
      <section className="guide-ledger">
        {guide.items.map(([name, detail], index) => (
          <article key={name}><span>{String(index + 1).padStart(2, '0')}</span><h2>{name}</h2><p>{detail}</p></article>
        ))}
      </section>
      <nav className="guide-links" aria-label="Contract guides">
        {(['receipts', 'replay', 'failures', 'x402', 'catalog'] as GuideTopic[]).map((value) => <Link className={value === topic ? 'is-active' : ''} key={value} to={`/docs/${value}`}>{value}</Link>)}
      </nav>
      {topic === 'catalog' ? <p className="machine-links"><a href="/capabilities.json">Capabilities JSON</a><a href="/claims.json">Claims JSON</a><a href="/.well-known/clervo.json">Clervo discovery</a></p> : null}
    </section>
  );
}
