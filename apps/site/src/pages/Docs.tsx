import { useEffect } from 'react';

import { CodeBlock } from '../components/CodeBlock';
import type { ActivationState } from '../experience';
import {
  discovery,
  familyOf,
  formatUsdc,
  installExamples,
  launchState,
  lifecycleLabels,
  observedApiOrigin,
  observedProduct,
  publicApiCallable,
  quickStartCurl,
  quickStartNeedsNoKey,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';

/*
 * /docs and /docs/:client — the developer quickstart.
 *
 * Two facts stay apart on this page, because collapsing them is what makes a
 * quickstart lie:
 *
 *   package publication — the client exists on a public registry
 *   endpoint reachability — a deployed route answers a request right now
 *
 * A published package pointed at a dead endpoint is not a working quickstart,
 * so every snippet is configured with the origin the probe actually observed
 * serving, and the operation table renders each family's observed lifecycle
 * rather than the discovery document's own lifecycle string.
 */

type ClientId = keyof typeof installExamples;

const searchObserved = observedProduct('search');

const clients: Array<{ id: ClientId; label: string; packageName: string; version: string }> = [
  { id: 'http', label: 'Raw HTTP', packageName: 'OpenAPI 3.1.1', version: 'published contract' },
  { id: 'typescript', label: 'TypeScript', packageName: '@clervo/sdk', version: '0.3.0 published' },
  { id: 'python', label: 'Python', packageName: 'clervo-sdk', version: '0.2.0 published' },
  { id: 'mcp', label: 'MCP', packageName: '@clervo/mcp', version: '0.3.0 published' },
];

// Typed failures, in the order a caller meets them. The middle column is the
// only thing a reader needs after a non-200: whether anything ran, and whether
// sending the request again is safe.
const failures: Array<{ code: string; retry: 'refused' | 'unresolved'; detail: string }> = [
  { code: '400', retry: 'refused', detail: 'The request was rejected before execution. Nothing ran and nothing was charged.' },
  { code: '402', retry: 'refused', detail: 'A typed challenge carrying the exact maximum charge. No client signs it for you.' },
  { code: '409', retry: 'refused', detail: 'The idempotency key is already bound to a different request. Change the key or send the original request.' },
  { code: '429', retry: 'refused', detail: 'The free entry quota is exhausted. The request was not executed.' },
  { code: '502', retry: 'unresolved', detail: 'The executor or contract verification failed closed. Reconcile the settlement state before retrying.' },
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
  const selected = clients.find(({ id }) => id === clientId) ?? clients[0]!;
  useEffect(() => {
    onPhase(activation.receiptInspected ? 'receipt' : 'qualified');
  }, [activation.receiptInspected, onPhase]);
  if (!validClient) return null;

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Developer quickstart / published clients</p>
        <h1>Install the client.<br />Keep the boundary visible.</h1>
        <p className="lede">
          The TypeScript SDK, MCP server and Python SDK are published and
          registry-verified. Every client takes an explicit base URL, so the
          endpoint you are calling is never implicit
          {publicApiCallable
            ? `. The observed public origin is ${observedApiOrigin}.`
            : ' and no public origin is currently observed serving.'}
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--primary" to="/start">Set up Clervo</Link>
          <a className="button button--quiet" href="/openapi.yaml">Read the OpenAPI contract</a>
        </div>
      </section>

      {quickStartCurl === null ? null : (
        <section className="band band--ruled docs-body" aria-labelledby="docs-first-call">
          <div className="section-head">
            <p className="eyebrow">First call / no account required</p>
            <h2 id="docs-first-call">One command. A cited result.</h2>
            <p className="lede">
              {quickStartNeedsNoKey
                ? 'No account, no API key, no wallet, no idempotency key. The server generates a key and returns it in the idempotency-key response header; send that value back to replay the same operation without a second execution.'
                : 'No account, no API key and no wallet. The route currently requires an idempotency-key header, so this command carries one; reuse the same value to replay without a second execution.'}
            </p>
          </div>
          <CodeBlock label="First free Search call" code={quickStartCurl} />
          <p className="quiet docs-note">
            Over the free cap the route answers <code>429 free_quota_exceeded</code>{' '}
            rather than executing. Paid requests return a 402 carrying the exact
            maximum charge before anything runs.
          </p>
        </section>
      )}

      <section className="band band--ruled docs-body" aria-labelledby="docs-client">
        <div className="section-head">
          <p className="eyebrow">{selected.packageName} / {selected.version}</p>
          <h2 id="docs-client">{selected.label} client</h2>
          <p className="lede">
            Installable from its public registry, configured with an explicit
            base URL. It does not sign payment authorizations on your behalf and
            never retries an unknown settlement automatically.
          </p>
        </div>
        <nav className="cluster docs-clients" aria-label="Client language">
          {clients.map((item) => (
            <Link
              key={item.id}
              className={item.id === clientId ? 'is-active' : ''}
              aria-current={item.id === clientId ? 'page' : undefined}
              to={`/docs/${item.id}`}
            >
              {item.label}
              <i>{item.packageName}</i>
            </Link>
          ))}
        </nav>
        <CodeBlock
          label={`${selected.label} client`}
          code={installExamples[clientId]}
          onCopy={() => updateActivation({ selectedClient: clientId })}
        />
      </section>

      <section className="band band--ruled docs-body" aria-labelledby="docs-operations">
        <div className="section-head">
          <p className="eyebrow">Exact operation surface</p>
          <h2 id="docs-operations">Published operations, with the state of the family behind each.</h2>
          <p className="lede">
            An operation on the discovery document is a named contract. Whether
            the family behind it answers requests right now is a separate
            observation, and it is the one in the right-hand column.
          </p>
        </div>
        <ul className="docs-operations">
          {discovery.products.map((product) => {
            const observed = observedProduct(familyOf(product.productId));
            const price = product.pricing.displayPrice;
            return (
              <li key={product.productId}>
                <code>{product.productId}</code>
                <span className="quiet">
                  {product.publicAvailable ? product.summary : `${product.summary} Not publicly available.`}
                </span>
                <span className="data docs-operations__price">
                  {price === null ? 'no public price' : `max ${formatUsdc(price.amountAtomic, price.decimals)}`}
                </span>
                <span className={`state state--${observed.lifecycleState}`}>
                  {lifecycleLabels[observed.lifecycleState]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="band band--ruled docs-body" aria-labelledby="docs-failures">
        <div className="section-head">
          <p className="eyebrow">Failure behaviour</p>
          <h2 id="docs-failures">Typed errors say whether a retry is safe.</h2>
          <p className="lede">
            Refused means nothing executed and nothing was charged, so the
            request can be corrected and sent again. Unresolved means execution
            began and the settlement state is not known, so it is reconciled
            rather than retried.
          </p>
        </div>
        <ul className="docs-failures">
          {failures.map(({ code, retry, detail }) => (
            <li key={code}>
              <b className="data">{code}</b>
              <span className={`state state--${retry}`}>{retry}</span>
              <span className="quiet">{detail}</span>
            </li>
          ))}
        </ul>
        <p className="cluster docs-note">
          <Link className="text-link" to="/docs/failures">Read the full recovery contract</Link>
          <Link className="text-link" to="/docs/replay">Read replay semantics</Link>
        </p>
      </section>

      <section className="band docs-body" aria-labelledby="docs-binding">
        <div className="section-head">
          <p className="eyebrow">Interface binding</p>
          <h2 id="docs-binding">What these snippets are pinned to.</h2>
        </div>
        <dl className="facts">
          <div>
            <dt>Contract</dt>
            <dd>{discovery.contractVersion}</dd>
          </div>
          <div>
            <dt>Release candidate</dt>
            <dd>{discovery.distribution.releaseCandidateId}</dd>
          </div>
          <div>
            <dt>Interface hash</dt>
            <dd>{discovery.distribution.interfaceHash}</dd>
          </div>
          <div>
            <dt>Observed API origin</dt>
            <dd>{publicApiCallable ? observedApiOrigin : 'none observed'}</dd>
          </div>
          <div>
            <dt>Package publication</dt>
            <dd>{launchState.distribution.packages.state.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt>Public payment quoted</dt>
            <dd>{searchObserved.observedPrice === null ? 'no' : 'yes'}</dd>
          </div>
        </dl>
        {activation.selectedClient === null ? null : (
          <p className="quiet docs-note" aria-live="polite">
            {activation.selectedClient} snippet copied. Recorded in this browser
            only, and never sent anywhere.
          </p>
        )}
      </section>
    </>
  );
}
