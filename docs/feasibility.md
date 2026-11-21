# Provider feasibility — checked 2026-11-20

Installed here: Node.js 24.18.0; Codex CLI 0.171.0; Claude Code 2.1.329; Antigravity `agy` 1.5.13. CLI versions and help were inspected before implementation. Codex's installed app-server JSON schemas confirm the quota response fields used here.

## Codex: live, verified

Official transport and account API: https://developers.openai.com/codex/app-server/

Credential-store configuration: https://developers.openai.com/codex/config-reference/

The documented stdio JSON-RPC handshake is `initialize`, then `initialized`. `account/login/start` with externally managed `chatgptAuthTokens` supports memory-only access tokens, and `account/read` plus `account/rateLimits/read` expose real quota without a thread or model turn. External-token mode does not refresh another application's managed credentials; this client refuses token-refresh server requests.

The existing authenticated Codex profile returned five-hour and seven-day windows in a real invocation. A second live verification confirmed its original `auth.json` hash remained unchanged. No inference APIs were called. All returned bucket IDs are supported, including provider-specific/model-specific buckets when actually returned. API-key-only subscription quota and read-only access to another profile's keyring are unsupported.

Two simultaneous real authenticated identities were not available for testing. Synthetic profile tests verify separate paths, identity hashes, duplicate rejection, changed-profile handling, and removal without deleting authentication. New login is a supported native CLI device flow with per-home keyring storage; completing it requires the user's interactive authentication and was not attempted.

## Claude: supported passive collector, setup required

Status-line schema: https://code.claude.com/docs/en/statusline

CLI authentication status: https://code.claude.com/docs/en/cli-reference

Usage command: https://code.claude.com/docs/en/interactive-mode

Authentication restrictions: https://code.claude.com/docs/en/legal-and-compliance

The documented status-line JSON includes `rate_limits.five_hour` and `rate_limits.seven_day`, each with `used_percentage` and `resets_at`. These fields arrive only after a normal session response and can be independently absent. The collector receives them through the provider's supported script interface and stores only normalized quota and identity metadata. Existing local token-usage statistics cannot establish remaining subscription quota and are not used.

The installed `claude auth status` confirmed an authenticated subscription. Its CLI help exposes no supported standalone machine-readable subscription quota command. The app therefore does not invoke print mode with `/usage`, read subscription credentials, call private OAuth endpoints, or run a prompt for quota. Its ten-minute refresh checks identity and reads the latest observation; it cannot independently poll fresh Claude subscription limits.

The existing profile has no status-line collector configured. Live quota publication is unverified until the user enables monitoring in Setup and uses Claude normally. Parsing is tested against documented fields, including zero values, missing windows, and unrelated token statistics. No existing Claude settings or auth files were changed.

## Antigravity: supported passive collector, setup required

Status-line schema and Windows invocation: https://antigravity.google/docs/cli/statusline/

Native usage panel: https://antigravity.google/docs/cli/commands/usage/

CLI command reference: https://antigravity.google/docs/cli/reference/

The documented status-line payload includes quota buckets with remaining fractions or amounts, absolute reset times, disabled state, plan tier and account email. The native `/usage` panel refreshes quota from disk and the provider. `agy --help` on the installed version lists no supported standalone quota-export command. Print mode is a model-prompt path and is not used. Private protobuf state, editor databases, local service tokens and undocumented endpoints are not used.

Its profile and CLI installation were found. No supported independent authentication-profile switch was verified, so new isolated Antigravity authentication is explicitly unsupported. A settings directory alone is not treated as an independent authenticated identity.

The existing profile has no status-line collector configured. Live quota publication is unverified until the user enables monitoring in Setup and opens `/usage` in the CLI. The real receiver script is tested end to end with documented payload fixtures: allowlisted persistence, model buckets, missing fields, amount-only quotas, separate account snapshots and changed-email rejection. These tests do not establish successful live Google retrieval.

## Dashboard choices

The visual system uses a blue-gray desktop surface (#edf2f7), white account panels (#ffffff), dark blue text (#193143), muted text (#546b7e), blue actions (#245bbd), and teal connection status (#187365). Segoe UI Variable is the Windows-local typeface; no fonts are fetched. Left-aligned provider columns hold two account slots each on desktop, collapse to two columns on tablets and one on phones. Quota bars and timestamps carry the visual emphasis; absent data stays textual and has no decorative placeholder values. Provider-colored top edges identify the three groups.
