import { mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDir as defaultDataDir, statuslinePath } from './paths.ts';
import { collectorSetup, enableCollector, disableCollector } from './integration.ts';
import { loadAccounts, saveAccounts } from './store.ts';
import { detect, fingerprint, exists } from './providers/detect.ts';
import { collectCodex } from './providers/codex.ts';
import { collectPassive, claudeIdentity } from './providers/passive.ts';
import type { Account, Provider, Snapshot } from './types.ts';
import { UserError } from './types.ts';
export const providers = ['codex', 'claude', 'antigravity'] as const;
export class Service {
  dir: string;
  accounts: Account[] = [];
  snapshots = new Map<string, Snapshot>();
  inFlight = new Map<string, Promise<void>>();
  constructor(dir = defaultDataDir) { this.dir = dir; }
  async init() { this.accounts = await loadAccounts(this.dir); }
  async persist() { await saveAccounts(this.dir, this.accounts); }
  account(id: string) { const a = this.accounts.find(a => a.id === id); if (!a) throw new UserError('Account not found.'); return a; }
  validate(provider: unknown, name: unknown) {
    if (!providers.includes(provider as Provider)) throw new UserError('Choose a supported provider.');
    if (typeof name !== 'string' || !name.trim() || name.length > 80) throw new UserError('Use an account name of 1–80 characters.');
  }
  async attach(input: any) {
    this.validate(input.provider, input.name);
    if (this.accounts.filter(a => a.provider === input.provider).length >= 2) throw new UserError('Two accounts per provider are already attached. Remove one first.');
    let profilePath: string;
    if (input.detectionId) {
      const d = (await detect()).find(d => d.id === input.detectionId && d.provider === input.provider);
      if (!d) throw new UserError('Detected profile no longer exists. Scan again.');
      profilePath = d.profilePath;
    } else {
      if (typeof input.profilePath !== 'string' || !isAbsolute(input.profilePath) || /^[\\/]{2}/.test(input.profilePath)) throw new UserError('Enter an absolute local CLI profile directory. Network shares are not supported.');
      try { profilePath = await realpath(input.profilePath); } catch { throw new UserError('Profile directory does not exist.'); }
      const marker = input.provider === 'codex' ? 'auth.json' : input.provider === 'claude' ? '.credentials.json' : 'settings.json';
      if (!await exists(join(profilePath, marker))) throw new UserError(`This directory has no ${marker}. Use an existing provider profile.`);
    }
    if (this.accounts.some(a => a.provider === input.provider && a.profilePath.toLowerCase() === profilePath.toLowerCase())) throw new UserError('This profile is already attached.');
    const a: Account = { id: randomUUID(), provider: input.provider, name: input.name.trim(), profilePath, managed: false };
    a.identity = await this.identity(a);
    if (a.identity && this.accounts.some(other => other.provider === a.provider && other.identity === a.identity)) throw new UserError('This account is already attached through another profile.');
    this.accounts.push(a); await this.persist();
    return a;
  }
  async identity(a: Account): Promise<string | undefined> {
    if (a.provider === 'claude') return (await claudeIdentity(a.profilePath)).identity;
    if (a.provider === 'codex' && !a.managed) {
      try { const auth = JSON.parse(await readFile(join(a.profilePath, 'auth.json'), 'utf8')); return auth.tokens?.account_id ? fingerprint(auth.tokens.account_id) : undefined; } catch { throw new UserError('Codex login file is not readable.'); }
    }
    return undefined;
  }
  async refresh(id: string) {
    if (this.inFlight.has(id)) return this.inFlight.get(id);
    const a = this.account(id);
    const task = (async () => {
      try {
        if (a.provider === 'codex' && !a.managed && a.identity && await this.identity(a) !== a.identity) {
          this.snapshots.set(id, { status: 'profile_changed', message: 'This profile changed accounts. Reconnect to attach its current identity.', quotas: [], observedAt: null }); return;
        }
        this.snapshots.set(id, a.provider === 'codex' ? await collectCodex(a) : await collectPassive(a, this.dir));
      } catch (e) {
        const old = this.snapshots.get(id);
        this.snapshots.set(id, { status: 'error', message: e instanceof UserError ? e.message : 'Quota refresh failed. Check the profile and try again.', quotas: old?.quotas || [], observedAt: old?.observedAt || null, email: old?.email, plan: old?.plan });
      }
    })().finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, task); return task;
  }
  async refreshAll() { await Promise.all(this.accounts.map(a => this.refresh(a.id))); }
  state() { return { accounts: this.accounts.map(a => ({ ...a, snapshot: this.snapshots.get(a.id) || { status: 'waiting', message: 'Waiting for first refresh.', quotas: [], observedAt: null }, refreshing: this.inFlight.has(a.id) })), refreshIntervalMs: 600000 }; }
  async rename(id: string, name: string) { const a = this.account(id); this.validate(a.provider, name); a.name = name.trim(); await this.persist(); }
  async remove(id: string) { const a = this.account(id); if (a.provider !== 'codex') await disableCollector(a, this.dir); this.accounts = this.accounts.filter(a => a.id !== id); this.snapshots.delete(id); await this.persist(); }
  async reconnect(id: string) {
    const a = this.account(id); const identity = await this.identity(a);
    if (identity && this.accounts.some(other => other.id !== id && other.provider === a.provider && other.identity === identity)) throw new UserError('This account is already attached.');
    if (a.provider === 'antigravity') {
      await rm(join(this.dir, 'bindings', `${id}.json`), { force: true });
      await rm(join(this.dir, 'snapshots', `${id}.json`), { force: true });
    }
    a.identity = identity; this.snapshots.delete(id); await this.persist(); await this.refresh(id);
  }
  async setup(id: string) {
    const a = this.account(id);
    if (a.provider === 'codex') return { message: a.managed ? 'Use the isolated login launcher to reconnect.' : 'Existing profile is read-only. If login expires, reconnect in the original Codex CLI and refresh.', profilePath: a.profilePath };
    const command = `"${process.execPath}" "${statuslinePath}" "${this.dir}" "${id}"`;
    return { ...(await collectorSetup(a, this.dir)), command, source: a.provider === 'claude' ? 'https://code.claude.com/docs/en/statusline' : 'https://antigravity.google/docs/cli/statusline/' };
  }
  async enableCollector(id: string) { return enableCollector(this.account(id), this.dir); }
  async disableCollector(id: string) { return disableCollector(this.account(id), this.dir); }
  async createCodex(name: string) {
    this.validate('codex', name);
    if (this.accounts.filter(a => a.provider === 'codex').length >= 2) throw new UserError('Two Codex accounts are already attached.');
    const id = randomUUID(); const profilePath = join(this.dir, 'profiles', id);
    await mkdir(profilePath, { recursive: true });
    await writeFile(join(profilePath, 'config.toml'), 'cli_auth_credentials_store = "keyring"\n[analytics]\nenabled = false\n[feedback]\nenabled = false\n[otel]\nmetrics_exporter = "none"\nexporter = "none"\ntrace_exporter = "none"\n');
    this.accounts.push({ id, provider: 'codex', name: name.trim(), profilePath, managed: true }); await this.persist();
    // An explicit local launcher keeps supported provider login outside the dashboard.
    const launcherPath = join(profilePath, 'login.ps1');
    const literal = profilePath.replaceAll("'", "''");
    await writeFile(launcherPath, `$env:CODEX_HOME = '${literal}'\n& codex -c 'cli_auth_credentials_store="keyring"' login --device-auth\nif ($LASTEXITCODE -ne 0) { Write-Host 'Login failed. No file-store fallback is enabled.' }\nRead-Host 'Press Enter to close'\n`);
    return { id, launcherPath, command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${launcherPath}"`, message: 'Run this command in a terminal to sign in through Codex. Credentials stay in Windows Credential Manager. Then refresh this account.' };
  }
}
