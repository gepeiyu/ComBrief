# ComBrief

[English](README.md) · **中文**

在菜单栏 / 系统托盘为 **Cursor**、**Claude Code** 等 AI 编程工具各挂一盏状态灯，不用盯着 IDE 也能知道 Agent 是在干活、等你确认，还是已经停下来了。对 Claude Code，ComBrief 还可以把确认请求同步到 Slack，便于外出时远程批准或拒绝。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 功能亮点

- 每个受支持的 AI App 独立显示一盏托盘状态灯。
- 基于官方 Hook 事件驱动状态变化，不用「几秒没动静」猜空闲。
- 四种状态一眼可见：离线、空闲、工作中、等待确认。
- 进入红灯时可发送系统通知。
- 安全安装 Hooks：先备份、再追加 ComBrief 条目，不覆盖你已有的 Hooks。
- Claude Code 支持 Slack 远程确认：本地终端和 Slack 双通道并行，先处理者生效。
- 界面支持 English / 中文 / 日本語。
- 支持 macOS 与 Windows，包括开机自启设置与 Windows Hook `.cmd` 包装脚本。

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

如果你所在地区下载 Electron 较慢，可把 `.npmrc.example` 复制为 `.npmrc`，按需调整镜像。

### 配置

1. 打开 **ComBrief 设置**，点击 **添加**，选择 Cursor 或 Claude Code。ComBrief 会自动写入 Hooks。
2. **新开一次** Agent 会话。安装 Hooks 之前已打开的会话可能不会上报状态。
3. 托盘区会出现对应状态灯（macOS 可能在 `^` 折叠区）。

可在设置中切换界面语言：**English / 中文 / 日本語**（默认 English）。

## 为什么需要 ComBrief

Agent 在后台跑工具、等你点 **Run**、或在「planning next」时，IDE 里不一定显眼。ComBrief 通过官方 **Hooks** 把状态同步到托盘：**一眼四色灯**，需要时还有系统通知。

## 状态灯

| 颜色 | 状态 | 含义 |
|------|------|------|
| 灰 | `offline` | 会话已结束 |
| 绿 | `idle` | 在线空闲，当前没有进行中的 Agent 回合 |
| 黄 | `working` | 本回合进行中：思考、规划、跑工具或子 Agent |
| 红 | `waiting_user` | 需要你确认：Run / 权限对话框等 |

规则完全由 Hook 事件驱动，不做「几秒没动静就猜空闲」——避免规划下一步时误变绿灯。详见 [docs/STATE-RULES.md](docs/STATE-RULES.md)。

## 支持的 App

| App | 配置文件 | 安装后的 Bridge |
|-----|----------|-----------------|
| [Cursor](https://cursor.com) | `~/.cursor/hooks.json` | `~/.combrief/apps/cursor/bridge.mjs` 或 `bridge.cmd` |
| [Claude Code](https://code.claude.com) | `~/.claude/settings.json` | `~/.combrief/apps/claude-code/bridge.mjs` 或 `bridge.cmd` |

每个 App **独立一盏灯**，可在设置中自定义圆点内缩写（如 `C` / `CC`，最多 2 个拉丁字符或 1 个中日韩字符）。

## Slack 远程确认（Claude Code）

外出时若只能使用 **Slack**（无法使用 Claude App），可在 ComBrief 设置中配置 Slack Bot。启用后，**同一次待办会同时出现在本地 Claude Code 终端与 Slack 频道**：

- 本地终端可照常批准 / 拒绝；
- Slack 频道会出现带按钮的确认卡片。

任一侧批准或拒绝即可，先处理者获胜。决策完成后，ComBrief 会更新 Slack 卡片，并向 Claude Code Hook 输出兼容的确认结果。

推荐配置路径：

1. ComBrief 设置 → **Slack 远程确认** → **打开 Slack 配置指南…**。
2. 按应用内指南操作，或阅读 [docs/guides/slack-setup.zh-CN.md](docs/guides/slack-setup.zh-CN.md)。
3. 启用 Slack 后重新安装 Claude Code Hooks，以写入 `remote-gate.mjs`。

简要来说，Slack 需要创建一个开启 Socket Mode 的 Slack App，并在 ComBrief 中填写 Bot Token（`xoxb-…`）、App-Level Token（`xapp-…`）和目标频道 ID。

## 配置项

数据目录：`~/.combrief/`

| 路径 | 说明 |
|------|------|
| `config.json` | 端口、Token、已注册 App、语言、托盘选项、通知、Slack 设置等 |
| `apps/<appId>/` | Bridge 脚本、remote-gate 脚本、Hook 链式执行记录与安装清单 |
| `backups/<appId>/` | 安装时创建的配置备份（仅供手动恢复） |
| `logs/` | 开启事件日志后写入的调试日志 |

`config.json` 常用项：

- `port` — 本地 HTTP 端口，默认 `3847`
- `token` — 随机 Bearer Token，Bridge 上报本地服务时使用
- `locale` — 界面语言：`en` / `zh` / `ja`（默认 `en`）
- `notificationsEnabled` — 红灯时系统通知（默认开）
- `pendingToolApprovalMs` — 等 Run 多久后变红灯（默认 5000 ms）
- `eventLoggingEnabled` — 是否写 `~/.combrief/logs/`（默认关）
- `launchAtLogin` — 支持的平台上开机自启
- `showTrayAbbrev` / `trayAbbrevs` — 控制托盘圆点内缩写
- `slack` — Claude Code 的 Slack 远程确认设置

## Hooks 与安全

ComBrief **不会覆盖**你现有的 Hooks 配置：

- **安装 / 重装**：先备份，复制 Bridge 脚本到 `~/.combrief/apps/<appId>/`，再追加 ComBrief Hook 条目；你的其它 Hook 保留。
- **卸载 / 移除 App**：只删除 ComBrief 条目，不用安装备份整文件覆盖，避免丢失你之后的修改。
- **已有 Hook**：ComBrief 会把非 ComBrief 的 Hook 命令记录到 `chain.json`，Bridge 上报状态后继续执行它们。
- **Bridge 失败**：上报失败时 fail-open，不阻断 Cursor / Claude Code 正常工作。
- **本地 HTTP**：Bridge 只访问 `127.0.0.1`，并携带 `~/.combrief/config.json` 中的 Token。

## 架构概览

```text
Cursor / Claude Code
        │ hooks (stdin/stdout)
        ▼
  ~/.combrief/apps/<appId>/bridge.mjs 或 bridge.cmd
        │ POST /v1/state (127.0.0.1 + bearer token)
        ▼
  ComBrief Electron 主进程
        ├─ AppController + 状态机
        ├─ TrayManager + 系统通知
        └─ SlackRuntime / DecisionService（Claude Code 远程确认）
```

完整中文架构文档见：[docs/ARCHITECTURE.zh-CN.md](docs/ARCHITECTURE.zh-CN.md)。

## 开发

```bash
npm install
npm test
npm run build
npm start
```

项目结构：

- `src/main/` — Electron 主进程、状态机、托盘、安装器、Slack 运行时、i18n、本地 HTTP 服务。
- `src/preload/` — 安全暴露给渲染页的 IPC 接口。
- `src/renderer/` — 设置页、关于页、Slack 配置指南页。
- `extensions/` — Hook Bridge 脚本；构建时复制到 `dist/extensions/`，安装时复制到 `~/.combrief/apps/<appId>/`。
- `tests/` — Vitest 测试，覆盖状态规则、Hook 注入、Slack 决策、配置、路径、托盘图标、i18n 和 HTTP 行为。
- `docs/` — 使用文档与架构文档。

## 更多文档

- [中文架构文档](docs/ARCHITECTURE.zh-CN.md)
- [状态灯规则](docs/STATE-RULES.md)
- [Slack 配置指南](docs/guides/slack-setup.zh-CN.md)
- [代码签名说明](docs/CODE-SIGNING.zh-CN.md)

## 参与贡献

欢迎 Issue 与 Pull Request。涉及状态机、Hook 映射、安装器行为或 Slack 远程确认的大改动，请先开 Issue，与 [STATE-RULES.md](docs/STATE-RULES.md) 和架构文档保持一致。

## 许可证

[MIT](LICENSE) © ComBrief contributors
