// Install the actual npm tarball in an isolated prefix, then exercise its installed command.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const release = join(root, 'release');
const tarball = join(release, `${pkg.name}-${pkg.version}.tgz`);
const prefix = await mkdtemp(join(tmpdir(), 'abc-installed-'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw Error('Run with npm run release:verify.');
let child;
try {
  const result = spawnSync(process.execPath, [npmCli, 'install', '--global', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', tarball], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const installed = join(prefix, 'node_modules', pkg.name);
  assert.equal(spawnSync(process.execPath, [join(installed, 'bin/abc.js'), '--version'], { encoding: 'utf8' }).stdout.trim(), `ABC ${pkg.version}`);
  assert.ok((await readFile(join(prefix, 'abc.cmd'), 'utf8')).replaceAll('\\', '/').includes('bin/abc.js'));
  // Start with no provider binaries on PATH: missing providers must not prevent use.
  const data = join(prefix, 'local-data'); await mkdir(data);
  const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
  const port = listener.address().port; await new Promise(r => listener.close(r));
  child = spawn(process.execPath, [join(installed, 'bin/abc.js'), '--no-open', '--port', String(port)], { env: { ...process.env, ABC_DATA_DIR: data, PATH: process.env.SystemRoot + '/System32' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const origin = `http://127.0.0.1:${port}`;
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Installed CLI did not start.')), 15000); child.stdout.on('data', d => { if (String(d).includes(origin)) { clearTimeout(timer); resolve(); } }); child.on('exit', () => { clearTimeout(timer); reject(Error('Installed CLI exited early.')); }); });
  const html = await (await fetch(origin)).text(); assert.ok(html.includes('Agent Budget Console'));
  assert.equal((await fetch(origin + '/style.css')).status, 200);
  const state = await (await fetch(origin + '/api/state')).json(); assert.deepEqual(state.accounts, []);
  const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-Quota-Desk': state.token };
  const profile = join(prefix, 'fake-provider'); await mkdir(profile); await writeFile(join(profile, 'settings.json'), JSON.stringify({ theme: 'original' }));
  const attached = await (await fetch(origin + '/api/accounts', { method: 'POST', headers, body: JSON.stringify({ provider: 'antigravity', name: 'Package test', profilePath: profile }) })).json();
  const setup = await (await fetch(`${origin}/api/accounts/${attached.id}/setup`)).json(); assert.equal(setup.enabled, false);
  const enable = await fetch(`${origin}/api/accounts/${attached.id}/enable-collector`, { method: 'POST', headers, body: '{}' }); assert.equal(enable.status, 200);
  const settings = JSON.parse(await readFile(join(profile, 'settings.json'), 'utf8'));
  assert.equal(settings.theme, 'original'); assert.ok(settings.statusLine.command.includes('EncodedCommand'));
  const payload = JSON.stringify({ email: 'package@example.test', quota: { weekly: { remaining_fraction: .42, reset_time: '2030-01-01T00:00:00Z' } } });
  const powershell = settings.statusLine.command.split(' ');
  const execution = spawnSync(powershell[0], powershell.slice(1), { input: payload, encoding: 'utf8', windowsHide: true });
  assert.equal(execution.status, 0, execution.stderr); assert.ok(execution.stdout.includes('42%'), execution.stdout);
  const refresh = await fetch(`${origin}/api/accounts/${attached.id}/refresh`, { method: 'POST', headers, body: '{}' }); assert.equal(refresh.status, 200);
  const updated = await (await fetch(origin + '/api/state')).json(); assert.equal(updated.accounts[0].snapshot.quotas[0].remainingPercent, 42);
  const disable = await fetch(`${origin}/api/accounts/${attached.id}/disable-collector`, { method: 'POST', headers, body: '{}' }); assert.equal(disable.status, 200);
  assert.deepEqual(JSON.parse(await readFile(join(profile, 'settings.json'), 'utf8')), { theme: 'original' });
  console.log('Installed npm package verified: abc command, compiled assets, missing-provider handling, enable/collect/disable monitoring, settings restoration.');
} finally {
  if (child && child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
  await rm(prefix, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
