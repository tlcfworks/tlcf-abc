import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { detect } from '../src/providers/detect.ts';
import { collectCodex } from '../src/providers/codex.ts';
import { claudeIdentity } from '../src/providers/passive.ts';
import { command } from '../src/providers/process.ts';
const hash = (s: Buffer) => createHash('sha256').update(s).digest('hex');
for (const exe of ['codex', 'claude', 'agy']) console.log(`${exe}: ${await command(exe, ['--version']).then(s => s.trim()).catch(() => 'not installed')}`);
for (const d of await detect()) {
  if (d.provider === 'codex') {
    const path = join(d.profilePath, 'auth.json'); const before = hash(await readFile(path));
    try {
      const result = await collectCodex({ id: randomUUID(), provider: 'codex', name: 'Read-only verification', profilePath: d.profilePath, managed: false });
      console.log(`Codex: ${result.status}; ${result.quotas.length} reported windows; original auth unchanged: ${before === hash(await readFile(path))}`);
      if (before !== hash(await readFile(path))) process.exitCode = 1;
      if (result.status !== 'connected') process.exitCode = 1;
    } catch { console.log('Codex: live quota unavailable; reconnect in original CLI.'); process.exitCode = 1; }
  }
  if (d.provider === 'claude') { const info = await claudeIdentity(d.profilePath); console.log(`Claude: ${info.loggedIn ? 'authenticated' : 'not authenticated'}; quota requires configured status-line data (no inference triggered).`); }
  if (d.provider === 'antigravity') console.log('Antigravity: CLI profile found; quota and identity require configured status-line data. Independent auth profiles unverified.');
}
