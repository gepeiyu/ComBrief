# ComBrief Remote（HaaS EDU K1）设计方案

日期：2026-06-09

## 1. 背景与目标

ComBrief 当前通过 Cursor / Claude Code hooks 将 Agent 状态归一化为 `offline`、`idle`、`working`、`waiting_user` 四种状态，并通过托盘灯和 Slack 远程确认帮助用户及时处理 Agent 等待。下一步希望增加一个配套小硬件，让用户在玩游戏、看电影等不方便切回 IDE / app 窗口的场景下，也能看到 Agent 状态并完成确认。

本方案聚焦使用用户已有的 HaaS EDU K1，将其做成 **ComBrief Remote**：一个电池供电、BLE 连接、带 OLED 屏幕和实体按键的外部状态与确认终端。

第一版目标：

- 通过 BLE 连接 ComBrief 桌面端；
- 常驻显示 ComBrief / Agent 状态；
- 在 Agent 需要确认时显示来源、内容和选项；
- 用户通过 K1/K2/K3/K4 完成查看和选择；
- ComBrief 接收选择并复用现有 decision service 释放等待中的 hook；
- macOS + Windows 都作为目标平台；
- 尽量不改 HaaS EDU K1 硬件，不增加焊接和外设。

## 2. 范围与非目标

### 2.1 第一版范围

- 硬件：HaaS EDU K1。
- 产品名：ComBrief Remote。
- BLE 广播名：`ComBrief-Remote`。
- 屏幕显示：项目名 + 桌面端版本号，例如 `ComBrief v0.1.2`。
- 交互：
  - 默认显示缩略文本 `brief` + 选项列表；
  - `K1` 确认当前高亮选项；
  - `K2` 在缩略模式中上移选项，在完整模式中上一页；
  - `K3` 切换缩略模式和完整模式；
  - `K4` 在缩略模式中下移选项，在完整模式中下一页；
  - 默认焦点为 `Allow` 或第一个可继续选项。
- 通道：HaaS 与 Slack、本地终端并列为远程/旁路决策通道，先到先赢。
- 协议：BLE GATT + JSON 消息。

### 2.2 第一版非目标

- 不做 `danger: true`。
- 不做长按确认、二次确认、组合键、双击。
- 不做 `Details` 选项。
- 不做多请求队列。
- 不做离线缓存决策。
- 不让硬件直接控制 Cursor / Claude Code。
- 不做定制 PCB、外接屏幕、外接键盘。
- 不做 OTA、声音提醒、复杂睡眠策略。
- 不承诺中文大字库优化；第一版优先保证英文、命令、路径、选项可读。

## 3. 硬件与摆放方案

### 3.1 必需硬件

- HaaS EDU K1 一台；
- 可传数据的 USB 线，用于刷固件、串口日志和充电；
- macOS 测试机；
- Windows 测试机或可用于手测的 Windows 环境。

### 3.2 建议配件

- 小号桌面手机支架或亚克力名片支架；
- 背胶魔术贴或纳米双面胶，用于固定在显示器底部或桌边；
- 防滑脚垫；
- 短 USB 数据线，便于低电量时边充边用。

### 3.3 摆放建议

推荐第一版使用桌面支架摆放：不破坏设备，角度可调，也便于刷机调试。后续如果希望固定位置，可以使用魔术贴贴在显示器底部或桌边。

## 4. 系统架构

```text
Cursor / Claude Code
        │
        │ official hooks
        ▼
ComBrief Electron 主进程
        │
        ├─ 现有托盘状态灯
        ├─ 现有 Slack / 本地 decision service
        └─ 新增 ComBrief Remote 硬件通道
              │
              │ BLE GATT
              ▼
        HaaS EDU K1 固件
              │
              ├─ OLED 状态与确认显示
              ├─ K1-K4 按键输入
              └─ 电量 / 连接状态显示
```

核心原则：硬件不直接理解 Agent，也不直接碰 Cursor / Claude Code；ComBrief 仍然是状态和决策中心。HaaS EDU K1 只是 ComBrief Remote 的当前硬件实现。

## 5. 用户交互设计

### 5.1 状态页

无待确认请求时，显示 ComBrief 版本、主要 app 状态和电量。

```text
ComBrief v0.1.2
CC WORKING
CU IDLE
Batt 78%
```

规则：

- 标题使用 `ComBrief v<appVersion>`；
- 最多显示 2 个 app，更多 app 后续再扩展翻页；
- 收到待确认请求时，请求页优先于状态页。

### 5.2 请求缩略模式

默认进入缩略模式，显示来源、类型、一行缩略文本和选项列表。

```text
CC SHELL
npm install noble

> Allow
  Deny
```

按键规则：

| 按键 | 作用 |
|---|---|
| K1 | 确认当前高亮选项 |
| K2 | 选项上移 |
| K3 | 切换到完整模式 |
| K4 | 选项下移 |

### 5.3 请求完整模式

完整模式只浏览内容，不提交决策。用户需要回到缩略模式后再确认。

```text
CC SHELL 1/3
npm install
@abandonware/noble
cwd: <workspace>/...
```

按键规则：

| 按键 | 作用 |
|---|---|
| K1 | 返回缩略模式 |
| K2 | 上一页 |
| K3 | 返回缩略模式 |
| K4 | 下一页 |

### 5.4 多选问题

多选问题同样使用缩略 / 完整两种模式。缩略模式显示问题缩略文本和选项列表。

```text
CC ASK
First version?

> macOS+Windows
  macOS only
```

如果问题正文较长，`K3` 切到完整模式看完整内容；选项仍只在缩略模式中选择。

### 5.5 LED 状态反馈

HaaS EDU K1 的白色 `PWR` 不纳入 ComBrief 状态设计，仅使用可编程的红 `L1`、绿 `L2`、蓝 `L3` 三个 LED。

LED 规则：

| Remote 状态 | 红 L1 | 绿 L2 | 蓝 L3 | 含义 |
|---|---|---|---|---|
| 未连接 ComBrief | 走马灯参与 | 走马灯参与 | 走马灯参与 | 正在等待连接 / BLE 广播中 |
| 已连接 + 空闲 | 熄灭 | 常亮 | 熄灭 | 已连接，无需用户处理 |
| 已连接 + 工作中 | 熄灭 | 熄灭 | 呼吸 | Agent 正在处理 |
| 已连接 + 需要用户确认 | 快速闪烁 | 熄灭 | 熄灭 | 需要用户看屏幕并选择 |

未连接走马灯循环为 `红 → 绿 → 蓝 → 红...`，建议每 300–500ms 切换一个灯，同一时间只亮一个灯，亮度避免过高。

状态优先级：

```text
未连接 ComBrief
  > 需要用户确认
  > 工作中
  > 空闲
```

只要 BLE 未连接，就显示三色走马灯；即使设备内保留上一次请求，也不显示红灯快闪。连接恢复后，如果 ComBrief 仍有活跃请求，再切换到红灯快闪。

### 5.6 默认焦点

- Permission / Shell / MCP / ExitPlanMode：默认焦点为 `allow`；
- AskUserQuestion：默认焦点为第一个选项 `option:0`；
- 不做危险选项二次确认。

## 6. BLE GATT 协议

### 6.1 广播与命名

- 功能名：ComBrief Remote；
- BLE 广播名：`ComBrief-Remote`；
- HaaS 平台内部标识：`haas-edu-k1`。

### 6.2 GATT 服务与特征

建议使用一个专用 GATT Service。

| 名称 | 方向 | 权限 | 用途 |
|---|---|---|---|
| `host_tx` | ComBrief → Remote | Write / Write Without Response | 下发状态、请求、控制消息 |
| `device_tx` | Remote → ComBrief | Notify | 上报 hello、选择、电量、错误 |
| `device_info` | ComBrief 读取 | Read | 固件版本、平台、协议版本 |
| `control` | 双向 | Write + Notify | 心跳、清屏、测试显示、重置 UI |

第一版最小可只实现 `host_tx` 和 `device_tx`。

### 6.3 UUID

```text
Service UUID:
7b5c0001-8d4a-4c3a-9b4f-434252465001

host_tx:
7b5c0002-8d4a-4c3a-9b4f-434252465001

device_tx:
7b5c0003-8d4a-4c3a-9b4f-434252465001

device_info:
7b5c0004-8d4a-4c3a-9b4f-434252465001

control:
7b5c0005-8d4a-4c3a-9b4f-434252465001
```

### 6.4 分包策略

协议层处理完整 JSON；传输层负责 BLE 分包与重组。第一版限制消息大小，避免协议层再嵌套 chunk envelope。

建议限制：

- `brief` 最多 64 字符；
- `content` 最多 1024 字符；
- `options` 最多 8 个；
- 单个 option label 最多 24 字符；
- 主机发送前确保 JSON 字节数不超过保守阈值，例如 1400 bytes。

### 6.5 `hello`

设备连接后主动 notify：

```json
{
  "protocol": 1,
  "type": "hello",
  "deviceName": "ComBrief-Remote",
  "platform": "haas-edu-k1",
  "fwVersion": "0.1.0",
  "battery": 78,
  "capabilities": {
    "display": "oled-128x64",
    "keys": ["K1", "K2", "K3", "K4"],
    "briefFullToggle": true,
    "maxOptions": 8,
    "maxBriefLen": 64,
    "maxContentLen": 1024
  }
}
```

### 6.6 `state`

ComBrief 下发状态快照：

```json
{
  "protocol": 1,
  "type": "state",
  "appName": "ComBrief",
  "appVersion": "0.1.2",
  "apps": [
    { "id": "claude-code", "label": "CC", "status": "working" },
    { "id": "cursor", "label": "CU", "status": "idle" }
  ],
  "primary": "claude-code",
  "ts": 1710000000000
}
```

状态值沿用 ComBrief 四态：`offline`、`idle`、`working`、`waiting_user`。

### 6.7 `request`

ComBrief 下发待确认请求：

```json
{
  "protocol": 1,
  "type": "request",
  "appName": "ComBrief",
  "appVersion": "0.1.2",
  "decisionId": "abc123",
  "source": "claude-code",
  "sourceLabel": "CC",
  "kind": "SHELL",
  "brief": "npm install noble",
  "content": "npm install @abandonware/noble\ncwd: <workspace>/ComBrief",
  "options": [
    { "id": "allow", "label": "Allow" },
    { "id": "deny", "label": "Deny" }
  ],
  "defaultFocus": "allow",
  "expiresAt": 1710000030000
}
```

字段要点：

- `brief`：缩略模式一行文本；
- `content`：完整模式分页文本；
- `options`：只包含真实可提交选项，不包含 `Details`；
- `defaultFocus`：第一版通常是 `allow`。

### 6.8 选项规则

Permission / Shell / MCP：

```json
[
  { "id": "allow", "label": "Allow" },
  { "id": "deny", "label": "Deny" }
]
```

ExitPlanMode：

```json
[
  { "id": "allow", "label": "Approve" },
  { "id": "deny", "label": "Reject" }
]
```

AskUserQuestion：

```json
[
  { "id": "option:0", "label": "macOS + Windows" },
  { "id": "option:1", "label": "macOS only" }
]
```

### 6.9 `decision`

Remote 回传当前高亮选项：

```json
{
  "protocol": 1,
  "type": "decision",
  "decisionId": "abc123",
  "optionId": "allow",
  "ts": 1710000001234
}
```

ComBrief 收到后校验 `decisionId` 和 `optionId`，再复用现有 `buildHookStdout()` 生成 hook 输出并 resolve 当前等待。

### 6.10 `resolved`

ComBrief 通知 Remote 当前请求已处理：

```json
{
  "protocol": 1,
  "type": "resolved",
  "decisionId": "abc123",
  "result": "approved",
  "message": "Approved by Remote"
}
```

`result` 可选：`approved`、`denied`、`selected`、`handled_elsewhere`、`expired`、`failed`。

### 6.11 其他消息

第一版最小可用消息集为：`hello`、`state`、`request`、`decision`、`resolved`。

可选增强消息：

- `battery`：上报电量；
- `key`：调试或设置页测试按键；
- `control`：测试显示、回状态页、重置 UI；
- `error`：上报解析失败、协议不支持、显示失败等。

## 7. 固件架构

### 7.1 HaaS / AliOS Things 开发环境

HaaS EDU K1 固件第一版应基于 AliOS Things 3.3 开发，而不是按普通裸机工程组织。官方快速开始流程是：搭建开发环境、创建工程、编译、烧录、查看日志。推荐开发方式：

1. 安装 VS Code 和 HaaS Studio；
2. 通过 HaaS Studio 创建 AliOS Things 工程；
3. 选择 HaaS EDU K1 作为开发板；
4. 选择 `eduk1_demo` 或 `helloworld_demo` 作为起点；
5. 在 `package.yaml` 中添加 BLE、OLED、按键、电量等依赖；
6. 使用 HaaS Studio 或 `aos make` 编译；
7. 使用 HaaS Studio 或 `aos burn` 烧录；
8. 通过串口日志验证运行状态，波特率按官方文档建议使用 115200。

开发起点建议分两步：

- 验证阶段：从 `eduk1_demo` 参考 OLED、按键、电量和页面结构示例，快速确认 HaaS EDU K1 外设 API；
- 产品固件阶段：整理为独立 solution 或独立 app，例如 `solutions/combrief_remote/`，减少无关 demo 逻辑。

### 7.2 AliOS 工程结构

ComBrief 仓库内可先用 `firmware/haas-edu-k1/` 保存固件源码和说明，但真正放进 AliOS Things 工程时，应贴近 solution / component 结构。

推荐 AliOS solution 结构：

```text
solutions/combrief_remote/
├─ package.yaml
├─ SConstruct
├─ combrief_remote.c
├─ app_state/
│  ├─ app_state.c
│  └─ app_state.h
├─ ble_service/
│  ├─ ble_service.c
│  └─ ble_service.h
├─ display/
│  ├─ display.c
│  └─ display.h
├─ input/
│  ├─ input.c
│  └─ input.h
├─ protocol/
│  ├─ protocol.c
│  └─ protocol.h
└─ power/
   ├─ power.c
   └─ power.h
```

如果第一阶段直接嵌入 `eduk1_demo`，可作为一个 EDU K1 子应用：

```text
solutions/eduk1_demo/k1_apps/combrief_remote/
├─ combrief_remote.c
├─ app_state.c / app_state.h
├─ ble_service.c / ble_service.h
├─ display.c / display.h
├─ input.c / input.h
├─ protocol.c / protocol.h
└─ power.c / power.h
```

最终实现计划需要根据实际 AliOS 工程生成结果调整路径，但模块边界保持不变。

### 7.3 组件依赖方向

`package.yaml` 需要验证并引入的能力：

- `ble_host`：BLE 协议栈、广播、连接、GATT 收发；
- OLED / EDU K1 display 相关组件：优先复用 `eduk1_demo` 和信息屏示例里的 OLED API；
- key / GPIO / input 相关组件：读取 K1/K2/K3/K4 短按事件；
- ADC / battery 相关组件：读取电池电量；
- JSON 解析：优先使用 AliOS 可用组件；如果没有合适组件，第一版可用受限字段的轻量解析器。

官方资料已经覆盖 BLE 基础能力、OLED 绘图、按键事件和电量获取，但自定义 GATT Service、Write characteristic 和 Notify characteristic 的完整 API 需要在固件最小验证阶段确认。

### 7.4 固件模块职责

建议固件模块：

```text
firmware/haas-edu-k1/
├─ app/
│  ├─ main.c
│  ├─ app_state.c / app_state.h
│  ├─ ble_service.c / ble_service.h
│  ├─ display.c / display.h
│  ├─ input.c / input.h
│  ├─ protocol.c / protocol.h
│  ├─ power.c / power.h
│  └─ storage.c / storage.h
├─ include/
│  └─ combrief_protocol.h
└─ README.md
```

这是 ComBrief 仓库内的源码组织视图；移植到 AliOS Things 时按 7.2 的 solution 结构落地。

模块职责：

- `main`：启动和主循环；
- `app_state`：当前连接、页面、请求、焦点、完整页页码；
- `ble_service`：广播、连接、GATT 收发；
- `protocol`：JSON 解析和生成；
- `display`：OLED 绘制、文本截断、换行、分页；
- `input`：K1-K4 去抖和短按事件；
- `led`：红 L1、绿 L2、蓝 L3 的走马灯、常亮、呼吸、快闪模式；
- `power`：电量、低电量提示、基础降亮；
- `storage`：可选持久化。

### 7.5 固件状态机

```text
BOOT
  ↓ 初始化完成
ADVERTISING
  ↓ BLE connected
CONNECTED_IDLE
  ↓ state 消息
STATUS
  ↓ request 消息
REQUEST_BRIEF
  ├─ K1: 提交当前选项
  ├─ K2: 选项上移
  ├─ K3: REQUEST_FULL
  └─ K4: 选项下移

REQUEST_FULL
  ├─ K1: REQUEST_BRIEF
  ├─ K2: 上一页
  ├─ K3: REQUEST_BRIEF
  └─ K4: 下一页

RESOLVED
  ├─ K1/K3: 返回 STATUS
  └─ 超时: 返回 STATUS

ERROR
  ├─ K1/K3: 返回安全页面
  └─ BLE 断开: ADVERTISING
```

### 7.6 固件常量

```c
#define COMBRIEF_REMOTE_NAME "ComBrief-Remote"
#define COMBRIEF_REMOTE_FW_VERSION "0.1.0"
#define COMBRIEF_PROTOCOL_VERSION 1

#define COMBRIEF_MAX_BRIEF_LEN 64
#define COMBRIEF_MAX_CONTENT_LEN 1024
#define COMBRIEF_MAX_OPTIONS 8
#define COMBRIEF_MAX_OPTION_LABEL_LEN 24
```

## 8. ComBrief 桌面端改造

### 8.1 新增模块

建议新增：

```text
src/main/hardware/protocol.ts
src/main/hardware/request-builder.ts
src/main/hardware/decision-mapper.ts
src/main/hardware/transport.ts
src/main/hardware/mock-transport.ts
src/main/hardware/runtime.ts
src/main/hardware/ble-transport.ts
```

职责：

- `protocol.ts`：协议类型、UUID、常量、基础校验；
- `request-builder.ts`：`DecisionWaitBody + requestId` → `HardwareRequestMessage`；
- `decision-mapper.ts`：`HardwareDecisionMessage + PendingDecision` → `DecisionAction`；
- `transport.ts`：抽象 BLE / mock transport；
- `mock-transport.ts`：测试和开发模拟；
- `runtime.ts`：管理连接、状态、请求、resolved、设备事件；
- `ble-transport.ts`：真实 BLE 扫描、连接、写入、notify。

### 8.2 `DecisionService` 改造

`DecisionService` 当前负责 Slack 和本地双通道。新增硬件通道后，应将 Remote 作为并列 channel。

新流程：

```text
handleWait()
  create requestId
  pendingMeta.set()
  sessionIndex.set()
  post Slack card if enabled
  send hardware request if enabled and connected
  queue.wait()
  send hardware resolved
  clear pending
```

新增公开方法：

```ts
resolveFromHardware(message: HardwareDecisionMessage): boolean
```

处理逻辑：

1. 找到 `pendingMeta`；
2. 检查 `queue.isWaiting()`；
3. 校验 `optionId`；
4. 转成 `DecisionAction`；
5. 调用 `buildHookStdout()`；
6. 调用 `DecisionQueue.resolve()`；
7. 更新 Slack 卡片为由 Remote 处理；
8. 通知 Remote `resolved`。

同时需要注意：HaaS/Remote 不应依赖 Slack 开关。即使 Slack 未启用，只要硬件通道启用且已连接，仍应能参与确认。

### 8.3 状态推送

`AppController` 每次状态变化后，将最新状态快照异步发送给 `HardwareRuntime`。

要求：

- 不阻塞托盘更新；
- 发送失败不影响现有功能；
- 重连后立即发送最新状态；
- 当前有 active request 时，设备保持请求页，不被状态页覆盖。

### 8.4 设置页

设置页新增区块：ComBrief Remote。

功能：

- 启用 / 禁用；
- 当前连接状态；
- 设备名；
- 固件版本；
- 电量；
- 扫描并连接；
- 断开；
- 测试显示；
- 清除绑定。

配置新增：

```json
{
  "hardware": {
    "enabled": false,
    "deviceName": "ComBrief-Remote",
    "autoReconnect": true,
    "lastDeviceId": "",
    "statusPushEnabled": true,
    "decisionPushEnabled": true
  }
}
```

## 9. 实现里程碑

### M1：协议与 mock 决策通道

目标：不接真实硬件，测试中能模拟 Remote 选择 `Allow`，hook 被释放。

产物：

- 协议类型；
- request builder；
- decision mapper；
- mock transport；
- `DecisionService` 硬件通道测试。

### M2：固件最小版

目标：HaaS EDU K1 能显示 mock host 下发的 request，并回传选择。

产物：

- AliOS Things / HaaS Studio 工程可编译、可烧录、可通过串口查看日志；
- 验证 `ble_host` 基础能力：广播名 `ComBrief-Remote` 可被扫描；
- 验证自定义 GATT Service：主机能写入 JSON，设备能 notify JSON；
- OLED 状态页；
- request 缩略 / 完整模式；
- K1/K2/K3/K4 按键；
- decision notify。

### M3：真实 BLE 接入 ComBrief

目标：ComBrief 可以连接 HaaS EDU K1 并完成真实确认。

产物：

- BLE transport；
- 设置页启用和连接状态；
- 状态推送；
- 决策回传。

### M4：跨平台验证

目标：macOS + Windows 都能使用。

产物：

- macOS 手测记录；
- Windows 手测记录；
- 打包验证；
- BLE 断连重连验证。

## 10. 测试计划

### 10.1 单元测试

建议新增：

```text
tests/hardware-protocol.test.ts
tests/hardware-request-builder.test.ts
tests/hardware-decision-mapper.test.ts
tests/hardware-runtime.test.ts
tests/decision-service-hardware.test.ts
```

覆盖：

- request 消息结构；
- `brief` / `content` 裁剪；
- 默认焦点；
- option 生成；
- `allow` / `deny` / `option:n` 映射；
- 硬件先处理；
- Slack 先处理；
- 本地先处理；
- 请求超时；
- 请求结束后发送 `resolved`；
- 硬件断连时不影响本地 / Slack。

### 10.2 固件测试

通过串口日志和 mock BLE host 验证：

- 启动；
- 广播；
- 连接；
- 收到 `state`；
- 收到 `request`；
- 缩略页选项移动；
- `K3` 切换完整页；
- 完整页翻页；
- 选择回传；
- resolved 显示；
- 断连后恢复广播。

### 10.3 端到端手测

1. 启动 ComBrief；
2. 设置页启用 ComBrief Remote；
3. HaaS EDU K1 开机；
4. ComBrief 连接设备；
5. Cursor / Claude Code 状态变更，Remote 显示同步；
6. Claude Code 触发 PermissionRequest；
7. Remote 显示缩略页；
8. 按 `K3` 查看完整内容；
9. 按 `K3` 或 `K1` 回缩略页；
10. 按 `K1` 允许；
11. Agent 继续执行；
12. Slack 卡片如果存在，显示已由 Remote 处理；
13. 本地终端如果先处理，Remote 显示 handled elsewhere。

## 11. 风险与规避

### 11.1 BLE native 依赖风险

macOS / Windows 打包、权限、扫描稳定性可能不同。

规避：

- 使用 `HardwareTransport` 抽象；
- 先实现 mock transport；
- BLE 单独实现；
- 设置页允许禁用；
- 失败不影响 ComBrief 核心托盘功能。

### 11.2 HaaS 固件生态与 GATT 实现风险

HaaS EDU K1 / AliOS Things 的 BLE + OLED 示例资料可能不如 ESP32 生态丰富。官方资料确认了 BLE 基础能力、OLED 绘图、按键事件和电量获取，但自定义 GATT Service、Write characteristic 与 Notify characteristic 的完整 API 需要先做最小验证。

规避：

- 固件先按 AliOS Things / HaaS Studio 流程创建最小可烧录工程；
- 先验证广播、连接、GATT write、GATT notify，再做完整 UI；
- 优先复用 `eduk1_demo` 中的 OLED、按键、电量代码；
- 协议保持 JSON；
- OLED UI 简化；
- 不做长按、详情页、OTA 等扩展。

### 11.3 小屏显示风险

128×64 OLED 显示路径、命令、中文会拥挤。

规避：

- 缩略模式只显示 `brief` 一行；
- 完整模式分页显示 `content`；
- option label 裁剪；
- 第一版优先英文、命令、路径；
- 后续再优化中文字体。

### 11.4 误操作风险

默认焦点为 `Allow` 可以让 Agent 更快继续，但也提高误按可能。

当前产品决策：第一版默认焦点按用户要求放在 `Allow`，不做二次确认。

最小安全边界：

- 只接受当前活跃 `decisionId`；
- 过期请求不可提交；
- 请求被 Slack / 本地 / Remote 任一通道处理后不可重复提交。

## 12. 自审结论

- 无 `TBD` / `TODO` 占位；
- 第一版范围聚焦 HaaS EDU K1，不再引入其他硬件；
- 交互、协议、桌面端改造和测试计划一致；
- 已明确不做 `danger`、`Details`、长按、多请求队列、离线缓存；
- 已补充 AliOS Things 3.3 / HaaS Studio 开发路径、工程结构和组件依赖方向；
- 已将自定义 GATT Service 的最小验证列为 M2 固件里程碑；
- 需要在实现计划阶段进一步确认桌面端 BLE transport 的具体库与打包策略，以及 AliOS Things 自定义 GATT API 细节。
