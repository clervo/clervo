#!/usr/bin/env node

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';

const credential = process.env.DRPC_API_KEY;
if (!credential) throw new TypeError('DRPC_API_KEY is required');
const sampleCount = Number.parseInt(process.env.DRPC_QUALIFICATION_SAMPLES ?? '5', 10);
if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 10) throw new TypeError('DRPC_QUALIFICATION_SAMPLES must be between 1 and 10');

const sources = [
  { chain: 'arbitrum', network: 'arbitrum', protocol: 'evm', expectedChainId: '0xa4b1' },
  { chain: 'avalanche', network: 'avalanche', protocol: 'evm', expectedChainId: '0xa86a' },
  { chain: 'base', network: 'base', protocol: 'evm', expectedChainId: '0x2105' },
  { chain: 'bitcoin', network: 'bitcoin', protocol: 'bitcoin' },
  { chain: 'bsc', network: 'bsc', protocol: 'evm', expectedChainId: '0x38' },
  { chain: 'cosmos', network: 'cosmos-hub', protocol: 'cosmos' },
  { chain: 'ethereum', network: 'ethereum', protocol: 'evm', expectedChainId: '0x1' },
  { chain: 'fantom', network: 'fantom', protocol: 'evm', expectedChainId: '0xfa' },
  { chain: 'gnosis', network: 'gnosis', protocol: 'evm', expectedChainId: '0x64' },
  { chain: 'near', network: 'near', protocol: 'near' },
  { chain: 'optimism', network: 'optimism', protocol: 'evm', expectedChainId: '0xa' },
  { chain: 'polygon', network: 'polygon', protocol: 'evm', expectedChainId: '0x89' },
  { chain: 'tron', network: 'tron', protocol: 'evm', expectedChainId: '0x2b6653dc' },
];

const endpoint = new URL('https://lb.drpc.org/ogrpc');

function publicAddress(address) {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    return !(octets[0] === 10 || octets[0] === 127 || octets[0] === 0
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || octets[0] >= 224);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return !(normalized === '::' || normalized === '::1' || normalized.startsWith('fc')
      || normalized.startsWith('fd') || normalized.startsWith('fe8')
      || normalized.startsWith('fe9') || normalized.startsWith('fea')
      || normalized.startsWith('feb'));
  }
  return false;
}

const addresses = await lookup(endpoint.hostname, { all: true, verbatim: true });
if (addresses.length === 0 || addresses.some(({ address }) => !publicAddress(address))) {
  throw new TypeError('drpc_endpoint_private_address');
}

function requestsFor(source) {
  if (source.protocol === 'evm') return [
    { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
    { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] },
  ];
  if (source.protocol === 'bitcoin') return [
    { jsonrpc: '2.0', id: 1, method: 'getblockcount', params: [] },
  ];
  return [
    { jsonrpc: '2.0', id: 1, method: 'status', params: [] },
  ];
}

function evaluate(source, payload) {
  const rows = Array.isArray(payload) ? payload : [payload];
  if (source.protocol === 'evm') {
    const chainId = rows.find(({ id }) => id === 1)?.result;
    const height = rows.find(({ id }) => id === 2)?.result;
    return {
      identityMatches: chainId === source.expectedChainId,
      heightValid: /^0x[0-9a-f]+$/iu.test(height ?? '') && Number.parseInt(height, 16) > 0,
      batchSupported: rows.length === 2,
    };
  }
  if (source.protocol === 'bitcoin') return {
    identityMatches: null,
    heightValid: Number(rows[0]?.result) > 0,
    batchSupported: false,
  };
  if (source.protocol === 'cosmos') return {
    identityMatches: rows[0]?.result?.node_info?.network === 'cosmoshub-4',
    heightValid: Number(rows[0]?.result?.sync_info?.latest_block_height) > 0,
    batchSupported: false,
  };
  return {
    identityMatches: rows[0]?.result?.chain_id === 'mainnet',
    heightValid: Number(rows[0]?.result?.sync_info?.latest_block_height) > 0,
    batchSupported: false,
  };
}

const observations = [];
for (let sample = 1; sample <= sampleCount; sample += 1) {
  for (const source of sources) {
    const target = new URL(endpoint);
    target.searchParams.set('network', source.network);
    const started = performance.now();
    let status = 0;
    let payload = null;
    let failureCode = null;
    try {
      const response = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Drpc-Key': credential },
        body: JSON.stringify(requestsFor(source)),
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      status = response.status;
      const text = await response.text();
      try { payload = JSON.parse(text); } catch { failureCode = 'invalid_json'; }
    } catch (error) {
      failureCode = error?.name === 'TimeoutError' ? 'timeout' : 'network_failure';
    }
    const result = evaluate(source, payload);
    const rpcError = (Array.isArray(payload) ? payload : [payload]).find((row) => Number.isInteger(row?.error?.code))?.error?.code;
    const passed = status === 200 && result.identityMatches !== false && result.heightValid;
    observations.push({
      chain: source.chain,
      network: source.network,
      protocol: source.protocol,
      sample,
      status,
      latencyMs: Math.round(performance.now() - started),
      identityStatus: result.identityMatches === true ? 'exact' : result.identityMatches === null ? 'endpoint_only' : 'failed',
      heightValid: result.heightValid,
      batchSupported: result.batchSupported,
      failureCode: failureCode ?? (status !== 200 ? `http_${status}` : Number.isInteger(rpcError) ? `json_rpc_${rpcError}` : null),
      passed,
    });
  }
  if (sample < sampleCount) await new Promise((resolve) => setTimeout(resolve, 1_100));
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

const chainSummary = sources.map(({ chain }) => {
  const rows = observations.filter((observation) => observation.chain === chain);
  return {
    chain,
    calls: rows.length,
    passedCalls: rows.filter(({ passed }) => passed).length,
    latencyMsP50: percentile(rows.map(({ latencyMs }) => latencyMs), 0.5),
    latencyMsP95: percentile(rows.map(({ latencyMs }) => latencyMs), 0.95),
    passed: rows.length === sampleCount && rows.every(({ passed }) => passed),
  };
});

const report = {
  schemaVersion: 'clervo.drpc-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.drpc',
  plan: 'free',
  ownerCashSpentUsd: 0,
  externalCalls: observations.length,
  transactionCalls: 0,
  signedPayloads: 0,
  credentialRecorded: false,
  endpointAuthentication: 'Drpc-Key_header',
  allowance: {
    computeUnitsPer30Days: 210_000_000,
    usualComputeUnitsPerMinutePerIp: 120_000,
    minimumComputeUnitsPerMinutePerIp: 50_400,
    paidDepositStatus: 'owner_reported_disabled_unverified',
    automaticPaidOverageStatus: 'owner_reported_disabled_unverified',
  },
  safety: {
    httpsOnly: true,
    credentialInUrl: false,
    fixedOrigin: 'https://lb.drpc.org',
    networkAllowlist: sources.map(({ network }) => network),
    publicDnsRequired: true,
    redirectsAllowed: false,
    readOnlyMethodsOnly: true,
  },
  summary: {
    configuredChains: sources.length,
    samplesPerChain: sampleCount,
    passedChains: chainSummary.filter(({ passed }) => passed).length,
    exactIdentityChains: sources.filter(({ chain }) => observations.filter((row) => row.chain === chain).every(({ identityStatus }) => identityStatus === 'exact')).length,
  },
  chainSummary,
  observations,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
