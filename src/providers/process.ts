import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { UserError } from '../types.ts';
export function safeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(OPENAI|CODEX|CHATGPT|ANTHROPIC|CLAUDE|OTEL|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/i.test(k)) delete env[k];
  return { ...env, RUST_LOG: 'error', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}
export function command(exe: string, args: string[], env = safeEnv()): Promise<string> {
  return new Promise((resolve, reject) => execFile(exe, args, { env, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
    if (err && !stdout) reject(new UserError(`${exe} is unavailable or did not respond.`)); else resolve(stdout);
  }));
}
export class Rpc {
  child: ReturnType<typeof spawn>;
  pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  seq = 0;
  closed = false;
  constructor(exe: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
    this.child = spawn(exe, args, { env, cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr!.on('data', () => {}); // Provider diagnostics may contain credentials. Never log them.
    this.child.stdin!.on('error', () => this.fail());
    this.child.on('error', () => this.fail());
    this.child.on('exit', () => this.fail());
    const lines = createInterface({ input: this.child.stdout! });
    lines.on('line', line => {
      if (line.length > 4 * 1024 * 1024) return this.fail();
      let msg; try { msg = JSON.parse(line); } catch { return; }
      const p = this.pending.get(msg.id);
      if (p && ('result' in msg || 'error' in msg)) {
        clearTimeout(p.timer); this.pending.delete(msg.id);
        // Do not surface raw RPC errors (they can echo inputs).
        if (msg.error) p.reject(new UserError('Codex rejected the quota request. Reconnect the profile in its original CLI, then refresh.'));
        else p.resolve(msg.result);
      } else if (msg.id !== undefined && msg.method) {
        this.child.stdin!.write(JSON.stringify({ id: msg.id, error: { code: -32000, message: 'Read-only collector cannot refresh credentials or perform actions.' } }) + '\n');
      }
    });
  }
  fail() {
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new UserError('Codex app-server stopped or could not start. Check the installed CLI.')); }
    this.pending.clear();
  }
  request(method: string, params?: any): Promise<any> {
    if (this.closed) return Promise.reject(new UserError('Codex app-server is unavailable.'));
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new UserError('Codex quota request timed out.')); }, 25000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin!.write(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }) + '\n');
    });
  }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'local_quota_desk', title: 'ABC — Agent Budget Console', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    this.child.stdin!.write('{"method":"initialized"}\n');
  }
  stop() { this.child.stdin!.end(); this.child.kill(); this.fail(); }
}
