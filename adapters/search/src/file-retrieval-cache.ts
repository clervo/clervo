import { constants } from 'node:fs';
import { mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { DurableRetrievalCacheStore, RetrievalCacheRecord } from '../../../services/search/src/retrieval-cache.js';

export class FileDurableRetrievalCacheStore implements DurableRetrievalCacheStore {
  constructor(readonly root: string) {
    if (!path.isAbsolute(root) || root === path.parse(root).root) throw new Error('invalid_retrieval_cache_root');
  }

  private file(cacheKey: string): string {
    if (!/^sha256:[a-f0-9]{64}$/u.test(cacheKey)) throw new Error('invalid_retrieval_cache_key');
    return path.join(this.root, `${cacheKey.slice(7)}.json`);
  }

  async get(cacheKey: string): Promise<RetrievalCacheRecord | undefined> {
    try {
      const handle = await open(this.file(cacheKey), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { return JSON.parse(await handle.readFile('utf8')) as RetrievalCacheRecord; } finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ELOOP') return undefined;
      throw error;
    }
  }

  async put(record: Readonly<RetrievalCacheRecord>): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const target = this.file(record.cacheKey);
    const temporary = path.join(this.root, `.${record.cacheKey.slice(7)}.${process.pid}.tmp`);
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  }

  async delete(cacheKey: string): Promise<void> {
    await unlink(this.file(cacheKey)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }

  async keys(): Promise<readonly string[]> {
    const names = await readdir(this.root).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? [] : Promise.reject(error));
    return Object.freeze(names.filter((name) => /^[a-f0-9]{64}\.json$/u.test(name)).map((name) => `sha256:${name.slice(0, 64)}`).sort());
  }
}
