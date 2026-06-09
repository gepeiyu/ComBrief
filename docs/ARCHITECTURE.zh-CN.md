# ComBrief 架构文档

本文基于当前代码整理 ComBrief 的整体架构、核心流程、状态机原理、Hook 安装机制、Slack 远程确认链路和安全边界。适合维护者在改动状态规则、Hook 映射、安装器或 Slack 决策逻辑前阅读。

## 1. 项目定位

ComBrief 是一个 Electron 托盘应用，为 Cursor、Claude Code 等 AI 编程工具显示状态灯。它不直接控制 Agent，而是通过各工具官方 Hooks 获取事件，再把事件归一化为统一状态：

- `offline`：会话结束，灰灯；
- `idle`：在线空闲，绿灯；
- `working`：本回合进行中，黄灯；
- `waiting_user`：需要用户批准，红灯。

对 Claude Code，ComBrief 还提供 Slack 远程确认能力：当 Claude Code 触发 `PermissionRequest` 时，`remote-gate.mjs` 会同时等待本地终端和 Slack 按钮，先响应的一侧生效。

## 2. 技术栈与运行形态

| 层 | 技术 / 文件 | 说明 |
|----|-------------|------|
| 桌面壳 | Electron 33 | 托盘、窗口、系统通知、开机自启 |
| 主进程 | `src/main/**/*.ts` | 应用入口、状态机、HTTP 服务、安装器、Slack 运行时 |
| 渲染页 | `src/renderer/*.html` / `*.js` | 设置页、关于页、Slack 配置指南 |
| Preload | `src/preload/settings-preload.ts` | 通过 IPC 暴露安全 API |
| Hook 脚本 | `extensions/**` | 安装到用户目录后由 Cursor / Claude Code 调用 |
| 测试 | Vitest | 状态机、Hook 注入、Slack 决策、路径、配置等单元测试 |
| 打包 | electron-builder | macOS `.dmg`、Windows NSIS `.exe` |

运行时主要数据位于 `~/.combrief/`：

```text
~/.combrief/
├─ config.json              # 端口、token、语言、app、Slack 等配置
├─ apps/
│  ├─ cursor/
│  │  ├─ bridge.mjs / bridge.cmd
│  │  ├─ chain.json
│  │  └─ manifest.json
│  └─ claude-code/
│     ├─ bridge.mjs / bridge.cmd
│     ├─ remote-gate.mjs / remote-gate.cmd
│     ├─ chain.json
│     └─ manifest.json
├─ backups/<appId>/          # 安装前配置备份
└─ logs/                     # 可选调试日志
```

## 3. 顶层架构

```text
Cursor / Claude Code
        │
        │ official hooks，stdin 传入 hook payload
        ▼
~/.combrief/apps/<appId>/bridge.mjs 或 bridge.cmd
        │
        │ POST /v1/state
        │ Authorization: Bearer <config.token>
        ▼
Electron main process
        ├─ HTTP server：接收 Hook 事件、Slack 决策请求
        ├─ AppController：保存每个 App 的运行状态
        ├─ state-machine：把 Hook 事件归约为灯色状态
        ├─ TrayManager：创建 / 更新托盘灯、菜单和通知
        ├─ Installer：安装 / 卸载 Hook 脚本
        └─ SlackRuntime / DecisionService：Claude Code 远程确认
```

Electron 主进程由 `src/main/index.ts` 启动。它负责：

1. 初始化配置和开机自启；
2. 创建托盘管理器；
3. 创建 `AppController` 并恢复已注册 App；
4. 启动 Slack runtime；
5. 在 `127.0.0.1:<port>` 启动 HTTP 服务；
6. 注册 IPC，供设置页调用；
7. 周期性执行状态超时检查和托盘动画。

## 4. 主进程模块职责

### 4.1 `index.ts`：应用编排入口

`src/main/index.ts` 是 Electron 主入口。核心职责包括：

- 隐藏 macOS Dock，使应用表现为托盘工具；
- Windows / Linux 下创建隐藏 background window，避免所有窗口关闭后进程退出；
- 读取并补齐 `~/.combrief/config.json`；
- 根据配置创建每个 App 的托盘灯；
- 启动本地 HTTP 服务；
- 注册设置页 IPC：App 列表、安装 / 卸载、配置读写、Slack 状态、测试消息、打开配置指南、i18n 文案等。

### 4.2 `config.ts`：持久配置

`src/main/config.ts` 定义 `CombriefConfig`。关键字段：

- `port`：默认 `3847`；
- `token`：首次生成的随机 token，Bridge 上报本地 HTTP 时必须携带；
- `pendingToolApprovalMs`：从「可能在等批准」到红灯的延迟，默认 5000ms；
- `notificationsEnabled`：红灯通知；
- `eventLoggingEnabled`：是否写 `~/.combrief/logs/`；
- `launchAtLogin`：开机自启；
- `showTrayAbbrev` / `trayAbbrevs`：托盘圆点内文字；
- `locale`：`en` / `zh` / `ja`；
- `apps`：已安装 Hook 的 App ID；
- `slack`：Slack 远程确认配置。

配置读取时会与默认值合并，因此旧版本配置文件缺少新字段时仍可运行。

### 4.3 `http-server.ts`：本地 HTTP API

HTTP 服务只监听 `127.0.0.1`，并要求所有请求带 `Authorization: Bearer <token>`。主要端点：

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/v1/health` | 健康检查，返回版本 |
| `POST` | `/v1/state` | Hook Bridge 上报状态事件 |
| `GET` | `/v1/slack/status` | 设置页查询 Slack 连接状态 |
| `POST` | `/v1/slack/test` | 发送 Slack 测试消息 |
| `POST` | `/v1/decision/wait` | `remote-gate` 等待 Slack / 本地决策 |
| `POST` | `/v1/decision/local-resolved` | 本地终端先处理时通知主进程更新 Slack 卡片 |

`/v1/state` 会校验：

1. `appId` 必须已注册；
2. `event` 必须在允许列表中；
3. 校验通过后调用 `AppController.handleState()`。

### 4.4 `AppController`：状态和 UI 的中心协调器

`src/main/app-controller.ts` 持有每个 App 的 `AppState`，并将状态变化同步给托盘。

主要流程：

1. 收到 Hook payload；
2. 读取当前 App 状态，不存在则从 `offline` 新建；
3. 调用 `updatePendingApproval()` 更新「可能在等批准」的起点；
4. 调用 `reduceState()` 得到下一状态；
5. 写事件日志（如果启用）；
6. 如果状态进入红灯且通知开关打开，触发系统通知；
7. 调用 `TrayManager.setStatus()` 更新图标、菜单和 tooltip。

`tickTimeouts()` 每秒执行一次，用于把长时间未解除的 pending approval 从黄灯推进到红灯。当前实现刻意不通过心跳超时变离线，也不通过静默超时猜空闲。

### 4.5 `state-machine.ts`：状态灯规则

状态机是 ComBrief 的核心稳定性边界。原则是：**只相信 Hook 事件，不靠时间沉默猜测 Agent 空闲**。

核心规则：

- `beforeSubmitPrompt` / Claude `UserPromptSubmit`：回合开始，变黄；
- `stop` / Claude `Stop`：回合结束，变绿；
- `sessionStart`：离线时变绿；
- `sessionEnd`：变灰；
- `afterAgentResponse`、`afterAgentThought`、子 Agent 事件：仍在回合中，保持黄；
- `beforeShellExecution`：保持当前状态，因为 Cursor 可能在用户点击 Allow 前就触发该事件；
- `PermissionRequest`、Shell / MCP 的 `preToolUse`、`permission_denied`：先保持黄，超过 `pendingToolApprovalMs` 后才变红。

这套规则对应 `docs/STATE-RULES.md`，测试覆盖在 `tests/state-machine.test.ts`。

### 4.6 `TrayManager` 与 `tray-icons.ts`：托盘显示

`TrayManager` 管理两类托盘项：

- hub 灰点：没有添加任何 App 时显示，用于打开设置；
- App 状态灯：每个已安装 App 一盏独立灯。

菜单包括：

- 当前状态和更新时间；
- 打开设置；
- 重新安装 Hooks；
- 移除此 App；
- 关于；
- 退出。

图标由 `tray-icons.ts` 动态生成：

- 绿色：空闲；
- 黄色：工作中，呼吸动画；
- 红色：等待确认，闪烁；
- 灰色：离线；
- 可在圆点内显示最多 2 个拉丁字符或 1 个中日韩字符。

## 5. Hook 安装机制

### 5.1 App 注册表

`src/main/apps/registry.ts` 定义当前支持的 App：

| App ID | 显示名 | Hook 配置 | 类型 |
|--------|--------|-----------|------|
| `cursor` | Cursor | `.cursor/hooks.json` | `cursor-hooks-json` |
| `claude-code` | Claude Code | `.claude/settings.json` | `claude-settings-json` |

后续支持新工具时，通常先扩展该注册表，并实现对应 Hook 注入器和 Bridge 映射。

### 5.2 安装步骤

`src/main/installer/install-app.ts` 的 `installApp(appId)` 执行：

1. 定位用户 Hook 配置文件；
2. 在 `~/.combrief/backups/<appId>/` 备份当前配置；
3. 将 `extensions/<appId>/*.mjs` 复制到 `~/.combrief/apps/<appId>/`；
4. Windows 下解析 Node 路径，并生成 `bridge.cmd` / `remote-gate.cmd`；
5. 注入 ComBrief Hook 条目；
6. 收集已有非 ComBrief Hook 命令，写入 `chain.json`；
7. 写入 `manifest.json`；
8. 更新 `config.json` 的 `apps` 列表。

### 5.3 Cursor Hook 注入

`src/main/installer/hooks-json.ts` 管理 `~/.cursor/hooks.json`。ComBrief 会为 Cursor 追踪以下事件：

```text
sessionStart, sessionEnd, beforeSubmitPrompt,
preToolUse, postToolUse, postToolUseFailure,
beforeShellExecution, afterShellExecution,
afterAgentResponse, afterAgentThought,
subagentStart, subagentStop, stop
```

注入方式是给每个事件追加命令：

```text
~/.combrief/apps/cursor/bridge.mjs <event>
```

卸载时只移除命令路径匹配 ComBrief Bridge 的条目，不删除用户原有 Hooks。

### 5.4 Claude Code Hook 注入

`src/main/installer/settings-json.ts` 管理 `~/.claude/settings.json`。ComBrief 会为 Claude Code 追踪：

```text
SessionStart, SessionEnd, UserPromptSubmit,
PreToolUse, PostToolUse, PostToolUseFailure, Stop
```

此外，`src/main/installer/remote-gate-json.ts` 会为 `PermissionRequest` 注入：

```text
~/.combrief/apps/claude-code/remote-gate.mjs PermissionRequest
```

这里特意只 gate `PermissionRequest`，不 gate `PreToolUse`，因为当前设计重点是 Claude Code 的权限请求双通道处理；常规 PreToolUse 仍由 Bridge 上报状态。

### 5.5 Hook 链式执行

安装时，ComBrief 会把已有的非 ComBrief Hook 命令收集到 `chain.json`。Bridge 上报自己的状态后，会继续按顺序执行这些命令，并转发 stdin/stdout/stderr。

这样可以降低对用户已有自动化的影响：ComBrief 不是替换 Hook，而是插入一层轻量观察与转发。

## 6. Bridge 脚本原理

### 6.1 普通 Bridge

`extensions/cursor/bridge.mjs` 和 `extensions/claude-code/bridge.mjs` 逻辑相似：

1. 从 stdin 读取 Hook payload；
2. 从命令行参数、环境变量或 payload 中解析 Hook 名；
3. 把原始 Hook 名映射为 ComBrief 统一事件名；
4. 从 `~/.combrief/config.json` 读取端口和 token；
5. `POST /v1/state` 上报事件、时间戳、session ID 和 meta；
6. 对 `beforeSubmitPrompt` 输出继续执行所需的 JSON；
7. 执行 `chain.json` 中记录的用户原有 Hook 命令；
8. 上报失败时写日志（仅当开启日志），但不阻断原工具。

Bridge 提取的 `meta` 包括：

- `stopStatus`：回合结束状态；
- `failureType`：工具失败类型，例如 `permission_denied`；
- `toolName`：工具名，用于识别 Shell / MCP / PermissionRequest 等待逻辑。

### 6.2 事件归一化

主进程还有 `src/main/bridge/map-event.ts`，用于测试和维护 Hook 映射的一致性。Cursor 事件大多已是小写统一事件；Claude Code 事件会从 `SessionStart`、`UserPromptSubmit`、`PermissionRequest` 等映射到统一的 `sessionStart`、`beforeSubmitPrompt`、`permissionRequest`。

## 7. 状态流详解

### 7.1 正常回合

```text
用户提交消息
  → beforeSubmitPrompt / UserPromptSubmit
  → ComBrief: working（黄）

Agent 思考、输出、调用工具、子 Agent 执行
  → preToolUse / postToolUse / afterAgentResponse / afterAgentThought / subagent*
  → ComBrief: working（黄）

Agent 结束本回合
  → stop / Stop
  → ComBrief: idle（绿）
```

关键点：`afterAgentResponse` 不代表回合结束。很多 Agent 在输出一段文字后还会继续规划或调用工具，所以它保持黄灯。

### 7.2 等待用户批准

```text
Shell / MCP preToolUse 或 PermissionRequest
  → pendingApprovalSince = now
  → 先保持 working（黄）

超过 pendingToolApprovalMs 仍未解除
  → applyPendingApprovalTimeout
  → waiting_user（红）
  → 可触发系统通知

用户批准，随后收到 postToolUse / afterShellExecution / stop
  → 清除 pendingApprovalSince
  → 回到 working 或 idle
```

红灯有延迟，是为了避免自动允许、瞬时拒权或短暂权限事件造成误报。

### 7.3 会话开始 / 结束

```text
sessionStart
  → offline 时变 idle

sessionEnd
  → offline
```

当前实现不通过心跳或静默超时把会话变离线，避免误判长时间思考或后台任务。

## 8. Slack 远程确认架构

Slack 功能只针对 Claude Code 的远程确认场景。

### 8.1 组件关系

```text
Claude Code PermissionRequest
        │
        ▼
remote-gate.mjs
        ├─ POST /v1/state: permissionRequest
        ├─ POST /v1/decision/wait
        │       │
        │       ▼
        │  DecisionService + DecisionQueue
        │       │
        │       ├─ SlackAdapter 发布按钮卡片
        │       └─ 等待 Slack interactive callback
        │
        └─ promptLocalDecision 本地终端菜单

Slack 按钮 or 本地终端
        │
        ▼
先响应者生成 Hook stdout
        │
        ▼
Claude Code 继续执行或拒绝
```

### 8.2 `SlackRuntime`

`src/main/slack-runtime.ts` 管理 Slack 连接生命周期：

- 根据配置决定是否启动；
- 创建 `SlackAdapter`；
- 创建共享 `DecisionQueue` 与 `DecisionService`；
- 提供连接状态和测试消息能力；
- 配置变化时停止并重启。

### 8.3 `SlackAdapter`

`src/main/slack/adapter.ts` 封装 Slack SDK：

- `SocketModeClient`：接收交互事件；
- `WebClient`：发送和更新消息；
- `postDecisionMessage()`：发布确认卡片；
- `updateDecisionMessage()`：决策完成后移除按钮并写入状态；
- `postTestMessage()`：发送测试消息。

如果配置了 `allowedUserIds`，Slack 交互只接受白名单用户。

### 8.4 `DecisionService`

`src/main/decision-service.ts` 是远程确认核心：

1. `handleWait()` 收到 `remote-gate` 请求；
2. 生成 `requestId`；
3. 建立 `sessionId → requestId` 索引；
4. 发布 Slack 卡片；
5. 通过 `DecisionQueue.wait()` 等待决策或超时；
6. Slack 按钮触发 `handleBlockAction()` 时生成 Claude Code Hook stdout；
7. 本地终端先处理时，`resolveLocalTerminal()` 返回 `hookStdout: null`，避免覆盖本地决策；
8. Bridge 后续上报 `postToolUse` 或 `permission_denied` 时，`tryResolveFromLocal()` 也能识别本地已处理并更新 Slack 卡片。

这实现了「双通道，先处理者获胜」。

### 8.5 Slack 卡片

`src/main/slack/blocks.ts` 生成 Slack Block Kit：

- 顶部 divider 与请求时间；
- 工具名、会话后 6 位、项目目录；
- 工具输入摘要；
- 动作按钮。

支持三种卡片模式：

| 模式 | 工具 / 场景 | 按钮 |
|------|-------------|------|
| `permission` | 普通权限请求 | 允许一次、始终允许建议、拒绝 |
| `askUser` | `AskUserQuestion` | 问题选项 |
| `exitPlan` | `ExitPlanMode` | 批准计划、拒绝 |

决策完成后，`buildResolvedDecisionBlocks()` 会移除按钮，并追加已处理状态与处理时间。

### 8.6 Hook stdout 生成

`src/main/slack/hook-stdout.ts` 和 `extensions/claude-code/build-hook-stdout.mjs` 保持同步，用来输出 Claude Code 识别的 hookSpecificOutput。

典型行为：

- `PermissionRequest + allowOnce`：输出 `decision.behavior = allow` 和 `updatedInput`；
- `PermissionRequest + allowAlways`：额外输出 `updatedPermissions`；
- `PermissionRequest + deny`：输出 `decision.behavior = deny`；
- `AskUserQuestion`：把选项写入 `updatedInput.answers`；
- `ExitPlanMode`：按批准 / 拒绝输出对应结构；
- legacy `PreToolUse`：保留 `permissionDecision` 格式。

## 9. 渲染层与 IPC

### 9.1 设置页

`src/renderer/settings.html` 和 `settings.js` 提供设置 UI：

- 添加 / 移除 Cursor、Claude Code；
- 切换语言；
- 开关红灯通知；
- 配置开机自启；
- 控制托盘圆点缩写；
- 开关调试日志；
- 配置 Slack Token、频道 ID、发送测试消息；
- 打开 Slack 配置指南。

`src/preload/settings-preload.ts` 通过 `contextBridge` 暴露 `window.combrief`，避免渲染页直接访问 Node API。

### 9.2 关于页与 Slack 指南

- `about-window.ts` / `about.html`：显示版本、简介和仓库链接；
- `slack-setup-window.ts` / `slack-setup-guide.html` / `slack-setup-guide.js`：加载对应语言的 Markdown 指南，并用轻量 Markdown 渲染器展示。

`copy-extensions.mjs` 构建时会把渲染页和 `docs/guides/slack-setup.*.md` 复制到 `dist/renderer/`。

## 10. 开机自启与后台窗口

### 10.1 开机自启

`login-item.ts` 与 `login-item-settings.ts` 封装 Electron login item：

- macOS：使用 `mainAppService`，并以隐藏方式打开；
- Windows：使用稳定 Run value 名称 `ComBrief`，并传入 `--opened-at-login`；
- 设置页会读取有效状态，并提示 macOS 需要用户在登录项中允许、Windows 启动项被禁用等问题。

### 10.2 Background window

Windows / Linux 上，如果所有窗口都关闭，Electron 可能退出。`background-window.ts` 创建一个隐藏 1×1 window，并在非主动退出时阻止其关闭，以保持托盘应用常驻。

macOS 下则隐藏 Dock，通过菜单栏托盘常驻。

## 11. 构建与打包

`package.json` 脚本：

| 命令 | 说明 |
|------|------|
| `npm test` | 运行 Vitest |
| `npm run build` | TypeScript 编译并复制 extensions / renderer 资源 |
| `npm start` | 构建后用 Electron 启动开发态应用 |
| `npm run pack` | 构建 electron-builder 目录包 |
| `npm run dist` | 构建安装包 |

`electron-builder.yml`：

- `appId: app.combrief`；
- macOS target：`dmg`；
- Windows target：`nsis`；
- 应用图标：`build/icon.png`；
- 签名说明见 `docs/CODE-SIGNING.zh-CN.md`。

## 12. 安全边界与设计取舍

### 12.1 本地通信

- HTTP 服务仅监听 `127.0.0.1`；
- Bridge 请求必须携带随机 token；
- token 存储在用户本机 `~/.combrief/config.json`；
- Bridge 上报失败 fail-open，避免影响原工具工作。

### 12.2 Hook 配置安全

- 安装前备份配置；
- 只追加 ComBrief 条目；
- 卸载只删除 ComBrief 条目，不整文件回滚；
- 用户原有 Hook 会通过 `chain.json` 继续执行。

### 12.3 Slack 安全

- 推荐使用私有频道；
- Token 只保存在本机配置中；
- 支持 `allowedUserIds` 白名单；
- Slack 按钮生成的是 Claude Code Hook 输出，本质上等同远程批准本机 Claude Code 操作，因此频道成员需要可信；
- token 泄露后应在 Slack App 后台撤销并重新生成。

### 12.4 状态判断取舍

ComBrief 故意不做：

- 不用「N 秒无 Hook」猜绿灯；
- 不用心跳缺失强制离线；
- 不在 `beforeShellExecution` 立刻红灯；
- 不把 `stop + aborted` 判为红灯。

这些取舍的目标是减少误报，尤其避免 Agent 仍在规划时托盘误显示空闲。

## 13. 测试覆盖

当前测试主要覆盖：

| 测试文件 | 覆盖内容 |
|----------|----------|
| `state-machine.test.ts` | 回合状态、红灯延迟、避免静默猜绿 / 猜离线 |
| `hooks-json.test.ts` | Cursor Hook 注入、移除和链式命令收集 |
| `settings-json.test.ts` | Claude Code Hook 注入、移除、Windows 命令格式 |
| `remote-gate-json.test.ts` | `PermissionRequest` remote gate 注入与移除 |
| `decision-queue.test.ts` | 决策等待、超时与 resolve |
| `decision-service.test.ts` | Slack / 本地双通道决策竞争 |
| `slack-blocks.test.ts` | Slack 卡片按钮、时间、决议状态 |
| `hook-stdout.test.ts` | Claude Code hookSpecificOutput 输出格式 |
| `permission-suggestions.test.ts` | `permission_suggestions` 提取与按钮文案 |
| `http-server.test.ts` | 本地 HTTP 鉴权后的健康检查和状态上报 |
| `config.test.ts` | 默认配置、Slack 默认项、托盘缩写 |
| `tray-icons.test.ts` / `tray-abbrev.test.ts` | 图标动画、位图格式、缩写规范 |
| `i18n.test.ts` | 多语言文案和 IPC 可克隆性 |
| `login-item.test.ts` | macOS / Windows 开机自启参数 |
| `node-resolve.test.ts` | Windows Node 解析和 `.cmd` 生成 |
| `paths.test.ts` | 用户目录路径展开与平台差异 |
| `notification-service.test.ts` | 红灯通知去重 |

## 14. 扩展新 App 的建议流程

如果要支持新的 AI 工具，可按以下顺序：

1. 在 `APP_REGISTRY` 增加 App 定义；
2. 确认该工具的 Hook 配置文件格式；
3. 新增 installer 注入 / 移除逻辑，保证只追加、可卸载、可链式执行用户已有 Hook；
4. 在 `extensions/<appId>/` 新增 Bridge 脚本，负责事件解析、meta 提取和 `/v1/state` 上报；
5. 将原始事件映射到统一 `StateEvent`；
6. 补充状态机或映射测试；
7. 更新 README、架构文档和状态规则文档。

新增 App 时应优先保持现有状态机语义，不要让某个工具的特殊事件破坏「回合开始 / 回合结束」这个核心模型。

## 15. 改动高风险区域

以下区域改动前建议先补测试或运行全量测试：

- `state-machine.ts`：影响托盘灯准确性；
- `extensions/**/bridge.mjs`：影响 Hook 上报和用户原有 Hook 链式执行；
- `installer/*.ts`：影响用户配置文件，必须确保可逆且不覆盖用户内容；
- `decision-service.ts` / `remote-gate.mjs` / `hook-stdout.ts`：影响 Claude Code 远程批准和权限输出格式；
- `http-server.ts`：影响本地通信和安全边界；
- `login-item*.ts`：不同平台行为差异较大。

## 16. 一句话总结

ComBrief 的核心架构是：**Hook Bridge 负责观察和转发，本地 HTTP 服务负责接收事件，状态机负责稳定归约，托盘负责可视化，Slack 决策层负责 Claude Code 的远程批准**。整个系统尽量保持 fail-open、可卸载、少误报，并避免覆盖用户既有自动化配置。
