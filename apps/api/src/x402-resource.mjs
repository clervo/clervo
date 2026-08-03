import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { isQuoteExpired, verifyQuote } from '../../../dist/packages/contracts/src/index.js';

const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED';
const pathMethods = Object.freeze({ supported: 'GET', verify: 'POST', settle: 'POST' });

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
} = {}) {
  if (network !== 'eip155:8453') throw new TypeError('unsupported x402 production network');
  if (!/^0x[a-fA-F0-9]{40}$/u.test(asset ?? '')) throw new TypeError('invalid x402 asset');
  if (!/^0x[a-fA-F0-9]{40}$/u.test(payTo ?? '')) throw new TypeError('invalid x402 receiver');
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.hostname === 'ai.clervo.dev') {
    throw new TypeError('invalid x402 public origin');
  }
  const client = facilitator ?? new HTTPFacilitatorClient({
    url: facilitatorUrl(url).toString(),
    createAuthHeaders: createCdpFacilitatorAuth({ keyId, keySecret, url }),
  });
  const server = new x402ResourceServer(client).register(network, new ExactEvmScheme());
  await server.initialize();
  return Object.freeze({
    mode: 'challenge_only',
    async challenge({ quote, description, now }) {
      if (!verifyQuote(quote)) throw new TypeError('quote_hash_invalid');
      if (isQuoteExpired(quote, now)) throw new TypeError('quote_expired');
      if (quote.maximumCharge.asset !== 'USDC' || quote.maximumCharge.decimals !== 6) throw new TypeError('quote_asset_invalid');
      if (typeof description !== 'string' || description.length < 1 || description.length > 500) throw new TypeError('description_invalid');
      const requirements = await server.buildPaymentRequirements({
        scheme: 'exact',
        network,
        payTo,
        price: { amount: quote.maximumCharge.amountAtomic, asset },
        maxTimeoutSeconds: Math.min(60, Math.max(1, Math.floor((Date.parse(quote.expiresAt) - Date.parse(now)) / 1_000))),
        extra: {
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
        url: `${origin.origin}/v1/search/paid`,
        description,
        mimeType: 'application/json',
      }, 'PAYMENT-SIGNATURE header is required');
      const header = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
      return Object.freeze({ status: 402, headers: Object.freeze({ [PAYMENT_REQUIRED_HEADER]: header }), body });
    },
  });
}
