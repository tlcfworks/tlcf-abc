import { access, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Detection, Provider } from '../types.ts';
export const fingerprint = (s: string) => createHash('sha256').update(s).digest('hex');
export async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
export async function detect(): Promise<Detection[]> {
  const specs: [Provider, string, string[]][] = [
    ['codex', resolve(process.env.CODEX_HOME || join(homedir(), '.codex')), ['auth.json']],
    ['claude', resolve(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')), ['.credentials.json']],
    ['antigravity', join(homedir(), '.gemini', 'antigravity-cli'), ['settings.json']]
  ];
  const result: Detection[] = [];
  for (const [provider, base, markers] of specs) {
    const candidates = [base];
    // Only conventional, bounded profile locations; no recursive credential harvesting.
    for (const parent of [join(base, 'profiles'), join(homedir(), '.quota-profiles', provider)]) {
      for (const entry of (await readdir(parent, { withFileTypes: true }).catch(() => [])).slice(0, 20)) if (entry.isDirectory()) candidates.push(join(parent, entry.name));
    }
    for (const path of candidates) if ((await Promise.all(markers.map(m => exists(join(path, m))))).some(Boolean)) {
      const canonical = await realpath(path);
      if (result.some(d => d.provider === provider && d.profilePath.toLowerCase() === canonical.toLowerCase())) continue;
      result.push({ id: fingerprint(`${provider}:${canonical.toLowerCase()}`).slice(0, 20), provider, label: path === base ? 'Existing CLI profile' : path.split(/[\\/]/).at(-1)!, profilePath: canonical, evidence: provider === 'antigravity' ? 'CLI settings detected; sign-in unverified' : 'Login file detected; checked when attached' });
    }
  }
  return result;
}
