import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { codexQuotas, statusQuotas, timestamp } from '../src/providers/normalize.ts';
import { Service } from '../src/service.ts';
import { collectPassive } from '../src/providers/passive.ts';
import { randomUUID } from 'node:crypto';
import { Rpc, safeEnv } from '../src/providers/process.ts';
test('Codex normalizes each reported bucket and never fills missing windows', () => {
  assert.deepEqual(codexQuotas({ rateLimits: { primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: null } }), [{ id: 'codex:primary', label: 'codex / 5-hour', remainingPercent: 100, resetsAt: new Date(1800000000000).toISOString() }]);
  const q = codexQuotas({ rateLimits: { primary: { usedPercent: 5 } }, rateLimitsByLimitId: { model_a: { primary: { usedPercent: 100 }, secondary: { usedPercent: 101 } }, model_b: { primary: { usedPercent: 40 } } } });
  assert.equal(q.length, 2); assert.equal(q[0].remainingPercent, 0); assert.equal(q[0].resetsAt, null); assert.equal(q[1].remainingPercent, 60);
  assert.deepEqual(codexQuotas({ rateLimits: { primary: { usedPercent: '50' } } }), []);
});
test('Claude uses subscription rate limits, never context or token usage', () => {
  assert.deepEqual(statusQuotas('claude', { context_window: { remaining_percentage: 80 }, cost: { total_usd: 5 } }), []);
  const q = statusQuotas('claude', { rate_limits: { five_hour: { used_percentage: 0 }, seven_day: { used_percentage: 100, resets_at: 1800000000 }, spend_limit: { used_percentage: 40 } } });
  assert.equal(q.length, 2); assert.equal(q[0].remainingPercent, 100); assert.equal(q[1].remainingPercent, 0);
});
test('Antigravity handles model buckets, amount-only quotas and missing percentages', () => {
  const q = statusQuotas('antigravity', { quota: { a: { remaining_fraction: .125, reset_time: '2030-01-01T00:00:00Z' }, b: { remaining_amount: 12 }, c: { remaining_fraction: 2 }, d: { disabled: true } } });
  assert.equal(q.length, 3); assert.equal(q[0].remainingPercent, 12.5); assert.equal(q[1].remainingPercent, null); assert.equal(q[1].remainingAmount, 12); assert.equal(q[2].disabled, true);
  assert.equal(timestamp(null), null); assert.equal(timestamp('bad'), null); assert.equal(timestamp({}), null);
});
test('two Codex profiles stay separate, reject duplicates, and detect account swaps', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const service = new Service(join(dir, 'data')); await service.init();
  for (const id of ['one', 'two', 'copy']) { await mkdir(join(dir, id)); await writeFile(join(dir, id, 'auth.json'), JSON.stringify({ tokens: { account_id: id === 'copy' ? 'one' : id, access_token: 'test-only' } })); }
  const a = await service.attach({ provider: 'codex', name: 'One', profilePath: join(dir, 'one') });
  await assert.rejects(() => service.attach({ provider: 'codex', name: 'Duplicate', profilePath: join(dir, 'copy') }), /already attached/);
  const b = await service.attach({ provider: 'codex', name: 'Two', profilePath: join(dir, 'two') });
  assert.notEqual(a.identity, b.identity);
  await assert.rejects(() => service.attach({ provider: 'codex', name: 'Third', profilePath: join(dir, 'copy') }), /Two accounts/);
  await writeFile(join(dir, 'one', 'auth.json'), JSON.stringify({ tokens: { account_id: 'changed' } }));
  await service.refresh(a.id); assert.equal(service.snapshots.get(a.id)?.status, 'profile_changed'); assert.equal(service.snapshots.get(a.id)?.quotas.length, 0);
  await service.rename(a.id, 'Renamed'); await service.remove(a.id);
  assert.equal(await readFile(join(dir, 'two', 'auth.json'), 'utf8'), JSON.stringify({ tokens: { account_id: 'two', access_token: 'test-only' } }));
  const reloaded = new Service(join(dir, 'data')); await reloaded.init(); assert.equal(reloaded.accounts.length, 1); assert.equal(reloaded.accounts[0].id, b.id);
});
test('real status-line script filters secrets, isolates accounts and rejects identity swaps', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-bridge-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const a = { id: randomUUID(), provider: 'antigravity' as const, name: 'A', profilePath: dir, managed: false };
  const b = { ...a, id: randomUUID(), name: 'B', profilePath: join(dir, 'other') };
  await writeFile(join(dir, 'accounts.json'), JSON.stringify([a, b]));
  async function publish(id: string, data: unknown) {
    const child = execFile(process.execPath, ['scripts/statusline.ts', dir, id]); child.stdin!.end(JSON.stringify(data));
    await new Promise<void>((resolve, reject) => { child.on('exit', code => code === 0 ? resolve() : reject(Error('bridge failed'))); child.on('error', reject); });
  }
  await publish(a.id, { email: 'a@example.test', quota: { weekly: { remaining_fraction: .8, reset_time: '2030-01-01T00:00:00Z' } }, access_token: 'SECRET', transcript_path: 'PRIVATE' });
  const raw = await readFile(join(dir, 'snapshots', `${a.id}.json`), 'utf8'); assert.ok(!raw.includes('SECRET')); assert.ok(!raw.includes('PRIVATE'));
  assert.equal((await collectPassive(a, dir)).quotas[0].remainingPercent, 80);
  assert.equal((await collectPassive(b, dir)).quotas.length, 0);
  const snapshotPath = join(dir, 'snapshots', `${a.id}.json`);
  const old = JSON.parse(raw); old.observedAt = new Date(Date.now() - 700000).toISOString();
  await writeFile(snapshotPath, JSON.stringify(old));
  assert.equal((await collectPassive(a, dir)).status, 'stale');
  old.quotas[0].resetsAt = '2000-01-01T00:00:00Z';
  await writeFile(snapshotPath, JSON.stringify(old));
  assert.equal((await collectPassive(a, dir)).quotas.length, 0);
  await publish(a.id, { email: 'changed@example.test', quota: { weekly: { remaining_fraction: .2 } } });
  assert.equal((await collectPassive(a, dir)).status, 'profile_changed');
});
test('RPC handshakes, correlates replies and redacts upstream errors', async () => {
  const fixture = `const readline=require('node:readline');let ready=false;readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.method==='initialized'){ready=true;return;}const result=m.method==='initialize'?{}:{ready};const reply=m.method==='fail'?{id:m.id,error:{message:'SECRET upstream token'}}:{id:m.id,result};console.log(JSON.stringify(reply));});`;
  const rpc = new Rpc(process.execPath, ['-e', fixture], safeEnv(), process.cwd());
  try {
    await rpc.initialize(); assert.equal((await rpc.request('account/read')).ready, true);
    await assert.rejects(() => rpc.request('fail'), e => e instanceof Error && !e.message.includes('SECRET'));
  } finally { rpc.stop(); }
});
