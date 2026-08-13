import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { bazaarResourceServerExtension, declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { Receipt } from 'mppx';
import { Mppx, evm } from 'mppx/server';
import { isQuoteExpired, verifyQuote } from '../../../dist/packages/contracts/src/index.js';

const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED';
const PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE';
const MPP_CHALLENGE_HEADER = 'WWW-Authenticate';
const MPP_RECEIPT_HEADER = 'Payment-Receipt';
const MAXIMUM_PAYMENT_HEADER_BYTES = 65_536;
const pathMethods = Object.freeze({ supported: 'GET', verify: 'POST', settle: 'POST' });
const BASE_USDC_EIP712_DOMAIN = Object.freeze({ name: 'USD Coin', version: '2' });
export const PAYABLE_RESOURCE_PATHS = Object.freeze([
  '/v1/search/paid',
  '/v1/ai/execute',
  '/v1/chat/completions',
  '/v1/sandbox/execute',
  '/v1/rpc/execute',
  '/v1/prediction/execute',
  '/v1/crypto/execute',
]);
const payableResourcePaths = new Set(PAYABLE_RESOURCE_PATHS);
// Bazaar reads `serviceName`, `tags`, and `iconUrl` off the resource block of the
// settled payment payload (`sanitizeResourceServiceMetadata`), and metadata
// completeness feeds its ranking. The library silently drops any field that
// fails its own bounds, so these stay inside them: service name <= 32 printable
// ASCII characters, at most 5 tags of <= 32 characters each, and an icon URL on
// a public https host.
const RESOURCE_SERVICE_NAME = 'Clervo';
const RESOURCE_TAGS = Object.freeze({
  '/v1/search/paid': Object.freeze(['search', 'web', 'citations', 'x402']),
  '/v1/ai/execute': Object.freeze(['ai', 'llm', 'chat', 'inference', 'x402']),
  '/v1/chat/completions': Object.freeze(['ai', 'llm', 'chat', 'openai', 'x402']),
  '/v1/sandbox/execute': Object.freeze(['sandbox', 'code-execution', 'isolated', 'x402']),
  '/v1/rpc/execute': Object.freeze(['rpc', 'blockchain', 'evm', 'json-rpc', 'x402']),
  '/v1/prediction/execute': Object.freeze(['prediction-markets', 'odds', 'forecasting', 'x402']),
  '/v1/crypto/execute': Object.freeze(['crypto', 'onchain', 'wallet', 'analytics', 'x402']),
});
const SEARCH_DISCOVERY_INPUT = Object.freeze({ query: 'current x402 protocol documentation', maxResults: 3, synthesize: false, language: 'en', region: 'US' });

function defaultDiscovery(resourcePath) {
  const ai = ['/v1/ai/execute', '/v1/chat/completions'].includes(resourcePath);
  if (ai) throw new TypeError('ai_resource_discovery_required');
  const input = SEARCH_DISCOVERY_INPUT;
  const inputSchema = {
    type: 'object', required: ['query', 'synthesize'], additionalProperties: false,
    properties: {
      query: { type: 'string', minLength: 1, maxLength: 2000 }, maxResults: { type: 'integer', minimum: 1, maximum: 10 },
      synthesize: { const: false }, language: { type: 'string' }, region: { type: 'string' },
    },
  };
  const outputExample = { productId: 'search.web', state: 'RECEIPTED', replayed: false, output: { searchResponse: { results: [], citations: [] } }, receipt: { settlement: { status: 'settled' } } };
  return Object.freeze({
    method: 'POST', bodyType: 'json', input, inputSchema,
    output: { example: outputExample, schema: { type: 'object', additionalProperties: true } },
  });
}

function discoveryExtension(resourcePath, discovery) {
  const selected = discovery ?? defaultDiscovery(resourcePath);
  if (selected?.method !== 'POST' || selected?.bodyType !== 'json' || selected?.input === undefined
    || selected?.inputSchema?.type !== 'object' || selected?.output?.schema === undefined
    || selected?.output?.example === undefined) throw new TypeError('resource_discovery_invalid');
  return declareDiscoveryExtension(selected);
}

function resourceInfo(origin, resourcePath, description) {
  const tags = RESOURCE_TAGS[resourcePath];
  if (tags === undefined) throw new TypeError('resource_path_invalid');
  return Object.freeze({
    url: `${origin.origin}${resourcePath}`,
    description,
    mimeType: 'application/json',
    serviceName: RESOURCE_SERVICE_NAME,
    tags,
    iconUrl: `${origin.origin}/favicon.svg`,
  });
}

function base64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function facilitatorUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'api.cdp.coinbase.com'
    || url.pathname.replace(/\/+$/u, '') !== '/platform/v2/x402'
    || url.username
    || url.password
    || url.search
    || url.hash
  ) throw new TypeError('invalid production facilitator URL');
  return url;
}

function signingKey(value) {
  const normalized = value.replace(/\\n/gu, '\n');
  if (normalized.includes('-----BEGIN')) {
    const key = createPrivateKey(normalized);
    const algorithm = key.asymmetricKeyType === 'ec' ? 'ES256' : key.asymmetricKeyType === 'ed25519' ? 'EdDSA' : undefined;
    if (!algorithm) throw new TypeError('unsupported facilitator signing key');
    return { key, algorithm };
  }
  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.length !== 64) throw new TypeError('invalid facilitator signing key');
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  return {
    key: createPrivateKey({ key: Buffer.concat([pkcs8Prefix, decoded.subarray(0, 32)]), format: 'der', type: 'pkcs8' }),
    algorithm: 'EdDSA',
  };
}

function decodePaymentHeader(value) {
  if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value) > MAXIMUM_PAYMENT_HEADER_BYTES) {
    throw new TypeError('invalid x402 payment header');
  }
  let payment;
  try {
    payment = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    throw new TypeError('invalid x402 payment header');
  }
  if (!payment || payment.x402Version !== 2 || !payment.accepted || !payment.payload) throw new TypeError('invalid x402 payment payload');
  return payment;
}

function decimalAmount(amountAtomic, decimals = 6) {
  if (!/^(?:0|[1-9][0-9]{0,77})$/u.test(amountAtomic ?? '') || decimals !== 6) throw new TypeError('invalid payment amount');
  const padded = amountAtomic.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function mppMetadata(quote, resourcePath) {
  return Object.freeze({
    quoteId: quote.quoteId,
    quoteHash: quote.quoteHash,
    requestHash: quote.requestHash,
    operationId: quote.operationId,
    priceVersion: quote.priceVersion,
    quoteExpiresAt: quote.expiresAt,
    resource: resourcePath,
  });
}

function mppAuthorizationPayload(payload, requirements) {
  return Object.freeze({
    x402Version: 2,
    accepted: requirements,
    payload: Object.freeze({
      authorization: Object.freeze({
        from: payload.from,
        nonce: payload.nonce,
        to: payload.to,
        validAfter: payload.validAfter,
        validBefore: payload.validBefore,
        value: payload.value,
      }),
      signature: payload.signature,
    }),
  });
}

export function createCdpFacilitatorAuth({ keyId, keySecret, url, now = () => Date.now(), nonce = () => randomBytes(16).toString('hex') } = {}) {
  if (typeof keyId !== 'string' || keyId.length < 3 || keyId.length > 256) throw new TypeError('invalid facilitator key id');
  if (typeof keySecret !== 'string' || keySecret.length < 32) throw new TypeError('invalid facilitator key secret');
  const base = facilitatorUrl(url);
  const signer = signingKey(keySecret);
  return async () => {
    const headers = {};
    for (const [path, method] of Object.entries(pathMethods)) {
      const nowSeconds = Math.floor(now() / 1_000);
      const requestPath = `${base.pathname.replace(/\/+$/u, '')}/${path}`;
      const header = { alg: signer.algorithm, typ: 'JWT', kid: keyId, nonce: nonce() };
      const claims = {
        sub: keyId,
        iss: 'cdp',
        aud: ['cdp_service'],
        nbf: nowSeconds,
        exp: nowSeconds + 120,
        uri: `${method} ${base.hostname}${requestPath}`,
      };
      const unsigned = `${base64url(header)}.${base64url(claims)}`;
      const signature = signer.algorithm === 'ES256'
        ? sign('sha256', Buffer.from(unsigned), { key: signer.key, dsaEncoding: 'ieee-p1363' })
        : sign(null, Buffer.from(unsigned), signer.key);
      headers[path] = { Authorization: `Bearer ${unsigned}.${signature.toString('base64url')}` };
    }
    return headers;
  };
}

export async function createX402ChallengeService({
  facilitator,
  facilitatorUrl: url,
  keyId,
  keySecret,
  network,
  asset,
  payTo,
  publicOrigin,
  paymentMode = 'challenge_only',
  mppSecretKey,
} = {}) {
  if (network !== 'eip155:8453') throw new TypeError('unsupported x402 production network');
  if (!/^0x[a-fA-F0-9]{40}$/u.test(asset ?? '')) throw new TypeError('invalid x402 asset');
  if (!/^0x[a-fA-F0-9]{40}$/u.test(payTo ?? '')) throw new TypeError('invalid x402 receiver');
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.hostname === 'ai.clervo.dev') {
    throw new TypeError('invalid x402 public origin');
  }
  if (!['challenge_only', 'settlement_enabled'].includes(paymentMode)) throw new TypeError('invalid x402 payment mode');
  if (typeof mppSecretKey !== 'string' || Buffer.byteLength(mppSecretKey) < 32 || Buffer.byteLength(mppSecretKey) > 512) throw new TypeError('invalid MPP secret key');
  const client = facilitator ?? new HTTPFacilitatorClient({
    url: facilitatorUrl(url).toString(),
    createAuthHeaders: createCdpFacilitatorAuth({ keyId, keySecret, url }),
  });
  const server = new x402ResourceServer(client)
    .register(network, new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension);
  await server.initialize();

  function mppHandler({ quote, description, resourcePath, onVerified }) {
    const meta = mppMetadata(quote, resourcePath);
    const amount = decimalAmount(quote.maximumCharge.amountAtomic, quote.maximumCharge.decimals);
    const scope = `POST ${resourcePath}`;
    const method = evm.charge({
      currency: evm.assets.base.USDC,
      recipient: payTo,
      async settle({ payload, request }) {
        const requirements = Object.freeze({
          scheme: 'exact', network, amount: request.amount, asset: request.currency, payTo: request.recipient,
          maxTimeoutSeconds: Math.min(300, Math.max(1, Math.floor((Date.parse(quote.expiresAt) - Date.parse(quote.issuedAt)) / 1_000))),
          extra: Object.freeze({ ...BASE_USDC_EIP712_DOMAIN, clervo: meta }),
        });
        const paymentPayload = mppAuthorizationPayload(payload, requirements);
        const verification = await client.verify(paymentPayload, requirements);
        if (!verification.isValid) throw new TypeError(`MPP payment invalid:${verification.invalidReason ?? verification.invalidMessage ?? 'unknown'}`);
        const fingerprint = `sha256:${createHash('sha256').update(JSON.stringify({ protocol: 'mpp', paymentPayload })).digest('hex')}`;
        onVerified?.(Object.freeze({ paymentPayload, requirements, verification, fingerprint }));
        return { reference: `verified:${fingerprint}`, timestamp: quote.issuedAt };
      },
    });
    const mppx = Mppx.create({ methods: [method], realm: origin.host, secretKey: mppSecretKey });
    return {
      handler: mppx.evm.charge({ amount, description, externalId: quote.operationId, expires: quote.expiresAt, meta, scope }),
      meta,
      scope,
    };
  }

  return Object.freeze({
    mode: paymentMode,
    async challenge({ quote, description, now, resourcePath = '/v1/search/paid', discovery }) {
      if (!verifyQuote(quote)) throw new TypeError('quote_hash_invalid');
      if (isQuoteExpired(quote, now)) throw new TypeError('quote_expired');
      if (quote.maximumCharge.asset !== 'USDC' || quote.maximumCharge.decimals !== 6) throw new TypeError('quote_asset_invalid');
      if (typeof description !== 'string' || description.length < 1 || description.length > 500) throw new TypeError('description_invalid');
      if (!payableResourcePaths.has(resourcePath)) throw new TypeError('resource_path_invalid');
      const requirements = await server.buildPaymentRequirements({
        scheme: 'exact',
        network,
        payTo,
        price: { amount: quote.maximumCharge.amountAtomic, asset },
        maxTimeoutSeconds: Math.min(60, Math.max(1, Math.floor((Date.parse(quote.expiresAt) - Date.parse(now)) / 1_000))),
        extra: {
          ...BASE_USDC_EIP712_DOMAIN,
          clervo: {
            quoteId: quote.quoteId,
            quoteHash: quote.quoteHash,
            requestHash: quote.requestHash,
            operationId: quote.operationId,
            priceVersion: quote.priceVersion,
            quoteExpiresAt: quote.expiresAt,
          },
        },
      });
      const body = await server.createPaymentRequiredResponse(requirements, resourceInfo(origin, resourcePath, description), 'PAYMENT-SIGNATURE header is required', discoveryExtension(resourcePath, discovery));
      const header = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
      const mpp = mppHandler({ quote, description, resourcePath });
      const mppResult = await mpp.handler(new Request(`${origin.origin}${resourcePath}`, { method: 'POST' }));
      if (mppResult.status !== 402) throw new TypeError('MPP challenge unavailable');
      const mppHeader = mppResult.challenge.headers.get(MPP_CHALLENGE_HEADER);
      if (!mppHeader) throw new TypeError('MPP challenge header unavailable');
      return Object.freeze({
        status: 402,
        headers: Object.freeze({ [PAYMENT_REQUIRED_HEADER]: header, [MPP_CHALLENGE_HEADER]: mppHeader }),
        body,
        quote,
        mpp: Object.freeze({ description, resourcePath }),
      });
    },
    async authorize({ paymentHeader, authorizationHeader, challenge }) {
      if (paymentMode !== 'settlement_enabled') throw new Error('x402 settlement is disabled');
      if (paymentHeader !== undefined && authorizationHeader !== undefined) throw new TypeError('multiple payment credentials are not allowed');
      if (authorizationHeader !== undefined) {
        if (typeof authorizationHeader !== 'string' || Buffer.byteLength(authorizationHeader) > MAXIMUM_PAYMENT_HEADER_BYTES || !/^Payment\s+/iu.test(authorizationHeader)) {
          throw new TypeError('invalid MPP payment credential');
        }
        let verified;
        try {
          const mpp = mppHandler({
            quote: challenge?.quote,
            description: challenge?.mpp?.description,
            resourcePath: challenge?.mpp?.resourcePath,
            onVerified(value) { verified = value; },
          });
          const result = await mpp.handler(new Request(`${origin.origin}${challenge.mpp.resourcePath}`, { method: 'POST', headers: { Authorization: authorizationHeader } }));
          if (result.status !== 200 || !verified) throw new TypeError('MPP payment credential rejected');
        } catch {
          throw new TypeError('invalid MPP payment credential');
        }
        // Same reason as the x402 branch below: the settlement that reaches the
        // facilitator has to name the resource it paid for, or it indexes
        // nothing. The MPP credential carries the EIP-3009 authorization only,
        // so the resource and the declared discovery extension come from the
        // challenge this payment answered.
        return Object.freeze({
          protocol: 'mpp',
          ...verified,
          paymentPayload: Object.freeze({
            ...verified.paymentPayload,
            resource: challenge.body?.resource,
            extensions: { ...(challenge.body?.extensions ?? {}) },
          }),
        });
      }
      const paymentPayload = decodePaymentHeader(paymentHeader);
      const requirements = server.findMatchingRequirements(challenge?.body?.accepts ?? [], paymentPayload);
      if (!requirements) throw new TypeError('x402 payment requirements mismatch');
      const extensions = server.validateExtensions(challenge.body, paymentPayload);
      if (!extensions.valid) throw new TypeError('x402 payment extensions mismatch');
      const verification = await server.verifyPayment(paymentPayload, requirements, challenge.body.extensions ?? {});
      if (!verification.isValid) throw new TypeError(`x402 payment invalid:${verification.invalidReason ?? 'unknown'}`);
      const fingerprint = `sha256:${createHash('sha256').update(JSON.stringify(paymentPayload)).digest('hex')}`;
      // Bazaar indexes a settlement by reading `resource` and the `bazaar`
      // extension off the payload that reaches the facilitator. Those fields are
      // ours, not the payer's: `@x402/core`'s client copies them out of the
      // challenge, but a payer that omits or trims them would settle against an
      // empty resource URL and index nothing. Both are restored here from the
      // challenge we issued, after verification and after the fingerprint is
      // taken over exactly the bytes the payer signed for, so neither the
      // payment binding nor the idempotency identity changes.
      const settlementPayload = Object.freeze({
        ...paymentPayload,
        resource: challenge.body.resource,
        extensions: { ...(paymentPayload.extensions ?? {}), ...(challenge.body.extensions ?? {}) },
      });
      return Object.freeze({ protocol: 'x402', paymentPayload: settlementPayload, requirements, verification, fingerprint });
    },
    async settle(authorization) {
      if (paymentMode !== 'settlement_enabled') throw new Error('x402 settlement is disabled');
      if (!authorization?.paymentPayload || !authorization?.requirements || !/^sha256:[a-f0-9]{64}$/u.test(authorization?.fingerprint ?? '')) {
        throw new TypeError('invalid x402 authorization context');
      }
      try {
        const settlement = await server.settlePayment(authorization.paymentPayload, authorization.requirements);
        if (!settlement.success) return Object.freeze({ kind: 'unknown', reason: settlement.errorReason ?? 'settlement_failed' });
        const headers = authorization.protocol === 'mpp'
          ? Object.freeze({ [MPP_RECEIPT_HEADER]: Receipt.serialize(Receipt.from({ method: 'evm', reference: settlement.transaction, status: 'success', timestamp: new Date().toISOString() })) })
          : Object.freeze({ [PAYMENT_RESPONSE_HEADER]: Buffer.from(JSON.stringify(settlement), 'utf8').toString('base64') });
        return Object.freeze({
          kind: 'settled',
          settlement,
          headers,
        });
      } catch (error) {
        return Object.freeze({ kind: 'unknown', reason: error?.errorReason ?? 'settlement_transport_or_state_unknown' });
      }
    },
  });
}
