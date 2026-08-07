import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/*
 * Where the router keeps a customer's wallet, limits, and receipts.
 *
 * `CLERVO_HOME` exists so a test — or a second isolated identity on one machine
 * — never has to touch the real wallet. It must be absolute: a relative value
 * would resolve against whatever directory the agent happened to be run from,
 * which is how a wallet ends up written somewhere nobody can find again.
 */
export function clervoHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CLERVO_HOME;
  if (override !== undefined) {
    if (override.trim().length < 1 || !isAbsolute(override)) throw new TypeError('clervo_home_not_absolute');
    return override;
  }
  return join(homedir(), '.clervo');
}

export interface ClervoPaths {
  readonly home: string;
  readonly wallet: string;
  readonly limits: string;
  readonly receipts: string;
  readonly operations: string;
}

export function clervoPaths(env: NodeJS.ProcessEnv = process.env): ClervoPaths {
  const home = clervoHome(env);
  return Object.freeze({
    home,
    wallet: join(home, 'wallet.json'),
    limits: join(home, 'limits.json'),
    receipts: join(home, 'receipts'),
    operations: join(home, 'operations'),
  });
}
