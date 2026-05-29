# ComBrief

**English** · [中文](README.zh-CN.md)

Menu bar / system tray status lights for **Cursor**, **Claude Code**, and other AI coding tools—see at a glance whether an agent is working, waiting for your approval, or idle.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Quick start

### Requirements

- **macOS** or **Windows**
- [Node.js](https://nodejs.org) 20+ (hooks invoke `node` on your PATH to report state)
- [Cursor](https://cursor.com) and/or [Claude Code](https://code.claude.com)

### Download

| Platform | Download |
|----------|----------|
| macOS (Intel) | [ComBrief-0.1.0.dmg](https://github.com/gepeiyu/ComBrief/releases/download/v0.1.0/ComBrief-0.1.0.dmg) |
| macOS (Apple Silicon) | [ComBrief-0.1.0-arm64.dmg](https://github.com/gepeiyu/ComBrief/releases/download/v0.1.0/ComBrief-0.1.0-arm64.dmg) |
| Windows | [ComBrief Setup 0.1.0.exe](https://github.com/gepeiyu/ComBrief/releases/download/v0.1.0/ComBrief.Setup.0.1.0.exe) |

Other versions: [GitHub Releases](https://github.com/gepeiyu/ComBrief/releases).

After installation, launch ComBrief from the menu bar / system tray.

#### macOS: “was not opened” warning?

Release builds are not Apple-notarized yet. macOS may block the first launch after downloading from GitHub—this is expected.

1. Click **Done** on the dialog (do not click **Move to Trash**).
2. Open **System Settings → Privacy & Security**, scroll down, and if you see **“Open ‘ComBrief.app’ anyway”**, click it and confirm.
3. Open ComBrief from **Applications** again. If it is still blocked, **Control-click ComBrief → Open** (or right-click → Open).

On Intel Macs, use **ComBrief-0.1.0.dmg**; on Apple Silicon, use **ComBrief-0.1.0-arm64.dmg**.

### Setup

1. Open **ComBrief Settings**, click **Add**, and choose Cursor or Claude Code (hooks are installed automatically).
2. **Start a new** agent session (sessions that were already open before hooks were installed may not report state).
3. A status dot appears in the tray (on macOS it may be under the `^` overflow).

You can switch the UI language in settings: **English / 中文 / 日本語** (default English).

## Why ComBrief

When an agent runs tools in the background, waits for you to click **Run**, or is “planning next,” it is easy to miss in the IDE. ComBrief uses official **hooks** to mirror state in the tray: **four colors at a glance**, with optional system notifications.

## Status lights

| Color | Meaning |
|-------|---------|
| Gray | Session ended (offline) |
| Green | Online and idle—no agent turn in progress |
| Yellow | Turn in progress (thinking, planning, running tools) |
| Red | Needs your approval (Run, permission dialog, etc.) |

Rules are driven only by hook events—no “guess idle after N seconds,” which avoids false greens during planning. See [docs/STATE-RULES.md](docs/STATE-RULES.md).

## Supported apps

| App | Config file |
|-----|-------------|
| [Cursor](https://cursor.com) | `~/.cursor/hooks.json` |
| [Claude Code](https://code.claude.com) | `~/.claude/settings.json` |

Each app gets **its own light**. You can customize the abbreviation inside the dot in settings (e.g. `C` / `CC`).

## Configuration

Data directory: `~/.combrief/`

| Path | Purpose |
|------|---------|
| `config.json` | Port, token, registered apps, locale, notifications, etc. |
| `apps/<appId>/` | Bridge scripts and install manifest |
| `backups/<appId>/` | Config backup on install (manual restore only) |

Common `config.json` keys:

- `locale` — UI language: `en` / `zh` / `ja` (default `en`)
- `notificationsEnabled` — notify on red light (default on)
- `pendingToolApprovalMs` — time before “waiting for Run” turns red (default 5000 ms)
- `eventLoggingEnabled` — write `~/.combrief/logs/` (default off)

## Hooks and safety

ComBrief **does not replace** your existing hook setup:

- **Install / reinstall**: backs up first, then **appends** bridge entries tagged with `COMBRIEF_MARKER`; your other hooks stay.
- **Uninstall / remove app**: **only removes** ComBrief entries—install backups are not auto-restored, so edits you made later are kept.
- Bridge failures are **fail-open** and do not block Cursor / Claude Code.

## Architecture

```
Cursor / Claude Code
        │ hooks (stdin/stdout)
        ▼
  ~/.combrief/apps/<appId>/bridge.mjs
        │ POST /v1/state (localhost + token)
        ▼
  ComBrief (Electron) ──► tray lights + notifications
```

## Development

```bash
git clone https://github.com/gepeiyu/ComBrief.git
cd ComBrief
npm install
npm test
npm start          # run locally
npm run dist       # build installers
```

More docs: [status light rules](docs/STATE-RULES.md)

## Contributing

Issues and pull requests are welcome. For large changes—especially state machine or hook mapping—open an issue first to stay aligned with [STATE-RULES.md](docs/STATE-RULES.md).

## License

[MIT](LICENSE) © ComBrief contributors
