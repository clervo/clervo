import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

/* Base mainnet USDC — the only asset any Clervo quote is denominated in. */
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const BASE_CHAIN_ID = 8453 as const;
export const USDC_DECIMALS = 6 as const;
export const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org' as const;

const balanceOfAbi = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const;

/*
 * The RPC endpoint the balance is read from.
 *
 * A wallet address is sent to whatever endpoint this returns, so an operator who
 * does not want that going to a public node points `CLERVO_BASE_RPC_URL` at
 * their own. Plain HTTP is refused: an eavesdropper on the response can lie
 * about a balance, and a balance of zero is what lets a wallet be replaced.
 */
export function baseRpcUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CLERVO_BASE_RPC_URL;
  if (configured === undefined || configured.trim().length < 1) return DEFAULT_BASE_RPC_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new TypeError('invalid_base_rpc_url');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new TypeError('unsafe_base_rpc_url');
  return url.toString();
}

export function formatUsdc(amountAtomic: bigint | string): string {
  const value = typeof amountAtomic === 'bigint' ? amountAtomic : BigInt(amountAtomic);
  const padded = value.toString().padStart(USDC_DECIMALS + 1, '0');
  const whole = padded.slice(0, -USDC_DECIMALS);
  const fraction = padded.slice(-USDC_DECIMALS).replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export interface WalletBalance {
  readonly address: string;
  readonly network: 'eip155:8453';
  readonly asset: 'USDC';
  readonly assetAddress: typeof BASE_USDC_ADDRESS;
  readonly amountAtomic: string;
  readonly amount: string;
  readonly nativeWei: string;
  readonly observedAt: string;
  readonly rpcUrl: string;
}

export async function readWalletBalance({
  address,
  env = process.env,
  now = () => new Date().toISOString(),
  timeoutMs = 15_000,
}: { address: string; env?: NodeJS.ProcessEnv; now?: () => string; timeoutMs?: number }): Promise<WalletBalance> {
  if (!/^0x[a-fA-F0-9]{40}$/u.test(address)) throw new TypeError('invalid_wallet_address');
  const rpcUrl = baseRpcUrl(env);
  const client = createPublicClient({ chain: base, transport: http(rpcUrl, { timeout: timeoutMs, retryCount: 1 }) });
  const [usdc, native] = await Promise.all([
    client.readContract({ address: BASE_USDC_ADDRESS, abi: balanceOfAbi, functionName: 'balanceOf', args: [address as `0x${string}`] }),
    client.getBalance({ address: address as `0x${string}` }),
  ]);
  return Object.freeze({
    address,
    network: 'eip155:8453',
    asset: 'USDC',
    assetAddress: BASE_USDC_ADDRESS,
    amountAtomic: usdc.toString(),
    amount: formatUsdc(usdc),
    nativeWei: native.toString(),
    observedAt: now(),
    rpcUrl,
  });
}

/*
 * What an operator has to do to make the wallet spendable.
 *
 * The gas note is the part customers get wrong: an x402 `exact` payment is an
 * EIP-3009 authorization the facilitator submits, so the payer needs USDC and
 * does not need ETH. Saying so here is what stops someone bridging ETH they will
 * never spend.
 */
export interface FundingGuidance {
  readonly address: string;
  readonly network: 'eip155:8453';
  readonly networkName: 'Base mainnet';
  readonly chainId: typeof BASE_CHAIN_ID;
  readonly asset: 'USDC';
  readonly assetAddress: typeof BASE_USDC_ADDRESS;
  readonly decimals: typeof USDC_DECIMALS;
  readonly gasRequired: false;
  readonly notes: readonly string[];
}

export function fundingGuidance(address: string): FundingGuidance {
  if (!/^0x[a-fA-F0-9]{40}$/u.test(address)) throw new TypeError('invalid_wallet_address');
  return Object.freeze({
    address,
    network: 'eip155:8453',
    networkName: 'Base mainnet',
    chainId: BASE_CHAIN_ID,
    asset: 'USDC',
    assetAddress: BASE_USDC_ADDRESS,
    decimals: USDC_DECIMALS,
    gasRequired: false,
    notes: Object.freeze([
      'Send USDC on Base mainnet to the address above. Nothing else is accepted.',
      'USDC on Ethereum, Polygon, Arbitrum, Solana, or any other network will not arrive and cannot be recovered by Clervo.',
      'You do not need ETH. A Clervo payment is a signed USDC authorization the facilitator submits, so gas is not paid from this wallet.',
      'Send a small amount first and confirm it with `clervo wallet balance` before sending more.',
    ]),
  });
}
