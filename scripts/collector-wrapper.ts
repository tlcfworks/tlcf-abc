// Receives the provider's status JSON once, sends a copy to ABC, and keeps the old status line.
import { readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
async function run(exe: string, args: string[], input: string): Promise<string> {
  return new Promise(resolve => {
    let output = '';
    const child = spawn(exe, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); resolve(output); }, 3500);
    child.on('error', () => { clearTimeout(timer); resolve(''); });
    child.stdout!.on('data', d => { if (output.length < 65536) output += d; });
    child.stdin!.on('error', () => {});
    child.on('exit', () => { clearTimeout(timer); resolve(output); });
    child.stdin!.end(input);
  });
}
try {
  const meta = JSON.parse(await readFile(process.argv[2], 'utf8'));
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024 * 1024) throw Error(); }
  const collector = run(meta.node, [meta.collector, meta.dataDir, meta.accountId], input);
  const original = meta.previousStatusLine?.command;
  if (typeof original === 'string' && original.trim()) {
    let exe = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh';
    let args = process.platform === 'win32' ? ['/d', '/s', '/c', original] : ['-c', original];
    // Claude's Windows status-line commands use Git Bash. Antigravity uses cmd /c.
    if (meta.provider === 'claude' && process.platform === 'win32') {
      exe = 'powershell.exe'; args = ['-NoProfile', '-NonInteractive', '-Command', original];
      for (const candidate of [process.env.CLAUDE_CODE_GIT_BASH_PATH, join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe'), join(process.env.LOCALAPPDATA || '', 'Programs/Git/bin/bash.exe')]) {
        if (!candidate) continue;
        if (await access(candidate).then(() => true).catch(() => false)) { exe = candidate; args = ['-c', original]; break; }
      }
    }
    const [output] = await Promise.all([run(exe, args, input), collector]);
    process.stdout.write(output);
  } else process.stdout.write(await collector);
} catch { console.log('ABC monitoring unavailable'); }
