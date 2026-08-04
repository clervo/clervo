import { useEffect } from 'react';

import { CodeBlock } from '../components/CodeBlock';
import { ModeBadge } from '../components/Navigation';
import type { ActivationState } from '../experience';
import { discovery, installExamples, launchState, type ExperiencePhase } from '../product';
import { Link } from '../router';

type ClientId = keyof typeof installExamples;

const clients: Array<{ id: ClientId; label: string; packageName: string; version: string }> = [
  { id: 'http', label: 'Raw HTTP', packageName: 'OpenAPI 3.1.1', version: 'published contract' },
  { id: 'typescript', label: 'TypeScript', packageName: '@clervo/sdk', version: '0.3.0 published' },
  { id: 'python', label: 'Python', packageName: 'clervo-sdk', version: '0.2.0 published' },
  { id: 'mcp', label: 'MCP', packageName: '@clervo/mcp', version: '0.3.0 published' },
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
        <ModeBadge>Public packages verified · endpoint required</ModeBadge>
        <p className="eyebrow">Developer quickstart / published clients</p>
        <h1>Install the client.<br />Keep the boundary visible.</h1>
        <p>
          The TypeScript SDK, MCP server, and Python SDK are published and
          registry-verified. Every client still requires an explicit base URL
          because the Clervo customer API is not publicly callable.
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
            <b>Published package / private service boundary</b>
            <p>
              This client is installable from its public registry. It does not
              discover a public endpoint, sign payment authorizations, or retry
              an unknown settlement automatically.
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
              <li><b>402</b><span>Typed challenge; current public discovery remains non-payable and clients never auto-sign.</span></li>
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
              <div><dt>Package publication</dt><dd>{launchState.distribution.packages.state.replaceAll('_', ' ')}</dd></div>
              <div><dt>Private payment proof</dt><dd>settled and replayed once</dd></div>
              <div><dt>Public payment available</dt><dd>false</dd></div>
            </dl>
          </section>
        </article>
      </div>
    </section>
  );
}
