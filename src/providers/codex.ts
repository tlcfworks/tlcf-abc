import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Rpc, safeEnv } from './process.ts';
import { codexQuotas } from './normalize.ts';
import type { Account, Snapshot } from '../types.ts';
import { UserError } from '../types.ts';
import { fingerprint } from './detect.ts';
export const codexArgs = (store = 'ephemeral') => ['app-server', '-c', `cli_auth_credentials_store="${store}"`, '-c', 'analytics.enabled=false', '-c', 'feedback.enabled=false', '-c', 'otel.metrics_exporter="none"', '-c', 'otel.exporter="none"', '-c', 'otel.trace_exporter="none"', '-c', 'check_for_update_on_startup=false'];
export async function collectCodex(account: Account): Promise<Snapshot> {
  const home = account.managed ? account.profilePath : await mkdtemp(join(tmpdir(), 'quota-desk-'));
  const rpc = new Rpc('codex', codexArgs(account.managed ? 'keyring' : 'ephemeral'), { ...safeEnv(), CODEX_HOME: home }, home);
  try {
    await rpc.initialize();
    if (!account.managed) {
      let auth;
      try { auth = JSON.parse(await readFile(join(account.profilePath, 'auth.json'), 'utf8')); } catch { throw new UserError('No readable Codex auth.json in this profile. Keyring-only external profiles cannot be attached read-only.'); }
      const token = auth.tokens?.access_token;
      const accountId = auth.tokens?.account_id;
      if (typeof token !== 'string' || typeof accountId !== 'string') throw new UserError('This profile has no supported ChatGPT subscription login. API keys do not expose subscription quotas.');
      if (account.identity && fingerprint(accountId) !== account.identity) return { status: 'profile_changed', message: 'This profile changed accounts. Reconnect to attach its current identity.', quotas: [], observedAt: null };
      await rpc.request('account/login/start', { type: 'chatgptAuthTokens', accessToken: token, chatgptAccountId: accountId });
    }
    const info = await rpc.request('account/read', { refreshToken: false });
    if (!info.account) return { status: 'authentication_required', message: 'Sign in to this isolated Codex profile.', quotas: [], observedAt: null };
    const result = await rpc.request('account/rateLimits/read');
    const quotas = codexQuotas(result);
    return { status: quotas.length ? 'connected' : 'unavailable', message: quotas.length ? 'Live quota from Codex app-server.' : 'Codex returned no quota windows for this account.', quotas, observedAt: quotas.length ? new Date().toISOString() : null, email: info.account.email || undefined, plan: info.account.planType || undefined };
  } finally {
    rpc.stop();
    if (!account.managed) await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}
