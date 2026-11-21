import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Service } from './service.ts';
import { detect } from './providers/detect.ts';
import { command } from './providers/process.ts';
import { root } from './paths.ts';
import { UserError } from './types.ts';
async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new UserError('Expected JSON.');
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 16384) throw new UserError('Request is too large.'); }
  try { return JSON.parse(text); } catch { throw new UserError('Invalid JSON.'); }
}
export async function startServer(port = 4317, service = new Service()) {
  await service.init();
  const token = randomBytes(32).toString('hex');
  let origin = '';
  let mutation = Promise.resolve();
  const json = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    if (`http://${req.headers.host}` !== origin || req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== origin)) return json(res, 403, { error: 'Only the local dashboard can access this service.' });
    try {
      const path = new URL(req.url || '/', origin).pathname;
      if (req.method === 'GET') {
        if (path === '/api/state') return json(res, 200, { ...service.state(), token });
        if (path === '/api/detect') return json(res, 200, { profiles: await detect() });
        if (path === '/api/versions') {
          const versions = await Promise.all(['codex', 'claude', 'agy'].map(async exe => ({ name: exe, version: await command(exe, ['--version']).then(s => s.trim()).catch(() => 'Not installed') })));
          return json(res, 200, { versions });
        }
        const setup = path.match(/^\/api\/accounts\/([a-f0-9-]{36})\/setup$/);
        if (setup) return json(res, 200, await service.setup(setup[1]));
        const files: Record<string, [string, string]> = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
        if (files[path]) { const [file, mime] = files[path]; res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); res.end(await readFile(join(root, 'public', file))); return; }
        return json(res, 404, { error: 'Not found.' });
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
      if (req.headers.origin !== origin || req.headers['x-quota-desk'] !== token) return json(res, 403, { error: 'Reload the local dashboard and try again.' });
      const input = await body(req);
      // Serialize account changes; quota refreshes are coalesced per account.
      const run = async () => {
        if (path === '/api/accounts') { const a = await service.attach(input); void service.refresh(a.id); return { id: a.id }; }
        if (path === '/api/accounts/new-codex') return service.createCodex(input.name);
        if (path === '/api/refresh') { await service.refreshAll(); return { ok: true }; }
        const match = path.match(/^\/api\/accounts\/([a-f0-9-]{36})\/(refresh|rename|remove|reconnect|enable-collector|disable-collector)$/);
        if (!match) throw new UserError('Unknown action.');
        const [, id, action] = match;
        if (action === 'enable-collector') return service.enableCollector(id);
        if (action === 'disable-collector') return service.disableCollector(id);
        if (action === 'refresh') await service.refresh(id);
        if (action === 'rename') await service.rename(id, input.name);
        if (action === 'remove') await service.remove(id);
        if (action === 'reconnect') await service.reconnect(id);
        return { ok: true };
      };
      const result = mutation.then(run); mutation = result.then(() => {}, () => {});
      json(res, 200, await result);
    } catch (e) { json(res, e instanceof UserError ? 400 : 500, { error: e instanceof UserError ? e.message : 'The local request failed. Try again.' }); }
  });
  server.requestTimeout = 90000; server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve()); });
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}`;
  const timer = setInterval(() => { void service.refreshAll(); }, 600000); timer.unref();
  server.on('close', () => clearInterval(timer));
  void service.refreshAll();
  return { server, origin, service };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.ABC_PORT || process.env.QUOTA_DESK_PORT || 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('QUOTA_DESK_PORT must be between 1 and 65535.');
  startServer(port).then(({ origin }) => console.log(`ABC is ready at ${origin}`)).catch(() => { console.error('ABC could not start. Check the port and local account settings.'); process.exitCode = 1; });
}
