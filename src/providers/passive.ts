import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { command, safeEnv } from './process.ts';
import { fingerprint } from './detect.ts';
import type { Account, Snapshot } from '../types.ts';
import { UserError } from '../types.ts';
export async function bindAntigravity(dir: string, id: string, email: unknown) {
  if (typeof email !== 'string' || !email.trim()) throw new UserError('Antigravity did not publish an account identity.');
  const hash = fingerprint(email.trim().toLowerCase());
  await mkdir(join(dir, 'bindings'), { recursive: true });
  const path = join(dir, 'bindings', `${id}.json`);
  try { await writeFile(path, JSON.stringify({ identity: hash }), { flag: 'wx', mode: 0o600 }); } catch (e: any) { if (e.code !== 'EEXIST') throw e; }
  const saved = JSON.parse(await readFile(path, 'utf8'));
  if (saved.identity !== hash) throw new UserError('Antigravity account changed. Reconnect this profile in the dashboard.');
  return hash;
}
export async function claudeIdentity(profilePath: string) {
  let info;
  try { info = JSON.parse(await command('claude', ['auth', 'status'], { ...safeEnv(), CLAUDE_CONFIG_DIR: profilePath })); } catch { throw new UserError('Claude authentication status could not be read. Check claude auth status in this profile.'); }
  return { loggedIn: info.loggedIn === true, identity: info.loggedIn ? fingerprint(`${info.orgId || ''}:${info.email || ''}:${info.authMethod || ''}`) : undefined, email: typeof info.email === 'string' ? info.email : undefined, plan: typeof info.subscriptionType === 'string' ? info.subscriptionType : undefined };
}
export async function collectPassive(account: Account, dataDir: string): Promise<Snapshot> {
  let info: Awaited<ReturnType<typeof claudeIdentity>> | undefined;
  if (account.provider === 'claude') {
    info = await claudeIdentity(account.profilePath);
    if (!info.loggedIn) return { status: 'authentication_required', message: 'Sign in using Claude Code in this profile, then reconnect.', quotas: [], observedAt: null };
    if (account.identity && info.identity !== account.identity) return { status: 'profile_changed', message: 'This CLI profile is signed into a different account. Reconnect to attach its current identity.', quotas: [], observedAt: null };
  }
  let saved;
  try { saved = JSON.parse(await readFile(join(dataDir, 'snapshots', `${account.id}.json`), 'utf8')); } catch {}
  if (!saved || saved.profilePath !== account.profilePath || saved.identity !== account.identity) return { status: 'waiting', message: 'Enable the status-line collector in Setup. Quotas appear when the CLI publishes them; refresh does not run a prompt.', quotas: [], observedAt: null, email: info?.email, plan: info?.plan };
  if (saved.profileChanged) return { status: 'profile_changed', message: 'Antigravity changed signed-in accounts. Reconnect to accept the current identity.', quotas: [], observedAt: null };
  if (Array.isArray(saved.quotas) && !saved.quotas.length && saved.observedAt === null) return { status: 'waiting', message: 'The CLI has not published quota windows. Open /usage in the CLI; the dashboard will not run a prompt.', quotas: [], observedAt: null, email: info?.email || saved.email, plan: info?.plan || saved.plan };
  if (!Array.isArray(saved.quotas) || !Number.isFinite(Date.parse(saved.observedAt))) throw new UserError('Invalid local quota snapshot. Wait for the next status-line update.');
  const quotas = saved.quotas.filter((q: any) => !q.resetsAt || Date.parse(q.resetsAt) > Date.now());
  const stale = Date.now() - Date.parse(saved.observedAt) > 600000;
  return { status: !quotas.length ? 'waiting' : stale ? 'stale' : 'connected', message: !quotas.length ? 'No unexpired quota windows published. Open /usage in the CLI.' : stale ? 'Last published CLI data; open /usage in the CLI for a newer observation.' : 'Quota published by the CLI status line. Refresh reads the latest local observation.', quotas, observedAt: saved.observedAt, email: info?.email || saved.email, plan: info?.plan || saved.plan };
}
