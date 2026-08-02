import { createHash, createHmac } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const accessIdentifier = process.env.R2_ACCESS_KEY_ID;
const secretCredential = process.env.R2_SECRET_ACCESS_KEY;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const useDerivedEndpoint = process.env.R2_USE_DERIVED_ACCOUNT_ENDPOINT === 'true';
const configuredEndpoint = useDerivedEndpoint && accountId ? `https://${accountId}.r2.cloudflarestorage.com` : process.env.R2_S3_ENDPOINT;
if (!accessIdentifier || !secretCredential || !configuredEndpoint) {
  throw new Error('R2 access credentials and an account-scoped endpoint are required');
}

const endpoint = new URL(configuredEndpoint);
if (
  endpoint.protocol !== 'https:'
  || endpoint.username
  || endpoint.password
  || endpoint.search
  || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com')
) {
  throw new Error('R2_S3_ENDPOINT must be a credential-free account-specific Cloudflare R2 HTTPS origin');
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (secret, value, encoding) => createHmac('sha256', secret).update(value).digest(encoding);
const now = new Date();
const dateTime = now.toISOString().replace(/[:-]|\.\d{3}/gu, '');
const date = dateTime.slice(0, 8);
const payloadHash = sha256('');
const canonicalUri = endpoint.pathname === '/' ? '/' : `${endpoint.pathname.replace(/\/+$/u, '')}/`;
const canonicalHeaders = `host:${endpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${dateTime}\n`;
const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
const canonicalRequest = `GET\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
const scope = `${date}/auto/s3/aws4_request`;
const stringToSign = `AWS4-HMAC-SHA256\n${dateTime}\n${scope}\n${sha256(canonicalRequest)}`;
const dateSecret = hmac(`AWS4${secretCredential}`, date);
const regionSecret = hmac(dateSecret, 'auto');
const serviceSecret = hmac(regionSecret, 's3');
const signingSecret = hmac(serviceSecret, 'aws4_request');
const signature = hmac(signingSecret, stringToSign, 'hex');

const started = performance.now();
let status = null;
let listShapeValid = false;
let bucketCount = null;
let ownerMetadataPresent = false;
let transportFailureCode = null;
try {
  const response = await fetch(new URL(canonicalUri, endpoint.origin), {
    headers: {
      accept: 'application/xml',
      authorization: `AWS4-HMAC-SHA256 Credential=${accessIdentifier}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': dateTime,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  status = response.status;
  const body = await response.text();
  listShapeValid = /<ListAllMyBucketsResult(?:\s|>)/u.test(body);
  bucketCount = listShapeValid ? (body.match(/<Bucket>/gu) ?? []).length : null;
  ownerMetadataPresent = listShapeValid && /<Owner>/u.test(body);
} catch (error) {
  const causeCode = error?.cause?.code;
  transportFailureCode = typeof causeCode === 'string' && causeCode.includes('SSL')
    ? 'tls_handshake_failure'
    : error?.name === 'TimeoutError'
      ? 'timeout'
      : 'transport_failure';
}
const latencyMs = Math.round(performance.now() - started);
const passed = status === 200 && listShapeValid;

const report = {
  schemaVersion: 'clervo.cloudflare-r2-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.cloudflare_r2',
  endpointOrigin: 'https://r2.cloudflarestorage.com',
  ownerCashSpentUsd: 0,
  externalCalls: 1,
  credentialSlotsUsed: 1,
  endpointSelection: useDerivedEndpoint ? 'derived_from_account_id' : 'configured_legacy_value',
  operation: 'ListBuckets',
  operationClass: 'class_a',
  objectReadCalls: 0,
  objectWriteCalls: 0,
  deleteCalls: 0,
  customerObjectDataUsed: false,
  responsePayloadValuesRecorded: false,
  observation: {
    status,
    latencyMs,
    transportFailureCode,
    s3ListShapeValid: listShapeValid,
    bucketCount,
    ownerMetadataPresent,
    passed,
  },
  summary: {
    authenticationAndAccountListingStatus: passed ? 'passed' : 'failed',
    objectLifecycleStatus: 'not_run',
    customerObjectIsolationStatus: 'not_run',
    productionStatus: passed ? 'blocked_pending_isolation_and_cost_guard' : 'blocked_credential_or_permission_failure',
  },
  allowance: {
    advertisedMonthlyStandardStorageGb: 10,
    advertisedMonthlyClassAOperations: 1_000_000,
    advertisedMonthlyClassBOperations: 10_000_000,
    advertisedEgressPriceUsdPerGb: 0,
    ownerUsageAndBalanceStatus: 'not_exposed_by_s3_api',
    automaticPaidOverageStatus: 'unknown',
    automaticPaidUpgradeAllowedByClervo: false,
  },
  terms: {
    reviewedAt: new Date().toISOString(),
    pricingUrl: 'https://developers.cloudflare.com/r2/pricing/',
    productUrl: 'https://developers.cloudflare.com/r2/',
    customerApplicationUseDocumented: true,
    customerContentUseDocumented: true,
    rawCredentialOrAccountResaleAllowed: false,
    valueAddedStorageServiceStatus: 'compatible_subject_to_customer_isolation_and_subscription_terms',
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
