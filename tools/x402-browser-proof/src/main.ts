import { x402Client, x402HTTPClient } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import type { PaymentRequired } from '@x402/core/types';
import { base } from 'viem/chains';
import { createWalletClient, custom, getAddress } from 'viem';

type Address = `0x${string}`;
type EthereumProvider = { request(input: { method: string; params?: unknown[] }): Promise<unknown> };
type ProofConfig = {
  network: 'eip155:8453';
  chainIdHex: '0x2105';
  asset: Address;
  amountAtomic: string;
  amountDisplay: string;
  payTo: Address;
  payer: Address;
  facilitator: 'https://api.cdp.coinbase.com/platform/v2/x402';
  productId: 'search.web' | 'sandbox.run' | 'ai.chat' | 'ai.image' | 'prediction.markets' | 'prediction.market' | 'crypto.wallet.report' | 'crypto.wallet.transactions';
  resource: 'https://api.clervo.dev/v1/search/paid' | 'https://api.clervo.dev/v1/sandbox/execute' | 'https://api.clervo.dev/v1/ai/execute' | 'https://api.clervo.dev/v1/prediction/execute' | 'https://api.clervo.dev/v1/crypto/execute';
  idempotencyKey: string;
  payerBalanceCapAtomic: string;
  supplierCostCeilingAtomic: string;
  request: Record<string, unknown>;
};

const connectButton = document.querySelector<HTMLButtonElement>('#connect')!;
const challengeButton = document.querySelector<HTMLButtonElement>('#challenge')!;
const approveButton = document.querySelector<HTMLButtonElement>('#approve')!;
const status = document.querySelector<HTMLPreElement>('#status')!;
const bounds = document.querySelector<HTMLDListElement>('#bounds')!;
let config: ProofConfig;
let provider: EthereumProvider;
let payer: Address;
let challengeIdentity = '';
let verifiedPaymentRequired: PaymentRequired;
let verifiedQuoteExpiresAt = '';
let paymentAttempted = false;
const proofBase = /^\/proof\/b10-(?:search|sandbox)(?:\/|$)/u.test(window.location.pathname)
  ? window.location.pathname.replace(/\/$/u, '')
  : '';
const proofFetch = (path: string, init?: RequestInit) => fetch(`${proofBase}${path}`, init);

function show(message: string) { status.textContent = message; }
function sameAddress(left: string, right: string) { return left.toLowerCase() === right.toLowerCase(); }
function decodeHeader(value: string) {
  try { return JSON.parse(atob(value)); } catch { throw new Error('invalid PAYMENT-REQUIRED encoding'); }
}

function balanceOfData(address: Address) {
  return `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`;
}

function usefulPaidResult(body: any) {
  if (body?.productId !== config.productId || body?.receipt?.productId !== config.productId) return false;
  if (config.productId === 'ai.chat') {
    return body?.model === 'clervo/gpt-5.6-luna'
      && body?.exactModelId === 'clervo/gpt-5.6-luna'
      && body?.result?.output?.kind === 'chat'
      && typeof body?.result?.output?.content === 'string'
      && body.result.output.content.trim().length > 0;
  }
  if (config.productId === 'ai.image') {
    return body?.model === 'clervo/gemini-3.1-flash-lite-image'
      && body?.exactModelId === 'clervo/gemini-3.1-flash-lite-image'
      && body?.result?.output?.kind === 'image'
      && Array.isArray(body.result.output.artifacts)
      && body.result.output.artifacts.length === 1
      && body.result.output.artifacts.every((artifact: any) => /^artifact:\/\//u.test(artifact?.artifactUri ?? '')
        && /^sha256:[a-f0-9]{64}$/u.test(artifact?.sha256 ?? '')
        && artifact?.width === 1024
        && artifact?.height === 1024)
      && body?.result?.usage?.images === 1;
  }
  if (config.productId === 'prediction.markets') {
    return body?.result?.output?.kind === 'markets'
      && Array.isArray(body.result.output.markets)
      && body.result.output.markets.length > 0
      && body.result.output.markets.every((market: any) => Array.isArray(market?.supplyAttributions)
        && market.supplyAttributions.some((item: any) => item?.sourceId === 'pdata' && item?.license === 'CC BY 4.0'))
      && body?.receipt?.supplierCost?.amountAtomic === '0'
      && body?.receipt?.provenance?.some((item: any) => item?.adapterId === 'adapter_prediction.pdata_rest');
  }
  if (config.productId === 'prediction.market') {
    return body?.result?.output?.kind === 'market'
      && /^pmkt_[a-f0-9]{32}$/u.test(body?.result?.output?.market?.marketRef ?? '')
      && Array.isArray(body?.result?.output?.market?.supplyAttributions)
      && body.result.output.market.supplyAttributions.some((item: any) => item?.sourceId === 'pdata' && item?.license === 'CC BY 4.0')
      && body?.receipt?.supplierCost?.amountAtomic === '0'
      && body?.receipt?.provenance?.some((item: any) => item?.adapterId === 'adapter_prediction.pdata_rest');
  }
  if (config.productId === 'crypto.wallet.report' || config.productId === 'crypto.wallet.transactions') {
    const expectedKind = config.productId === 'crypto.wallet.report' ? 'report' : 'transactions';
    return body?.result?.output?.kind === expectedKind
      && body?.result?.output?.state !== 'unavailable'
      && Array.isArray(body?.result?.output?.servedChains)
      && body.result.output.servedChains.length > 0
      && Array.isArray(body?.result?.output?.evidenceRefs)
      && body.result.output.evidenceRefs.length > 0
      && body?.result?.output?.freshness?.status === 'fresh'
      && body?.result?.output?.provenance?.sourceClass === 'indexed_public_blockchain_data'
      && body?.result?.output?.provenance?.thirdPartyLabelsUsed === false
      && body?.receipt?.supplierCost?.amountAtomic === '0'
      && body?.receipt?.provenance?.some((item: any) => item?.adapterId === 'adapter_crypto.blockscout_value_added');
  }
  if (config.productId === 'sandbox.run') {
    return body?.productId === 'sandbox.run'
      && body?.result?.output?.kind === 'execution'
      && body?.result?.output?.exitCode === 0
      && body?.result?.output?.stdoutBase64 === btoa('B10 sandbox proof')
      && body?.execution?.classId === 'sandbox.short'
      && body?.execution?.cleanup?.state === 'destroyed';
  }
  return Array.isArray(body?.output?.searchResponse?.results) && body.output.searchResponse.results.length > 0;
}

function validateChallenge(response: Response, body: any) {
  if (response.status !== 402) throw new Error(`expected 402 challenge, received ${response.status}`);
  const encoded = response.headers.get('payment-required');
  if (!encoded || encoded.length > 32_768) throw new Error('missing or oversized PAYMENT-REQUIRED');
  const decoded = decodeHeader(encoded);
  if (decoded.x402Version !== 2 || !Array.isArray(decoded.accepts) || decoded.accepts.length !== 1) throw new Error('unexpected x402 challenge shape');
  const requirement = decoded.accepts[0];
  if (requirement.scheme !== 'exact') throw new Error('payment scheme mismatch');
  if (requirement.network !== config.network) throw new Error('payment network mismatch');
  if (!sameAddress(requirement.asset, config.asset)) throw new Error('payment asset mismatch');
  if (!sameAddress(requirement.payTo, config.payTo)) throw new Error('payment receiver mismatch');
  if (requirement.amount !== config.amountAtomic) throw new Error('payment amount mismatch');
  if (requirement.extra?.name !== 'USD Coin' || requirement.extra?.version !== '2') throw new Error('USDC EIP-712 domain mismatch');
  if (decoded.resource?.url !== config.resource) throw new Error('payment resource mismatch');
  if (body?.quote?.productId !== config.productId) throw new Error('payment product mismatch');
  if (body?.quote?.maximumCharge?.amountAtomic !== config.amountAtomic || body?.quote?.maximumCharge?.asset !== 'USDC') throw new Error('quote maximum mismatch');
  const expiresAt = Date.parse(body?.quote?.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt - Date.now() > 10 * 60_000) throw new Error('quote expiry outside bounded window');
  const clervo = requirement.extra?.clervo;
  if (!clervo?.quoteHash || !clervo?.requestHash || !clervo?.operationId || clervo.quoteExpiresAt !== body.quote.expiresAt) throw new Error('challenge binding missing');
  return Object.freeze({
    identity: JSON.stringify({ requirement, quoteHash: clervo.quoteHash, requestHash: clervo.requestHash, operationId: clervo.operationId }),
    paymentRequired: decoded as PaymentRequired,
    quoteExpiresAt: body.quote.expiresAt as string,
  });
}

const requestInit = () => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': config.idempotencyKey },
  body: JSON.stringify(config.request),
});

async function getChallenge() {
  const response = await proofFetch('/api/paid-operation', requestInit());
  const body = await response.clone().json();
  const verified = validateChallenge(response, body);
  challengeIdentity = verified.identity;
  verifiedPaymentRequired = verified.paymentRequired;
  verifiedQuoteExpiresAt = verified.quoteExpiresAt;
  approveButton.disabled = false;
  show(`Challenge verified.\n\nReceiver: ${config.payTo}\nMaximum: ${config.amountDisplay}\nNetwork: Base mainnet\n\nNo signature has been requested.`);
}

async function connect() {
  const injected = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!injected) throw new Error('MetaMask was not found');
  provider = injected;
  const chain = String(await provider.request({ method: 'eth_chainId' }));
  if (chain.toLowerCase() !== config.chainIdHex) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: config.chainIdHex }] });
  }
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') throw new Error('MetaMask returned no account');
  payer = getAddress(accounts[0]);
  if (!sameAddress(payer, config.payer)) throw new Error('connected account is not the approved payer');
  if (sameAddress(payer, config.payTo)) throw new Error('payer and receiver must be different');
  const rawBalance = await provider.request({
    method: 'eth_call',
    params: [{ to: config.asset, data: balanceOfData(payer) }, 'latest'],
  });
  if (typeof rawBalance !== 'string' || !/^0x[a-fA-F0-9]+$/u.test(rawBalance)) throw new Error('USDC balance check failed');
  const balance = BigInt(rawBalance);
  if (balance < BigInt(config.amountAtomic)) throw new Error('approved payer has insufficient USDC');
  if (balance > BigInt(config.payerBalanceCapAtomic)) throw new Error('approved payer balance exceeds the bounded proof cap');
  challengeButton.disabled = false;
  connectButton.disabled = true;
  show(`Approved payer connected: ${payer}\nVerified balance: ${balance} atomic USDC (within cap)\nNo signature has been requested.`);
}

async function approveOnce() {
  if (paymentAttempted) throw new Error('payment was already attempted; reconcile instead of retrying');
  paymentAttempted = true;
  approveButton.disabled = true;
  challengeButton.disabled = true;

  const wallet = createWalletClient({ account: payer, chain: base, transport: custom(provider as any) });
  const signer = {
    address: payer,
    signTypedData: (message: any) => wallet.signTypedData({ ...message, account: payer }),
  };
  const client = new x402Client();
  registerExactEvmScheme(client, { signer, networks: [config.network] });
  client.registerPolicy((_version, requirements) => requirements.filter((item) =>
    item.scheme === 'exact' &&
    item.network === config.network &&
    sameAddress(item.asset, config.asset) &&
    sameAddress(item.payTo, config.payTo) &&
    item.amount === config.amountAtomic
  ));

  if (verifiedPaymentRequired === undefined || challengeIdentity.length === 0) throw new Error('verified challenge is missing');
  if (Date.parse(verifiedQuoteExpiresAt) <= Date.now()) throw new Error('verified challenge expired; stop and reconcile before using another key');

  show('Waiting for one bounded MetaMask signature…');
  const paymentPayload = await client.createPaymentPayload(verifiedPaymentRequired);
  const paymentHeaders = new x402HTTPClient(client).encodePaymentSignatureHeader(paymentPayload);
  const paidRequest = requestInit();
  const headers = new Headers(paidRequest.headers);
  for (const [name, value] of Object.entries(paymentHeaders)) headers.set(name, value);
  const paid = await proofFetch('/api/paid-operation', { ...paidRequest, headers });
  if (!paid.ok) throw new Error(`paid request failed with ${paid.status}; reconcile before any retry`);
  const paidBody = await paid.json();
  if (!usefulPaidResult(paidBody)) throw new Error('paid response is not a useful exact-product result; reconcile');
  if (paidBody?.receipt?.customerCharge?.amountAtomic !== config.amountAtomic) throw new Error('paid receipt amount mismatch; reconcile');
  if (paidBody?.receipt?.settlement?.status !== 'settled') throw new Error('settlement is not confirmed; reconcile');
  if (!paid.headers.get('payment-response')) throw new Error('PAYMENT-RESPONSE is missing; reconcile');

  const replay = await proofFetch('/api/paid-operation', requestInit());
  if (!replay.ok || replay.headers.get('idempotency-replayed') !== 'true') throw new Error('no-charge replay was not proven; reconcile');
  const replayBody = await replay.json();
  if (replayBody?.replayed !== true || replayBody?.operationId !== paidBody?.operationId || replayBody?.receipt?.receiptId !== paidBody?.receipt?.receiptId) throw new Error('replay identity mismatch; reconcile');

  show(`PROOF COMPLETE\n\nOperation: ${paidBody.operationId}\nReceipt: ${paidBody.receipt?.receiptId ?? 'recorded'}\nCharge: ${config.amountDisplay}\nSettlement: confirmed\nReplay: same result, no second authorization\n\nDo not sign again.`);
}

async function load() {
  const response = await proofFetch('/config?proof=b10-20260810e', { headers: { accept: 'application/json', 'cache-control': 'no-cache' } });
  if (!response.ok) throw new Error('guarded proof configuration unavailable');
  config = await response.json();
  bounds.innerHTML = [
    ['Network', 'Base mainnet (8453)'], ['Asset', 'Native USDC'], ['Maximum', config.amountDisplay],
    ['Product', config.productId], ['Receiver', config.payTo], ['Payer', config.payer], ['Facilitator', config.facilitator],
    ['Payer cap', `${config.payerBalanceCapAtomic} atomic USDC`],
    ['Supplier ceiling', `${config.supplierCostCeilingAtomic} atomic USD`],
    ['Execution', 'one authorization; replay must be free'],
  ].map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join('');
  show('Configuration loaded. Connect only the approved funded payer.');
}

connectButton.addEventListener('click', () => connect().catch((error) => show(`REFUSED: ${error.message}`)));
challengeButton.addEventListener('click', () => getChallenge().catch((error) => show(`REFUSED: ${error.message}`)));
approveButton.addEventListener('click', () => approveOnce().catch((error) => show(`STOP AND RECONCILE: ${error.message}\n\nDo not sign or retry again.`)));
load().catch((error) => { connectButton.disabled = true; show(`REFUSED: ${error.message}`); });
