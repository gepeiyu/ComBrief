# ComBrief × Claude Code × Slack 远程确认 — 设计说明

**状态**：已实现 P0（2026-06-05，待手工 Slack E2E）  
**实现计划**：[docs/plans/2026-06-05-slack-remote-approval.md](../plans/2026-06-05-slack-remote-approval.md)  
**日期**：2026-06-05  
**范围**：仅 Slack（不含飞书）。办公室本机 Claude Code + 外出 **仅 Slack 按钮** 完成待办决策（权限 / 选题 / 批计划等）。

---

## 1. 目标与非目标

### 1.1 目标（P0 = 方案 A）

- 当 Claude Code 需要用户确认（权限对话框、`ExitPlanMode`、`AskUserQuestion` 等）时，ComBrief 将摘要发到用户配置的 **固定 Slack 频道**。
- 外出用户在 Slack 内 **仅通过 Block Kit 按钮** 操作（允许 / 拒绝 / 选择选项），**不要求**在 Slack 里打字下指令。
- ComBrief 把用户选择写回 Claude Code Hook 的 **stdout**，等价于在 IDE 内点击允许/拒绝或选择选项。
- 保留现有托盘状态灯；`bridge.mjs` 继续 fail-open 上报状态。
- 设置页提供 Slack 配置（Token、频道 ID、测试连接）及总开关。

### 1.2 非目标

- 飞书或任意第二 IM（首版仅 Slack）。
- **P0 不做方案 B**：频道内自然语言（`ok` / `deny` / 自由文本续聊）；见 **P2**。
- Cursor 的远程确认（Cursor 无 `PermissionRequest`；红灯逻辑与 CC 不一致）。
- ComBrief 托管的云中继（办公室机通过 Socket Mode **出站** 连 Slack；见 §2.3）。
- 将 Claude **Remote Control**、**Channels**（Telegram/Discord）或官方 **@Claude Slack 云端会话** 作为本机 CC 的外出入口（见 §2.2，环境不可用或非本机会话）。

### 1.3 后续阶段（可选，不在当前交付范围）

| 阶段 | 内容 | 状态 |
|------|------|------|
| **P1** | 红灯 / `Stop` 异步 Slack 通知（无按钮）；按 `sessionId` 线程（可选） | 可选增强 |
| **方案 B（新指令）** | Slack 频道内打字注入新 user prompt | **明确不做**（除非另开 spec） |

当前交付 **仅 P0 方案 A**。

---

## 2. 背景与约束

### 2.1 部署场景

- **运行位置**：Claude Code 与 ComBrief 同在 **办公室机器**（本地文件系统、MCP、工具链）。
- **操作者**：外出时 **只能** 使用 Slack 等受允许的 IM；**不能** 使用 Claude App、claude.ai/code 等（网络策略限制）。
- **因此**：ComBrief + 本机 Hooks + 自建 Slack Bot 是外出审批的 **必要路径**，不是可选增强。

### 2.2 为何不采用官方替代方案

| 方案 | 为何不满足 |
|------|------------|
| [Remote Control](https://code.claude.com/docs/en/remote-control) | 依赖手机访问 Claude App / 浏览器；当前环境 **不可用**。 |
| [Channels](https://code.claude.com/docs/en/channels)（Telegram/Discord 等） | 外出端若只能 Slack，TG/DC **无法作为操作入口**；且 Channel 跑在 CC 进程内，ComBrief 无法替代实现。 |
| 官方 [Slack @Claude](https://code.claude.com/docs/en/slack) | 会话在 **Anthropic 云端**，不是办公室 **本机** 正在跑的 CC。 |
| ComBrief 仅做托盘灯 + 文档指路 | 无法在 Slack 内完成 **本机** 权限确认。 |

README 可脚注：若个别环境允许 Claude App，可并行使用 Remote Control；**不**替代本 spec 的 Slack 审批。

### 2.3 网络

- 办公室机器需能 **出站** 访问 Slack API（Socket Mode + `chat.postMessage`）；与「禁止 Claude App」通常不冲突，部署前需 IT 确认。
- ComBrief **不** 要求办公室机器暴露入站 HTTP（Socket Mode 出站连接）。
- 手机侧仅需能使用 **企业 Slack 客户端**（与 ComBrief 实现无关）。

### 2.4 运行前提

- 办公室机器开机、用户已登录、ComBrief 与 Claude Code 会话在运行；合盖休眠会导致链路中断（建议配合 ComBrief 开机自启；不纳入 P0 实现）。

---

## 3. 架构总览

### 3.1 三条链路

| 链路 | 机制 |
|------|------|
| Claude Code → ComBrief（状态） | `bridge.mjs` → `POST /v1/state`（现有） |
| Claude Code ↔ ComBrief（决策） | `remote-gate.mjs` → `POST /v1/decision/wait`（阻塞）→ stdout JSON |
| ComBrief ↔ Slack | Slack Web API + **Socket Mode**（`@slack/socket-mode` + `@slack/web-api`） |

**Hooks 仅用于 Claude Code 侧**；Slack 使用官方 Bot API，不由用户配置 Hook。

### 3.2 组件图

```text
┌─────────────────┐     stdin/stdout      ┌──────────────────┐
│  Claude Code    │◄──────────────────────►│ remote-gate.mjs  │
│                 │                        │ (blocking hooks) │
└────────┬────────┘                        └────────┬─────────┘
         │ hooks (async)                           │ HTTP localhost
         ▼                                           ▼
┌─────────────────┐     POST /v1/state     ┌──────────────────┐
│  bridge.mjs     │───────────────────────►│ ComBrief         │
└─────────────────┘                        │  - AppController │
                                           │  - DecisionQueue │
                                           │  - SlackAdapter  │
                                           └────────┬─────────┘
                                                    │ Socket Mode + Web API
                                                    ▼
                                           ┌──────────────────┐
                                           │ Slack #channel   │
                                           └──────────────────┘
```

### 3.3 双 Hook 分工（Claude Code）

| 脚本 | 挂载事件 | 行为 |
|------|----------|------|
| `bridge.mjs`（现有） | `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop` | 异步上报，**不阻塞**，fail-open |
| `remote-gate.mjs`（新增） | `PermissionRequest`；`PreToolUse` 且 matcher 为 `AskUserQuestion`、`ExitPlanMode`（可配置扩展） | 阻塞等待 ComBrief 决策，写 stdout |

安装/卸载：扩展 `injectClaudeBridge` 同类逻辑，在 `~/.claude/settings.json` 追加带 `COMBRIEF_MARKER` 的 `remote-gate` 条目；卸载时只删 ComBrief 条目。

---

## 4. Claude Code Hook 契约

### 4.1 `remote-gate.mjs` 流程

1. 从 stdin 读取 hook JSON（`session_id`, `tool_name`, `tool_input`, `cwd`, `hook_event_name` 等）。
2. 若 `config.json` 中 `slack.enabled !== true`：立即 exit 0，**无 stdout**（走 IDE 原生对话框）。
3. 先发 Slack 卡片，再 `POST http://127.0.0.1:{port}/v1/decision/wait` 阻塞等待（双通道，见 §4.5）。
4. 等待结束（Slack 按钮 / 本地 CLI 已确认 / 超时）。
5. 仅当响应含 **非空** `hookStdout` 时写入 stdout（Slack 批准/拒绝）；**本地已处理** 时 `hookStdout` 为 null → 不写 stdout，exit 0。
6. 超时且无本地处理：exit 0 且无 stdout（**fail-open**）或可选 `deny`（`slack.failClosed`，默认 `false`）。

### 4.5 双通道：本地 + Slack，先处理者获胜

- **Slack**：`handleWait` 注册 pending 后立即 `chat.postMessage` 发卡；Hook 继续阻塞等待。
- **本地 CLI**：在 Hook 阻塞期间，Claude Code **应**并行展示权限 UI（具体时机由 CC 决定）；用户在终端点 Allow/Deny 后，`bridge` 上报 `postToolUse` / `postToolUseFailure(permission_denied)`。
- **ComBrief**：`tryResolveFromLocal` 按 `sessionId` + `toolName` 匹配 pending，以 `hookStdout: null` 结束等待 → Hook 退出且**不**覆盖本地决策。
- **Slack 按钮**：仍以 `hookStdout` 写 `allow`/`deny`；若 pending 已结束（本地先处理），点击无效。
- **先处理者获胜**：同一 `requestId` 仅 resolve 一次。

用户无需关闭 Slack 或等待超时才能在本地点 Allow。

### 4.2 请求体（`/v1/decision/wait`）

```json
{
  "appId": "claude-code",
  "hookEvent": "permissionRequest",
  "sessionId": "…",
  "cwd": "/path/to/project",
  "toolName": "Bash",
  "toolInput": { },
  "raw": { }
}
```

- `hookEvent`：`permissionRequest` | `preToolUse`
- `raw`：原始 stdin 对象（便于日志与后续扩展）
- ComBrief 生成 `requestId`（UUID），返回前在服务端注册 pending。

### 4.3 响应体

```json
{
  "requestId": "…",
  "hookStdout": "{\"hookSpecificOutput\":{…}}"
}
```

`hookStdout` 由 ComBrief 按事件类型组装：

| 事件 | stdout 模式 |
|------|-------------|
| `PermissionRequest` | `hookSpecificOutput.hookEventName = "PermissionRequest"`, `decision.behavior` = `allow` \| `deny`, 可选 `message` |
| `PreToolUse` + `AskUserQuestion` | `permissionDecision: "allow"`, `updatedInput` 含原 `questions` + `answers` 映射 |
| `PreToolUse` + `ExitPlanMode` | `permissionDecision: "allow"` 或 `deny`（拒绝时带 `permissionDecisionReason`） |

### 4.4 安装时新增 Claude 事件

在现有 `CLAUDE_EVENTS` 列表之外，**单独**为 `remote-gate` 注册：

- `PermissionRequest`（可无 matcher，或文档建议用户对高风险工具加 matcher）
- `PreToolUse`：两组 matcher hook 条目 — `AskUserQuestion`、`ExitPlanMode`

`bridge.mjs` **不**订阅 `PermissionRequest`，避免重复阻塞。

---

## 5. ComBrief 服务端

### 5.1 `DecisionQueue`

- 内存 Map：`requestId → { resolve, createdAt, sessionId, … }`
- `register(request)` + `resolve(requestId, decision)`
- 超时定时器：到期 `resolve` 为「无决策」，HTTP 返回 204 或 `{ hookStdout: null }`，gate 脚本 fail-open
- 单进程 Electron；重启后 pending 全部失效（可接受，Claude 侧会重新弹窗或重试）

### 5.2 HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/decision/wait` | Hook 阻塞入口；body 见 4.2 |
| `POST` | `/v1/slack/test` | 设置页「发送测试消息」 |
| `GET` | `/v1/slack/status` | 连接状态、最近错误（设置页展示） |

现有 `/v1/state` 不变。

### 5.3 `SlackAdapter`

**依赖**：`@slack/socket-mode`、`@slack/web-api`（版本在实现时锁定）。

**启动**（`slack.enabled` 时）：

1. 使用 `appToken`（`xapp-…`）启动 Socket Mode 客户端。
2. 订阅 `interactive`（`block_actions`）、可选 `events_api` 若需 `message`（首版不需要）。
3. 使用 `botToken`（`xoxb-…`）调用 `chat.postMessage`。

**出站消息**：

- `channel`: 配置中的 `slack.channelId`
- `text`:  fallback 纯文本（通知摘要）
- `blocks`: Block Kit（见 5.4）
- 可选 `thread_ts`：按 `sessionId` 维护线程表（P1；首版可发主频道）

**入站**：

- `block_actions` → 解析 `action_id` / `value`（JSON：`{ requestId, action: "allow"|"deny"|optionIndex }`）
- 校验：可选 `slack.allowedUserIds`（Slack user ID 白名单）
- 调用 `DecisionQueue.resolve`

### 5.4 Slack 卡片（Block Kit）规范

**标题**：`Claude Code 需要你确认`（i18n 键 `slack.card.title`）

**上下文字段**：

- `tool_name`
- `cwd`（basename 或截断绝对路径）
- `session` 短码（`sessionId` 末 6 位）

**正文 section**：`formatToolSummary(toolName, toolInput)` — 脱敏规则：

- `Bash`：显示 command 字段，最长 500 字符
- `ExitPlanMode`：`plan` 前 800 字符 + 「…」
- `AskUserQuestion`：列出每个 `question` 文本
- 其他：JSON 压缩显示，最长 400 字符

**按钮**：

| 场景 | actions |
|------|---------|
| 通用权限 | `允许` (`allow`) / `拒绝` (`deny`) |
| AskUserQuestion | 每个 option 一个 button，`value` 含选项 label |
| ExitPlanMode | `批准计划` / `拒绝` |

`action_id` 固定前缀 `combrief_decision`，避免与其他 Slack App 冲突。

### 5.5 异步通知（P1，不属于 P0）

- 当 `AppController` 进入 `waiting_user` 或收到 `stop` 且 `stopStatus=completed` 时，若 Slack 启用，发送 **非阻塞** 通知消息（无 pending）。
- 与 **P0 决策卡片** 区分：通知消息 **无按钮**（方案 A 下外出仅依赖带按钮的审批卡片）。
- 不依赖 Claude App 深链（外出不可用）。

---

## 6. 配置

### 6.1 `config.json` 扩展

```ts
interface SlackConfig {
  enabled: boolean;
  botToken: string;      // xoxb-…
  appToken: string;      // xapp-…, connections:write
  channelId: string;     // C…
  decisionTimeoutMs: number;  // default 600_000
  failClosed: boolean;   // default false
  allowedUserIds?: string[];  // optional Slack U… IDs
}

interface CombriefConfig {
  // …existing fields
  slack: SlackConfig;
}
```

默认值：`enabled: false`，token 字段空字符串；`loadConfig` 合并缺省。

**存储**：明文存在 `~/.combrief/config.json`（与现有 `token` 相同）；设置页提示用户勿分享配置文件。

### 6.2 设置页 UX

新增区块 **Slack 远程确认**：

1. 开关「启用 Slack 远程确认」
2. Bot User OAuth Token（password input）
3. App-Level Token（Socket Mode，password input）
4. Channel ID（`C…`）+ 帮助链接说明如何邀请 Bot、如何查 ID
5. 高级（折叠）：决策超时、fail-closed、允许操作的用户 ID 列表
6. 按钮：**测试连接** → 调用 `/v1/slack/test` 发送绿色提示块
7. 状态行：Socket Mode 已连接 / 断开 / 最近错误

文案走 i18n（`en` / `zh` / `ja`）。

### 6.3 用户侧 Slack 准备清单（写入 README）

1. 创建 Slack App，启用 Socket Mode，创建 App Token `connections:write`
2. Bot scopes: `chat:write`, `channels:read`（私有频道加 `groups:read`）
3. 安装到 Workspace，复制 `xoxb-…`
4. 创建频道（如 `#claude-approvals`），邀请 Bot
5. 在 Slack 中获取 Channel ID，填入 ComBrief

---

## 7. 状态机与 Slack 的关系

- 托盘红灯逻辑 **不变**（`docs/STATE-RULES.md`）。
- `PermissionRequest` 在 `remote-gate` 阻塞期间，bridge 仍可能上报 `permissionRequest` → 黄灯 → 超时红灯；与 Slack 卡片发送并行。
- Slack 决策完成后，`PostToolUse` / 后续 hook 恢复黄/绿；无需新状态枚举。

---

## 8. 错误处理

| 情况 | 行为 |
|------|------|
| ComBrief 未运行 | `remote-gate` 连接失败 → fail-open |
| Slack 未连接 | 不发送卡片；wait 直至超时 → fail-open |
| `chat.postMessage` 失败 | 记录日志；可选向 Hook 返回 503，gate fail-open |
| 用户点击已过期 `requestId` | Slack 回复 ephemeral toast「已过期」 |
| 非白名单用户点按钮 | 忽略或 toast「无权限」 |
| Hook 超时 | pending 清理；Claude 显示原生对话框（若仍在等待） |

---

## 9. 安全

- Hook → ComBrief：现有 `Authorization: Bearer {config.token}`。
- Slack 按钮 `value` 仅含 `requestId` + `action`，**不含** secret；决策在 ComBrief 内查表。
- `allowedUserIds` 防止频道内他人误点。
- 消息内容脱敏：不写完整 `~/.ssh` 路径以外的 secrets；工具输入仅摘要。
- Token 仅本地存储；日志中 mask `xoxb`/`xapp` 前缀后几位。

---

## 10. 测试策略

| 层级 | 内容 |
|------|------|
| 单元 | `formatToolSummary`、`buildHookStdout`（各 tool 类型）、`DecisionQueue` 超时 |
| 单元 | `buildSlackBlocks` snapshot |
| 集成 | mock `WebClient` + Socket Mode 事件 → `resolve` 输出 stdout JSON |
| 手工 | 真实 Slack 工作区：PermissionRequest Bash、`AskUserQuestion`、`ExitPlanMode` |

不依赖 Slack 网络的 CI：全部 mock。

---

## 11. 实现阶段

| 阶段 | 交付 |
|------|------|
| **P0（方案 A）** | `remote-gate.mjs`、`DecisionQueue`、HTTP `/v1/decision/wait`、`SlackAdapter` Socket Mode + **仅按钮** 审批卡片、`config` + 设置页、Claude 安装器注入；**不含** Slack 文字指令、不含频道内续聊 |
| **P1** | 红灯/`Stop` 异步 Slack 通知（纯文本）；可选按 `sessionId` 线程 |
| ~~P2 方案 B~~ | ~~Slack 打字续聊~~ | **不实现** |

---

## 12. 文件清单（实现参考）

| 路径 | 说明 |
|------|------|
| `extensions/claude-code/remote-gate.mjs` | 阻塞决策 hook |
| `src/main/slack/adapter.ts` | Socket Mode + postMessage |
| `src/main/slack/blocks.ts` | Block Kit 构建 |
| `src/main/slack/hook-stdout.ts` | 决策 → stdout JSON |
| `src/main/decision-queue.ts` | pending 管理 |
| `src/main/http-server.ts` | 新路由 |
| `src/main/installer/settings-json.ts` | 注入 remote-gate 事件 |
| `src/renderer/settings.html` / `settings.js` | Slack UI |
| `src/main/i18n/messages.ts` | 文案 |
| `tests/decision-queue.test.ts` | 等 |

---

## 13. Spec 自检

- [x] 无 TBD / 占位章节
- [x] 已移除飞书范围，仅 Slack
- [x] 已写明外出不可用 Claude App，Slack 为硬性入口
- [x] 范围仅方案 A；方案 B（Slack 新指令）不实现
- [x] Hook 与 Slack API 职责无交叉矛盾
- [x] fail-open 与 `STATE-RULES.md` 一致
- [x] 单 spec 可支撑一份 P0 implementation plan

---

## 14. 评审后下一步

评审通过后：使用 `writing-plans` skill 生成 P0 实现计划（任务拆分、PR 顺序、测试命令）。
