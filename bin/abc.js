#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const meta = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (args.includes('--version') || args.includes('-v')) { console.log(`ABC ${meta.version}`); process.exit(0); }
if (args.includes('--help') || args.includes('-h')) {
  console.log('ABC - Agent Budget Console\n\nUsage: abc [--port 4317] [--no-open]\n\nStarts a Windows-local dashboard bound to 127.0.0.1.\nClose with Ctrl+C. Set ABC_DATA_DIR to choose a local data directory.\nProvider CLIs and provider sign-in are managed separately.');
  process.exit(0);
}
if (process.platform !== 'win32') { console.error('ABC currently supports Windows only.'); process.exit(1); }
if (Number(process.versions.node.split('.')[0]) < 24) { console.error('ABC requires Node.js 24 or later.'); process.exit(1); }
let port = Number(process.env.ABC_PORT || process.env.QUOTA_DESK_PORT || 4317);
let open = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--no-open') open = false;
  else if (args[i] === '--port') port = Number(args[++i]);
  else { console.error(`Unknown option: ${args[i]}. Run abc --help.`); process.exit(1); }
}
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('Choose a port between 1 and 65535.'); process.exit(1); }
try {
  const { startServer } = await import('../dist/src/server.js');
  const { server, origin } = await startServer(port);
  console.log(`ABC - Agent Budget Console\n${origin}\nKeep this window open. Press Ctrl+C to stop.`);
  if (open) {
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', origin], { windowsHide: true, detached: true, stdio: 'ignore' });
    child.on('error', () => console.log(`Open ${origin} in your browser.`)); child.unref();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); process.exit(0); });
} catch (e) {
  if (e?.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Open http://127.0.0.1:${port} if ABC is running, or run abc --port ${port + 1}.`);
  else console.error('ABC could not start. Check your local account settings and file permissions.');
  process.exitCode = 1;
}
