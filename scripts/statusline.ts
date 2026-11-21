// Supported provider status-line receiver. Does not make network requests or run prompts.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { statusQuotas } from '../src/providers/normalize.ts';
import { claudeIdentity, bindAntigravity } from '../src/providers/passive.ts';
import { atomicJson, loadAccounts } from '../src/store.ts';
const [dir, id] = process.argv.slice(2);
try {
  if (!dir || !/^[a-f0-9-]{36}$/.test(id || '')) throw Error();
  const a = (await loadAccounts(dir)).find(a => a.id === id);
  if (!a || a.provider === 'codex') throw Error();
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024 * 1024) throw Error(); }
  const data = JSON.parse(input);
  // Resolve current Claude identity through the official CLI; never inspect its secrets.
  const info = a.provider === 'claude' ? await claudeIdentity(a.profilePath) : undefined;
  if (info && (!info.loggedIn || info.identity !== a.identity)) throw Error();
  const quotas = statusQuotas(a.provider, data);
  const email = a.provider === 'antigravity' && typeof data.email === 'string' ? data.email : info?.email;
  await mkdir(join(dir, 'snapshots'), { recursive: true });
  if (a.provider === 'antigravity') {
    try { await bindAntigravity(dir, id, email); } catch {
      await atomicJson(join(dir, 'snapshots', `${id}.json`), { profilePath: a.profilePath, identity: a.identity, profileChanged: true });
      throw Error();
    }
  }
  // Persist only allowlisted quota fields, never the raw status payload or transcript.
  await atomicJson(join(dir, 'snapshots', `${id}.json`), { profilePath: a.profilePath, identity: a.identity, observedAt: quotas.length ? new Date().toISOString() : null, email, plan: info?.plan || (typeof data.plan_tier === 'string' ? data.plan_tier : undefined), quotas });
  console.log(quotas.map(q => `${q.label}: ${q.remainingPercent === null ? q.remainingAmount ?? 'unavailable' : `${Math.round(q.remainingPercent)}%`} left`).join(' | ') || 'Quota not published');
} catch { console.log('Quota collector waiting'); }
