import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const keyIdentifier = process.env.CDP_API_KEY_ID;
const secretCredential = process.env.CDP_API_KEY_SECRET;
const configuredFacilitator = process.env.CDP_X402_FACILITATOR_URL;
if (!keyIdentifier || !secretCredential || !configuredFacilitator) {
  throw new Error('CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_X402_FACILITATOR_URL are required');
}

const facilitator = new URL(configuredFacilitator);
if (
  facilitator.protocol !== 'https:'
  || facilitator.hostname !== 'api.cdp.coinbase.com'
  || facilitator.pathname.replace(/\/+$/u, '') !== '/platform/v2/x402'
  || facilitator.username
  || facilitator.password
  || facilitator.search
) {
  throw new Error('CDP_X402_FACILITATOR_URL must be the exact credential-free production CDP facilitator origin and path');
}

const base64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const normalizedSecret = secretCredential.replace(/\\n/gu, '\n');
let signingKey;
let algorithm;
if (normalizedSecret.includes('-----BEGIN')) {
  signingKey = createPrivateKey(normalizedSecret);
  algorithm = signingKey.asymmetricKeyType === 'ec' ? 'ES256' : signingKey.asymmetricKeyType === 'ed25519' ? 'EdDSA' : null;
} else {
  const decoded = Buffer.from(normalizedSecret, 'base64');
  if (decoded.length !== 64) throw new Error('CDP secret is neither a supported PEM key nor a 64-byte Ed25519 credential');
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  signingKey = createPrivateKey({ key: Buffer.concat([pkcs8Prefix, decoded.subarray(0, 32)]), format: 'der', type: 'pkcs8' });
  algorithm = 'EdDSA';
}
if (!algorithm) throw new Error('Unsupported CDP signing-key algorithm');

const supportedPath = '/platform/v2/x402/supported';
const nowSeconds = Math.floor(Date.now() / 1000);
const header = { alg: algorithm, typ: 'JWT', kid: keyIdentifier, nonce: randomBytes(16).toString('hex') };
const claims = {
  sub: keyIdentifier,
  iss: 'cdp',
  aud: ['cdp_service'],
  nbf: nowSeconds,
  exp: nowSeconds + 120,
  uri: `GET api.cdp.coinbase.com${supportedPath}`,
};
const unsignedToken = `${base64url(header)}.${base64url(claims)}`;
const signature = algorithm === 'ES256'
  ? sign('sha256', Buffer.from(unsignedToken), { key: signingKey, dsaEncoding: 'ieee-p1363' })
  : sign(null, Buffer.from(unsignedToken), signingKey);
const bearer = `${unsignedToken}.${signature.toString('base64url')}`;

const probe = async ({ serviceId, url, authorization }) => {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', ...(authorization ? { authorization } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Math.round(performance.now() - started);
    const payload = await response.json().catch(() => null);
    const kinds = Array.isArray(payload?.kinds) ? payload.kinds : [];
    const validKinds = kinds.filter(({ x402Version, scheme, network }) => Number.isInteger(x402Version) && typeof scheme === 'string' && typeof network === 'string');
    return {
      serviceId,
      status: response.status,
      latencyMs,
      responseShapeValid: validKinds.length === kinds.length && kinds.length > 0 && Array.isArray(payload?.extensions) && typeof payload?.signers === 'object',
      supportedKindCount: validKinds.length,
      protocolVersions: [...new Set(validKinds.map(({ x402Version }) => x402Version))].sort(),
      schemes: [...new Set(validKinds.map(({ scheme }) => scheme))].sort(),
      networks: [...new Set(validKinds.map(({ network }) => network))].sort(),
      extensionNames: Array.isArray(payload?.extensions) ? payload.extensions.filter((value) => typeof value === 'string').sort() : [],
      signerPatternCount: payload?.signers && typeof payload.signers === 'object' ? Object.keys(payload.signers).length : 0,
      signerValuesRecorded: false,
      passed: response.ok && validKinds.length > 0,
    };
  } catch (error) {
    return {
      serviceId,
      status: null,
      latencyMs: Math.round(performance.now() - started),
      responseShapeValid: false,
      supportedKindCount: 0,
      protocolVersions: [],
      schemes: [],
      networks: [],
      extensionNames: [],
      signerPatternCount: 0,
      signerValuesRecorded: false,
      passed: false,
      failureCode: error?.name === 'TimeoutError' ? 'timeout' : 'transport_failure',
    };
  }
};

const observations = [
  await probe({ serviceId: 'supply.cdp_x402', url: new URL(supportedPath, facilitator.origin), authorization: `Bearer ${bearer}` }),
  await probe({ serviceId: 'supply.x402_testnet', url: 'https://x402.org/facilitator/supported' }),
];

const report = {
  schemaVersion: 'clervo.x402-facilitator-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  ownerCashSpentUsd: 0,
  externalCalls: observations.length,
  supportedDiscoveryCalls: observations.length,
  verificationCalls: 0,
  settlementCalls: 0,
  walletSignatureCalls: 0,
  paymentAuthorizationCalls: 0,
  transactionSubmissionCalls: 0,
  gasSpent: 0,
  usdcSpent: 0,
  credentialPolicy: {
    cdpCredentialSlotsUsed: 1,
    jwtLifetimeSeconds: 120,
    secretValuesRecorded: false,
    signerAddressesRecorded: false,
  },
  summary: {
    passedFacilitators: observations.filter(({ passed }) => passed).length,
    productionFacilitatorStatus: observations[0].passed ? 'discovery_passed_payment_paths_not_run' : 'failed',
    testnetFacilitatorStatus: observations[1].passed ? 'discovery_passed_development_only' : 'failed',
  },
  observations,
  allowance: {
    cdpAdvertisedMonthlyTransactions: 1_000,
    cdpPaidPriceUsdPerTransaction: 0.001,
    automaticPaidOverageStatus: 'unknown',
    automaticPaidOverageAllowedByClervo: false,
    testnetFacilitatorPriceUsd: 0,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
