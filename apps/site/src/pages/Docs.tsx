import { useEffect } from 'react';

import { CodeBlock } from '../components/CodeBlock';
import { ModeBadge } from '../components/Navigation';
import type { ActivationState } from '../experience';
import { discovery, installExamples, type ExperiencePhase } from '../product';
import { Link } from '../router';

type ClientId = keyof typeof installExamples;
const clients: Array<{ id: ClientId; label: string; packageName: string; version: string }> = [
  { id: 'http', label: 'HTTP / OpenAPI', packageName: 'OpenAPI 3.1.1', version: 'frozen candidate' },
  { id: 'typescript', label: 'TypeScript', packageName: '@clervo/sdk', version: '0.3.0 candidate' },
  { id: 'python', label: 'Python', packageName: 'clervo-sdk', version: '0.2.0 candidate' },
  { id: 'mcp', label: 'MCP', packageName: '@clervo/mcp', version: '0.3.0 candidate' },
];
const objectives = [
  ['/start', 'Set up my coding agent', 'Review one agent-native setup instruction and keep approval authority.'],
  ['/catalog', 'Find an operation', 'Start from the desired outcome, then inspect lifecycle and contract truth.'],
  ['/pricing', 'Understand paid use', 'See quote, approval, settlement, receipt, and replay boundaries.'],
  ['/proof', 'Verify an outcome', 'Inspect result, evidence, receipt, and failure records independently.'],
  ['/security', 'Recover safely', 'Understand refusal, unresolved settlement, idempotency, and retry rules.'],
] as const;

export function Docs({ client = 'typescript', activation, updateActivation, onPhase }: { client?: string; activation: ActivationState; updateActivation(next: Partial<ActivationState>): void; onPhase(phase: ExperiencePhase): void }) {
  const validClient = ['http', 'typescript', 'python', 'mcp'].includes(client);
  const clientId = (validClient ? client : 'typescript') as ClientId;
  const selected = clients.find(({ id }) => id === clientId) ?? clients[0];
  useEffect(() => onPhase(activation.receiptInspected ? 'receipt' : 'qualified'), [activation.receiptInspected, onPhase]);
  if (!validClient) return null;
  return (
    <section className="docs-page authority-docs-page">
      <header className="page-intro"><ModeBadge>Package candidates · publication not verified</ModeBadge><p className="eyebrow">Docs · objective first</p><h1>Start from what your agent needs to do.</h1><p>Choose a builder objective, then follow versioned setup, catalog, quote, evidence, receipt, idempotency, error, and recovery contracts generated or tested against the same operation definitions.</p></header>
      <section className="docs-objectives"><header><p className="eyebrow">Five entry paths</p><h2>Start from your environment. Keep the same contract.</h2></header><div>{objectives.map(([path, title, detail], index) => <Link key={path} to={path}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{detail}</p><b>Open path →</b></Link>)}</div></section>
      <div className="docs-layout">
        <aside className="docs-nav"><p>Interface</p>{clients.map((item) => <Link key={item.id} className={item.id === clientId ? 'is-active' : ''} to={`/docs/${item.id}`}><span>{item.label}</span><small>{item.packageName}</small></Link>)}<div className="docs-proof"><span>Activation proof</span><b>{activation.selectedClient ? `${activation.selectedClient} snippet copied` : 'Not recorded'}</b><small>Stored only in this browser.</small></div></aside>
        <article className="docs-content">
          <header><p className="eyebrow">Quickstart / {selected.packageName}</p><h2>{selected.label} client</h2><span>{selected.version}</span></header>
          <div className="truth-callout"><b>Distribution boundary</b><p>The following is the prepared integration shape. The package candidate is tested locally but has not been verified as the current public registry release. Supply an endpoint explicitly.</p></div>
          <CodeBlock label={`${selected.label} candidate`} code={installExamples[clientId]} onCopy={() => updateActivation({ selectedClient: clientId })} />
          <section><p className="eyebrow">Exact operation surface</p><h3>Two projected methods, one bounded request contract.</h3><div className="method-table" role="table" aria-label="Projected methods">{discovery.products.map((product) => <div role="row" key={product.productId}><code role="cell">{product.productId}</code><span role="cell">{product.summary}</span><b role="cell">{product.lifecycle}</b></div>)}</div></section>
          <section id="errors"><p className="eyebrow">Errors and recovery</p><h3>Typed failures return one truthful next action.</h3><ul className="contract-list"><li><b>400</b><span>Request rejected before execution.</span></li><li><b>402</b><span>Typed non-payable fixture challenge; never auto-paid.</span></li><li><b>409</b><span>Idempotency key bound to a different request.</span></li><li><b>429</b><span>Bounded preview quota exhausted.</span></li><li><b>502</b><span>Executor or contract verification failed closed.</span></li></ul></section>
          <section className="contract-binding"><p className="eyebrow">Interface binding</p><dl><div><dt>Contract</dt><dd>{discovery.contractVersion}</dd></div><div><dt>Candidate</dt><dd>{discovery.distribution.releaseCandidateId}</dd></div><div><dt>Hash</dt><dd>{discovery.distribution.interfaceHash}</dd></div><div><dt>Public callable</dt><dd>false</dd></div><div><dt>Payment implemented</dt><dd>false</dd></div></dl></section>
        </article>
      </div>
    </section>
  );
}
