# ComBrief Remote HaaS End-to-End Manual Validation Guide

This guide records Task 11 manual validation for the ComBrief Remote HaaS EDU K1 path. It covers what can be validated in this repository, what must be validated in HaaS Studio / AliOS Things, and the expected desktop-to-remote behavior.

## Current validation state and limitations

- 当前仓库不编译 HaaS 固件；`npm test` and `npm run build` validate the desktop TypeScript app, renderer/preload wiring, Web Bluetooth bridge code, protocol constants, firmware structure, and static firmware module tests.
- The firmware directory provides importable source, protocol/state-machine code, and HaaS EDU K1 board adapters for OLED, K1-K4 input, LED, BLE GATT server, and ADC battery reading. Full acceptance still requires real-device validation of BLE discovery/connection, notifications, physical input debounce, OLED layout, LED timing, and battery calibration.
- Complete HaaS SDK 实机验证 still requires HaaS Studio / AliOS Things build, flash, serial logs, BLE pairing, OLED, K1-K4 input, LED, and power checks on the real HaaS EDU K1 board.
- Disconnect 是临时断开 / stop runtime. It is not the same as disabling hardware and should not persist `hardware.enabled=false`.

## Desktop automated validation

Run these from the ComBrief repository root before manual hardware validation:

```bash
npm test
npm run build
```

Expected results:

- All Vitest tests pass, including hardware protocol, Web Bluetooth bridge, settings renderer, main hardware wiring, HaaS firmware structure, and HaaS firmware module tests.
- `npm run build` completes TypeScript compilation and copies renderer/preload assets.
- The desktop app exposes the ComBrief Remote settings controls, including `Connect Remote`, Disconnect, and test display actions.

## Firmware import, build, and flash

1. Open or install HaaS Studio with an AliOS Things SDK version that supports HaaS EDU K1.
2. Copy or symlink `firmware/haas/combrief_remote` into the SDK as `solutions/combrief_remote`.
3. Open the AliOS Things workspace in HaaS Studio and select `solutions/combrief_remote`.
4. Confirm the OLED, K1-K4, and LED adapters compile with the target SDK; continue replacing or bridging BLE GATT server and power/battery adapter functions with the SDK APIs for the target HaaS EDU K1 board.
5. Build in the SDK environment. The macOS flow verified on this machine is:

```bash
cd /Users/silverwing/develop/alios_iot/solutions/combrief_remote
aos make
```

The build produces the main firmware at:

```bash
/Users/silverwing/develop/alios_iot/hardware/chip/haas1000/release/release_bin/ota_rtos.bin
```

6. Connect the HaaS EDU K1 over USB and confirm the serial port:

```bash
python3 -m serial.tools.list_ports
```

The verified device path on this machine is `/dev/cu.usbserial-AU03OSLJ`.

7. Flash `ota_rtos.bin`. Prefer the stock HaaS SDK `flash_program.py` flow documented in `firmware/haas/combrief_remote/README.md`; on this machine it can reboot from `(ash)#`, enter `2ndboot`, download `ota_rtos.bin`, swap AB partition, and finish without a manual reset. Only press reset if the script fails to reach `2ndboot ver:` / `aos boot#` / `Downloading files...`. The successful flow prints `2ndboot ver`, `CCCC`, `Swap AB partition`, and `Burn "[...]" success`.
8. Reboot or let the flash script reboot the board, then check serial logs for `OLED: Waiting BLE` and the red/green/blue advertising LED cycle.

Passing this section requires a real HaaS SDK build and flash. Repository-only validation is not enough for full firmware acceptance.

## BLE pairing through the desktop pairing window

1. Start the ComBrief desktop app after `npm run build`, or use the normal app start flow.
2. Open Settings and locate the ComBrief Remote / Hardware section.
3. Click `Connect Remote` to open the Web Bluetooth pairing window button flow.
4. Power or reset the HaaS EDU K1 and confirm the advertised device name is `ComBrief`.
5. Select `ComBrief` in the pairing window and complete the connection.
6. Confirm the device sends a valid `hello` message and the desktop immediately sends the current `state` snapshot back to the remote.
7. Confirm OLED shows the current ComBrief app state rather than remaining blank or stale after pairing.

## Request confirmation validation

Create a pending ComBrief request from a local app or Slack integration, then verify:

- The desktop sends a `request` message over `host_tx`.
- OLED displays summary content first and can switch to full content.
- `K1` moves option focus upward or to the previous option.
- `K2` moves option focus downward or to the next option.
- `K3` confirms the selected option and sends a `decision` over `device_tx`.
- `K4` toggles summary/full request display mode.
- The desktop receives the hardware `decision`, resolves the request, and sends `resolved` back to the board.
- OLED and LED leave the waiting state after `resolved` is processed.

## Slack/local/HaaS race validation

Validate that only one path wins for the same decision request:

1. Trigger a request that appears in Slack, local desktop handling, and HaaS remote.
2. Resolve the request from Slack first. Confirm the board receives `resolved` and later K3 presses do not create a second resolution.
3. Trigger another request and resolve it locally first. Confirm Slack and HaaS both observe the already-resolved state.
4. Trigger another request and resolve it with HaaS K3 first. Confirm Slack updates to the resolved result and the local runtime does not resolve again.
5. Repeat with delayed BLE delivery or a brief disconnect/reconnect to ensure the next valid `hello` receives a fresh `state` snapshot.

## Known limitations / manual validation state

- This repository currently validates source structure and desktop behavior, not HaaS SDK compilation.
- OLED/K1-K4/LED/BLE GATT/ADC battery 已接入 HaaS EDU K1 API；OLED drawing, BLE discovery/connection, notification subscription, physical input debounce, LED patterns, and battery calibration still require hardware confirmation.
- HaaS Studio build, 烧录, serial logs, BLE pairing, `ComBrief` discovery, K1/K2/K3/K4 input, `resolved` display, Slack race behavior, and Disconnect temporary-stop semantics must be checked manually on hardware before marking the remote fully validated.
