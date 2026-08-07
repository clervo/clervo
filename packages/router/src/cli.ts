#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { RouterError, callFree, callPaid, newIdempotencyKey, reconcileOperation, replayPaid, requestQuote } from './client.js';
import { diagnose } from './doctor.js';
import { formatUsdc, fundingGuidance, readWalletBalance } from './chain.js';
import { LimitError, loadLimits, saveLimits, usdcToAtomic } from './limits.js';
import { clervoPaths } from './paths.js';
import { capabilityFor, loadRegistry, type Registry } from './registry.js';
import { listOperations, readOperation, readReceipt, spentTodayAtomic, unreconciledOperations } from './store.js';
import { CLERVO_ROUTER_VERSION } from './version.js';
import { createWallet, loadWalletFile, replaceWallet, walletExists } from './wallet.js';

/* Machine-readable output is opt-in per command via --json. Everything a human
 * reads goes to stdout; nothing secret is ever written to either stream. */
interface Args {
  readonly command: string;
  readonly rest: readonly string[];
  readonly flags: ReadonlyMap<string, string | true>;
}

function parseArgs(argv: readonly string[]): Args {
  const flags = new Map<string, string | true>();
  const rest: string[] = [];
  let command = '';
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';
    if (token.startsWith('--')) {
      const [name = '', inline] = token.slice(2).split('=', 2);
      if (inline !== undefined) {
        flags.set(name, inline);
        continue;
      }
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(name, next);
        index += 1;
      } else {
        flags.set(name, true);
      }
      continue;
    }
    if (command === '') command = token;
    else rest.push(token);
  }
  return Object.freeze({ command, rest: Object.freeze(rest), flags });
}

function flagString(args: Args, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function wantsJson(args: Args): boolean {
  return args.flags.get('json') === true || args.flags.get('json') === 'true';
}

function print(line = ''): void {
  process.stdout.write(`${line}\n`);
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const USAGE = `clervo ${CLERVO_ROUTER_VERSION} — buy verified machine work with one command.

  clervo search "<query>"          A real search result. Free, no wallet, no signup.
  clervo catalog                   What the live system sells right now.
  clervo quote <product> [...]     The exact price of a call, without paying it.
  clervo run <product> [...]       Pay for one call and return the receipted result.
  clervo replay <key>              Fetch a settled result again. Never charges twice.
  clervo receipt <id|key>          Show a stored receipt.
  clervo history                   Every operation this machine has run.
  clervo reconcile                 Resolve any unknown settlement. Run this if told to.
  clervo doctor                    Check this machine end to end.

  clervo wallet create             Create the dedicated payment wallet.
  clervo wallet address            Show the address to fund, and how to fund it.
  clervo wallet balance            Read the on-chain USDC balance.
  clervo wallet restore <phrase>   Restore from a recovery phrase.
  clervo wallet backup             Reveal the recovery phrase. Asks first.

  clervo limits                    Show the spend limits.
  clervo limits set --per-operation <usdc> --daily <usdc>

Global flags: --json, --key <idempotency-key>, --yes, --product <id>
Environment:  CLERVO_HOME, CLERVO_API_ORIGIN, CLERVO_BASE_RPC_URL`;

async function confirm(question: string, assumeYes: boolean): Promise<boolean> {
  if (assumeYes) return true;
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(?:es)?$/iu.test(answer.trim());
  } finally {
    rl.close();
  }
}

function searchBody(query: string, args: Args): Record<string, unknown> {
  const maxResults = flagString(args, 'max-results');
  return {
    query,
    ...(maxResults === undefined ? {} : { maxResults: Number.parseInt(maxResults, 10) }),
    synthesize: false,
  };
}

/* The body for a paid call. `--body` takes JSON for any product; the shorthands
 * exist because typing JSON at a prompt is how a first paid call goes wrong. */
function requestBodyFor(productId: string, args: Args): Record<string, unknown> {
  const raw = flagString(args, 'body');
  if (raw !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new RouterError('body_invalid_json', '--body must be a JSON object');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new RouterError('body_invalid_json', '--body must be a JSON object');
    return parsed as Record<string, unknown>;
  }
  const positional = args.rest.join(' ').trim();
  if (productId === 'search.web' || productId === 'search.answer') {
    if (positional.length < 1) throw new RouterError('query_required', `usage: clervo run ${productId} "<query>"`);
    return { ...searchBody(positional, args), synthesize: productId === 'search.answer' };
  }
  if (productId === 'ai.chat') {
    if (positional.length < 1) throw new RouterError('prompt_required', 'usage: clervo run ai.chat "<prompt>" [--model <id>]');
    const model = flagString(args, 'model');
    if (model === undefined) throw new RouterError('model_required', 'ai.chat needs --model <id> — see `clervo catalog --models`');
    return {
      model,
      input: { kind: 'chat', messages: [{ role: 'user', content: positional }], responseFormat: 'text', stream: false },
      maximumOutputTokens: Number.parseInt(flagString(args, 'max-tokens') ?? '256', 10),
    };
  }
  throw new RouterError('body_required', `${productId} needs an explicit request: pass --body '<json>'`);
}

function printQuote(quote: { amount: string; productId: string; priceVersion: string; expiresAt: string; payTo: string }): void {
  print(`  ${quote.productId}`);
  print(`  price      ${quote.amount} USDC on Base mainnet`);
  print(`  payable to ${quote.payTo}`);
  print(`  version    ${quote.priceVersion}`);
  print(`  expires    ${quote.expiresAt}`);
}

async function commandSearch(args: Args, registry: Registry): Promise<number> {
  const query = args.rest.join(' ').trim();
  if (query.length < 1) {
    print('usage: clervo search "<query>"');
    return 2;
  }
  const outcome = await callFree({ registry, productId: 'search.web', body: searchBody(query, args) });
  if (wantsJson(args)) {
    printJson(outcome.result);
    return 0;
  }
  const response = ((outcome.result.output as Record<string, unknown> | undefined)?.searchResponse as Record<string, unknown> | undefined) ?? {};
  const results = Array.isArray(response.results) ? response.results as Record<string, unknown>[] : [];
  print(`${results.length} result(s) for "${query}" — free, nothing was charged.`);
  print();
  for (const [index, result] of results.entries()) {
    print(`${index + 1}. ${String(result.title ?? 'untitled')}`);
    print(`   ${String(result.url ?? '')}`);
    const snippet = String(result.snippet ?? '').replace(/\s+/gu, ' ').trim();
    if (snippet.length > 0) print(`   ${snippet.slice(0, 240)}`);
    print();
  }
  print(`operation ${outcome.operationId}`);
  print('Paid products need a funded wallet. Start with `clervo wallet create`.');
  return 0;
}

function commandCatalog(args: Args, registry: Registry): number {
  if (wantsJson(args)) {
    printJson({
      origin: registry.origin,
      observedAt: registry.observedAt,
      releaseId: registry.releaseId,
      capabilities: registry.capabilities,
    });
    return 0;
  }
  print(`Live catalog from ${registry.origin} — observed ${registry.observedAt}`);
  print();
  for (const capability of registry.capabilities) {
    const price = capability.priceAtomic === null
      ? 'quoted per request'
      : `${formatUsdc(capability.priceAtomic)} USDC${capability.priceIsBinding ? '' : ' (indicative)'}`;
    const availability = capability.paidCallable ? 'payable' : capability.freeCallable ? 'free only' : `unavailable${capability.reason === null ? '' : ` — ${capability.reason}`}`;
    print(`  ${capability.productId.padEnd(22)} ${availability.padEnd(34)} ${price}`);
    if (capability.freeCallable && capability.freeRoute !== null) print(`  ${' '.repeat(22)} free path ${capability.freeRoute}`);
  }
  print();
  print('Prices and availability come from the deployed system, not from this package.');
  return 0;
}

async function commandQuote(args: Args, registry: Registry): Promise<number> {
  const productId = args.rest[0] ?? flagString(args, 'product');
  if (productId === undefined) {
    print('usage: clervo quote <product> "<request>"');
    return 2;
  }
  const rest: Args = { ...args, rest: args.rest.slice(1) };
  const quote = await requestQuote({
    registry,
    productId,
    body: requestBodyFor(productId, rest),
    idempotencyKey: flagString(args, 'key') ?? newIdempotencyKey(),
  });
  if (wantsJson(args)) {
    printJson({
      productId: quote.productId, amountAtomic: quote.amountAtomic, amount: quote.amount, asset: quote.asset,
      network: quote.network, payTo: quote.payTo, priceVersion: quote.priceVersion, expiresAt: quote.expiresAt,
      quoteId: quote.quoteId, operationId: quote.operationId, requestHash: quote.requestHash,
    });
    return 0;
  }
  print('Quote — nothing was charged.');
  printQuote(quote);
  print();
  print('Pay it with the same request: clervo run ' + quote.productId + ' ... --key <key>');
  return 0;
}

async function commandRun(args: Args, registry: Registry): Promise<number> {
  const productId = args.rest[0] ?? flagString(args, 'product');
  if (productId === undefined) {
    print('usage: clervo run <product> "<request>"');
    return 2;
  }
  const rest: Args = { ...args, rest: args.rest.slice(1) };
  const body = requestBodyFor(productId, rest);
  const assumeYes = args.flags.get('yes') === true;
  const outcome = await callPaid({
    registry,
    productId,
    body,
    ...(flagString(args, 'key') === undefined ? {} : { idempotencyKey: flagString(args, 'key') as string }),
    async approve(quote, limits) {
      if (wantsJson(args) || assumeYes) return true;
      print('This call costs real money.');
      printQuote(quote);
      print(`  your limits per operation ${formatUsdc(limits.perOperationAtomic)} USDC, daily ${formatUsdc(limits.dailyAtomic)} USDC`);
      print();
      return confirm(`Pay ${quote.amount} USDC?`, false);
    },
  });
  if (wantsJson(args)) {
    printJson(outcome.result);
    return 0;
  }
  print(`Paid ${outcome.charged} USDC${outcome.replayed ? ' (replayed — no second charge)' : ''}.`);
  print(`  operation ${outcome.operationId}`);
  if (outcome.receiptId !== null) print(`  receipt   ${outcome.receiptId}`);
  const settlement = (outcome.receipt?.settlement as Record<string, unknown> | undefined) ?? undefined;
  if (settlement?.status !== undefined) print(`  settled   ${String(settlement.status)}`);
  print();
  printJson(outcome.result.result ?? outcome.result.output ?? outcome.result);
  return 0;
}

async function commandReplay(args: Args, registry: Registry): Promise<number> {
  const key = args.rest[0] ?? flagString(args, 'key');
  if (key === undefined) {
    print('usage: clervo replay <idempotency-key>');
    return 2;
  }
  const record = readOperation(key);
  if (record === undefined) {
    print(`No local record for ${key}. A replay needs the original request body, which is stored when the call is made.`);
    return 2;
  }
  const outcome = await replayPaid({ registry, productId: record.productId, body: record.requestBody, idempotencyKey: key });
  if (wantsJson(args)) {
    printJson(outcome.result);
    return 0;
  }
  print(`Replayed ${key} — no second authorization, no second charge.`);
  print(`  operation ${outcome.operationId}`);
  print(`  charged   ${outcome.charged} USDC (the original charge)`);
  print();
  printJson(outcome.result.result ?? outcome.result.output ?? outcome.result);
  return 0;
}

function commandReceipt(args: Args): number {
  const reference = args.rest[0];
  if (reference === undefined) {
    print('usage: clervo receipt <receipt-id|idempotency-key>');
    return 2;
  }
  const viaKey = readOperation(reference);
  const receiptId = viaKey?.receiptId ?? reference;
  const receipt = readReceipt(receiptId);
  if (receipt === undefined) {
    print(`No stored receipt for ${reference}.`);
    return 2;
  }
  printJson(receipt);
  return 0;
}

function commandHistory(args: Args): number {
  const records = listOperations();
  if (wantsJson(args)) {
    printJson(records);
    return 0;
  }
  if (records.length < 1) {
    print('No operations yet. `clervo search "<query>"` is free.');
    return 0;
  }
  print(`${records.length} operation(s) — spent today ${formatUsdc(spentTodayAtomic())} USDC`);
  print();
  for (const record of records) {
    const charge = record.chargedAtomic === null ? '—' : `${formatUsdc(record.chargedAtomic)} USDC`;
    print(`  ${record.startedAt}  ${record.state.padEnd(11)} ${record.productId.padEnd(14)} ${charge.padEnd(14)} ${record.idempotencyKey}`);
    if (record.reason !== null) print(`  ${' '.repeat(24)} ${record.reason}`);
  }
  return 0;
}

async function commandReconcile(args: Args, registry: Registry): Promise<number> {
  const open = unreconciledOperations();
  if (open.length < 1) {
    print('Nothing to reconcile. No operation is in an unknown settlement state.');
    return 0;
  }
  const results = [];
  for (const record of open) {
    results.push(await reconcileOperation({ registry, record }));
  }
  if (wantsJson(args)) {
    printJson(results);
    return results.some((result) => result.resolved === 'still_unknown') ? 1 : 0;
  }
  for (const result of results) {
    print(`  ${result.idempotencyKey}  ${result.resolved.padEnd(14)} ${result.detail}`);
  }
  const unresolved = results.filter((result) => result.resolved === 'still_unknown');
  print();
  if (unresolved.length > 0) {
    print(`${unresolved.length} operation(s) are still unknown. Paid calls stay blocked. Try again when the API is reachable.`);
    return 1;
  }
  print('All settlements resolved. Paid calls are unblocked.');
  return 0;
}

async function commandDoctor(args: Args): Promise<number> {
  const diagnosis = await diagnose({ checkBalance: args.flags.get('offline') !== true });
  if (wantsJson(args)) {
    printJson(diagnosis);
    return diagnosis.healthy ? 0 : 1;
  }
  print(`clervo ${diagnosis.routerVersion} — ${diagnosis.checkedAt}`);
  print();
  for (const entry of diagnosis.checks) {
    const mark = entry.status === 'ok' ? 'ok  ' : entry.status === 'warn' ? 'warn' : 'FAIL';
    print(`  ${mark}  ${entry.id.padEnd(24)} ${entry.detail}`);
    if (entry.remedy !== undefined) print(`        ${' '.repeat(24)} → ${entry.remedy}`);
  }
  print();
  print(diagnosis.healthy ? 'Ready.' : 'Not ready — fix the FAIL lines above.');
  return diagnosis.healthy ? 0 : 1;
}

function printFunding(address: string): void {
  const guidance = fundingGuidance(address);
  print(`  address  ${guidance.address}`);
  print(`  network  ${guidance.networkName} (${guidance.network}, chain id ${guidance.chainId})`);
  print(`  asset    USDC at ${guidance.assetAddress}`);
  print();
  for (const note of guidance.notes) print(`  - ${note}`);
}

async function commandWallet(args: Args): Promise<number> {
  const action = args.rest[0] ?? 'address';
  const assumeYes = args.flags.get('yes') === true;

  if (action === 'create') {
    if (walletExists()) {
      const { file } = loadWalletFile();
      print(`A wallet already exists and was not touched: ${file.address}`);
      print('Clervo will not replace a wallet that might hold funds. To use a different one:');
      print('  clervo wallet backup            reveal the phrase for the current wallet');
      print('  clervo wallet restore <phrase>  replace it, only if it is empty');
      return 1;
    }
    const created = createWallet();
    if (wantsJson(args)) {
      /* The phrase is returned on stdout exactly once, in the JSON the caller
       * asked for. It is never logged elsewhere by this package. */
      printJson({ address: created.view.address, network: created.view.network, derivationPath: created.view.derivationPath, path: created.view.path, recoveryPhrase: created.mnemonic });
      return 0;
    }
    print('Wallet created. This is the only time the recovery phrase is shown.');
    print();
    print(`  ${created.mnemonic}`);
    print();
    print('Write it down now, on paper, offline. Anyone with this phrase can spend the wallet.');
    print(`It is also stored at ${created.view.path}, readable only by you.`);
    print();
    print('Fund it to make paid calls:');
    printFunding(created.view.address);
    print();
    print('Then: clervo wallet balance');
    return 0;
  }

  if (action === 'address') {
    if (!walletExists()) {
      print('No wallet yet. Run `clervo wallet create`.');
      return 2;
    }
    const { file } = loadWalletFile();
    if (wantsJson(args)) {
      printJson(fundingGuidance(file.address));
      return 0;
    }
    print('Fund this wallet to make paid calls.');
    print();
    printFunding(file.address);
    return 0;
  }

  if (action === 'balance') {
    if (!walletExists()) {
      print('No wallet yet. Run `clervo wallet create`.');
      return 2;
    }
    const { file } = loadWalletFile();
    const balance = await readWalletBalance({ address: file.address });
    if (wantsJson(args)) {
      printJson(balance);
      return 0;
    }
    print(`${balance.amount} USDC on Base mainnet`);
    print(`  address  ${balance.address}`);
    print(`  read at  ${balance.observedAt} via ${balance.rpcUrl}`);
    if (BigInt(balance.amountAtomic) === 0n) {
      print();
      print('Nothing to spend yet. Send USDC on Base mainnet to the address above.');
    }
    return 0;
  }

  if (action === 'backup') {
    if (!walletExists()) {
      print('No wallet yet. Run `clervo wallet create`.');
      return 2;
    }
    if (!await confirm('Print the recovery phrase to this terminal? Anyone who sees it can spend the wallet.', assumeYes)) {
      print('Cancelled. Nothing was printed.');
      return 1;
    }
    const { file } = loadWalletFile();
    print();
    print(`  ${file.mnemonic}`);
    print();
    print(`Wallet ${file.address}, derivation ${file.derivationPath}.`);
    return 0;
  }

  if (action === 'restore') {
    const phrase = args.rest.slice(1).join(' ').trim() || flagString(args, 'phrase') || '';
    if (phrase.length < 1) {
      print('usage: clervo wallet restore "<twelve word phrase>"');
      return 2;
    }
    /*
     * The guard that matters. If a wallet is already here, its balance is read
     * on-chain first and a non-zero balance refuses the replacement outright —
     * the operator has to move the funds out themselves. A wallet that cannot be
     * read is treated as possibly funded, never as empty.
     */
    let outgoingIsEmpty = true;
    if (walletExists()) {
      const { file } = loadWalletFile();
      const balance = await readWalletBalance({ address: file.address });
      outgoingIsEmpty = BigInt(balance.amountAtomic) === 0n && BigInt(balance.nativeWei) === 0n;
      if (!outgoingIsEmpty) {
        print(`Refused. The existing wallet ${file.address} holds ${balance.amount} USDC.`);
        print('Move the funds out first. Clervo will not replace a funded wallet.');
        return 1;
      }
      if (!await confirm(`Replace the empty wallet ${file.address}?`, assumeYes)) {
        print('Cancelled. The existing wallet was not touched.');
        return 1;
      }
    }
    const view = replaceWallet({ mnemonic: phrase, outgoingIsEmpty });
    if (wantsJson(args)) {
      printJson(view);
      return 0;
    }
    print(`Restored ${view.address}.`);
    print();
    printFunding(view.address);
    return 0;
  }

  print(`unknown wallet command: ${action}`);
  return 2;
}

function commandLimits(args: Args): number {
  if ((args.rest[0] ?? '') === 'set') {
    const perOperation = flagString(args, 'per-operation');
    const daily = flagString(args, 'daily');
    if (perOperation === undefined && daily === undefined) {
      print('usage: clervo limits set --per-operation <usdc> --daily <usdc>');
      return 2;
    }
    const limits = saveLimits({
      ...(perOperation === undefined ? {} : { perOperationAtomic: usdcToAtomic(perOperation) }),
      ...(daily === undefined ? {} : { dailyAtomic: usdcToAtomic(daily) }),
    });
    if (wantsJson(args)) {
      printJson(limits);
      return 0;
    }
    print(`Limits set: per operation ${formatUsdc(limits.perOperationAtomic)} USDC, daily ${formatUsdc(limits.dailyAtomic)} USDC.`);
    return 0;
  }
  const limits = loadLimits();
  const spent = spentTodayAtomic();
  if (wantsJson(args)) {
    printJson({ ...limits, spentTodayAtomic: spent });
    return 0;
  }
  print(`per operation  ${formatUsdc(limits.perOperationAtomic)} USDC`);
  print(`daily          ${formatUsdc(limits.dailyAtomic)} USDC`);
  print(`spent today    ${formatUsdc(spent)} USDC`);
  print();
  print('These are enforced on this machine before anything is signed. The server enforces its own quote independently.');
  return 0;
}

/* Commands that need the live catalog. Everything else must work offline, because
 * `doctor` has to be usable precisely when the network is the problem. */
const NEEDS_REGISTRY = Object.freeze(new Set(['search', 'catalog', 'quote', 'run', 'replay', 'reconcile']));

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.command === '' || args.command === 'help' || args.flags.get('help') === true) {
    print(USAGE);
    return args.command === '' ? 2 : 0;
  }
  if (args.command === 'version' || args.flags.get('version') === true) {
    print(CLERVO_ROUTER_VERSION);
    return 0;
  }

  const registry = NEEDS_REGISTRY.has(args.command) ? await loadRegistry() : undefined;

  switch (args.command) {
    case 'search': return commandSearch(args, registry as Registry);
    case 'catalog': return commandCatalog(args, registry as Registry);
    case 'quote': return commandQuote(args, registry as Registry);
    case 'run': return commandRun(args, registry as Registry);
    case 'replay': return commandReplay(args, registry as Registry);
    case 'receipt': return commandReceipt(args);
    case 'history': return commandHistory(args);
    case 'reconcile': return commandReconcile(args, registry as Registry);
    case 'doctor': return commandDoctor(args);
    case 'wallet': return commandWallet(args);
    case 'limits': return commandLimits(args);
    case 'home': print(clervoPaths().home); return 0;
    default:
      print(`unknown command: ${args.command}`);
      print();
      print(USAGE);
      return 2;
  }
}

/*
 * One exit point for every failure, so no error path can accidentally print a
 * stack trace containing a request body or a signed payload. The code is shown;
 * the internals are not.
 */
async function run(): Promise<void> {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof RouterError || error instanceof LimitError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.code === 'settlement_unknown' || error.code === 'unreconciled_operation_blocks_spend' ? 3 : 1;
      return;
    }
    if (error instanceof Error && ['WalletError', 'RegistryError', 'StoreError'].includes(error.name)) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = (error as { code?: string }).code === 'unreconciled_operation_blocks_spend' ? 3 : 1;
      return;
    }
    process.stderr.write(`${error instanceof Error ? error.message : 'the command failed'}\n`);
    process.exitCode = 1;
  }
}

await run();
