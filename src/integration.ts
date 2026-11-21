import { readFile, mkdir, lstat, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { atomicJson } from './store.ts';
import { statuslinePath, wrapperPath } from './paths.ts';
import { UserError, type Account } from './types.ts';
type Installation = { provider: string; settingsPath: string; installedCommand: string; hadStatusLine: boolean; previousStatusLine?: any; node: string; collector: string; dataDir: string; accountId: string };
const metadataPath = (dir: string, id: string) => join(dir, 'integrations', `${id}.json`);
async function readSettings(path: string): Promise<{ settings: any; raw: string | null }> {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new UserError('Settings are a symbolic link. Automatic setup is disabled to protect other profiles.');
    const raw = await readFile(path, 'utf8');
    const settings = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error();
    return { settings, raw };
  } catch (e: any) {
    if (e.code === 'ENOENT') return { settings: {}, raw: null };
    if (e instanceof UserError) throw e;
    throw new UserError('CLI settings are not valid JSON. Fix them in the provider CLI before enabling monitoring.');
  }
}
async function installation(dir: string, id: string): Promise<Installation | null> {
  try { return JSON.parse(await readFile(metadataPath(dir, id), 'utf8')); } catch (e: any) { if (e.code === 'ENOENT') return null; throw new UserError('The monitoring backup is unreadable. Restore it before changing settings.'); }
}
async function checkUnchanged(path: string, raw: string | null) {
  const current = await readFile(path, 'utf8').catch((e: any) => { if (e.code === 'ENOENT') return null; throw e; });
  if (current !== raw) throw new UserError('CLI settings changed during setup. Try again.');
}
export async function collectorSetup(a: Account, dir: string) {
  const settingsPath = join(a.profilePath, 'settings.json');
  const { settings } = await readSettings(settingsPath);
  const meta = await installation(dir, a.id);
  const enabled = Boolean(meta && settings.statusLine?.command === meta.installedCommand);
  return { enabled, settingsPath, backupPath: meta ? metadataPath(dir, a.id) : null, message: enabled ? 'Monitoring is enabled. Restart the CLI if it is already open. Disable monitoring to restore your previous status-line configuration.' : 'Enable monitoring to configure this CLI profile automatically. Your previous status line is preserved and unrelated settings stay intact. No sign-in or authentication files are changed.' };
}
export async function enableCollector(a: Account, dir: string) {
  if (a.provider === 'codex') throw new UserError('Codex uses its live quota API and needs no status-line collector.');
  const settingsPath = join(a.profilePath, 'settings.json');
  const { settings, raw } = await readSettings(settingsPath);
  const previous = await installation(dir, a.id);
  if (previous && settings.statusLine?.command !== previous.installedCommand) throw new UserError('Your status-line configuration changed outside ABC. Restore it or disable monitoring before enabling it again.');
  // Protect settings from being used as another account's status line.
  if (!previous && typeof settings.statusLine?.command === 'string' && settings.statusLine.command.includes('collector-wrapper.js')) throw new UserError('Another ABC account already monitors this settings file.');
  const recordPath = metadataPath(dir, a.id);
  const literal = (value: string) => `'${value.replaceAll('\\', '/').replaceAll("'", "''")}'`;
  // Encoded PowerShell avoids cmd/Git Bash interpolation of arbitrary Windows profile paths.
  const script = `& ${literal(process.execPath)} ${literal(wrapperPath)} ${literal(recordPath)}; exit $LASTEXITCODE`;
  const installedCommand = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`;
  const meta: Installation = { provider: a.provider, settingsPath, installedCommand, hadStatusLine: previous ? previous.hadStatusLine : Object.hasOwn(settings, 'statusLine'), previousStatusLine: previous ? previous.previousStatusLine : settings.statusLine, node: process.execPath, collector: statuslinePath, dataDir: dir, accountId: a.id };
  await mkdir(dirname(recordPath), { recursive: true });
  await checkUnchanged(settingsPath, raw);
  // Back up only the field we change; other settings may contain private provider configuration.
  await atomicJson(recordPath, meta);
  await checkUnchanged(settingsPath, raw);
  settings.statusLine = { ...(settings.statusLine && typeof settings.statusLine === 'object' ? settings.statusLine : {}), type: 'command', command: installedCommand, enabled: true };
  await atomicJson(settingsPath, settings);
  return collectorSetup(a, dir);
}
export async function disableCollector(a: Account, dir: string) {
  const meta = await installation(dir, a.id);
  if (!meta) return { enabled: false };
  const { settings, raw } = await readSettings(meta.settingsPath);
  if (settings.statusLine?.command !== meta.installedCommand) throw new UserError('The status line was changed outside ABC. Restore the ABC status line before disabling it, so your newer configuration is not overwritten.');
  if (meta.hadStatusLine) settings.statusLine = meta.previousStatusLine;
  else delete settings.statusLine;
  await checkUnchanged(meta.settingsPath, raw);
  await atomicJson(meta.settingsPath, settings);
  await rm(metadataPath(dir, a.id));
  return { enabled: false, message: 'Monitoring disabled. Your previous status line was restored. Restart the CLI if needed.' };
}
