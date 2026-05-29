# ComBrief

**English** · [中文](README.zh-CN.md)

Menu bar / system tray status lights for **Cursor**, **Claude Code**, and other AI coding tools—see at a glance whether an agent is working, waiting for your approval, or idle.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Quick start

### Requirements

- **macOS** or **Windows**
- [Node.js](https://nodejs.org) 20+ (hook scripts invoke `node` on your PATH)
- [Cursor](https://cursor.com) and/or Claude Code CLI

### Installers (for friends)

Download the installer for your platform from **[GitHub Releases](https://github.com/gepeiyu/ComBrief/releases/latest)**:

| Platform | File | Notes |
|----------|------|--------|
| macOS (Intel) | `ComBrief-x.y.z.dmg` | no `-arm64` suffix |
| macOS (Apple Silicon) | `ComBrief-x.y.z-arm64.dmg` | M-series Macs |
| Windows | `ComBrief Setup x.y.z.exe` | NSIS installer |

After installing, open ComBrief and add Cursor / Claude Code in settings. [Node.js](https://nodejs.org) 20+ must still be installed on the machine (hooks invoke `node`).

#### Build from source

Build on the target OS (**build Windows installers on Windows**):

```bash
npm install
npm run dist
```

Output is under `release/` with the same filenames as above. Pushing a `v*` tag triggers CI to publish to Releases.

### Usage

1. Open **ComBrief Settings** from the tray and **Add** Cursor or Claude Code.  
2. **Start a new** agent session (sessions opened before hooks were installed may not report).  
3. Status dots should appear in the menu bar / tray (on macOS they may live under the `^` overflow).

In settings you can switch the UI to **English / 中文 / 日本語** (default: English).

### Run from source (dev / self-test)

```bash
git clone https://github.com/gepeiyu/ComBrief.git
cd ComBrief
npm install

# Optional: faster Electron downloads in some regions
# cp .npmrc.example .npmrc

npm start
```

## Why ComBrief

When an agent runs tools in the background, waits for you to click **Run**, or is “planning next,” it is easy to miss in the IDE. ComBrief uses official **Hooks** to mirror state in the tray: **four colors at a glance**, with optional system notifications.

## Status lights

| Color | Meaning |
|-------|---------|
| Gray | Session ended (offline) |
| Green | Online and idle—no agent turn in progress |
| Yellow | Turn in progress (thinking, planning, running tools) |
| Red | Needs your approval (Run, permission dialog, etc.) |

Rules are driven only by hook events—no “guess idle after N seconds,” which avoids false greens during planning. See [docs/STATE-RULES.md](docs/STATE-RULES.md) (Chinese).

## Supported apps

| App | Config file | Status |
|-----|-------------|--------|
| [Cursor](https://cursor.com) | `~/.cursor/hooks.json` | Supported |
| [Claude Code](https://code.claude.com) | `~/.claude/settings.json` | Supported |

Each app gets **its own light** (optional abbreviation inside the dot, e.g. `C` / `CC`).

## Configuration

Data directory: `~/.combrief/`

| Path | Purpose |
|------|---------|
| `config.json` | Port, token, registered apps, locale, notifications, etc. |
| `apps/<appId>/` | Bridge scripts and install manifest |
| `backups/<appId>/` | Config backup on install (**manual restore only**) |

Common `config.json` keys:

- `locale` — UI language: `en` / `zh` / `ja` (default `en`)
- `notificationsEnabled` — notify on red light (default on)
- `pendingToolApprovalMs` — time before “waiting for Run” turns red (default 5000 ms)
- `eventLoggingEnabled` — write `~/.combrief/logs/` (default off)

## Hooks and safety

ComBrief **does not replace** your existing hook setup:

- **Install / reinstall**: backup first, then **append** bridge entries tagged with `COMBRIEF_MARKER`; your other hooks stay.  
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
npm test              # unit tests
npm run build         # compile TypeScript
npm run pack          # unpacked app in release/
npm run dist          # installers
```

More docs:

- [Status light rules](docs/STATE-RULES.md) (Chinese)

## Contributing

Issues and pull requests are welcome. For large changes, open an issue first—especially for state machine or hook mapping, to stay aligned with [STATE-RULES.md](docs/STATE-RULES.md).

## License

[MIT](LICENSE) © ComBrief contributors
