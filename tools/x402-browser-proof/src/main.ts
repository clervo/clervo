import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
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
  productId: 'search.web' | 'ai.chat';
  resource: 'https://api.clervo.dev/v1/search/paid' | 'https://api.clervo.dev/v1/ai/execute';
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
let paymentAttempted = false;

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
    return body?.exactModelId === 'gpt-5.6-luna'
      && body?.result?.output?.kind === 'chat'
      && typeof body?.result?.output?.content === 'string'
      && body.result.output.content.trim().length > 0;
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
  return JSON.stringify({ requirement, quoteHash: clervo.quoteHash, requestHash: clervo.requestHash, operationId: clervo.operationId });
}

const requestInit = () => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': config.idempotencyKey },
  body: JSON.stringify(config.request),
});

async function getChallenge() {
  const response = await fetch('/api/paid-operation', requestInit());
  const body = await response.clone().json();
  challengeIdentity = validateChallenge(response, body);
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

  const boundedFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (response.status === 402) {
      const body = await response.clone().json();
      const observed = validateChallenge(response, body);
      if (observed !== challengeIdentity) throw new Error('challenge changed after approval review');
    }
    return response;
  };
  const paidFetch = wrapFetchWithPayment(boundedFetch, client);
  show('Waiting for one bounded MetaMask signature…');
  const paid = await paidFetch('/api/paid-operation', requestInit());
  if (!paid.ok) throw new Error(`paid request failed with ${paid.status}; reconcile before any retry`);
  const paidBody = await paid.json();
  if (!usefulPaidResult(paidBody)) throw new Error('paid response is not a useful exact-product result; reconcile');
  if (paidBody?.receipt?.customerCharge?.amountAtomic !== config.amountAtomic) throw new Error('paid receipt amount mismatch; reconcile');
  if (paidBody?.receipt?.settlement?.status !== 'settled') throw new Error('settlement is not confirmed; reconcile');
  if (!paid.headers.get('payment-response')) throw new Error('PAYMENT-RESPONSE is missing; reconcile');

  const replay = await fetch('/api/paid-operation', requestInit());
  if (!replay.ok || replay.headers.get('idempotency-replayed') !== 'true') throw new Error('no-charge replay was not proven; reconcile');
  const replayBody = await replay.json();
  if (replayBody?.replayed !== true || replayBody?.operationId !== paidBody?.operationId || replayBody?.receipt?.receiptId !== paidBody?.receipt?.receiptId) throw new Error('replay identity mismatch; reconcile');

  show(`PROOF COMPLETE\n\nOperation: ${paidBody.operationId}\nReceipt: ${paidBody.receipt?.receiptId ?? 'recorded'}\nCharge: ${config.amountDisplay}\nSettlement: confirmed\nReplay: same result, no second authorization\n\nDo not sign again.`);
}

async function load() {
  const response = await fetch('/config', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('guarded proof configuration unavailable');
  config = await response.json();
  bounds.innerHTML = [
    ['Network', 'Base mainnet (8453)'], ['Asset', 'Native USDC'], ['Maximum', config.amountDisplay],
    ['Product', config.productId], ['Receiver', config.payTo], ['Payer', config.payer],
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
