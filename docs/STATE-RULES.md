# ComBrief 状态灯规则（基于 Hooks）

> 只根据 Cursor / Claude Code **实际会触发的 hook** 推导，不依赖超时猜「空闲」。

## 四灯含义

| 灯 | 状态 | 含义 |
|----|------|------|
| 灰 | `offline` | 会话已结束（`sessionEnd` / `SessionEnd`） |
| 绿 | `idle` | 会话在线，**当前没有进行中的 Agent 回合** |
| 黄 | `working` | **本回合进行中**：思考、规划下一步、跑工具 |
| 红 | `waiting_user` | 必须你点 Run / 权限确认框 |

## 核心概念：「回合」(turn)

一次回合 = 你发出一条消息 → Agent 处理（可多轮工具）→ **`stop` / `Stop` 触发**。

- **回合开始**：`beforeSubmitPrompt`（Cursor）/ `UserPromptSubmit`（CC）→ 黄灯  
- **回合结束**：`stop` / `Stop`（任意 `status`）→ **绿灯**  
- **`afterAgentResponse` / `afterAgentThought` 不结束回合**（规划下一步时仍黄灯，避免误绿）

## Cursor Hooks → 灯

| Hook | 灯 |
|------|-----|
| `sessionStart` | 灰→绿（若此前离线） |
| `sessionEnd` | 灰 |
| `beforeSubmitPrompt` | 黄（回合开始） |
| `preToolUse` / `postToolUse` | 黄 |
| `postToolUseFailure` | 拒权→红；否则黄 |
| `beforeShellExecution` | 保持当前（不单独升红，避免自动 Run 误报） |
| `afterShellExecution` | 黄 |
| `afterAgentResponse` | **黄** |
| `afterAgentThought` | **黄** |
| `subagentStart` / `subagentStop` | 黄 |
| `stop` | **绿**（回合结束） |

## Claude Code Hooks → 灯

| Hook | 灯 |
|------|-----|
| `SessionStart` | 灰→绿 |
| `SessionEnd` | 灰 |
| `UserPromptSubmit` | 黄 |
| `PreToolUse` / `PostToolUse` | 黄 |
| `PostToolUseFailure` | 拒权→红；否则黄 |
| `PermissionRequest` | 红 |
| `Stop` | **绿** |

## 红灯（仅两种来源）

1. **`PermissionRequest`**（CC）— 权限对话框  
2. **Shell/MCP 的 `preToolUse` 后超过 `pendingToolApprovalMs`（默认 5s）仍无 `postToolUse`** — 视为在等 Run（Cursor 自动执行的命令通常 &lt;5s 完成，不误报）

通知仅在 **进入红灯** 时发送。

## Hooks 安装 / 卸载

- **安装 / 重装**：备份当前配置文件到 `~/.combrief/backups/`；在现有 hooks 上**追加** ComBrief 条目（带 `COMBRIEF_MARKER`），不删你的其它 hook。
- **卸载 / 移除 App**：**只删除** ComBrief 条目，**不会**用安装时的备份整文件覆盖（避免丢你之后改过的 hooks）。
- 若需回到安装前整文件状态，可手动从 `~/.combrief/backups/<appId>/` 挑选备份恢复。

## 故意不做的事

- ❌ 用「N 秒无 hook」把黄灯猜成绿灯（会导致 *planning next* 等思考阶段误绿）  
- ❌ `beforeShellExecution` 立刻升红（允许列表自动 Run 会误报）  
- ❌ `stop` + `aborted` 升红（手动停止应回绿）
