# ABC — Agent Budget Console

A Windows-local subscription quota dashboard for two Codex, two Claude, and two Google Antigravity accounts. Node.js 24+, vanilla HTML/CSS/JavaScript, no runtime packages, no database. It never sends AI prompts to obtain usage.

Three distribution methods are supported: an npm package, a GitHub source checkout, and a Windows ZIP with Node.js bundled. All run locally at http://127.0.0.1:4317 by default. See `docs/distribution.md` for full instructions and release status.

After npm publication: run `npm install -g tlcf-abc`, then `tlcf-abc`. Before publication, install the `.tgz` file from the GitHub release using `npm install -g .\tlcf-abc-1.0.1.tgz`.

From source: clone https://github.com/tlcfworks/tlcf-abc.git , run `npm ci`, then `npm start`. From the Windows ZIP: extract everything and double-click `start.cmd`; no Node.js installation is needed. The browser opens automatically. Keep the terminal open; Ctrl+C stops ABC. Provider CLIs and sign-in are separate prerequisites.

## Connect accounts

Select **Add account → Existing CLI profile**. The dashboard scans the default or environment-selected Codex and Claude directories, the Antigravity CLI directory, and their `profiles` subdirectories. It also scans `%USERPROFILE%\.quota-profiles\<provider>\<profile>`. You can supply another absolute profile directory. Nothing is attached until you choose it. A detected file is evidence of a profile, not proof of a valid subscription; connection checks happen after attaching.

For **Codex**, attach an existing `CODEX_HOME` containing `auth.json`. The collector reads its access token into an isolated, ephemeral app-server process and calls the documented `account/rateLimits/read`. It never copies the refresh token or writes the original profile. If its access token expires, use your original Codex CLI to renew its login, then refresh. External profiles whose credentials exist only in a keyring cannot currently be attached read-only.

For a **new Codex account**, choose **New account**. The app creates a separate `CODEX_HOME` and shows a PowerShell login command. Run that command in a terminal and complete the provider's device-code flow, then refresh. Each profile uses Codex's `keyring` credential store, backed by Windows Credential Manager, with no plaintext fallback. The dashboard does not accept passwords, API keys, cookies, or pasted subscription tokens. Removing an account keeps its CLI profile and login intact.

For **Claude and Antigravity**, attach an existing profile, open **Setup**, and click **Enable monitoring**. ABC backs up the previous status-line configuration, adds its collector, and preserves any existing status-line output and unrelated settings. Restart the CLI if it is already open. No JSON editing is required. **Disable monitoring** restores the original status line; removing an account also disables its collector. Changes made outside ABC are detected and never silently overwritten. Keep the installation folder in place while monitoring is enabled.

Claude publishes subscription limits after the first ordinary API response in a session. The dashboard will never trigger that response. Use Claude normally, or check `/usage` in Claude Code. No Claude credentials are read by the collector; identity comes from the supported `claude auth status` command. New Claude sign-in belongs in Claude Code, using a separate `CLAUDE_CONFIG_DIR` for another account. The dashboard does not intermediate Claude subscription authentication.

Antigravity publishes quota buckets and account email through its documented status line. Open `/usage` or `/quota` inside the native CLI to request a fresh provider observation. Its installed CLI has no verified noninteractive quota command or independent authentication-profile switch. This app does not automate its sign-in, extract its credentials, scrape its private state, or pretend that two settings directories create two independent logins. Two account slots are available for independently established profiles, but creating those isolated Antigravity sessions remains unsupported here.

**Reconnect** accepts the current identity of the attached CLI profile. It does not launch login or log out another account. Use native provider tools if authentication needs renewal. Codex and Claude profile swaps are checked before accepting usage. Antigravity's first status-line email binds its slot; a different email clears visible quota and requires reconnecting.

## What refresh means

The server refreshes attached accounts on startup and every ten minutes. **Refresh all** and each account's **Refresh** button perform the same checks immediately. Codex queries live quotas. Claude and Antigravity read their latest status-line observation; they cannot force fresh provider usage from this dashboard. The page reads local state every ten seconds and updates countdowns automatically.

Only reported windows are displayed. Codex handles all returned bucket IDs, primary/secondary windows and individual spend controls. Claude handles published five-hour and seven-day subscription windows. Antigravity handles quota bucket IDs, remaining fractions, amount-only quotas, disabled buckets and absolute reset times. An amount without a total never becomes a fabricated percentage. Model bucket names are provider labels, not inferred model mappings. No monthly window appears unless the provider actually exposes it. Gateway spend limits and API billing are not presented as Claude subscription quotas.

Observations older than ten minutes are labeled accordingly. Passed reset times never imply that quota has replenished: refresh or a new CLI observation is required. Errors retain previous Codex observations with their original timestamp and show the failed status. Identity changes hide prior quotas.

## Local storage and security

Metadata, generated login launchers and sanitized quota observations live in `%LOCALAPPDATA%\QuotaDesk`. Set `ABC_DATA_DIR` (or the compatible `QUOTA_DESK_DATA`) to an absolute alternative directory if needed. Independent managed secrets are kept by Codex in Windows Credential Manager; the app itself stores no tokens. Its browser gets account names, profile paths, status, quota values and an anti-CSRF nonce, never provider credentials. There is no browser storage, analytics, external font, CDN, cloud backend or intermediary.

The server binds only to `127.0.0.1`, validates the exact Host and Origin, requires a per-process nonce on mutations, sends no CORS allowances, and serves only three allowlisted frontend files. Keep access to your Windows user account and local data folder private: this is a personal local utility, not a security boundary against other programs running as you.

The application has no direct external HTTP collector. Codex's official app-server manages its own necessary requests to OpenAI services; it starts in an isolated directory with custom provider configuration and proxy environment removed, analytics/feedback/OTel exporters disabled. Passive status-line collection makes no network requests. The supported Claude identity check runs with nonessential traffic disabled. Your ordinary native CLI sessions retain their own network settings.

Use `tlcf-abc --port 4320` or set `ABC_PORT` to change port 4317; the legacy `QUOTA_DESK_PORT` variable also works. Use `tlcf-abc --no-open` to suppress automatic browser opening.

## Verification

For development, run `npm install`, `npm run build` (compiles the release runtime to JavaScript), and `npm test`. `npm run verify:live` checks installed versions, reads actual Codex quota, compares the original authentication file hash before/after, and checks Claude authentication without inference. It prints no tokens or account identifiers. Tests use fixtures only for protocol shapes and failure cases; production collectors have no sample-data mode.

See `docs/feasibility.md` for verified capabilities, source links and live-test limitations.
