import { useEffect, useMemo } from 'react';

import { operationContract, publishedOperationIds } from '../operation';
import type { ExperiencePhase } from '../product';
import { Link } from '../router';

function JsonBlock({ value, empty }: { value: unknown | null; empty: string }) {
  return <pre className="code-block" tabIndex={0}><code>{value === null ? empty : JSON.stringify(value, null, 2)}</code></pre>;
}

export function Operation({ operationId, onPhase }: { operationId: string; onPhase(phase: ExperiencePhase): void }) {
  const contract = useMemo(() => operationContract(operationId), [operationId]);
  useEffect(() => onPhase(contract.publicAvailable ? 'qualified' : 'risk'), [contract.publicAvailable, onPhase]);
  const responseErrors = contract.openapi.responses === null
    ? []
    : Object.entries(contract.openapi.responses).filter(([code]) => code !== '200').sort(([a], [b]) => a.localeCompare(b));

  return (
    <main className="commercial-page">
      <section className="commercial-page-lead shell" aria-labelledby="operation-title">
        <p className="commercial-breadcrumbs"><Link to="/product">Products</Link><span>/</span><Link to={`/products/${contract.familyRoute}`}>{contract.familyLabel}</Link><span>/</span>{contract.id}</p>
        <p className="eyebrow">Operation reference</p>
        <h1 id="operation-title">{contract.title}</h1>
        <p className="lede">{contract.summary}</p>
        <div className="commercial-actions"><span className={`state state--${contract.publicAvailable ? 'live' : 'unavailable'}`}>{contract.publicAvailable ? 'available' : 'unavailable'}</span>{contract.publicAvailable ? <Link className="button button--primary" to="/start">Start using Clervo</Link> : null}</div>
      </section>

      <section className="commercial-section commercial-section--tint" aria-labelledby="operation-current">
        <div className="shell">
          <p className="eyebrow">Current contract</p><h2 id="operation-current">Route, price, and payment.</h2>
          <dl className="commercial-contract-grid">
            <div><dt>Operation ID</dt><dd><code>{contract.id}</code></dd></div>
            <div><dt>Route</dt><dd><code>{contract.publicRoute ?? 'No public route'}</code></dd></div>
            <div><dt>Access</dt><dd>{contract.access}</dd></div>
            <div><dt>Price</dt><dd>{contract.price.amount}</dd></div>
            <div><dt>Price basis</dt><dd>{contract.price.behavior}</dd></div>
            <div><dt>Payment</dt><dd>{contract.paymentBehavior}</dd></div>
            <div><dt>Idempotency key</dt><dd>{contract.openapi.idempotencyRequired ? 'Required' : 'Not required by this operation schema'}</dd></div>
            <div><dt>Updated</dt><dd><time dateTime={contract.observedAt}>{contract.observedAt}</time></dd></div>
          </dl>
          <p className="quiet">A paid request returns its binding 402 requirement before execution. This reference page never calls the operation, creates a wallet, or sends payment.</p>
        </div>
      </section>

      <section className="commercial-section shell" aria-labelledby="operation-schema">
        <div className="commercial-heading"><div><p className="eyebrow">HTTP reference</p><h2 id="operation-schema">Request and result schemas.</h2></div><a className="text-link" href="/openapi.json">Complete OpenAPI <span aria-hidden="true">→</span></a></div>
        <div className="commercial-schema-grid">
          <article><h3>Request</h3><JsonBlock value={contract.openapi.requestSchema} empty="No public request schema is bound to this operation." /></article>
          <article><h3>Result</h3><JsonBlock value={contract.openapi.responseSchema} empty="No public result schema is bound to this operation." /></article>
        </div>
      </section>

      <section className="commercial-section commercial-section--tint" aria-labelledby="operation-errors">
        <div className="shell">
          <p className="eyebrow">Errors and recovery</p><h2 id="operation-errors">Every failure has a safe next action.</h2>
          <div className="commercial-error-list">
            {responseErrors.length === 0 ? <p>No operation-specific response errors are published.</p> : responseErrors.map(([code, response]) => <article key={code}><strong>{code}</strong><p>{response.description ?? 'See OpenAPI for the response contract.'}</p></article>)}
          </div>
          <p className="quiet">Use the same idempotency key for an identical retry. If settlement is unknown, reconcile before authorizing anything else.</p>
        </div>
      </section>

      <section className="commercial-section shell" aria-labelledby="operation-integrate">
        <p className="eyebrow">Integrate</p><h2 id="operation-integrate">Use the interface that fits your software.</h2>
        <div className="commercial-actions"><Link className="button button--secondary" to="/docs/mcp">MCP</Link><Link className="button button--secondary" to="/docs/typescript">TypeScript</Link><Link className="button button--secondary" to="/docs/python">Python</Link><Link className="button button--secondary" to="/docs/http">HTTP</Link></div>
      </section>

      <nav className="commercial-operation-nav shell" aria-label="Other public operations">
        {publishedOperationIds.filter((id) => id !== operationId).map((id) => <Link key={id} to={`/operations/${id}`}>{id}</Link>)}
      </nav>
    </main>
  );
}
