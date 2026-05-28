# ComBrief

在菜单栏 / 系统托盘为 **Cursor**、**Claude Code** 等 AI 编程工具各挂一盏状态灯，不用盯着 IDE 也能知道 Agent 是在干活、等你确认，还是已经停下来了。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

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

| App | 配置文件 | 状态 |
|-----|----------|------|
| [Cursor](https://cursor.com) | `~/.cursor/hooks.json` | 支持 |
| [Claude Code](https://code.claude.com) | `~/.claude/settings.json` | 支持 |

每个 App **独立一盏灯**（可自定义圆点内缩写，如 `C` / `CC`）。

## 快速开始

### 环境

- **macOS** 或 **Windows**
- [Node.js](https://nodejs.org) 20+（Hooks 脚本会调用系统里的 `node`）
- [Cursor](https://cursor.com) 和/或 Claude Code CLI

### 从源码运行（开发 / 自测）

```bash
git clone https://github.com/gepeiyu/ComBrief.git
cd ComBrief
npm install

# 可选：国内加速 Electron 下载
# cp .npmrc.example .npmrc

npm start
```

1. 在托盘打开 **ComBrief 设置**，点击 **添加** Cursor 或 Claude Code。  
2. **新开一次** Agent 会话（装 Hooks 前的旧会话可能不会上报）。  
3. 菜单栏 / 托盘区应出现对应状态灯（macOS 可能在 `^` 折叠区里）。

### 安装包（推荐给朋友）

在目标系统上构建（**Windows 安装包请在 Windows 上** `npm run dist`）：

```bash
npm install
npm run dist
```

产物在 `release/` 目录（macOS：`.dmg`，Windows：`.exe` 安装程序）。对方机器仍需安装 Node.js。

## 配置

数据目录：`~/.combrief/`

| 文件 | 说明 |
|------|------|
| `config.json` | 端口、Token、已注册 App、通知开关等 |
| `apps/<appId>/` | Bridge 脚本与安装清单 |
| `backups/<appId>/` | 安装时的配置备份（**仅供手动恢复**） |

常用可调项（`config.json`）：

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

## 开发

```bash
npm test              # 单元测试
npm run build         # 编译 TypeScript
npm run pack          # 免安装目录（release/）
npm run dist          # 安装包
```

更多文档：

- [状态灯规则](docs/STATE-RULES.md)

## 参与贡献

欢迎 Issue 与 Pull Request。大改动请先开 Issue 讨论状态机或 Hook 映射，避免与 [STATE-RULES.md](docs/STATE-RULES.md) 的设计意图冲突。

## 许可证

[MIT](LICENSE) © ComBrief contributors
