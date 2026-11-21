import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Account } from './types.ts';
export async function atomicJson(path: string, data: unknown) {
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(temp, path);
}
export async function loadAccounts(dataDir: string): Promise<Account[]> {
  await mkdir(dataDir, { recursive: true });
  try {
    const data = JSON.parse(await readFile(join(dataDir, 'accounts.json'), 'utf8'));
    if (!Array.isArray(data) || data.some(a => !/^[a-f0-9-]{36}$/.test(a.id) || !['codex','claude','antigravity'].includes(a.provider) || typeof a.profilePath !== 'string' || typeof a.name !== 'string' || typeof a.managed !== 'boolean')) throw Error();
    return data;
  } catch (e: any) { if (e.code === 'ENOENT') return []; throw new Error('Account settings are invalid. Restore accounts.json from a backup before starting.'); }
}
export const saveAccounts = (dir: string, accounts: Account[]) => atomicJson(join(dir, 'accounts.json'), accounts);
