import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { bazaarResourceServerExtension, declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { isQuoteExpired, verifyQuote } from '../../../dist/packages/contracts/src/index.js';

const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED';
const PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE';
const MAXIMUM_PAYMENT_HEADER_BYTES = 65_536;
const pathMethods = Object.freeze({ supported: 'GET', verify: 'POST', settle: 'POST' });
const BASE_USDC_EIP712_DOMAIN = Object.freeze({ name: 'USD Coin', version: '2' });
const PAYABLE_RESOURCE_PATHS = new Set(['/v1/search/paid', '/v1/ai/execute']);
const SEARCH_DISCOVERY_INPUT = Object.freeze({ query: 'current x402 protocol documentation', maxResults: 3, synthesize: false, language: 'en', region: 'US' });
const AI_DISCOVERY_INPUT = Object.freeze({
  model: 'gpt-5.6-luna',
  input: Object.freeze({ kind: 'chat', messages: Object.freeze([Object.freeze({ role: 'user', content: 'Reply with the single word ready.' })]), responseFormat: 'text', stream: false }),
  maximumOutputTokens: 16,
});

function discoveryExtension(resourcePath) {
  const ai = resourcePath === '/v1/ai/execute';
  const input = ai ? AI_DISCOVERY_INPUT : SEARCH_DISCOVERY_INPUT;
  const inputSchema = ai ? {
    type: 'object', required: ['model', 'input', 'maximumOutputTokens'], additionalProperties: false,
    properties: {
      model: { type: 'string', enum: ['gpt-5.6-luna'] },
      input: {
        type: 'object', required: ['kind', 'messages', 'responseFormat', 'stream'], additionalProperties: false,
        properties: {
          kind: { const: 'chat' },
          messages: { type: 'array', minItems: 1, items: { type: 'object', required: ['role', 'content'], properties: { role: { enum: ['user'] }, content: { type: 'string', minLength: 1 } }, additionalProperties: false } },
          responseFormat: { const: 'text' }, stream: { const: false },
        },
      },
      maximumOutputTokens: { type: 'integer', minimum: 1, maximum: 16384 },
    },
  } : {
    type: 'object', required: ['query', 'synthesize'], additionalProperties: false,
    properties: {
      query: { type: 'string', minLength: 1, maxLength: 2000 }, maxResults: { type: 'integer', minimum: 1, maximum: 10 },
      synthesize: { const: false }, language: { type: 'string' }, region: { type: 'string' },
    },
  };
  const outputExample = ai
    ? { productId: 'ai.chat', state: 'RECEIPTED', replayed: false, exactModelId: 'gpt-5.6-luna', result: { output: { kind: 'chat', content: 'ready' } }, receipt: { settlement: { status: 'settled' } } }
    : { productId: 'search.web', state: 'RECEIPTED', replayed: false, output: { searchResponse: { results: [], citations: [] } }, receipt: { settlement: { status: 'settled' } } };
  return declareDiscoveryExtension({
    method: 'POST', bodyType: 'json', input, inputSchema,
    output: { example: outputExample, schema: { additionalProperties: true } },
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
} = {}) {
  if (network !== 'eip155:8453') throw new TypeError('unsupported x402 production network');
  if (!/^0x[a-fA-F0-9]{40}$/u.test(asset ?? '')) throw new TypeError('invalid x402 asset');
  if (!/^0x[a-fA-F0-9]{40}$/u.test(payTo ?? '')) throw new TypeError('invalid x402 receiver');
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.hostname === 'ai.clervo.dev') {
    throw new TypeError('invalid x402 public origin');
  }
  if (!['challenge_only', 'settlement_enabled'].includes(paymentMode)) throw new TypeError('invalid x402 payment mode');
  const client = facilitator ?? new HTTPFacilitatorClient({
    url: facilitatorUrl(url).toString(),
    createAuthHeaders: createCdpFacilitatorAuth({ keyId, keySecret, url }),
  });
  const server = new x402ResourceServer(client)
    .register(network, new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension);
  await server.initialize();
  return Object.freeze({
    mode: paymentMode,
    async challenge({ quote, description, now, resourcePath = '/v1/search/paid' }) {
      if (!verifyQuote(quote)) throw new TypeError('quote_hash_invalid');
      if (isQuoteExpired(quote, now)) throw new TypeError('quote_expired');
      if (quote.maximumCharge.asset !== 'USDC' || quote.maximumCharge.decimals !== 6) throw new TypeError('quote_asset_invalid');
      if (typeof description !== 'string' || description.length < 1 || description.length > 500) throw new TypeError('description_invalid');
      if (!PAYABLE_RESOURCE_PATHS.has(resourcePath)) throw new TypeError('resource_path_invalid');
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
      const body = await server.createPaymentRequiredResponse(requirements, {
        url: `${origin.origin}${resourcePath}`,
        description,
        mimeType: 'application/json',
      }, 'PAYMENT-SIGNATURE header is required', discoveryExtension(resourcePath));
      const header = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
      return Object.freeze({ status: 402, headers: Object.freeze({ [PAYMENT_REQUIRED_HEADER]: header }), body });
    },
    async authorize({ paymentHeader, challenge }) {
      if (paymentMode !== 'settlement_enabled') throw new Error('x402 settlement is disabled');
      const paymentPayload = decodePaymentHeader(paymentHeader);
      const requirements = server.findMatchingRequirements(challenge?.body?.accepts ?? [], paymentPayload);
      if (!requirements) throw new TypeError('x402 payment requirements mismatch');
      const extensions = server.validateExtensions(challenge.body, paymentPayload);
      if (!extensions.valid) throw new TypeError('x402 payment extensions mismatch');
      const verification = await server.verifyPayment(paymentPayload, requirements, challenge.body.extensions ?? {});
      if (!verification.isValid) throw new TypeError(`x402 payment invalid:${verification.invalidReason ?? 'unknown'}`);
      const fingerprint = `sha256:${createHash('sha256').update(JSON.stringify(paymentPayload)).digest('hex')}`;
      return Object.freeze({ paymentPayload, requirements, verification, fingerprint });
    },
    async settle(authorization) {
      if (paymentMode !== 'settlement_enabled') throw new Error('x402 settlement is disabled');
      if (!authorization?.paymentPayload || !authorization?.requirements || !/^sha256:[a-f0-9]{64}$/u.test(authorization?.fingerprint ?? '')) {
        throw new TypeError('invalid x402 authorization context');
      }
      try {
        const settlement = await server.settlePayment(authorization.paymentPayload, authorization.requirements);
        if (!settlement.success) return Object.freeze({ kind: 'unknown', reason: settlement.errorReason ?? 'settlement_failed' });
        return Object.freeze({
          kind: 'settled',
          settlement,
          headers: Object.freeze({ [PAYMENT_RESPONSE_HEADER]: Buffer.from(JSON.stringify(settlement), 'utf8').toString('base64') }),
        });
      } catch (error) {
        return Object.freeze({ kind: 'unknown', reason: error?.errorReason ?? 'settlement_transport_or_state_unknown' });
      }
    },
  });
}
