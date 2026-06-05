# Slack 远程确认 — 配置指南

外出时若只能使用 **Slack**（无法使用 Claude App），可按下面八步把 ComBrief 接到 Slack。办公室本机跑 Claude Code，外出在 Slack 频道点按钮即可批准或拒绝。

## 总览

```text
Slack 开放平台建 App
  → 开 Socket Mode + 配 Bot 权限
  → 安装到 Workspace
  → 建频道、邀请 Bot
  → ComBrief 设置里填 Token + Channel ID
  → 重装 Claude Code Hooks
  → 测试验证
```

---

## 第一步：创建 Slack 应用

1. 打开 [Slack API 应用管理](https://api.slack.com/apps)（需能访问 Slack API；公司网络若有限制要找 IT）。
2. 点 **Create New App** → **From scratch**。
3. **App Name**：例如 `ComBrief` 或 `Claude Approvals`。
4. **Workspace**：选你的公司 Workspace。

---

## 第二步：开启 Socket Mode（重要）

ComBrief 用 **Socket Mode 出站连 Slack**，办公室机器**不用**暴露公网 URL。

1. 左侧 **Socket Mode** → 打开 **Enable Socket Mode**。
2. 点 **Generate App-Level Token**：
   - Token Name：随意，如 `combrief-socket`
   - Scope：勾选 **`connections:write`**
3. 复制生成的 **`xapp-…`**（只显示一次，请先存好）→ 对应 ComBrief 设置里的 **Socket Mode App Token**。

---

## 第三步：配置 Bot 权限

左侧 **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**，至少添加：

| Scope | 用途 |
|--------|------|
| `chat:write` | 发确认卡片到频道 |
| `channels:read` | 读公开频道信息（辅助） |

**使用私有频道（推荐）时，必须再加：**

| Scope | 用途 |
|--------|------|
| `groups:read` | 让 Bot 能访问你已邀请它加入的**私有频道** |

> 若在第三步之后才添加 `groups:read`，需要回到本页点击 **Reinstall to Workspace**，否则新权限不会生效。

---

## 第四步：安装到 Workspace

1. 在 **OAuth & Permissions** 页面上方 → **Install to Workspace** → 允许。
2. 复制 **Bot User OAuth Token**（`xoxb-…`）→ ComBrief 设置里的 **Bot User OAuth Token**。

---

## 第五步：建频道并邀请 Bot

建议用 **私有频道** 收确认卡片，避免公开频道里被无关同事误点。

### 创建私有频道

1. Slack 左侧 **频道** 旁点 **+** → **创建频道**。
2. 名称例如 `claude-approvals`（可不要 `#` 前缀）。
3. 可见性选 **私有** — 仅受邀成员可见（界面可能写「Private / 专用」）。
4. 创建后只邀请你自己和需要远程点按钮的同事。

### 把 Bot 邀请进私有频道

Bot **不会**自动进私有频道，必须手动邀请，否则测试消息和确认卡片都发不出去。

1. 打开刚建的私有频道。
2. 输入：`/invite @你的Bot名字`（把 `你的Bot名字` 换成第一步里 App 的名称）。
3. 或：频道名 → **集成** / **成员** → **添加应用** → 选择你的 Bot。

邀请成功后，频道成员列表里应能看到该应用。

### 获取频道 ID

ComBrief 设置里要填 **频道 ID**，不是 `#频道名`。

| 方式 | 操作 |
|------|------|
| Slack 客户端 | 打开私有频道 → 点顶部频道名 → 拉到底部 → 复制 **频道 ID** |
| 浏览器 | 打开该频道，地址栏类似 `…/archives/C01234567` 或 `…/archives/G01234567`，最后一段即为 ID |

**ID 前缀说明：**

- 常见为 `C…`（不少工作区的私有频道也是 `C` 开头）
- 部分私有频道为 `G…`
- 两种都可以填进 ComBrief，只要与频道详情里显示的 **完全一致**

### 公开频道（可选）

若必须用公开频道：创建时选 **公开**，同样 `/invite @Bot`，权限可不加 `groups:read`（仍建议私有）。

---

## 第六步：在 ComBrief 里填写

回到本窗口上方的 **Slack 远程确认** 区域：

1. 勾选 **启用 Slack 远程确认**
2. **Bot User OAuth Token**：粘贴 `xoxb-…`
3. **Socket Mode App Token**：粘贴 `xapp-…`
4. **频道 ID**：粘贴频道详情里的 ID（`C…` 或 `G…`，不是 `#频道名`）
5. 点 **发送测试消息** → Slack 频道应出现「ComBrief Slack is connected」
6. 状态行应显示 **Slack：已连接**

配置保存在 `~/.combrief/config.json` 的 `slack` 段。**请勿**把 Token 提交到 git 或发到群里。

---

## 第七步：安装 Claude Code Hooks

1. 在 ComBrief 设置里找到 **Claude Code**：
   - 若未添加 → 点 **添加**
   - 若已添加 → 托盘菜单或设置里 **重新安装 Hooks**（会写入 `remote-gate.mjs`）
2. 本机需有 **Node.js 20+**（Hook 脚本需要）。

---

## 第八步：验证

1. 办公室机器：Claude Code 可用，ComBrief 在运行，Slack 显示已连接。
2. 终端运行 `claude`，让 Agent 执行一条会触发确认的操作（例如需要批准的 Bash）。
3. 预期：
   - Slack 频道出现 **带按钮** 的确认卡片；
   - 本机 CLI **也可** 点 Allow（双通道，先处理者获胜）；
   - 外出时只在 Slack 点 **允许/拒绝** 即可；
   - 点完后卡片按钮会消失，并显示已处理状态。

---

## 常见问题

| 问题 | 处理 |
|------|------|
| 测试消息发不出（私有频道） | Bot 是否已 **/invite 进该私有频道**；是否已加 `groups:read` 并 **Reinstall App**；频道 ID 是否与详情一致（`C…`/`G…`） |
| 测试消息发不出（公开频道） | Bot 是否已邀请进频道；ID 不是 `#名字` |
| 提示 not_in_channel | 私有频道最常见：Bot 未邀请进频道，在频道里执行 `/invite @Bot` |
| Socket 未连接 | `xapp-…` 是否带 `connections:write`；公司网络是否放行 `*.slack.com` 出站 |
| 有卡片但点按钮没反应 | ComBrief 是否在运行；设置里 Slack 是否仍 **已连接** |
| 公司不让装自定义 Slack App | 需 Workspace **管理员** 批准应用安装 |

---

## 安全建议

- 使用 **私有频道**，只邀请自己和必要同事。
- 可在 `config.json` 里配置 `allowedUserIds`（Slack 用户 ID `U…`，限制谁能点按钮）。
- Token 泄露后，在 Slack 应用后台 **Revoke 并重新生成**。
