const $ = id => document.getElementById(id);
const labels = { codex: 'Codex', claude: 'Claude', antigravity: 'Antigravity' };
const symbols = { codex: 'C', claude: '✳', antigravity: 'A' };
const statuses = { connected: 'Connected', waiting: 'Waiting for data', stale: 'Older observation', error: 'Refresh failed', authentication_required: 'Sign-in required', profile_changed: 'Account changed', unavailable: 'Quota unavailable' };
let state = { accounts: [] }, token, profiles = [], filter = 'all', renaming;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Quota-Desk': token }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'Local request failed.'); return result;
}
function notice(text) { $('notice').textContent = text; }
function age(iso) { const n = Math.max(0, Date.now() - Date.parse(iso)); return n < 60000 ? 'just now' : n < 3600000 ? `${Math.floor(n / 60000)} min ago` : `${Math.floor(n / 3600000)} hr ago`; }
function countdown(iso) {
  if (!iso) return 'Reset time not provided'; const n = Date.parse(iso) - Date.now();
  if (n <= 0) return 'Reset passed · refresh for current quota';
  const mins = Math.ceil(n / 60000); return `Resets in ${mins >= 1440 ? `${Math.floor(mins / 1440)}d ` : ''}${mins >= 60 ? `${Math.floor(mins % 1440 / 60)}h ` : ''}${mins % 60}m`;
}
function action(label, fn) { const b = el('button', '', label); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (e) { notice(e.message); } finally { b.disabled = false; } }); return b; }
function card(a, provider, slot) {
  const c = el('article', `account ${provider}${a ? '' : ' empty'}`);
  const heading = el('div', 'account-heading'); heading.append(el('span', 'provider-icon', symbols[provider]));
  const title = el('div'); title.append(el('h2', '', a?.name || `Account ${slot}`), el('div', 'provider-name', labels[provider])); heading.append(title); c.append(heading);
  if (!a) { const center = el('div', 'empty-center'); center.append(el('p', '', `Connect a ${labels[provider]} profile to see the quota it reports.`), action('＋ Attach account', () => openAdd(provider))); c.append(center); return c; }
  const s = a.snapshot;
  c.append(el('span', `status ${s.status}`, a.refreshing ? 'Refreshing…' : statuses[s.status] || s.status));
  if (s.email || s.plan) c.append(el('div', 'identity', [s.email, s.plan].filter(Boolean).join(' / ')));
  for (const q of s.quotas) {
    const expired = q.resetsAt && Date.parse(q.resetsAt) <= Date.now();
    const row = el('div', `quota${q.remainingPercent !== null && q.remainingPercent < 20 ? ' low' : ''}`);
    const line = el('div', 'quota-label'); line.append(el('span', '', q.label));
    const amount = el('strong', '', q.disabled ? 'Disabled' : expired ? '—' : q.remainingPercent === null ? String(q.remainingAmount ?? '—') : `${Math.round(q.remainingPercent)}%`);
    if (!expired && !q.disabled) amount.append(el('small', '', q.remainingPercent === null ? ' remaining' : ' left'));
    line.append(amount); row.append(line);
    if (q.remainingPercent !== null && !expired && !q.disabled) { const bar = el('progress'); bar.max = 100; bar.value = q.remainingPercent; bar.setAttribute('aria-label', `${q.label}: ${Math.round(q.remainingPercent)} percent remaining`); row.append(bar); }
    const reset = el('div', 'reset', countdown(q.resetsAt)); if (q.resetsAt) reset.title = new Date(q.resetsAt).toLocaleString(); row.append(reset); c.append(row);
  }
  if (!s.quotas.length || s.status !== 'connected') c.append(el('p', 'message', s.message));
  const bottom = el('div', 'account-bottom'); const seen = el('div', 'last-seen', s.observedAt ? `Last quota observation ${age(s.observedAt)}` : 'No successful quota observation'); if (s.observedAt) seen.title = new Date(s.observedAt).toLocaleString(); bottom.append(seen);
  const actions = el('div', 'card-actions');
  actions.append(action('Refresh', async () => { await api(`/api/accounts/${a.id}/refresh`, {}); await reload(); }), action('Setup', () => setup(a)), action('Rename', () => { renaming = a.id; $('rename-name').value = a.name; $('rename-error').textContent = ''; $('rename-dialog').showModal(); }), action('Reconnect', async () => { await api(`/api/accounts/${a.id}/reconnect`, {}); await reload(); }), action('Remove', async () => { if (confirm(`Remove ${a.name} from the dashboard? Its CLI login and profile will be kept.`)) { await api(`/api/accounts/${a.id}/remove`, {}); await reload(); } }));
  bottom.append(actions); c.append(bottom); return c;
}
function render() {
  const list = $('accounts'); list.replaceChildren();
  for (const provider of Object.keys(labels)) { if (filter !== 'all' && provider !== filter) continue; const accounts = state.accounts.filter(a => a.provider === provider); for (let i = 0; i < 2; i++) list.append(card(accounts[i], provider, i + 1)); }
  const observed = state.accounts.filter(a => a.snapshot.quotas.length).length;
  $('summary').textContent = `${state.accounts.length} of 6 accounts attached · ${observed} reporting quota`;
  $('clock').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
async function reload() { state = await api('/api/state'); token = state.token; render(); }
async function openAdd(provider = 'codex') {
  $('provider').value = provider; $('name').value = ''; $('method').value = 'existing'; $('form-error').textContent = ''; $('add-dialog').showModal();
  try { profiles = (await api('/api/detect')).profiles; } catch (e) { $('form-error').textContent = e.message; } updateForm();
}
function updateForm() {
  const provider = $('provider').value; const fresh = $('method').value === 'new';
  $('existing-fields').hidden = fresh; $('new-explanation').hidden = !fresh;
  $('attach').textContent = fresh ? 'Create isolated profile' : 'Attach account';
  $('attach').disabled = fresh && provider !== 'codex';
  $('new-explanation').textContent = provider === 'codex' ? 'Creates a separate profile and a local login launcher. Run the launcher to sign in through Codex using Windows Credential Manager. Your current Codex login stays untouched.' : provider === 'claude' ? 'Sign in directly in Claude Code using a separately configured CLAUDE_CONFIG_DIR, then attach that existing profile here. This dashboard does not collect Claude subscription credentials or offer Claude login.' : 'Use the native Antigravity sign-in. Independent Antigravity login profiles have not been verified; the dashboard cannot create them. Attach an existing profile and use its status line.';
  const select = $('profile'); select.replaceChildren();
  for (const d of profiles.filter(p => p.provider === provider)) { const o = el('option', '', `${d.label} — ${d.profilePath}`); o.value = d.id; select.append(o); }
  const custom = el('option', '', 'Use another profile directory…'); custom.value = 'custom'; select.append(custom); profileChanged();
}
function profileChanged() { const custom = $('profile').value === 'custom'; $('custom-path-label').hidden = !custom; $('profile-evidence').textContent = custom ? 'Enter a provider profile directory. Authentication files are read-only.' : profiles.find(p => p.id === $('profile').value)?.evidence || ''; }
function details(title, content) { $('details-title').textContent = title; $('details-content').replaceChildren(...content); $('details-dialog').showModal(); }
async function setup(a) {
  const data = await api(`/api/accounts/${a.id}/setup`); const nodes = [el('p', '', data.message)];
  if (data.settingsPath) {
    nodes.push(el('p', '', data.settingsPath));
    nodes.push(action(data.enabled ? 'Disable monitoring' : 'Enable monitoring', async () => {
      await api(`/api/accounts/${a.id}/${data.enabled ? 'disable-collector' : 'enable-collector'}`, {});
      $('details-dialog').close();
      notice(data.enabled ? 'Monitoring disabled. Your previous status line was restored.' : 'Monitoring enabled. Restart the provider CLI if it is open. No settings need to be edited manually.');
      await reload();
    }));
  }
  if (data.source) { const link = el('a', '', data.source); link.href = data.source; link.target = '_blank'; link.rel = 'noreferrer'; nodes.push(link); }
  if (a.provider === 'codex' && a.managed) { nodes.push(el('p', '', 'Run the login launcher in this profile directory, then refresh.'), el('pre', '', a.profilePath)); }
  details(`${labels[a.provider]} setup`, nodes);
}
$('add').addEventListener('click', () => openAdd());
$('provider').addEventListener('change', updateForm); $('method').addEventListener('change', updateForm); $('profile').addEventListener('change', profileChanged);
document.querySelectorAll('.close').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x => { x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', String(x === b)); }); render(); }));
$('add-form').addEventListener('submit', async e => {
  e.preventDefault(); $('attach').disabled = true; $('form-error').textContent = '';
  try {
    const provider = $('provider').value;
    if ($('method').value === 'new') {
      const result = await api('/api/accounts/new-codex', { name: $('name').value }); $('add-dialog').close();
      details('Sign in with Codex', [el('p', '', result.message), el('pre', '', result.command)]);
    } else {
      await api('/api/accounts', { provider, name: $('name').value, ...($('profile').value === 'custom' ? { profilePath: $('profile-path').value } : { detectionId: $('profile').value }) }); $('add-dialog').close();
    } await reload();
  } catch (e) { $('form-error').textContent = e.message; } finally { $('attach').disabled = $('method').value === 'new' && $('provider').value !== 'codex'; }
});
$('rename-form').addEventListener('submit', async e => { e.preventDefault(); try { await api(`/api/accounts/${renaming}/rename`, { name: $('rename-name').value }); $('rename-dialog').close(); await reload(); } catch (e) { $('rename-error').textContent = e.message; } });
$('refresh').addEventListener('click', async () => { const b = $('refresh'); b.disabled = true; notice('Refreshing account observations…'); try { await api('/api/refresh', {}); await reload(); notice('Refresh complete. Passive collectors show the latest observation published by their CLI.'); } catch (e) { notice(e.message); } finally { b.disabled = false; } });
$('about').addEventListener('click', async () => {
  const texts = [ ['Codex', 'Live quota through the official app-server. Existing auth files are read-only; access tokens remain in memory. Expired existing logins must be refreshed in their original CLI. https://developers.openai.com/codex/app-server/'], ['Claude', 'Uses documented status-line rate_limits data. Quota appears only after an ordinary CLI response; the dashboard never triggers one. No direct OAuth calls. https://code.claude.com/docs/en/statusline'], ['Antigravity', 'Uses documented status-line quota buckets. Open /usage in the CLI to refresh provider data. Independent sign-in profiles are unverified. https://antigravity.google/docs/cli/statusline/'] ];
  const nodes = texts.map(([title, text]) => { const d = el('section', 'details-section'); d.append(el('h3', '', title), el('p', '', text)); return d; });
  try { const result = await api('/api/versions'); nodes.push(el('pre', '', result.versions.map(v => `${v.name}: ${v.version}`).join('\n'))); } catch {}
  details('Collector capabilities', nodes);
});
reload().catch(e => notice(e.message));
setInterval(() => reload().catch(() => notice('Local server unavailable. Start ABC and reload this page.')), 10000);
setInterval(render, 30000);
