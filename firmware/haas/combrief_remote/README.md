# ComBrief Remote HaaS EDU K1 固件说明

本目录提供 ComBrief Remote 面向 HaaS EDU K1 的可导入源码、协议常量、状态机与外设适配占位实现，用于配合桌面端 Web Bluetooth bridge 验证 ComBrief Remote 端到端流程。当前 ComBrief 仓库仍不是完整 AliOS Things / HaaS SDK 工程，桌面端 CI 不编译 HaaS 固件；完整 HaaS SDK 编译、烧录和实机验证需要在 HaaS Studio / AliOS Things 环境中继续完成。

## 当前包含的模块

当前源码已经包含以下模块，并由 `SConstruct` 纳入工程结构：

- `app_state`：维护 BLE 连接、桌面状态、request、选项、resolved、显示模式与电量状态。
- `protocol`：生成/解析 `hello`、`state`、`request`、`decision`、`battery`、`resolved` JSON 协议数据。
- `ble_service`：固定 BLE 名称、服务 UUID 与 host/device 特征 UUID，并通过 placeholder 发送/接收回调模拟 GATT 数据流。
- `display`：用 OLED placeholder 文案渲染 idle、summary、full request、resolved 等状态。
- `input`：定义 K1/K2/K3/K4 行为并把确认选择转换为 `decision`。
- `led`：用 placeholder LED 状态表达离线、空闲、等待用户与 resolved 状态。
- `power`：用 placeholder 电量读取/上报逻辑维护 battery 百分比。

这些模块是结构、协议和状态机代码审查用的 adapter 骨架。BLE/OLED/input/LED/power 外设适配目前仍使用 `printf` / placeholder hook；导入 HaaS Studio 后，需要按实际 AliOS Things 版本映射真实 BLE GATT、OLED、K1-K4、LED 和 power/battery API，再执行编译与实机验证。

## 硬件与协议常量

- 硬件：HaaS EDU K1 开发板。
- BLE 广播名称 / Device name：`ComBrief-Remote`。
- Service UUID：`7b5c0001-8d4a-4c3a-9b4f-434252465001`。
- `host_tx` UUID：`7b5c0002-8d4a-4c3a-9b4f-434252465001`，桌面端写入 `state`、`request`、`resolved`。
- `device_tx` UUID：`7b5c0003-8d4a-4c3a-9b4f-434252465001`，设备端通知 `hello`、`decision`、`battery`。
- Device info UUID：`7b5c0004-8d4a-4c3a-9b4f-434252465001`。
- Control UUID：`7b5c0005-8d4a-4c3a-9b4f-434252465001`。
- 协议版本：`1`。

## 按钮行为

- `K1`：在 request 选项中向上/向前移动焦点。
- `K2`：在 request 选项中向下/向后移动焦点。
- `K3`：确认当前选项并通过 `device_tx` 发送 `decision`。
- `K4`：切换 OLED summary/full 内容视图。

当桌面端通过 Slack、local hook 或 HaaS remote 任一路径完成同一 request 后，会下发 `resolved`；固件状态机应显示 resolved 结果、更新 LED 状态，并清理等待中的选择态。

## 导入到 HaaS Studio / AliOS Things

1. 准备 AliOS Things SDK 与 HaaS Studio，并确认 HaaS EDU K1 的板级支持包可用。
2. 将本目录复制或软链接到 AliOS Things SDK 的 `solutions/combrief_remote`：

```bash
mkdir -p solutions
cp -R /path/to/ComBrief/firmware/haas/combrief_remote solutions/combrief_remote
```

3. 在 HaaS Studio 中打开 AliOS Things 工作区，选择 `solutions/combrief_remote` 作为应用工程。
4. 按当前 SDK 版本补齐 `package.yaml`、`SConstruct` 与外设 adapter 所需组件依赖。
5. 将 placeholder BLE/OLED/input/LED/power 函数替换或桥接到真实 HaaS SDK API。

## Build 与烧录验证

在完整 AliOS Things SDK 根目录中构建，示例命令会随 SDK 版本不同而变化：

```bash
aos make combrief_remote@haaseduk1 -c config
aos make
```

当前仓库不编译 HaaS 固件，也不要求 `npm test` 或 `npm run build` 编译 C 固件。上述命令必须在完整 HaaS Studio / AliOS Things 环境中执行，并且需要真实外设 API 映射完成后才能作为固件通过标准。

烧录建议流程：

1. 使用 USB 连接 HaaS EDU K1。
2. 在 HaaS Studio 中选择目标串口与 HaaS EDU K1 工程。
3. 完成真实 adapter 映射与 HaaS SDK 编译后点击烧录，或使用对应 SDK 版本的烧录命令。
4. 烧录完成后重启开发板，确认串口日志出现 ComBrief Remote boot、BLE 广播和 hello 发送相关信息。

## 桌面连接验证步骤

1. 启动 ComBrief 桌面应用。
2. 打开 Settings 中的 ComBrief Remote / Hardware 区域。
3. 点击 `Connect Remote` 打开 Web Bluetooth pairing window。
4. 给 HaaS EDU K1 上电或复位，等待 BLE 广播名称 `ComBrief-Remote` 出现在设备列表。
5. 选择设备并连接，确认设备发送 `hello` 后桌面端立即下发当前 `state`，OLED 显示最新 ComBrief 状态。
6. 使用测试 display、Slack request 和本地 hook request 验证 `request`、K1-K4、`decision`、`resolved` 与 LED 状态。
7. 点击 Disconnect 时只应临时断开/停止 runtime，不等同于禁用硬件，也不应持久化为 `hardware.enabled=false`。

## 第一版限制

- 当前 repo 提供可导入源码、协议/状态机和 placeholder 外设适配，不是完整 AliOS SDK 工程。
- BLE/OLED/input/LED/power 仍需映射真实 HaaS API 后进行 HaaS SDK 编译、烧录和实机验证。
- 桌面端自动化测试覆盖协议常量、状态机、Web Bluetooth bridge 与 wiring；实机 BLE 时序、OLED 版式、按键抖动、LED 和电源读数仍属于人工验证范围。
