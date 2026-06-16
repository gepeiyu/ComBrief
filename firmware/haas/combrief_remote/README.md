# ComBrief Remote HaaS EDU K1 固件说明

本目录提供 ComBrief Remote 面向 HaaS EDU K1 的可导入源码、协议常量、状态机与 HaaS EDU K1 外设适配，用于配合桌面端 Web Bluetooth bridge 验证 ComBrief Remote 端到端流程。当前 ComBrief 仓库仍不是完整 AliOS Things / HaaS SDK 工程，桌面端 CI 不编译 HaaS 固件；完整 HaaS SDK 编译、烧录和实机验证需要在 HaaS Studio / AliOS Things 环境中完成。

## 当前包含的模块

当前源码已经包含以下模块，并由 `SConstruct` 纳入工程结构：

- `app_state`：维护 BLE 连接、桌面状态、request、选项、resolved、显示模式与电量状态。
- `protocol`：生成/解析 `hello`、`state`、`request`、`decision`、`battery`、`resolved` JSON 协议数据。
- `ble_service`：固定 BLE 名称、服务 UUID 与 host/device 特征 UUID，并接入 HaaS BLE GATT server 初始化、广播、写入回调与通知发送接口。
- `display`：在 HaaS EDU K1 上通过 `sh1106` / `hal_oled.h` 驱动 OLED，渲染启动、等待 BLE、idle、summary、full request、resolved 等状态。
- `input`：通过 HaaS EDU K1 `key_init` 接入 K1/K2/K3/K4，并把确认选择转换为 `decision`。
- `led`：通过 HaaS EDU K1 `led_switch` 接入三色 LED，离线/广播时红绿蓝依次亮起，连接后按状态显示红/绿/蓝。
- `power`：通过 HaaS ADC driver 读取电压并换算 battery 百分比；ADC 读数无效时标记为未知，OLED 显示 `Battery --%`，避免显示假的固定电量。

这些模块已完成 OLED、K1-K4、LED、BLE GATT server 与 ADC battery 的 HaaS EDU K1 API 映射；BLE 发现/连接、通知订阅、按键抖动和电量校准仍需要结合实机继续验证。

## 硬件与协议常量

- 硬件：HaaS EDU K1 开发板。
- BLE 广播名称 / Device name：`ComBrief`。
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
4. 按当前 SDK 版本确认 `package.yaml`、`SConstruct` 与外设 adapter 所需组件依赖。
5. 当前已接入 OLED、K1-K4 和 LED；继续按实际 AliOS Things 版本补齐 BLE GATT server 与 power/battery API。

## Build 与烧录验证

以下流程是本仓库当前在 macOS + HaaS EDU K1 上实测可用的流程。示例路径按本机工作区写出；在其他机器上请替换为自己的 AliOS Things SDK 路径和串口号。

### 1. 准备 AliOS solution

将 ComBrief 固件源码放到 AliOS Things SDK 的 `solutions/combrief_remote` 下。可以复制，也可以软链接；本次实测使用的是已复制后的目录：

```bash
/Users/silverwing/develop/alios_iot/solutions/combrief_remote
```

如果从 ComBrief 仓库重新同步，示例命令如下：

```bash
rsync -a /Users/silverwing/develop/ComBrief/firmware/haas/combrief_remote/ \
  /Users/silverwing/develop/alios_iot/solutions/combrief_remote/
```

不要对 `solutions/combrief_remote` 直接执行 `rm -rf` 或带 `--delete` 的同步；该目录里可能已有 `out/`、`aos_sdk/`、`.sconsign.dblite`、`aos.map` 等 AliOS 构建产物。

注意：如果你只改了 ComBrief 仓库里的 `firmware/haas/combrief_remote`，但没有同步到 AliOS SDK 的 `solutions/combrief_remote`，那么 `aos make` 编译到的仍然是旧代码。

### 2. 编译固件

在 AliOS solution 目录内直接编译：

```bash
cd /Users/silverwing/develop/alios_iot/solutions/combrief_remote
aos make
```

本机实测从 SDK 根目录执行 `aos make combrief_remote@haaseduk1 -c config && aos make` 可能提示 `the workspace is not initialized`；从 `solutions/combrief_remote` 目录执行 `aos make` 可以正常构建。

编译成功后，关键产物包括：

```bash
/Users/silverwing/develop/alios_iot/solutions/combrief_remote/out/combrief_remote@haaseduk1.bin
/Users/silverwing/develop/alios_iot/hardware/chip/haas1000/release/release_bin/ota_rtos.bin
/Users/silverwing/develop/alios_iot/hardware/chip/haas1000/release/write_flash_tool/ota_bin/ota_rtos.bin
```

其中烧录主固件时使用：

```bash
/Users/silverwing/develop/alios_iot/hardware/chip/haas1000/release/release_bin/ota_rtos.bin
```

### 3. 确认串口

连接 HaaS EDU K1 后，在 macOS 上列出串口：

```bash
python3 -m serial.tools.list_ports
```

本机实测设备串口为：

```bash
/dev/cu.usbserial-AU03OSLJ
```

### 4. 烧录主固件

优先使用 HaaS SDK 官方 `flash_program.py`。在本机实测中，脚本可以从当前 ComBrief firmware 的 `(ash)#` CLI 自动发送 `reboot`，捕获 `Press key 'w' to 2ndboot cli menu in 300ms` 窗口，自动进入 `2ndboot`，通常不需要手动按复位键。

```bash
cd /Users/silverwing/develop/alios_iot/hardware/chip/haas1000/release/aos_burn_tool
python3 flash_program.py \
  --bin=/Users/silverwing/develop/alios_iot/hardware/chip/haas1000/release/write_flash_tool/ota_bin/ota_rtos.bin
```

如果需要同时刷新字体/文件系统资源，可追加 `littlefs.bin`，但主固件日常迭代通常只刷 `ota_rtos.bin` 更快：

```bash
python3 flash_program.py \
  --bin=/Users/silverwing/develop/alios_iot/hardware/chip/haas1000/release/write_flash_tool/ota_bin/ota_rtos.bin \
  --bin=/Users/silverwing/develop/alios_iot/hardware/chip/haas1000/release/write_flash_tool/ota_bin/littlefs.bin#0xB32000
```

烧录成功时应看到类似输出：

```text
[ScriptPrint] check if in boot
2ndboot ver: 2ndboot-1.0.0-20200916.163506
aos boot# 
[ScriptPrint] Downloading files...
Please start ymodem ...
CCCC
[ScriptPrint] Swap AB partition
[ScriptPrint] Burn "[...]" success
```

只有当官方脚本一直输出普通启动日志、无法出现 `2ndboot ver:` / `aos boot#` / `Downloading files...` 时，才需要在脚本运行后短按一次 HaaS EDU K1 复位键来帮它赶上 300ms 入口窗口。不要把 `Press key 'w' to 2ndboot cli menu in 300ms` 这一行本身当作已经进入 bootloader；真正进入后会出现 `2ndboot ver:` 和 `aos boot#`。

### 5. 串口验证

烧录后读取 8 秒串口日志：

```bash
python3 - <<'PY'
import serial
import time

PORT = '/dev/cu.usbserial-AU03OSLJ'
BAUD = 1500000
ser = serial.Serial(PORT, BAUD, timeout=0.2)
try:
    ser.reset_input_buffer()
    ser.write(b'\n')
    end = time.time() + 8
    data = b''
    while time.time() < end:
        chunk = ser.read(4096)
        if chunk:
            data += chunk
    print(data.decode('utf-8', errors='ignore'))
finally:
    ser.close()
PY
```

当前 OLED/LED 适配成功时，应能看到类似日志：

```text
OLED: Waiting BLE
LED green: COMBRIEF_REMOTE_ADVERTISING red green blue cycle
OLED: Waiting BLE
LED blue: COMBRIEF_REMOTE_ADVERTISING red green blue cycle
OLED: Waiting BLE
LED red: COMBRIEF_REMOTE_ADVERTISING red green blue cycle
```

实机外观预期：

- OLED 显示 `ComBrief`、版本和 `Waiting BLE`。
- LED 红、绿、蓝依次亮起，而不是三色同步闪烁。

### 6. 常见问题

- 如果官方 `flash_program.py` 一直输出启动日志，说明没有进入 2ndboot；使用上面的稳健烧录脚本。
- 如果提示串口打不开，先确认没有其他串口监视器占用 `/dev/cu.usbserial-*`。
- 如果 `burn_bin_file` 提示无法进入 YModem，通常是没有看到连续 `CCCC`；重新复位板子再执行稳健烧录脚本。
- 如果屏幕仍是黑屏，先看串口是否出现 `OLED: Waiting BLE`；若有日志但屏幕黑，优先检查 `sh1106`/`hal_oled.h` 依赖是否被编进 AliOS 固件。

## 桌面连接验证步骤

1. 启动 ComBrief 桌面应用。
2. 打开 Settings 中的 ComBrief Remote / Hardware 区域。
3. 点击 `Connect Remote` 打开 Web Bluetooth pairing window。
4. 给 HaaS EDU K1 上电或复位，等待 BLE 广播名称 `ComBrief` 出现在设备列表。
5. 选择设备并连接，确认设备发送 `hello` 后桌面端立即下发当前 `state`，OLED 显示最新 ComBrief 状态。
6. 使用测试 display、Slack request 和本地 hook request 验证 `request`、K1-K4、`decision`、`resolved` 与 LED 状态。
7. 点击 Disconnect 时只应临时断开/停止 runtime，不等同于禁用硬件，也不应持久化为 `hardware.enabled=false`。

## 第一版限制

- 当前 repo 提供可导入源码、协议/状态机，以及 OLED、K1-K4、LED、BLE GATT server、ADC battery 的 HaaS EDU K1 适配；它仍不是完整 AliOS SDK 工程。
- 如果 ADC 读数无效，固件不会显示固定假电量，而是显示 `Battery --%` 并暂不发送 battery payload；实机电量百分比仍需要后续按 HaaS EDU K1 的真实电池分压/ADC 通道校准。
- 桌面端自动化测试覆盖协议常量、状态机、Web Bluetooth bridge 与 wiring；实机 BLE 发现/连接、通知订阅、OLED 版式、按键抖动、LED 和电源读数校准仍属于人工验证范围。
