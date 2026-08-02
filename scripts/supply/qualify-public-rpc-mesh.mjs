import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { performance } from 'node:perf_hooks';

const sources = [
  { environmentName: 'RPC_ARBITRUM', chain: 'arbitrum', protocol: 'evm', expectedChainId: '0xa4b1' },
  { environmentName: 'RPC_AVALANCHE', chain: 'avalanche', protocol: 'evm', expectedChainId: '0xa86a' },
  { environmentName: 'RPC_BASE', chain: 'base', protocol: 'evm', expectedChainId: '0x2105' },
  { environmentName: 'RPC_BITCOIN', chain: 'bitcoin', protocol: 'bitcoin_rest' },
  { environmentName: 'RPC_BSC', chain: 'bsc', protocol: 'evm', expectedChainId: '0x38' },
  { environmentName: 'RPC_COSMOS', chain: 'cosmos', protocol: 'tendermint' },
  { environmentName: 'RPC_ETH', chain: 'ethereum', protocol: 'evm', expectedChainId: '0x1' },
  { environmentName: 'RPC_FANTOM', chain: 'fantom', protocol: 'evm', expectedChainId: '0xfa' },
  { environmentName: 'RPC_GNOSIS', chain: 'gnosis', protocol: 'evm', expectedChainId: '0x64' },
  { environmentName: 'RPC_NEAR', chain: 'near', protocol: 'near' },
  { environmentName: 'RPC_OPTIMISM', chain: 'optimism', protocol: 'evm', expectedChainId: '0xa' },
  { environmentName: 'RPC_POLYGON', chain: 'polygon', protocol: 'evm', expectedChainId: '0x89' },
  { environmentName: 'RPC_SOLANA', chain: 'solana', protocol: 'solana' },
  { environmentName: 'RPC_TRON', chain: 'tron', protocol: 'tron' },
];

const expectedHosts = new Set([
  'arb1.arbitrum.io', 'arbitrum.llamarpc.com', 'arbitrum.publicnode.com',
  'api.avax.network', 'avalanche.llamarpc.com', 'mainnet.base.org', 'base.llamarpc.com', 'base-rpc.publicnode.com',
  'blockstream.info', 'mempool.space', 'bsc-dataseed1.binance.org', 'bsc.llamarpc.com', 'bsc.publicnode.com',
  'cosmos-rpc.publicnode.com', 'eth.llamarpc.com', 'rpc.ankr.com', 'ethereum.publicnode.com', 'eth.drpc.org',
  'rpc.ftm.tools', 'fantom.llamarpc.com', 'rpc.gnosischain.com', 'gnosis.llamarpc.com', 'rpc.mainnet.near.org',
  'mainnet.optimism.io', 'optimism.llamarpc.com', 'optimism.publicnode.com', 'polygon-rpc.com', 'polygon.publicnode.com',
  'api.mainnet-beta.solana.com', 'solana-rpc.publicnode.com', 'api.trongrid.io',
]);

function publicAddress(address) {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    return !(octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) || octets[0] >= 224);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return !(normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb'));
  }
  return false;
}

async function validateEndpoint(value) {
  const endpoint = new URL(value);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || !expectedHosts.has(endpoint.hostname)) throw new Error('rpc_endpoint_not_allowlisted');
  let addresses;
  try { addresses = await lookup(endpoint.hostname, { all: true, verbatim: true }); }
  catch (error) {
    if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') return { endpoint, dnsAvailable: false };
    throw error;
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !publicAddress(address))) throw new Error('rpc_endpoint_private_address');
  return { endpoint, dnsAvailable: true };
}

async function request(endpoint, init = {}) {
  const started = performance.now();
  try {
    const response = await fetch(endpoint, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = text; }
    return { status: response.status, latencyMs: Math.round(performance.now() - started), payload };
  } catch (error) {
    return { status: 0, latencyMs: Math.round(performance.now() - started), payload: null, failureCode: error?.name === 'TimeoutError' ? 'timeout' : 'network_failure' };
  }
}

async function probe(source, endpoint) {
  if (source.protocol === 'evm') {
    const result = await request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] },
    ]) });
    const rows = Array.isArray(result.payload) ? result.payload : [];
    const identity = rows.find(({ id }) => id === 1)?.result;
    const height = rows.find(({ id }) => id === 2)?.result;
    const rpcErrorCode = rows.find(({ error }) => Number.isInteger(error?.code))?.error?.code;
    return { ...result, identityMatches: identity === source.expectedChainId, heightValid: /^0x[0-9a-f]+$/iu.test(height ?? '') && Number.parseInt(height, 16) > 0, batchSupported: rows.length === 2, failureCode: result.failureCode ?? (result.status !== 200 ? `http_${result.status}` : Number.isInteger(rpcErrorCode) ? `json_rpc_${rpcErrorCode}` : undefined) };
  }
  if (source.protocol === 'bitcoin_rest') {
    const target = new URL(`${endpoint.href.replace(/\/$/u, '')}/blocks/tip/height`);
    const result = await request(target);
    return { ...result, identityMatches: null, heightValid: /^\d+\s*$/u.test(String(result.payload)) && Number(result.payload) > 0, batchSupported: false };
  }
  if (source.protocol === 'tendermint') {
    const target = new URL('status', endpoint.href.endsWith('/') ? endpoint : `${endpoint.href}/`);
    const result = await request(target);
    return { ...result, identityMatches: result.payload?.result?.node_info?.network === 'cosmoshub-4', heightValid: Number(result.payload?.result?.sync_info?.latest_block_height) > 0, batchSupported: false };
  }
  if (source.protocol === 'near') {
    const result = await request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'status', params: [] }) });
    return { ...result, identityMatches: result.payload?.result?.chain_id === 'mainnet', heightValid: Number(result.payload?.result?.sync_info?.latest_block_height) > 0, batchSupported: false };
  }
  if (source.protocol === 'solana') {
    const result = await request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'getGenesisHash' },
      { jsonrpc: '2.0', id: 2, method: 'getSlot', params: [{ commitment: 'finalized' }] },
    ]) });
    const rows = Array.isArray(result.payload) ? result.payload : [];
    return { ...result, identityMatches: rows.find(({ id }) => id === 1)?.result === '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', heightValid: Number(rows.find(({ id }) => id === 2)?.result) > 0, batchSupported: rows.length === 2 };
  }
  if (source.protocol === 'tron') {
    const target = new URL('wallet/getnowblock', endpoint);
    const result = await request(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    return { ...result, identityMatches: null, heightValid: Number(result.payload?.block_header?.raw_data?.number) > 0 && typeof result.payload?.blockID === 'string', batchSupported: false };
  }
  throw new Error('unsupported_rpc_protocol');
}

const observations = [];
for (const source of sources) {
  const configured = (process.env[source.environmentName] ?? '').split(/[\s,]+/u).filter(Boolean);
  for (let index = 0; index < configured.length; index += 1) {
    const { endpoint, dnsAvailable } = await validateEndpoint(configured[index]);
    if (!dnsAvailable) {
      observations.push({ chain: source.chain, routeIndex: index + 1, endpointFingerprint: createHash('sha256').update(`${endpoint.hostname}${endpoint.pathname}`).digest('hex'), protocol: source.protocol, status: 0, latencyMs: 0, identityStatus: 'failed', heightValid: false, batchSupported: false, failureCode: 'dns_unavailable', passed: false });
      continue;
    }
    const result = await probe(source, endpoint);
    observations.push({
      chain: source.chain,
      routeIndex: index + 1,
      endpointFingerprint: createHash('sha256').update(`${endpoint.hostname}${endpoint.pathname}`).digest('hex'),
      protocol: source.protocol,
      status: result.status,
      latencyMs: result.latencyMs,
      identityStatus: result.identityMatches === true ? 'exact' : result.identityMatches === null ? 'endpoint_only' : 'failed',
      heightValid: result.heightValid,
      batchSupported: result.batchSupported,
      failureCode: result.failureCode ?? null,
      passed: result.status === 200 && result.identityMatches !== false && result.heightValid,
    });
  }
}

const report = {
  schemaVersion: 'clervo.public-rpc-mesh-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.public_rpc_mesh',
  ownerCashSpentUsd: 0,
  externalCalls: observations.filter(({ failureCode }) => failureCode !== 'dns_unavailable').length,
  transactionCalls: 0,
  signedPayloads: 0,
  configuredChains: sources.length,
  configuredRoutes: observations.length,
  safety: { httpsOnly: true, credentialsInUrlsAllowed: false, queryStringsAllowed: false, hostAllowlistRequired: true, publicDnsRequired: true, redirectsAllowed: false },
  summary: {
    passedRoutes: observations.filter(({ passed }) => passed).length,
    passedChains: new Set(observations.filter(({ passed }) => passed).map(({ chain }) => chain)).size,
    exactIdentityRoutes: observations.filter(({ identityStatus }) => identityStatus === 'exact').length,
    endpointOnlyIdentityRoutes: observations.filter(({ identityStatus }) => identityStatus === 'endpoint_only').length,
    batchCapableRoutes: observations.filter(({ batchSupported }) => batchSupported).length,
  },
  observations,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
