# ComBrief

**English** · [中文](README.zh-CN.md)

Menu bar / system tray status lights for **Cursor**, **Claude Code**, and other AI coding tools—see at a glance whether an agent is working, waiting for your approval, or idle. For Claude Code, ComBrief can also mirror approval requests to Slack so you can approve or deny remotely.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Highlights

- One independent tray light per supported AI app.
- Event-driven state tracking through official hooks—no idle guesses based on silence.
- Four visual states: offline, idle, working, and needs approval.
- Optional system notification when a session needs approval.
- Safe hook installation: backs up existing config, appends ComBrief entries, and preserves your other hooks.
- Slack remote approval for Claude Code with dual-channel handling: local terminal and Slack race, first decision wins.
- Multilingual UI: English, Chinese, and Japanese.
- macOS and Windows support, including launch-at-login settings and Windows hook command wrappers.

## Quick start

### Requirements

- **macOS** or **Windows**
- [Node.js](https://nodejs.org) 20+ (hooks invoke `node` on your PATH to report state)
- [Cursor](https://cursor.com) and/or [Claude Code](https://code.claude.com)

### Local install

```bash
git clone https://github.com/gepeiyu/ComBrief.git
cd ComBrief
npm install
npm test          # optional
```

**Day-to-day use** (no packaging):

```bash
npm start
```

Launch ComBrief from the menu bar / system tray.

**Build installers** (optional):

```bash
npm run dist
```

Output is in `release/` (`.dmg` on macOS, `.exe` on Windows). Local builds are not Apple-notarized; if macOS blocks the first launch, use **System Settings → Privacy & Security → Open anyway**, or **Control / right-click → Open**.

If Electron downloads slowly in your region, copy `.npmrc.example` to `.npmrc` and adjust the mirror if needed.

### Setup

1. Open **ComBrief Settings**, click **Add**, and choose Cursor or Claude Code. Hooks are installed automatically.
2. **Start a new** agent session. Sessions already open before hooks were installed may not report state.
3. A status dot appears in the tray. On macOS it may be under the `^` overflow.

You can switch the UI language in settings: **English / 中文 / 日本語** (default English).

## Why ComBrief

When an agent runs tools in the background, waits for you to click **Run**, or is “planning next,” it is easy to miss in the IDE. ComBrief uses official **hooks** to mirror state in the tray: **four colors at a glance**, with optional system notifications.

## Status lights

| Color | State | Meaning |
|-------|-------|---------|
| Gray | `offline` | Session ended |
| Green | `idle` | Online and idle—no agent turn in progress |
| Yellow | `working` | Turn in progress: thinking, planning, running tools, or subagents |
| Red | `waiting_user` | Needs your approval: Run, permission dialog, etc. |

Rules are driven only by hook events—no “guess idle after N seconds,” which avoids false greens during planning. See [docs/STATE-RULES.md](docs/STATE-RULES.md).

## Supported apps

| App | Config file | Installed bridge |
|-----|-------------|------------------|
| [Cursor](https://cursor.com) | `~/.cursor/hooks.json` | `~/.combrief/apps/cursor/bridge.mjs` or `bridge.cmd` |
| [Claude Code](https://code.claude.com) | `~/.claude/settings.json` | `~/.combrief/apps/claude-code/bridge.mjs` or `bridge.cmd` |

Each app gets **its own light**. You can customize the abbreviation inside the dot in settings (for example `C` / `CC`, up to two Latin characters or one CJK character).

## Slack remote approval for Claude Code

If you are away from your machine and can only use **Slack**, ComBrief can send Claude Code approval requests to a Slack channel. The same pending decision is available in both places:

- local Claude Code terminal approval;
- Slack approval card with buttons.

Whichever side responds first wins. After a decision is made, ComBrief updates the Slack card and unblocks the hook with Claude Code-compatible output.

Recommended setup path:

1. Open **ComBrief Settings → Slack remote approval → Open Slack setup guide…**.
2. Follow the in-app guide or read [docs/guides/slack-setup.en.md](docs/guides/slack-setup.en.md).
3. Reinstall Claude Code hooks after enabling Slack so `remote-gate.mjs` is installed.

At a high level, Slack setup requires a Slack app with Socket Mode, a Bot token (`xoxb-…`), an App-Level token (`xapp-…`), and a target channel ID.

## Configuration

Data directory: `~/.combrief/`

| Path | Purpose |
|------|---------|
| `config.json` | Port, token, registered apps, locale, tray options, notifications, Slack settings, etc. |
| `apps/<appId>/` | Bridge scripts, remote gate scripts, hook chain metadata, and install manifest |
| `backups/<appId>/` | Config backup created during install; manual restore only |
| `logs/` | Optional debug logs when event logging is enabled |

Common `config.json` keys:

- `port` — local HTTP port, default `3847`
- `token` — random bearer token used by bridge scripts to call the local server
- `locale` — UI language: `en` / `zh` / `ja` (default `en`)
- `notificationsEnabled` — notify on red light (default on)
- `pendingToolApprovalMs` — time before “waiting for Run” turns red (default 5000 ms)
- `eventLoggingEnabled` — write `~/.combrief/logs/` (default off)
- `launchAtLogin` — start ComBrief at OS login when supported
- `showTrayAbbrev` / `trayAbbrevs` — control text shown inside tray dots
- `slack` — Slack remote approval settings for Claude Code

## Hooks and safety

ComBrief **does not replace** your existing hook setup:

- **Install / reinstall**: backs up first, copies bridge scripts to `~/.combrief/apps/<appId>/`, then appends ComBrief hook entries. Your other hooks stay.
- **Uninstall / remove app**: only removes ComBrief entries. Install backups are not auto-restored, so edits you made later are kept.
- **Existing hooks**: ComBrief records non-ComBrief hook commands in `chain.json` and bridge scripts run them after reporting state.
- **Bridge failures**: reporting failures are fail-open and do not block Cursor / Claude Code.
- **Local HTTP**: bridge calls go to `127.0.0.1` with the token from `~/.combrief/config.json`.

## Architecture

```text
Cursor / Claude Code
        │ hooks (stdin/stdout)
        ▼
  ~/.combrief/apps/<appId>/bridge.mjs or bridge.cmd
        │ POST /v1/state (127.0.0.1 + bearer token)
        ▼
  ComBrief Electron main process
        ├─ AppController + state machine
        ├─ TrayManager + system notifications
        └─ SlackRuntime / DecisionService (Claude Code remote approval)
```

See the full Chinese architecture document: [docs/ARCHITECTURE.zh-CN.md](docs/ARCHITECTURE.zh-CN.md).

## Development

```bash
npm install
npm test
npm run build
npm start
```

Project layout:

- `src/main/` — Electron main process, state machine, tray, installer, Slack runtime, i18n, HTTP server.
- `src/preload/` — safe IPC bridge exposed to renderer pages.
- `src/renderer/` — settings, about, and Slack setup guide pages.
- `extensions/` — hook bridge scripts copied into `dist/extensions/` during build and into `~/.combrief/apps/<appId>/` during install.
- `tests/` — Vitest coverage for state rules, hook injection, Slack decisions, config, paths, tray icons, i18n, and HTTP behavior.
- `docs/` — user and architecture documentation.

## More docs

- [Architecture (中文)](docs/ARCHITECTURE.zh-CN.md)
- [Status light rules](docs/STATE-RULES.md)
- [Slack setup guide](docs/guides/slack-setup.en.md)
- [Code signing notes (中文)](docs/CODE-SIGNING.zh-CN.md)

## Contributing

Issues and pull requests are welcome. For large changes—especially state machine, hook mapping, installer behavior, or Slack remote approval—open an issue first to stay aligned with [STATE-RULES.md](docs/STATE-RULES.md) and the architecture document.

## License

[MIT](LICENSE) © ComBrief contributors
