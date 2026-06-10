# ComBrief Remote 真实 BLE 与 HaaS EDU K1 固件设计

日期：2026-06-10

## 1. 背景

ComBrief Remote 第一阶段已经完成桌面端 mock 集成：协议类型、请求构建、决策映射、`HardwareRuntime`、`MockHardwareTransport`、`DecisionService` 硬件通道、设置 UI 和测试已经落地。当前仍缺少两部分才能让 HaaS EDU K1 成为真实可用的确认遥控器：

1. 桌面端真实 BLE 连接能力；
2. HaaS EDU K1 固件。

本设计定义下一阶段如何从 mock 通道推进到真实硬件闭环：ComBrief 桌面端通过 BLE 连接 HaaS EDU K1，HaaS OLED 显示状态和确认请求，用户通过 K1/K2/K3/K4 选择，设备回传 `decision`，ComBrief 释放等待中的 hook。

## 2. 目标与非目标

### 2.1 目标

- 保留现有桌面端 `HardwareRuntime` / `DecisionService` / 协议模型，不推倒重来。
- 使用真实 BLE 连接 HaaS EDU K1。
- HaaS 固件实现 BLE 广播、GATT service、OLED 页面、按键输入、LED 状态、电量上报。
- 支持完整确认流程：`state`、`request`、`decision`、`resolved`。
- 与 Slack、本地终端保持并列决策通道，继续遵循“先到先赢”。
- 第一阶段以 macOS + HaaS EDU K1 实物闭环为主要验收目标。
- 固件源码纳入当前仓库版本管理，便于协议同步审查。

### 2.2 非目标

- 不引入 native Node BLE 依赖作为第一选择。
- 不做 BLE 分包协议；第一版继续限制 JSON 消息大小。
- 不做多请求队列；HaaS 侧只显示一个活跃请求。
- 不做 OTA、声音提醒、长按确认、二次确认、组合键。
- 不承诺第一阶段 Windows 实测通过；Windows 保留兼容目标。
- 不要求当前 CI 编译 HaaS 固件，因为 ComBrief 仓库不是完整 AliOS SDK。

## 3. 设计决策

桌面端采用“保留 transport 抽象，第一版落地 Web Bluetooth bridge”的方案。

原因：当前 ComBrief 依赖很轻，直接引入 `@abandonware/noble` 等 native BLE 依赖会增加 Electron 打包、跨平台二进制、权限和 CI 风险。Web Bluetooth 由 Electron/Chromium 提供，更适合先在 macOS 上打通真实设备连接。设计仍保留 `HardwareTransport` 边界，后续可增加 native BLE transport，而不影响 `DecisionService` 和固件协议。

固件源码放在当前仓库：

```text
firmware/haas/combrief_remote/
```

该目录保存 ComBrief Remote 固件源码和 README。实际编译烧录时，将其复制或导入到 AliOS Things / HaaS Studio 的 `solutions/combrief_remote/`。这样既能在当前 repo 中版本管理协议绑定代码，又不强迫 ComBrief 仓库变成完整 AliOS workspace。

## 4. 总体架构

```text
Cursor / Claude Code hooks
        │
        ▼
ComBrief Electron 主进程
        │
        ├─ AppController：生成 state 快照
        ├─ DecisionService：创建请求并处理先到先赢
        ├─ HardwareRuntime：统一硬件通道入口
        └─ WebBluetoothBridgeTransport：主进程 transport 适配器
                 │ IPC
                 ▼
        隐藏 BLE bridge renderer
                 │ Web Bluetooth / GATT
                 ▼
        HaaS EDU K1 固件
                 ├─ BLE service
                 ├─ OLED display
                 ├─ K1/K2/K3/K4 input
                 ├─ LED status
                 └─ battery report
```

关键边界：

- ComBrief 桌面端仍是唯一状态和决策中心。
- HaaS 只显示状态、显示请求并提交用户选择，不直接控制 Cursor / Claude Code。
- 协议继续使用 JSON，版本为 `1`。
- Mock transport 继续保留，用于单元测试和无设备开发。
- 真实 BLE 由 bridge renderer 操作，主进程通过 IPC 间接使用。

## 5. 桌面端 BLE Bridge 设计

### 5.1 新增组件

建议新增以下文件：

```text
src/main/hardware/web-bluetooth-bridge-transport.ts
src/main/hardware/web-bluetooth-bridge-window.ts
src/preload/hardware-bridge-preload.ts
src/renderer/hardware-bridge.html
src/renderer/hardware-bridge.js
```

职责：

- `web-bluetooth-bridge-transport.ts`：实现现有 `HardwareTransport` 接口，通过 IPC 与 bridge renderer 通信。
- `web-bluetooth-bridge-window.ts`：创建、隐藏、恢复和销毁 bridge window。
- `hardware-bridge-preload.ts`：只暴露硬件 bridge 所需 IPC，不暴露通用 Node API。
- `hardware-bridge.html/js`：调用 `navigator.bluetooth`，完成扫描、连接、GATT characteristic 获取、notify 订阅和写入。

设置页继续作为用户入口，但不持有长期 BLE 连接。长期连接由隐藏 bridge renderer 维护，避免设置窗口关闭后断开。

### 5.2 IPC 通道

主进程到 bridge renderer：

- `hardwareBridge:startScan`
- `hardwareBridge:connect`
- `hardwareBridge:disconnect`
- `hardwareBridge:sendHostMessage`
- `hardwareBridge:getStatus`

bridge renderer 到主进程：

- `hardwareBridge:statusChanged`
- `hardwareBridge:deviceMessage`
- `hardwareBridge:error`

`WebBluetoothBridgeTransport` 将这些 IPC 包装成：

- `start()`：确保 bridge window 存在并初始化；
- `stop()`：断开 BLE 或停止 bridge；
- `send(message)`：发送 `state` / `request` / `resolved`；
- `onMessage(handler)`：订阅 `hello` / `decision` / `battery`；
- `getStatus()`：返回统一连接状态。

### 5.3 连接流程

1. ComBrief 启动并发现 `hardware.enabled = true`。
2. 主进程创建 `HardwareRuntime` 与隐藏 bridge renderer。
3. 如果无法静默恢复连接，设置页显示“需要连接设备”。
4. 用户点击“连接 ComBrief Remote”。
5. bridge renderer 调用 `navigator.bluetooth.requestDevice()`，过滤目标 service 或设备名 `ComBrief-Remote`。
6. 用户选择设备。
7. bridge 连接 GATT server。
8. bridge 获取 service `7b5c0001-8d4a-4c3a-9b4f-434252465001`。
9. bridge 获取 `host_tx` 和 `device_tx` characteristics。
10. bridge 对 `device_tx` 调用 `startNotifications()`。
11. HaaS 发送 `hello`。
12. 主进程更新 connected、fwVersion、battery，并立即下发当前 `state`。

### 5.4 消息编码

- 主机发送：`JSON.stringify(message)` → `TextEncoder` → BLE write。
- 设备通知：BLE bytes → `TextDecoder` → `JSON.parse`。
- 任何来自 BLE 的 JSON 都必须经过现有 protocol guard 校验。
- bridge 写入前检查 UTF-8 byte length；如果过长或写入失败，设置 `lastError`，不阻塞 Slack/本地通道。

第一版不设计 chunk envelope。如果实测 MTU 限制影响真实请求，再单独设计协议 v2 分包。

### 5.5 后台连接策略

- `hardware.enabled = true` 时，App 启动创建 bridge window。
- 用户显式连接成功后，bridge window 常驻。
- App 退出时断开 BLE。
- BLE 断线时，如果 `autoReconnect = true`，尝试恢复连接。
- 如果 Web Bluetooth 权限不允许静默恢复，状态显示“需要重新连接”。

## 6. HaaS EDU K1 固件设计

### 6.1 固件目录

```text
firmware/haas/combrief_remote/
├─ README.md
├─ package.yaml
├─ SConstruct
├─ combrief_remote.c
├─ app_state/
│  ├─ app_state.c
│  └─ app_state.h
├─ protocol/
│  ├─ protocol.c
│  └─ protocol.h
├─ ble_service/
│  ├─ ble_service.c
│  └─ ble_service.h
├─ display/
│  ├─ display.c
│  └─ display.h
├─ input/
│  ├─ input.c
│  └─ input.h
├─ led/
│  ├─ led.c
│  └─ led.h
└─ power/
   ├─ power.c
   └─ power.h
```

### 6.2 模块职责

#### `protocol`

解析主机下发：

- `state`
- `request`
- `resolved`

生成设备上报：

- `hello`
- `decision`
- `battery`

协议版本固定为 `1`。未知版本、未知类型和 malformed JSON 均忽略，不重启设备。

#### `app_state`

维护设备当前状态：

- BLE 是否连接；
- 当前 ComBrief app 状态；
- 当前活跃请求；
- 当前选中 option index；
- 显示模式：`summary` / `full`；
- 完整内容页码；
- 最近 resolved 结果；
- 电量百分比。

第一版只保留一个活跃请求。收到新的 `request` 时直接替换旧请求。

#### `ble_service`

实现 BLE 广播和 GATT：

- 广播名：`ComBrief-Remote`
- Service UUID：`7b5c0001-8d4a-4c3a-9b4f-434252465001`
- `host_tx`：Write / Write Without Response
- `device_tx`：Notify

连接成功后立即发送 `hello`：

```json
{
  "protocol": 1,
  "type": "hello",
  "deviceName": "ComBrief-Remote",
  "platform": "haas-edu-k1",
  "fwVersion": "0.1.0",
  "battery": 78,
  "capabilities": {
    "display": "oled",
    "keys": ["K1", "K2", "K3", "K4"],
    "briefFullToggle": true,
    "maxOptions": 8,
    "maxBriefLen": 64,
    "maxContentLen": 1024
  }
}
```

#### `display`

OLED 显示页面：

未连接页：

```text
ComBrief Remote
Waiting BLE...
```

状态页：

```text
ComBrief v0.1.2
CC WORKING
CU IDLE
Batt 78%
```

请求缩略模式：

```text
CC SHELL
npm install noble

> Allow
  Deny
```

请求完整模式：

```text
CC SHELL 1/3
npm install
@abandonware/noble
cwd: /...
```

第一版按英文/ASCII 优先显示；中文显示依赖 HaaS 当前字体能力，不额外引入中文字库。

#### `input`

缩略模式：

- `K1`：发送当前高亮选项的 `decision`；
- `K2`：选项上移；
- `K3`：切换到完整模式；
- `K4`：选项下移。

完整模式：

- `K1`：返回缩略模式；
- `K2`：上一页；
- `K3`：返回缩略模式；
- `K4`：下一页。

按键防抖建议 50–100ms。发送 `decision` 后进入等待 `resolved` 状态，避免重复提交。

#### `led`

LED 状态优先级：

1. BLE 未连接：红 → 绿 → 蓝走马灯；
2. 有活跃请求：红灯快闪；
3. 已连接且工作中：蓝灯呼吸；
4. 已连接且空闲：绿灯常亮。

#### `power`

读取或估算电量并周期上报。如果 HaaS 电量接口不可用，第一版允许省略 `battery` 字段或返回固定值，同时保留协议结构。

### 6.3 固件状态机

```text
BOOT
  -> ADVERTISING
  -> CONNECTED_IDLE
  -> SHOWING_REQUEST
  -> DECISION_SENT
  -> CONNECTED_IDLE
```

异常路径：

- BLE 断开：任何状态回到 `ADVERTISING`。
- 收到 `resolved`：如果 `decisionId` 匹配当前请求，清空请求并回状态页。
- 收到新 `request`：替换当前请求并进入 `SHOWING_REQUEST`。
- 收到 malformed JSON：忽略，不改变当前状态。

## 7. 端到端数据流

### 7.1 状态同步

1. ComBrief 状态变化。
2. `AppController` 生成 `HardwareStateMessage`。
3. `HardwareRuntime.sendState()` 发送到 transport。
4. bridge 写入 HaaS `host_tx`。
5. HaaS 解析 `state`。
6. 无活跃请求时更新状态页；有活跃请求时只更新后台状态。
7. LED 按优先级刷新。

BLE 写入失败时，只记录 `lastError`，不影响 ComBrief 正常运行。

### 7.2 请求确认

1. Cursor / Claude Code hook 进入等待确认。
2. `DecisionService.handleWait()` 创建 requestId。
3. Slack、本地终端、HardwareRuntime 并行进入等待。
4. `buildHardwareRequest()` 生成 `HardwareRequestMessage`。
5. bridge 写入 HaaS `host_tx`。
6. HaaS 显示请求缩略页和默认焦点。
7. 用户通过 K2/K4 移动选项，通过 K3 查看完整内容。
8. 用户按 K1 确认。
9. HaaS 发送 `decision`。
10. bridge notify 转发主进程。
11. `HardwareRuntime` 校验消息。
12. `DecisionService.resolveFromHardware()` 映射为 `DecisionAction`。
13. 如果请求仍在等待，hook 被释放。
14. 主进程发回 `resolved`。
15. HaaS 清空请求并回状态页。

### 7.3 先到先赢

- Slack 先点：硬件收到 `resolved` 后回状态页。
- 本地终端先处理：硬件收到 `handled_elsewhere` 后回状态页。
- HaaS 先按：Slack 卡片更新为已处理，本地等待释放。
- 超时：硬件收到 `expired`，短暂显示后回状态页。
- 旧 `decision` 到达：主进程忽略，不重新释放 hook。

## 8. 错误处理

桌面端错误处理：

- 用户取消设备选择：状态保持 disconnected，不视为致命错误。
- 找不到 service/characteristic：显示设备不兼容或固件版本不匹配。
- BLE 写入失败：记录 `lastError`，Slack/本地继续工作。
- bridge window 崩溃：主进程更新 disconnected，可尝试重建。
- 从 BLE 收到非法 JSON：丢弃并记录错误。

HaaS 错误显示：

- 未连接：`Waiting BLE...`
- 协议不匹配：`Protocol mismatch`
- 决策已发送：`Waiting host...`
- 请求超时：短暂显示 `Expired`
- 被其他通道处理：短暂显示 `Handled elsewhere`

错误不应导致设备重启；设备应尽量回到可连接或状态显示页面。

## 9. 测试与验收

### 9.1 桌面端自动化测试

新增或扩展 Vitest：

- `tests/hardware-web-bluetooth-bridge-transport.test.ts`
  - `start()` 创建 bridge 并订阅事件；
  - `send()` 转发 `state` / `request` / `resolved`；
  - bridge 上报 `hello` / `decision` / `battery` 后触发 `onMessage`；
  - bridge 错误更新 `lastError`；
  - stop 后不再接收消息。

- `tests/hardware-bridge-ipc.test.ts`
  - IPC channel 名称稳定；
  - 非法消息不会进入 `HardwareRuntime`；
  - bridge 状态变化映射到统一硬件状态。

- `tests/settings-renderer.test.ts`
  - 设置页存在连接、断开、测试显示入口；
  - 异步按钮包含失败恢复逻辑。

继续保留现有硬件测试：protocol、request builder、decision mapper、runtime、decision service hardware、Slack runtime hardware。

不在单元测试中调用真实 `navigator.bluetooth`；bridge renderer 使用 fake/stub 注入 Web Bluetooth 对象。

### 9.2 桌面端构建验收

每个实现阶段至少运行：

```bash
npm test
npm run build
```

验收标准：

- 所有 Vitest 通过；
- TypeScript build 通过；
- 无新增 native 依赖；
- 没有蓝牙设备时 ComBrief 能正常启动；
- `hardware.enabled = false` 时不影响 Slack/本地通道。

### 9.3 固件侧验证

工具链配置前：

- 固件目录结构完整；
- README 说明 HaaS Studio / AliOS Things 环境准备、导入、编译、烧录、串口日志和 ComBrief 连接步骤；
- 协议常量与桌面端一致；
- 状态机、按键和 LED 行为可代码审查。

工具链配置后实物验收：

1. 烧录固件。
2. HaaS 显示 `Waiting BLE...`。
3. ComBrief 设置页扫描到 `ComBrief-Remote`。
4. 连接后设置页显示 connected、fwVersion、电量。
5. HaaS 显示当前 ComBrief 状态。
6. 触发 Shell/permission 请求。
7. HaaS 显示请求摘要和 Allow/Deny。
8. K2/K4 能移动选择。
9. K3 能进入/退出完整模式。
10. K1 选择 Allow 或 Deny 后，ComBrief hook 被释放。
11. Slack/本地先处理时，HaaS 回到状态页。
12. 超时时 HaaS 显示 expired 后回状态页。

### 9.4 跨平台验收范围

- macOS：本阶段目标打通并实测。
- Windows：保留兼容目标，后续阶段实测。

## 10. 风险与回退

| 风险 | 影响 | 回退策略 |
|---|---|---|
| Web Bluetooth 在隐藏窗口中不稳定 | BLE 连接无法长期保持 | 改为可见小窗口或要求设置窗口保持打开 |
| Web Bluetooth 在目标 Electron 版本能力不足 | 无法扫描或连接设备 | 评估 native BLE transport |
| BLE 单包长度不足 | 长请求无法发送到 HaaS | 先进一步裁剪 `content`，后续再做 chunking |
| HaaS BLE/OLED API 与预期不一致 | 固件实现延期 | 先提交骨架和 README，工具链配置后按真实 API 调整 |
| HaaS 工具链配置耗时 | 不能立即实物验证 | 先完成桌面 bridge、固件骨架和人工验证清单 |
| 中文显示效果不佳 | 请求内容可读性下降 | 第一版按英文/ASCII 优先，必要时桌面端提供更短摘要 |

## 11. 实施分阶段建议

1. 桌面端 bridge IPC 与 transport：不接真实蓝牙，先用 fake bridge 测试。
2. 设置页连接/断开入口和状态展示。
3. Web Bluetooth bridge 最小实现：扫描、连接、notify、写入。
4. HaaS 固件骨架与 README。
5. HaaS BLE hello/state 最小闭环。
6. HaaS request/decision/resolved 确认闭环。
7. 实物测试、错误处理和文档补充。

## 12. 成功标准

本阶段完成时，应满足：

- ComBrief 可以通过真实 BLE 连接 HaaS EDU K1。
- HaaS 连接后上报 `hello`，ComBrief 设置页显示连接状态。
- HaaS 能显示 ComBrief 当前状态。
- HaaS 能显示请求摘要、选项和完整内容页。
- K1/K2/K3/K4 能完成选择与浏览。
- HaaS 发送的 `decision` 能释放 ComBrief 等待中的 hook。
- Slack、本地终端、HaaS 三个通道继续保持先到先赢。
- 无 HaaS 或蓝牙失败时，ComBrief 原有功能不受影响。
