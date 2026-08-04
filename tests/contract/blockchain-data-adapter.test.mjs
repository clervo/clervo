import assert from 'node:assert/strict';
import test from 'node:test';
import { BlockscoutDataAdapter } from '../../dist/adapters/blockchain/src/blockscout-data.js';

const wallet = '0x0000000000000000000000000000000000000001';
const counterparty = '0x0000000000000000000000000000000000000002';
const txHash = `0x${'a'.repeat(64)}`;

test('multichain data adapter normalizes wallet, token, and transaction data without exposing its source or key', async () => {
  const requests = [];
  const transport = async ({ url }) => {
    requests.push(url);
    if (url.pathname.endsWith('/token-balances')) return { status: 200, body: [{ value: '42', token: { address_hash: counterparty, symbol: 'TKN', decimals: '18', type: 'ERC-20' } }] };
    if (url.pathname.endsWith('/transactions')) return { status: 200, body: { items: [{ hash: txHash, block_number: 12, timestamp: '2026-08-02T08:00:00.000Z', status: 'ok', from: { hash: wallet }, to: { hash: counterparty }, value: '7' }] } };
    return { status: 200, body: { hash: wallet, coin_balance: '100', is_contract: false, has_logs: false, has_validated_blocks: false, has_tokens: true, has_token_transfers: true } };
  };
  const adapter = new BlockscoutDataAdapter({ apiKey: 'test-private-key', allowedChainIds: [1, 8453], hardDailyCallCeiling: 3 }, transport);
  const overview = await adapter.addressOverview(1, wallet);
  const tokens = await adapter.tokenBalances(8453, wallet);
  const transactions = await adapter.transactions(1, wallet);
  assert.deepEqual(overview, { address: wallet, nativeBalanceAtomic: '100', isContract: false, transactionActivityPresent: false, tokenActivityPresent: true });
  assert.deepEqual(tokens, [{ contractAddress: counterparty, symbol: 'TKN', decimals: 18, balanceAtomic: '42', tokenType: 'ERC-20' }]);
  assert.deepEqual(transactions, [{ transactionHash: txHash, blockNumber: 12, timestamp: '2026-08-02T08:00:00.000Z', status: 'confirmed', from: wallet, to: counterparty, valueAtomic: '7' }]);
  assert.ok(requests.every((url) => url.origin === 'https://api.blockscout.com' && url.searchParams.get('apikey') === 'test-private-key'));
  assert.equal(JSON.stringify({ overview, tokens, transactions }).includes('test-private-key'), false);
  assert.equal(adapter.remainingCalls, 0);
  await assert.rejects(adapter.addressOverview(1, wallet), /call_ceiling_reached/u);
});

test('multichain data adapter fails closed on unapproved chains and substituted identities', async () => {
  const adapter = new BlockscoutDataAdapter({ apiKey: 'test-private-key', allowedChainIds: [1], hardDailyCallCeiling: 2 }, async () => ({ status: 200, body: { hash: counterparty, coin_balance: '1', is_contract: false } }));
  await assert.rejects(adapter.addressOverview(10, wallet), /chain_not_allowed/u);
  await assert.rejects(adapter.addressOverview(1, wallet), /address_response_invalid/u);
});

test('multichain data adapter normalizes an unused address null balance to zero', async () => {
  const adapter = new BlockscoutDataAdapter({ apiKey: 'test-private-key', allowedChainIds: [1], hardDailyCallCeiling: 1 }, async () => ({ status: 200, body: { hash: wallet, coin_balance: null, is_contract: false } }));
  assert.deepEqual(await adapter.addressOverview(1, wallet), { address: wallet, nativeBalanceAtomic: '0', isContract: false, transactionActivityPresent: false, tokenActivityPresent: false });
});

test('multichain data adapter normalizes exact token contract metadata without trusting market fields', async () => {
  const adapter = new BlockscoutDataAdapter({ apiKey: 'test-private-key', allowedChainIds: [1], hardDailyCallCeiling: 1 }, async () => ({ status: 200, body: { address_hash: counterparty, symbol: 'TKN', name: 'Test Token', decimals: '6', total_supply: '42000000', type: 'ERC-20', exchange_rate: '999999' } }));
  assert.deepEqual(await adapter.tokenOverview(1, counterparty), { contractAddress: counterparty, symbol: 'TKN', name: 'Test Token', decimals: 6, totalSupplyAtomic: '42000000', tokenType: 'ERC-20' });
});
