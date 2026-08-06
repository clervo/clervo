import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import type { ActivationState } from '../experience';
import type { ExperiencePhase } from '../product';
import { Link } from '../router';
import { ProofLab } from './ProofLab';

const records = [
  { state: 'verified', title: 'Research brief completed and proven.', detail: 'A bounded current-research fixture returns findings, evidence references, a non-payable receipt, and a safe replay identity.' },
  { state: 'refused', title: 'Policy boundary refused execution.', detail: 'The record preserves the reason, confirms that no execution or charge occurred, and returns one corrective action.' },
  { state: 'unresolved', title: 'Settlement uncertainty blocks retry.', detail: 'The operating record contains uncertainty rather than presenting a success or allowing a duplicate attempt.' },
] as const;

export function Proof({ activation, updateActivation, onPhase }: { activation: ActivationState; updateActivation(next: Partial<ActivationState>): void; onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase(activation.receiptInspected ? 'receipt' : activation.proofCompleted ? 'verified' : 'qualified'), [activation.proofCompleted, activation.receiptInspected, onPhase]);
  useEffect(() => {
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[name="product"]')];
    for (const input of inputs) input.setAttribute('aria-label', `${input.value} operation`);
    return () => { for (const input of inputs) input.removeAttribute('aria-label'); };
  }, []);
  return (
    <section className="authority-page proof-page">
      <header className="authority-intro">
        <ModeBadge>Reproducible fixture records · no customer claim</ModeBadge>
        <p className="eyebrow">Proof · reproducible operating records</p>
        <h1>Proof when work succeeds&mdash;and when it doesn’t.</h1>
        <p>Public proof must expose the task, operation version, quote, execution state, evidence, receipt, settlement, replay result, limitations, and whether the record is customer, owner-funded, fixture, or synthetic.</p>
        <div className="authority-actions"><a className="liquid-capsule liquid-capsule--primary" href="#proof-fixture">Inspect proof fixture</a><Link className="liquid-capsule liquid-capsule--secondary" to="/status">View current status</Link></div>
      </header>

      <section className="authority-section proof-library">
        <header><p className="eyebrow">Proof library</p><h2>Success and failure use the same evidence standard.</h2><p>Synthetic design records demonstrate structure only. They are not customer results or production settlement evidence.</p></header>
        <div>{records.map(() }</div>
      </section>

      <section id="proof-fixture" className="proof-fixture-section">
        <header><p className="eyebrow">Interactive operating record</p><h2>Inspect request → qualification → evidence → receipt.</h2><p>The existing deterministic fixture remains repository-local. It makes no provider call, signs no wallet message, and settles no funds.</p></header>
        <ProofLab activation={activation} updateActivation={updateActivation} onPhase={onPhase} />
      </section>
    </section>
  );
}
