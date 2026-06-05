# ComBrief

[English](README.md) · **中文**

在菜单栏 / 系统托盘为 **Cursor**、**Claude Code** 等 AI 编程工具各挂一盏状态灯，不用盯着 IDE 也能知道 Agent 是在干活、等你确认，还是已经停下来了。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 快速开始

### 环境要求

- **macOS** 或 **Windows**
- [Node.js](https://nodejs.org) 20+（Hooks 通过系统 `node` 上报状态）
- [Cursor](https://cursor.com) 和/或 [Claude Code](https://code.claude.com)

### 本地安装

```bash
git clone https://github.com/gepeiyu/ComBrief.git
cd ComBrief
npm install
npm test          # 可选
```

**日常使用**（无需打包）：

```bash
npm start
```

从菜单栏 / 托盘打开 ComBrief 即可。

**打包为安装包**（可选）：

```bash
npm run dist
```

产物在 `release/` 目录（macOS 为 `.dmg`，Windows 为 `.exe`）。本地构建未经 Apple 公证，macOS 首次打开若被拦截，可在 **系统设置 → 隐私与安全性** 点 **仍要打开**，或 **Control / 右键 → 打开**。

### 配置

1. 打开 **ComBrief 设置**，点击 **添加**，选择 Cursor 或 Claude Code（会自动写入 Hooks）。
2. **新开一次** Agent 会话（安装 Hooks 之前已打开的会话可能不会上报状态）。
3. 托盘区会出现对应状态灯（macOS 可能在 `^` 折叠区）。

可在设置中切换界面语言：**English / 中文 / 日本語**（默认 English）。

### Slack 远程确认（Claude Code）

外出时若只能使用 **Slack**（无法使用 Claude App），可在 ComBrief 设置中配置 Slack Bot。启用后，**同一次待办会同时出现在本地 CLI 与 Slack 频道**；在任一侧批准或拒绝即可（先处理者获胜），人在电脑前可照常使用本地 Allow，外出则在 Slack 点按钮。

**推荐**：ComBrief 设置 → **Slack 远程确认** → **打开 Slack 配置指南…**，按应用内八步图文操作（文档源文件：[docs/guides/slack-setup.zh-CN.md](docs/guides/slack-setup.zh-CN.md)）。

简要步骤：

1. 在 [Slack API](https://api.slack.com/apps) 创建应用，开启 **Socket Mode**，创建 App Token（`connections:write`）。
2. Bot Scopes：`chat:write`；私有频道另加 `groups:read`。
3. 安装到 Workspace，将 Bot 邀请进目标频道，复制 **Channel ID**（`C…`）。
4. ComBrief 设置 → **Slack 远程确认**：填入 `xoxb-…`、`xapp-…`、Channel ID，启用并发送测试消息。
5. 在设置中 **重新安装** Claude Code Hooks（或首次添加 Claude Code），以写入 `remote-gate` 脚本。

设计说明见 [docs/specs/2026-06-05-remote-slack-design.md](docs/specs/2026-06-05-remote-slack-design.md)。

## 为什么需要 ComBrief

Agent 在后台跑工具、等你点 **Run**、或在「planning next」时，IDE 里不一定显眼。ComBrief 通过官方 **Hooks** 把状态同步到托盘：**一眼四色灯**，需要时还有系统通知。

## 状态灯

| 颜色 | 含义 |
|------|------|
| 灰 | 会话已结束（离线） |
| 绿 | 在线空闲，当前没有进行中的 Agent 回合 |
| 黄 | 本回合进行中（思考、规划、跑工具） |
| 红 | 需要你确认（Run / 权限对话框等） |

规则完全由 Hook 事件驱动，不做「几秒没动静就猜空闲」——避免规划下一步时误变绿灯。详见 [docs/STATE-RULES.md](docs/STATE-RULES.md)。

## 支持的 App

| App | 配置文件 |
|-----|----------|
| [Cursor](https://cursor.com) | `~/.cursor/hooks.json` |
| [Claude Code](https://code.claude.com) | `~/.claude/settings.json` |

每个 App **独立一盏灯**，可在设置中自定义圆点内缩写（如 `C` / `CC`）。

## 配置项

数据目录：`~/.combrief/`

| 文件 | 说明 |
|------|------|
| `config.json` | 端口、Token、已注册 App、语言、通知开关等 |
| `apps/<appId>/` | Bridge 脚本与安装清单 |
| `backups/<appId>/` | 安装时的配置备份（仅供手动恢复） |

`config.json` 常用项：

- `locale` — 界面语言：`en` / `zh` / `ja`（默认 `en`）
- `notificationsEnabled` — 红灯时系统通知（默认开）
- `pendingToolApprovalMs` — 等 Run 多久后变红灯（默认 5000 ms）
- `eventLoggingEnabled` — 是否写 `~/.combrief/logs/`（默认关）

## Hooks 与安全

ComBrief **不会覆盖**你现有的 Hooks 配置：

- **安装 / 重装**：先备份，再**追加**带 `COMBRIEF_MARKER` 的 Bridge 条目；你的其它 hook 保留。
- **卸载 / 移除 App**：**只删除** ComBrief 条目，不用安装备份整文件覆盖，避免丢失你之后的修改。
- Bridge 上报失败时 **fail-open**，不阻断 Cursor / Claude Code 正常工作。

## 架构概览

```
Cursor / Claude Code
        │ hooks (stdin/stdout)
        ▼
  ~/.combrief/apps/<appId>/bridge.mjs
        │ POST /v1/state (localhost + token)
        ▼
  ComBrief (Electron) ──► 托盘状态灯 + 通知
```

## 更多文档

- [状态灯规则](docs/STATE-RULES.md)

## 参与贡献

欢迎 Issue 与 Pull Request。涉及状态机或 Hook 映射的大改动请先开 Issue，与 [STATE-RULES.md](docs/STATE-RULES.md) 的设计保持一致。

## 许可证

[MIT](LICENSE) © ComBrief contributors
