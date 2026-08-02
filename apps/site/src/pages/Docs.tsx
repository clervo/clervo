import { useEffect } from 'react';

import { CodeBlock } from '../components/CodeBlock';
import { ModeBadge } from '../components/Navigation';
import type { ActivationState } from '../experience';
import { discovery, installExamples, type ExperiencePhase } from '../product';
import { Link } from '../router';

type ClientId = keyof typeof installExamples;

const clients: Array<{ id: ClientId; label: string; packageName: string; version: string }> = [
  { id: 'http', label: 'Raw HTTP', packageName: 'OpenAPI 3.1.1', version: 'frozen candidate' },
  { id: 'typescript', label: 'TypeScript', packageName: '@clervo/sdk', version: '0.3.0 candidate' },
  { id: 'python', label: 'Python', packageName: 'clervo-sdk', version: '0.2.0 candidate' },
  { id: 'mcp', label: 'MCP', packageName: '@clervo/mcp', version: '0.3.0 candidate' },
];

export function Docs({
  client = 'typescript',
  activation,
  updateActivation,
  onPhase,
}: {
  client?: string;
  activation: ActivationState;
  updateActivation(next: Partial<ActivationState>): void;
  onPhase(phase: ExperiencePhase): void;
}) {
  const validClient = ['http', 'typescript', 'python', 'mcp'].includes(client);
  const clientId = (validClient ? client : 'typescript') as ClientId;
  const selected = clients.find(({ id }) => id === clientId) ?? clients[0];
  useEffect(() => {
    onPhase(activation.receiptInspected ? 'receipt' : 'qualified');
  }, [activation.receiptInspected, onPhase]);
  if (!validClient) return null;

  return (
    <section className="docs-page">
      <header className="page-intro">
        <ModeBadge>Package candidates · publication not verified</ModeBadge>
        <p className="eyebrow">Developer access / frozen contract</p>
        <h1>One interface.<br />Explicit limits.</h1>
        <p>
          Every client is bound to release candidate
          {' '}<code>{discovery.distribution.releaseCandidateId}</code>. An
          endpoint must be supplied explicitly because no public API deployment
          is currently claimed.
        </p>
      </header>

      <div className="docs-layout">
        <aside className="docs-nav">
          <p>Client</p>
          {clients.map((item) => (
            <Link
              key={item.id}
              className={item.id === clientId ? 'is-active' : ''}
              to={`/docs/${item.id}`}
            >
              <span>{item.label}</span>
              <small>{item.packageName}</small>
            </Link>
          ))}
          <div className="docs-proof">
            <span>Activation proof</span>
            <b>{activation.selectedClient ? `${activation.selectedClient} snippet copied` : 'Not recorded'}</b>
            <small>Stored only in this browser.</small>
          </div>
        </aside>

        <article className="docs-content">
          <header>
            <p className="eyebrow">{selected.packageName}</p>
            <h2>{selected.label} client</h2>
            <span>{selected.version}</span>
          </header>
          <div className="truth-callout">
            <b>Distribution boundary</b>
            <p>
              The following is the prepared integration shape. The package
              candidate is tested locally but has not been verified as the
              current public registry release.
            </p>
          </div>
          <CodeBlock
            label={`${selected.label} candidate`}
            code={installExamples[clientId]}
            onCopy={() => updateActivation({ selectedClient: clientId })}
          />

          <section>
            <p className="eyebrow">Exact operation surface</p>
            <h3>Two methods, one bounded request contract.</h3>
            <div className="method-table" role="table" aria-label="Projected methods">
              {discovery.products.map((product) => (
                <div role="row" key={product.productId}>
                  <code role="cell">{product.productId}</code>
                  <span role="cell">{product.summary}</span>
                  <b role="cell">{product.lifecycle}</b>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="eyebrow">Failure behavior</p>
            <h3>Typed errors stay visible.</h3>
            <ul className="contract-list">
              <li><b>400</b><span>Request rejected before execution.</span></li>
              <li><b>402</b><span>Typed non-payable mock challenge; never auto-paid.</span></li>
              <li><b>409</b><span>Idempotency key bound to a different request.</span></li>
              <li><b>429</b><span>Bounded preview quota exhausted.</span></li>
              <li><b>502</b><span>Executor or contract verification failed closed.</span></li>
            </ul>
          </section>

          <section className="contract-binding">
            <p className="eyebrow">Interface binding</p>
            <dl>
              <div><dt>Contract</dt><dd>{discovery.contractVersion}</dd></div>
              <div><dt>Candidate</dt><dd>{discovery.distribution.releaseCandidateId}</dd></div>
              <div><dt>Hash</dt><dd>{discovery.distribution.interfaceHash}</dd></div>
              <div><dt>Public callable</dt><dd>false</dd></div>
              <div><dt>Payment implemented</dt><dd>false</dd></div>
            </dl>
          </section>
        </article>
      </div>
    </section>
  );
}
