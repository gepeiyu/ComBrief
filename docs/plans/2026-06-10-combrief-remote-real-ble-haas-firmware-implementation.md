# ComBrief Remote Real BLE + HaaS Firmware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use tre:subagent-driven-development (recommended) or tre:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real ComBrief Remote hardware path: Electron Web Bluetooth bridge, settings connection flow, and HaaS EDU K1 firmware for OLED/button confirmation.

**Architecture:** Keep the existing desktop `HardwareRuntime` and `HardwareTransport` boundary. Add a Web Bluetooth bridge renderer managed by the Electron main process, then add HaaS EDU K1 firmware under `firmware/haas/combrief_remote/` that speaks the existing JSON protocol. Desktop tasks remain fully testable without a physical device; firmware tasks produce source, documentation, and an explicit HaaS Studio validation path.

**Tech Stack:** Electron 33 main/preload/renderer, TypeScript, Vitest, Web Bluetooth, IPC, AliOS Things / HaaS Studio C firmware, HaaS EDU K1 OLED/buttons/LED/BLE APIs.

---

## Scope Split

This plan covers two coordinated subsystems because the success criteria require a real end-to-end hardware loop:

1. **Desktop real BLE bridge** — testable with Vitest and fake bridge/Web Bluetooth adapters.
2. **HaaS EDU K1 firmware** — source and README live in this repo; compile/flash validation happens in HaaS Studio / AliOS Things once the toolchain is configured.

Tasks are sequenced so the desktop transport can be completed and tested before the firmware is ready. Firmware tasks avoid changing desktop behavior until the protocol loop is available.

## File Structure

### Desktop files

- Create: `src/main/hardware/bridge-ipc.ts` — shared IPC channel names and bridge status/message types.
- Create: `src/main/hardware/web-bluetooth-bridge-window.ts` — hidden bridge window lifecycle.
- Create: `src/main/hardware/web-bluetooth-bridge-transport.ts` — `HardwareTransport` implementation backed by bridge IPC.
- Create: `src/preload/hardware-bridge-preload.ts` — bridge-only preload API.
- Create: `src/renderer/hardware-bridge.html` — hidden bridge page.
- Create: `src/renderer/hardware-bridge.js` — Web Bluetooth scan/connect/send/notify logic.
- Modify: `scripts/copy-extensions.mjs` — copy bridge renderer assets into `dist/renderer`.
- Modify: `src/main/index.ts` — instantiate real bridge transport instead of `MockHardwareTransport`, add connect/disconnect IPC handlers.
- Modify: `src/preload/settings-preload.ts` — expose connect/disconnect hardware actions.
- Modify: `src/renderer/settings.html` — add connect/disconnect buttons.
- Modify: `src/renderer/settings.js` — bind connect/disconnect and richer status display.
- Modify: `src/main/i18n/messages.ts` — add localized labels/errors.

### Desktop tests

- Create: `tests/hardware-bridge-ipc.test.ts`.
- Create: `tests/hardware-web-bluetooth-bridge-transport.test.ts`.
- Modify: `tests/settings-renderer.test.ts`.
- Modify: `tests/i18n.test.ts`.

### Firmware files

- Create: `firmware/haas/combrief_remote/README.md`.
- Create: `firmware/haas/combrief_remote/package.yaml`.
- Create: `firmware/haas/combrief_remote/SConstruct`.
- Create: `firmware/haas/combrief_remote/combrief_remote.c`.
- Create: `firmware/haas/combrief_remote/app_state/app_state.h`.
- Create: `firmware/haas/combrief_remote/app_state/app_state.c`.
- Create: `firmware/haas/combrief_remote/protocol/protocol.h`.
- Create: `firmware/haas/combrief_remote/protocol/protocol.c`.
- Create: `firmware/haas/combrief_remote/ble_service/ble_service.h`.
- Create: `firmware/haas/combrief_remote/ble_service/ble_service.c`.
- Create: `firmware/haas/combrief_remote/display/display.h`.
- Create: `firmware/haas/combrief_remote/display/display.c`.
- Create: `firmware/haas/combrief_remote/input/input.h`.
- Create: `firmware/haas/combrief_remote/input/input.c`.
- Create: `firmware/haas/combrief_remote/led/led.h`.
- Create: `firmware/haas/combrief_remote/led/led.c`.
- Create: `firmware/haas/combrief_remote/power/power.h`.
- Create: `firmware/haas/combrief_remote/power/power.c`.

---

### Task 1: Desktop Bridge IPC Contract

**Files:**
- Create: `src/main/hardware/bridge-ipc.ts`
- Test: `tests/hardware-bridge-ipc.test.ts`

- [ ] **Step 1: Write failing bridge IPC tests**

Create `tests/hardware-bridge-ipc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  HARDWARE_BRIDGE_CHANNELS,
  isHardwareBridgeStatus,
  type HardwareBridgeStatus,
} from '../src/main/hardware/bridge-ipc';

describe('hardware bridge IPC contract', () => {
  it('uses stable channel names', () => {
    expect(HARDWARE_BRIDGE_CHANNELS).toEqual({
      startScan: 'hardwareBridge:startScan',
      connect: 'hardwareBridge:connect',
      disconnect: 'hardwareBridge:disconnect',
      sendHostMessage: 'hardwareBridge:sendHostMessage',
      getStatus: 'hardwareBridge:getStatus',
      statusChanged: 'hardwareBridge:statusChanged',
      deviceMessage: 'hardwareBridge:deviceMessage',
      error: 'hardwareBridge:error',
    });
  });

  it('accepts valid bridge status objects', () => {
    const status: HardwareBridgeStatus = {
      started: true,
      connected: true,
      scanning: false,
      deviceName: 'ComBrief-Remote',
      lastError: null,
    };

    expect(isHardwareBridgeStatus(status)).toBe(true);
  });

  it('rejects malformed bridge status objects', () => {
    expect(isHardwareBridgeStatus(null)).toBe(false);
    expect(isHardwareBridgeStatus({ started: true })).toBe(false);
    expect(
      isHardwareBridgeStatus({
        started: true,
        connected: true,
        scanning: 'no',
        deviceName: null,
        lastError: null,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hardware-bridge-ipc.test.ts`

Expected: FAIL because `src/main/hardware/bridge-ipc.ts` does not exist.

- [ ] **Step 3: Implement bridge IPC contract**

Create `src/main/hardware/bridge-ipc.ts`:

```ts
export const HARDWARE_BRIDGE_CHANNELS = {
  startScan: 'hardwareBridge:startScan',
  connect: 'hardwareBridge:connect',
  disconnect: 'hardwareBridge:disconnect',
  sendHostMessage: 'hardwareBridge:sendHostMessage',
  getStatus: 'hardwareBridge:getStatus',
  statusChanged: 'hardwareBridge:statusChanged',
  deviceMessage: 'hardwareBridge:deviceMessage',
  error: 'hardwareBridge:error',
} as const;

export interface HardwareBridgeStatus {
  started: boolean;
  connected: boolean;
  scanning: boolean;
  deviceName: string | null;
  lastError: string | null;
}

export function isHardwareBridgeStatus(value: unknown): value is HardwareBridgeStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  return (
    typeof status.started === 'boolean' &&
    typeof status.connected === 'boolean' &&
    typeof status.scanning === 'boolean' &&
    (status.deviceName === null || typeof status.deviceName === 'string') &&
    (status.lastError === null || typeof status.lastError === 'string')
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/hardware-bridge-ipc.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit bridge IPC contract**

Run:

```bash
git add src/main/hardware/bridge-ipc.ts tests/hardware-bridge-ipc.test.ts
git commit -m "feat(hardware): define Web Bluetooth bridge IPC contract"
```

---

### Task 2: Main-Process Bridge Window Lifecycle

**Files:**
- Create: `src/main/hardware/web-bluetooth-bridge-window.ts`
- Test: `tests/hardware-web-bluetooth-bridge-window.test.ts`

- [ ] **Step 1: Write failing bridge window tests**

Create `tests/hardware-web-bluetooth-bridge-window.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createWebBluetoothBridgeWindowManager } from '../src/main/hardware/web-bluetooth-bridge-window';

describe('web bluetooth bridge window manager', () => {
  it('creates one hidden bridge window and reuses it', () => {
    const loadFile = vi.fn();
    const on = vi.fn();
    const BrowserWindow = vi.fn(() => ({
      loadFile,
      on,
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    }));

    const manager = createWebBluetoothBridgeWindowManager({
      BrowserWindow,
      preloadPath: '/dist/preload/hardware-bridge-preload.js',
      rendererPath: '/dist/renderer/hardware-bridge.html',
    });

    const first = manager.ensureWindow();
    const second = manager.ensureWindow();

    expect(first).toBe(second);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(BrowserWindow).toHaveBeenCalledWith({
      show: false,
      width: 320,
      height: 240,
      webPreferences: {
        preload: '/dist/preload/hardware-bridge-preload.js',
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    expect(loadFile).toHaveBeenCalledWith('/dist/renderer/hardware-bridge.html');
  });

  it('clears the cached window when closed', () => {
    let closedHandler: (() => void) | undefined;
    const BrowserWindow = vi.fn(() => ({
      loadFile: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'closed') closedHandler = handler;
      }),
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    }));

    const manager = createWebBluetoothBridgeWindowManager({
      BrowserWindow,
      preloadPath: '/preload.js',
      rendererPath: '/bridge.html',
    });

    const first = manager.ensureWindow();
    closedHandler?.();
    const second = manager.ensureWindow();

    expect(first).not.toBe(second);
    expect(BrowserWindow).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hardware-web-bluetooth-bridge-window.test.ts`

Expected: FAIL because `createWebBluetoothBridgeWindowManager` does not exist.

- [ ] **Step 3: Implement bridge window manager**

Create `src/main/hardware/web-bluetooth-bridge-window.ts`:

```ts
import type { BrowserWindow as ElectronBrowserWindow } from 'electron';

interface BrowserWindowConstructor {
  new (options: {
    show: boolean;
    width: number;
    height: number;
    webPreferences: {
      preload: string;
      contextIsolation: boolean;
      nodeIntegration: boolean;
    };
  }): ElectronBrowserWindow;
}

export interface WebBluetoothBridgeWindowManagerOptions {
  BrowserWindow: BrowserWindowConstructor;
  preloadPath: string;
  rendererPath: string;
}

export interface WebBluetoothBridgeWindowManager {
  ensureWindow(): ElectronBrowserWindow;
  getWindow(): ElectronBrowserWindow | null;
  destroy(): void;
}

export function createWebBluetoothBridgeWindowManager(
  options: WebBluetoothBridgeWindowManagerOptions,
): WebBluetoothBridgeWindowManager {
  let bridgeWindow: ElectronBrowserWindow | null = null;

  return {
    ensureWindow() {
      if (bridgeWindow && !bridgeWindow.isDestroyed()) return bridgeWindow;
      bridgeWindow = new options.BrowserWindow({
        show: false,
        width: 320,
        height: 240,
        webPreferences: {
          preload: options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      bridgeWindow.loadFile(options.rendererPath);
      bridgeWindow.on('closed', () => {
        bridgeWindow = null;
      });
      return bridgeWindow;
    },

    getWindow() {
      return bridgeWindow && !bridgeWindow.isDestroyed() ? bridgeWindow : null;
    },

    destroy() {
      const win = bridgeWindow;
      bridgeWindow = null;
      if (win && !win.isDestroyed()) win.destroy();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/hardware-web-bluetooth-bridge-window.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit bridge window manager**

Run:

```bash
git add src/main/hardware/web-bluetooth-bridge-window.ts tests/hardware-web-bluetooth-bridge-window.test.ts
git commit -m "feat(hardware): manage hidden Web Bluetooth bridge window"
```

---

### Task 3: Web Bluetooth Bridge Transport

**Files:**
- Create: `src/main/hardware/web-bluetooth-bridge-transport.ts`
- Test: `tests/hardware-web-bluetooth-bridge-transport.test.ts`

- [ ] **Step 1: Write failing transport tests**

Create `tests/hardware-web-bluetooth-bridge-transport.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { HARDWARE_BRIDGE_CHANNELS } from '../src/main/hardware/bridge-ipc';
import { WebBluetoothBridgeTransport } from '../src/main/hardware/web-bluetooth-bridge-transport';
import type { HardwareDeviceMessage } from '../src/main/hardware/protocol';

function createHarness() {
  const sent: Array<{ channel: string; payload?: unknown }> = [];
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const webContents = {
    send: vi.fn((channel: string, payload?: unknown) => {
      sent.push({ channel, payload });
    }),
  };
  const win = { webContents };
  const manager = {
    ensureWindow: vi.fn(() => win),
    getWindow: vi.fn(() => win),
    destroy: vi.fn(),
  };
  const ipc = {
    on: vi.fn((channel: string, handler: (_event: unknown, payload: unknown) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add((payload) => handler({}, payload));
      listeners.set(channel, set);
    }),
    off: vi.fn(),
  };
  const emit = (channel: string, payload: unknown) => {
    for (const handler of listeners.get(channel) ?? []) handler(payload);
  };
  return { manager, ipc, sent, emit };
}

describe('WebBluetoothBridgeTransport', () => {
  it('starts the bridge and requests scan', async () => {
    const { manager, ipc, sent } = createHarness();
    const transport = new WebBluetoothBridgeTransport(manager, ipc);

    await transport.start();

    expect(manager.ensureWindow).toHaveBeenCalledOnce();
    expect(ipc.on).toHaveBeenCalledWith(HARDWARE_BRIDGE_CHANNELS.statusChanged, expect.any(Function));
    expect(ipc.on).toHaveBeenCalledWith(HARDWARE_BRIDGE_CHANNELS.deviceMessage, expect.any(Function));
    expect(sent).toContainEqual({ channel: HARDWARE_BRIDGE_CHANNELS.startScan, payload: undefined });
    expect(transport.getStatus()).toEqual({ started: true, connected: false, lastError: null });
  });

  it('sends host messages to the bridge window', async () => {
    const { manager, ipc, sent } = createHarness();
    const transport = new WebBluetoothBridgeTransport(manager, ipc);
    await transport.start();

    await transport.send({
      protocol: 1,
      type: 'resolved',
      decisionId: 'test',
      result: 'selected',
      message: 'Hello Remote',
    });

    expect(sent).toContainEqual({
      channel: HARDWARE_BRIDGE_CHANNELS.sendHostMessage,
      payload: {
        protocol: 1,
        type: 'resolved',
        decisionId: 'test',
        result: 'selected',
        message: 'Hello Remote',
      },
    });
  });

  it('forwards valid device messages to subscribers', async () => {
    const { manager, ipc, emit } = createHarness();
    const transport = new WebBluetoothBridgeTransport(manager, ipc);
    const received: HardwareDeviceMessage[] = [];
    transport.onMessage((message) => received.push(message));
    await transport.start();

    emit(HARDWARE_BRIDGE_CHANNELS.deviceMessage, {
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1710000000000,
    });
    emit(HARDWARE_BRIDGE_CHANNELS.deviceMessage, { type: 'decision' });

    expect(received).toEqual([
      {
        protocol: 1,
        type: 'decision',
        decisionId: 'request-1',
        optionId: 'allow',
        ts: 1710000000000,
      },
    ]);
  });

  it('maps bridge status and errors into transport status', async () => {
    const { manager, ipc, emit } = createHarness();
    const transport = new WebBluetoothBridgeTransport(manager, ipc);
    await transport.start();

    emit(HARDWARE_BRIDGE_CHANNELS.statusChanged, {
      started: true,
      connected: true,
      scanning: false,
      deviceName: 'ComBrief-Remote',
      lastError: null,
    });
    expect(transport.getStatus()).toEqual({ started: true, connected: true, lastError: null });

    emit(HARDWARE_BRIDGE_CHANNELS.error, 'GATT disconnected');
    expect(transport.getStatus()).toEqual({
      started: true,
      connected: true,
      lastError: 'GATT disconnected',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hardware-web-bluetooth-bridge-transport.test.ts`

Expected: FAIL because `WebBluetoothBridgeTransport` does not exist.

- [ ] **Step 3: Implement bridge transport**

Create `src/main/hardware/web-bluetooth-bridge-transport.ts`:

```ts
import type { IpcMain } from 'electron';
import {
  HARDWARE_BRIDGE_CHANNELS,
  isHardwareBridgeStatus,
  type HardwareBridgeStatus,
} from './bridge-ipc';
import {
  isHardwareBatteryMessage,
  isHardwareDecisionMessage,
  isHardwareHelloMessage,
  type HardwareDeviceMessage,
  type HardwareHostMessage,
} from './protocol';
import type { HardwareConnectionStatus, HardwareTransport } from './transport';
import type { WebBluetoothBridgeWindowManager } from './web-bluetooth-bridge-window';

function isDeviceMessage(value: unknown): value is HardwareDeviceMessage {
  return (
    isHardwareHelloMessage(value) ||
    isHardwareDecisionMessage(value) ||
    isHardwareBatteryMessage(value)
  );
}

export class WebBluetoothBridgeTransport implements HardwareTransport {
  private handlers = new Set<(message: HardwareDeviceMessage) => void>();
  private status: HardwareConnectionStatus = {
    started: false,
    connected: false,
    lastError: null,
  };
  private subscribed = false;

  constructor(
    private readonly manager: WebBluetoothBridgeWindowManager,
    private readonly ipcMain: Pick<IpcMain, 'on' | 'off'>,
  ) {}

  async start(): Promise<void> {
    const win = this.manager.ensureWindow();
    if (!this.subscribed) {
      this.ipcMain.on(HARDWARE_BRIDGE_CHANNELS.statusChanged, this.handleStatusChanged);
      this.ipcMain.on(HARDWARE_BRIDGE_CHANNELS.deviceMessage, this.handleDeviceMessage);
      this.ipcMain.on(HARDWARE_BRIDGE_CHANNELS.error, this.handleError);
      this.subscribed = true;
    }
    this.status = { started: true, connected: this.status.connected, lastError: null };
    win.webContents.send(HARDWARE_BRIDGE_CHANNELS.startScan);
  }

  async stop(): Promise<void> {
    const win = this.manager.getWindow();
    win?.webContents.send(HARDWARE_BRIDGE_CHANNELS.disconnect);
    this.status = { started: false, connected: false, lastError: null };
  }

  getStatus(): HardwareConnectionStatus {
    return { ...this.status };
  }

  async send(message: HardwareHostMessage): Promise<void> {
    const win = this.manager.getWindow();
    if (!win) throw new Error('ComBrief Remote bridge is not running');
    win.webContents.send(HARDWARE_BRIDGE_CHANNELS.sendHostMessage, message);
  }

  onMessage(handler: (message: HardwareDeviceMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private handleStatusChanged = (_event: unknown, payload: unknown): void => {
    if (!isHardwareBridgeStatus(payload)) return;
    const bridgeStatus: HardwareBridgeStatus = payload;
    this.status = {
      started: bridgeStatus.started,
      connected: bridgeStatus.connected,
      lastError: bridgeStatus.lastError,
    };
  };

  private handleDeviceMessage = (_event: unknown, payload: unknown): void => {
    if (!isDeviceMessage(payload)) return;
    for (const handler of this.handlers) handler(payload);
  };

  private handleError = (_event: unknown, payload: unknown): void => {
    this.status = {
      ...this.status,
      lastError: typeof payload === 'string' ? payload : 'Unknown bridge error',
    };
  };
}
```

- [ ] **Step 4: Run transport tests**

Run: `npm test -- tests/hardware-web-bluetooth-bridge-transport.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit bridge transport**

Run:

```bash
git add src/main/hardware/web-bluetooth-bridge-transport.ts tests/hardware-web-bluetooth-bridge-transport.test.ts
git commit -m "feat(hardware): add Web Bluetooth bridge transport"
```

---

### Task 4: Bridge Preload and Renderer Assets

**Files:**
- Create: `src/preload/hardware-bridge-preload.ts`
- Create: `src/renderer/hardware-bridge.html`
- Create: `src/renderer/hardware-bridge.js`
- Modify: `scripts/copy-extensions.mjs`
- Test: `tests/hardware-bridge-renderer.test.ts`

- [ ] **Step 1: Write failing static renderer test**

Create `tests/hardware-bridge-renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('hardware bridge renderer assets', () => {
  it('exposes only the bridge API through preload', () => {
    const preload = readFileSync(join(process.cwd(), 'src/preload/hardware-bridge-preload.ts'), 'utf8');
    expect(preload).toContain("contextBridge.exposeInMainWorld('combriefHardwareBridge'");
    expect(preload).toContain('sendStatus');
    expect(preload).toContain('sendDeviceMessage');
    expect(preload).toContain('sendError');
    expect(preload).not.toContain('listApps');
    expect(preload).not.toContain('setConfig');
  });

  it('loads the bridge script from the bridge html file', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/hardware-bridge.html'), 'utf8');
    expect(html).toContain('<script src="hardware-bridge.js"></script>');
  });

  it('copies bridge renderer files during build', () => {
    const copyScript = readFileSync(join(process.cwd(), 'scripts/copy-extensions.mjs'), 'utf8');
    expect(copyScript).toContain("'hardware-bridge.html'");
    expect(copyScript).toContain("'hardware-bridge.js'");
  });

  it('uses Web Bluetooth APIs and protocol UUIDs', () => {
    const bridge = readFileSync(join(process.cwd(), 'src/renderer/hardware-bridge.js'), 'utf8');
    expect(bridge).toContain('navigator.bluetooth.requestDevice');
    expect(bridge).toContain('7b5c0001-8d4a-4c3a-9b4f-434252465001');
    expect(bridge).toContain('7b5c0002-8d4a-4c3a-9b4f-434252465001');
    expect(bridge).toContain('7b5c0003-8d4a-4c3a-9b4f-434252465001');
    expect(bridge).toContain('TextEncoder');
    expect(bridge).toContain('TextDecoder');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hardware-bridge-renderer.test.ts`

Expected: FAIL because bridge preload and renderer files do not exist.

- [ ] **Step 3: Add bridge preload**

Create `src/preload/hardware-bridge-preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { HARDWARE_BRIDGE_CHANNELS } from '../main/hardware/bridge-ipc';

contextBridge.exposeInMainWorld('combriefHardwareBridge', {
  onStartScan: (handler: () => void) => {
    ipcRenderer.on(HARDWARE_BRIDGE_CHANNELS.startScan, handler);
    return () => ipcRenderer.off(HARDWARE_BRIDGE_CHANNELS.startScan, handler);
  },
  onConnect: (handler: () => void) => {
    ipcRenderer.on(HARDWARE_BRIDGE_CHANNELS.connect, handler);
    return () => ipcRenderer.off(HARDWARE_BRIDGE_CHANNELS.connect, handler);
  },
  onDisconnect: (handler: () => void) => {
    ipcRenderer.on(HARDWARE_BRIDGE_CHANNELS.disconnect, handler);
    return () => ipcRenderer.off(HARDWARE_BRIDGE_CHANNELS.disconnect, handler);
  },
  onSendHostMessage: (handler: (_event: unknown, message: unknown) => void) => {
    ipcRenderer.on(HARDWARE_BRIDGE_CHANNELS.sendHostMessage, handler);
    return () => ipcRenderer.off(HARDWARE_BRIDGE_CHANNELS.sendHostMessage, handler);
  },
  sendStatus: (status: object) => ipcRenderer.send(HARDWARE_BRIDGE_CHANNELS.statusChanged, status),
  sendDeviceMessage: (message: object) => ipcRenderer.send(HARDWARE_BRIDGE_CHANNELS.deviceMessage, message),
  sendError: (message: string) => ipcRenderer.send(HARDWARE_BRIDGE_CHANNELS.error, message),
});
```

- [ ] **Step 4: Add bridge HTML**

Create `src/renderer/hardware-bridge.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>ComBrief Remote Bridge</title>
  </head>
  <body>
    <script src="hardware-bridge.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Add bridge renderer JavaScript**

Create `src/renderer/hardware-bridge.js`:

```js
const SERVICE_UUID = '7b5c0001-8d4a-4c3a-9b4f-434252465001';
const HOST_TX_UUID = '7b5c0002-8d4a-4c3a-9b4f-434252465001';
const DEVICE_TX_UUID = '7b5c0003-8d4a-4c3a-9b4f-434252465001';
const REMOTE_NAME = 'ComBrief-Remote';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let device = null;
let server = null;
let hostTx = null;
let deviceTx = null;
let status = {
  started: false,
  connected: false,
  scanning: false,
  deviceName: null,
  lastError: null,
};

function sendStatus(patch = {}) {
  status = { ...status, ...patch };
  window.combriefHardwareBridge?.sendStatus(status);
}

function reportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  sendStatus({ lastError: message });
  window.combriefHardwareBridge?.sendError(message);
}

function handleDisconnected() {
  server = null;
  hostTx = null;
  deviceTx = null;
  sendStatus({ connected: false });
}

async function connect() {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not available in this Electron runtime');
  }
  sendStatus({ started: true, scanning: true, lastError: null });
  device = await navigator.bluetooth.requestDevice({
    filters: [{ name: REMOTE_NAME }, { services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID],
  });
  device.addEventListener('gattserverdisconnected', handleDisconnected);
  server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  hostTx = await service.getCharacteristic(HOST_TX_UUID);
  deviceTx = await service.getCharacteristic(DEVICE_TX_UUID);
  await deviceTx.startNotifications();
  deviceTx.addEventListener('characteristicvaluechanged', (event) => {
    try {
      const text = decoder.decode(event.target.value);
      const message = JSON.parse(text);
      window.combriefHardwareBridge?.sendDeviceMessage(message);
    } catch (error) {
      reportError(error);
    }
  });
  sendStatus({
    started: true,
    connected: true,
    scanning: false,
    deviceName: device.name || REMOTE_NAME,
    lastError: null,
  });
}

async function disconnect() {
  if (device?.gatt?.connected) device.gatt.disconnect();
  handleDisconnected();
}

async function sendHostMessage(message) {
  if (!hostTx) throw new Error('ComBrief Remote is not connected');
  const bytes = encoder.encode(JSON.stringify(message));
  if (bytes.byteLength > 1400) {
    throw new Error(`Hardware message is too large: ${bytes.byteLength} bytes`);
  }
  if (typeof hostTx.writeValueWithoutResponse === 'function') {
    await hostTx.writeValueWithoutResponse(bytes);
  } else {
    await hostTx.writeValue(bytes);
  }
}

window.combriefHardwareBridge?.onStartScan(() => {
  void connect().catch(reportError);
});
window.combriefHardwareBridge?.onConnect(() => {
  void connect().catch(reportError);
});
window.combriefHardwareBridge?.onDisconnect(() => {
  void disconnect().catch(reportError);
});
window.combriefHardwareBridge?.onSendHostMessage((_event, message) => {
  void sendHostMessage(message).catch(reportError);
});

sendStatus({ started: true });
```

- [ ] **Step 6: Copy bridge renderer files during build**

Modify `scripts/copy-extensions.mjs` renderer file list:

```js
for (const file of [
  'settings.html',
  'settings.js',
  'hardware-bridge.html',
  'hardware-bridge.js',
  'about.html',
  'slack-setup-guide.html',
  'slack-setup-guide.js',
]) {
  const src = join(root, 'src', 'renderer', file);
  if (existsSync(src)) {
    cpSync(src, join(rendererOut, file));
  }
}
```

- [ ] **Step 7: Run renderer tests and build**

Run:

```bash
npm test -- tests/hardware-bridge-renderer.test.ts
npm run build
```

Expected: both commands PASS.

- [ ] **Step 8: Commit bridge renderer assets**

Run:

```bash
git add src/preload/hardware-bridge-preload.ts src/renderer/hardware-bridge.html src/renderer/hardware-bridge.js scripts/copy-extensions.mjs tests/hardware-bridge-renderer.test.ts
git commit -m "feat(hardware): add Web Bluetooth bridge renderer"
```

---

### Task 5: Wire Real Bridge Transport into Main Process

**Files:**
- Modify: `src/main/index.ts`
- Test: `tests/main-hardware-wiring.test.ts`

- [ ] **Step 1: Write failing main wiring static test**

Create `tests/main-hardware-wiring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('main hardware wiring', () => {
  it('uses the Web Bluetooth bridge transport in production wiring', () => {
    const source = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    expect(source).toContain("import { WebBluetoothBridgeTransport }");
    expect(source).toContain("import { createWebBluetoothBridgeWindowManager }");
    expect(source).toContain('new WebBluetoothBridgeTransport(');
    expect(source).not.toContain('new MockHardwareTransport()');
  });

  it('registers hardware connect and disconnect IPC handlers', () => {
    const source = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8');
    expect(source).toContain("ipcMain.handle('hardware:connect'");
    expect(source).toContain("ipcMain.handle('hardware:disconnect'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/main-hardware-wiring.test.ts`

Expected: FAIL because `index.ts` still uses `MockHardwareTransport` and lacks connect/disconnect handlers.

- [ ] **Step 3: Replace mock transport wiring**

Modify imports in `src/main/index.ts`:

```ts
import { HardwareRuntime } from './hardware/runtime';
import { WebBluetoothBridgeTransport } from './hardware/web-bluetooth-bridge-transport';
import { createWebBluetoothBridgeWindowManager } from './hardware/web-bluetooth-bridge-window';
```

Remove:

```ts
import { MockHardwareTransport } from './hardware/mock-transport';
```

Create the manager and transport near current hardware initialization:

```ts
  const bridgeWindowManager = createWebBluetoothBridgeWindowManager({
    BrowserWindow,
    preloadPath: join(__dirname, '..', 'preload', 'hardware-bridge-preload.js'),
    rendererPath: join(__dirname, '..', 'renderer', 'hardware-bridge.html'),
  });
  hardwareRuntime = new HardwareRuntime(
    new WebBluetoothBridgeTransport(bridgeWindowManager, ipcMain),
    {
      onDecision: (message) => {
        slackRuntime.getDecisionService()?.resolveFromHardware(message);
      },
    },
  );
```

- [ ] **Step 4: Add connect and disconnect IPC handlers**

Add to `registerIpc()` in `src/main/index.ts` after `hardware:status`:

```ts
  ipcMain.handle('hardware:connect', async () => {
    if (!controller.getConfig().hardware.enabled) {
      controller.updateConfig({ hardware: { enabled: true } });
      saveConfig(combriefHome(), controller.getConfig());
    }
    await restartHardware();
    return hardwareRuntime.getStatus();
  });

  ipcMain.handle('hardware:disconnect', async () => {
    await hardwareRuntime.stop();
    return hardwareRuntime.getStatus();
  });
```

- [ ] **Step 5: Run wiring test, full hardware tests, and build**

Run:

```bash
npm test -- tests/main-hardware-wiring.test.ts tests/hardware-runtime.test.ts tests/decision-service-hardware.test.ts
npm run build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit main process wiring**

Run:

```bash
git add src/main/index.ts tests/main-hardware-wiring.test.ts
git commit -m "feat(hardware): wire real Web Bluetooth transport"
```

---

### Task 6: Settings UI Connection Controls

**Files:**
- Modify: `src/preload/settings-preload.ts`
- Modify: `src/renderer/settings.html`
- Modify: `src/renderer/settings.js`
- Modify: `src/main/i18n/messages.ts`
- Test: `tests/settings-renderer.test.ts`
- Test: `tests/i18n.test.ts`

- [ ] **Step 1: Expand failing settings renderer test**

Modify `tests/settings-renderer.test.ts` to include:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('settings renderer hardware controls', () => {
  it('uses robust async handling for the hardware enable checkbox', () => {
    const source = readFileSync(join(process.cwd(), 'src/renderer/settings.js'), 'utf8');
    const handlerStart = source.indexOf('hardwareEnabledEl.onchange = async () =>');
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    const handler = source.slice(handlerStart, source.indexOf('if (hardwareConnectEl)', handlerStart));
    expect(handler).toContain('try {');
    expect(handler).toContain('catch (err)');
    expect(handler).toContain('finally {');
    expect(handler).toContain('hardwareEnabledEl.disabled = false');
  });

  it('binds connect and disconnect buttons with async recovery', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/settings.html'), 'utf8');
    const source = readFileSync(join(process.cwd(), 'src/renderer/settings.js'), 'utf8');
    const preload = readFileSync(join(process.cwd(), 'src/preload/settings-preload.ts'), 'utf8');

    expect(html).toContain('id="hardwareConnect"');
    expect(html).toContain('id="hardwareDisconnect"');
    expect(source).toContain("document.getElementById('hardwareConnect')");
    expect(source).toContain("document.getElementById('hardwareDisconnect')");
    expect(source).toContain('window.combrief?.connectHardware?.()');
    expect(source).toContain('window.combrief?.disconnectHardware?.()');
    expect(preload).toContain("connectHardware: () => ipcRenderer.invoke('hardware:connect')");
    expect(preload).toContain("disconnectHardware: () => ipcRenderer.invoke('hardware:disconnect')");
  });
});
```

- [ ] **Step 2: Expand failing i18n test**

Modify the hardware keys list in `tests/i18n.test.ts`:

```ts
    const keys = [
      'hardwareSection',
      'hardwareEnabled',
      'hardwareConnect',
      'hardwareDisconnect',
      'hardwareTestDisplay',
      'hardwareStatusConnected',
      'hardwareStatusDisconnected',
      'hardwareStatusNeedsReconnect',
    ] as const;
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/settings-renderer.test.ts tests/i18n.test.ts`

Expected: FAIL because connect/disconnect UI and strings do not exist.

- [ ] **Step 4: Expose hardware connect/disconnect in settings preload**

Modify `src/preload/settings-preload.ts`:

```ts
  hardwareStatus: () => ipcRenderer.invoke('hardware:status'),
  connectHardware: () => ipcRenderer.invoke('hardware:connect'),
  disconnectHardware: () => ipcRenderer.invoke('hardware:disconnect'),
  testHardwareDisplay: () => ipcRenderer.invoke('hardware:testDisplay'),
```

- [ ] **Step 5: Add settings buttons**

Modify the hardware section in `src/renderer/settings.html`:

```html
    <p>
      <button type="button" id="hardwareConnect"></button>
      <button type="button" id="hardwareDisconnect"></button>
      <button type="button" id="hardwareTestDisplay"></button>
      <span id="hardwareStatus" class="hint" style="margin-left: 8px"></span>
    </p>
```

- [ ] **Step 6: Bind settings buttons**

Modify `src/renderer/settings.js` near existing hardware element declarations:

```js
const hardwareConnectEl = document.getElementById('hardwareConnect');
const hardwareDisconnectEl = document.getElementById('hardwareDisconnect');
```

Modify `applyStaticStrings(m)`:

```js
  if (hardwareConnectEl) hardwareConnectEl.textContent = m.settings.hardwareConnect;
  if (hardwareDisconnectEl) hardwareDisconnectEl.textContent = m.settings.hardwareDisconnect;
  if (hardwareTestDisplayEl) {
    hardwareTestDisplayEl.textContent = m.settings.hardwareTestDisplay;
  }
```

Modify `refreshHardwareStatus(m)` base selection:

```js
    const base = st.connected
      ? m.settings.hardwareStatusConnected
      : st.started
        ? m.settings.hardwareStatusNeedsReconnect
        : m.settings.hardwareStatusDisconnected;
```

Add handlers after the hardware enable handler:

```js
if (hardwareConnectEl) {
  hardwareConnectEl.onclick = async () => {
    hardwareConnectEl.disabled = true;
    try {
      await window.combrief?.connectHardware?.();
      await refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
      if (strings) await refreshHardwareStatus(strings);
    } finally {
      hardwareConnectEl.disabled = false;
    }
  };
}

if (hardwareDisconnectEl) {
  hardwareDisconnectEl.onclick = async () => {
    hardwareDisconnectEl.disabled = true;
    try {
      await window.combrief?.disconnectHardware?.();
      await refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
      if (strings) await refreshHardwareStatus(strings);
    } finally {
      hardwareDisconnectEl.disabled = false;
    }
  };
}
```

- [ ] **Step 7: Add i18n strings**

Modify `src/main/i18n/messages.ts` for each locale:

English:

```ts
hardwareConnect: 'Connect Remote',
hardwareDisconnect: 'Disconnect',
hardwareStatusNeedsReconnect: 'Needs reconnect',
```

Chinese:

```ts
hardwareConnect: '连接遥控器',
hardwareDisconnect: '断开连接',
hardwareStatusNeedsReconnect: '需要重新连接',
```

Japanese:

```ts
hardwareConnect: 'リモコンに接続',
hardwareDisconnect: '切断',
hardwareStatusNeedsReconnect: '再接続が必要です',
```

- [ ] **Step 8: Run settings and i18n tests**

Run: `npm test -- tests/settings-renderer.test.ts tests/i18n.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit settings controls**

Run:

```bash
git add src/preload/settings-preload.ts src/renderer/settings.html src/renderer/settings.js src/main/i18n/messages.ts tests/settings-renderer.test.ts tests/i18n.test.ts
git commit -m "feat(hardware): add remote connection controls"
```

---

### Task 7: Desktop Integration Verification

**Files:**
- No source creation required if prior tasks pass.
- May modify tests if a prior static test needs alignment with final names.

- [ ] **Step 1: Run all desktop tests**

Run:

```bash
npm test
```

Expected: PASS with all test files passing.

- [ ] **Step 2: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS. `dist/renderer/hardware-bridge.html`, `dist/renderer/hardware-bridge.js`, and `dist/preload/hardware-bridge-preload.js` exist after build.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: current branch is `feature/combrief-remote-haas-edu-k1` and the working tree is clean after commits.

---

### Task 8: Firmware Project Skeleton and README

**Files:**
- Create: `firmware/haas/combrief_remote/README.md`
- Create: `firmware/haas/combrief_remote/package.yaml`
- Create: `firmware/haas/combrief_remote/SConstruct`
- Create: `firmware/haas/combrief_remote/combrief_remote.c`
- Test: `tests/firmware-haas-structure.test.ts`

- [ ] **Step 1: Write failing firmware structure test**

Create `tests/firmware-haas-structure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'firmware/haas/combrief_remote');

describe('HaaS firmware structure', () => {
  it('contains the expected project files', () => {
    for (const file of ['README.md', 'package.yaml', 'SConstruct', 'combrief_remote.c']) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });

  it('documents import, build, flash, and serial validation steps', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).toContain('HaaS Studio');
    expect(readme).toContain('solutions/combrief_remote');
    expect(readme).toContain('烧录');
    expect(readme).toContain('串口日志');
    expect(readme).toContain('ComBrief-Remote');
  });

  it('declares protocol UUIDs in the firmware entry point', () => {
    const source = readFileSync(join(root, 'combrief_remote.c'), 'utf8');
    expect(source).toContain('7b5c0001-8d4a-4c3a-9b4f-434252465001');
    expect(source).toContain('ComBrief-Remote');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/firmware-haas-structure.test.ts`

Expected: FAIL because firmware files do not exist.

- [ ] **Step 3: Create firmware README**

Create `firmware/haas/combrief_remote/README.md`:

```markdown
# ComBrief Remote for HaaS EDU K1

This directory contains the HaaS EDU K1 firmware source for ComBrief Remote.

## Hardware

- HaaS EDU K1
- USB data cable for flashing, logs, and charging
- ComBrief desktop app with ComBrief Remote enabled

## Import into HaaS Studio / AliOS Things

This repository is not a full AliOS Things workspace. To build the firmware:

1. Open the AliOS Things workspace used by HaaS Studio.
2. Copy this directory to `solutions/combrief_remote`.
3. Open the `combrief_remote` solution in HaaS Studio.
4. Select the HaaS EDU K1 board profile.
5. Build the solution.
6. Connect HaaS EDU K1 by USB.
7. Flash the firmware from HaaS Studio.
8. Open the serial log viewer.

## Expected serial log

```text
ComBrief Remote boot
BLE advertising as ComBrief-Remote
BLE connected
hello sent
state received
request received
selection sent
resolved received
```

## Desktop validation

1. Start ComBrief.
2. Open Settings.
3. Enable ComBrief Remote.
4. Click Connect Remote.
5. Select `ComBrief-Remote` in the Bluetooth picker.
6. Confirm that the settings status shows connected, firmware version, and battery.
7. Trigger a permission request from Cursor or Claude Code.
8. Use K1/K2/K3/K4 on HaaS EDU K1 to choose an option.

## Protocol

- BLE name: `ComBrief-Remote`
- Service UUID: `7b5c0001-8d4a-4c3a-9b4f-434252465001`
- host_tx UUID: `7b5c0002-8d4a-4c3a-9b4f-434252465001`
- device_tx UUID: `7b5c0003-8d4a-4c3a-9b4f-434252465001`
- Protocol version: `1`
```

- [ ] **Step 4: Create minimal package and SConstruct files**

Create `firmware/haas/combrief_remote/package.yaml`:

```yaml
name: combrief_remote
version: 0.1.0
description: ComBrief Remote firmware for HaaS EDU K1
type: solution
tag: application
keywords:
  - ble
  - oled
  - haas-edu-k1
```

Create `firmware/haas/combrief_remote/SConstruct`:

```python
import os

src = Split('''
combrief_remote.c
app_state/app_state.c
protocol/protocol.c
ble_service/ble_service.c
display/display.c
input/input.c
led/led.c
power/power.c
''')

component = aos_component('combrief_remote', src)
component.add_includes('.')
component.add_includes('app_state')
component.add_includes('protocol')
component.add_includes('ble_service')
component.add_includes('display')
component.add_includes('input')
component.add_includes('led')
component.add_includes('power')
```

Create `firmware/haas/combrief_remote/combrief_remote.c`:

```c
#include <stdio.h>

#include "app_state/app_state.h"
#include "ble_service/ble_service.h"
#include "display/display.h"
#include "input/input.h"
#include "led/led.h"
#include "power/power.h"

#define COMBRIEF_REMOTE_NAME "ComBrief-Remote"
#define COMBRIEF_REMOTE_SERVICE_UUID "7b5c0001-8d4a-4c3a-9b4f-434252465001"

int application_start(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    printf("ComBrief Remote boot\n");
    printf("BLE advertising as %s\n", COMBRIEF_REMOTE_NAME);
    printf("Service UUID %s\n", COMBRIEF_REMOTE_SERVICE_UUID);

    combrief_app_state_init();
    combrief_display_init();
    combrief_led_init();
    combrief_power_init();
    combrief_input_init();
    combrief_ble_service_start();

    while (1) {
        combrief_input_poll();
        combrief_led_tick();
        combrief_power_tick();
        combrief_display_tick();
    }

    return 0;
}
```

- [ ] **Step 5: Run structure test**

Run: `npm test -- tests/firmware-haas-structure.test.ts`

Expected: PASS. This test checks the top-level firmware project files and protocol constants; module files are validated in later firmware tasks.

- [ ] **Step 6: Commit firmware skeleton files**

Run:

```bash
git add firmware/haas/combrief_remote/README.md firmware/haas/combrief_remote/package.yaml firmware/haas/combrief_remote/SConstruct firmware/haas/combrief_remote/combrief_remote.c tests/firmware-haas-structure.test.ts
git commit -m "feat(firmware): add HaaS ComBrief Remote skeleton"
```

---

### Task 9: Firmware State and Protocol Modules

**Files:**
- Create: `firmware/haas/combrief_remote/app_state/app_state.h`
- Create: `firmware/haas/combrief_remote/app_state/app_state.c`
- Create: `firmware/haas/combrief_remote/protocol/protocol.h`
- Create: `firmware/haas/combrief_remote/protocol/protocol.c`
- Test: `tests/firmware-haas-protocol.test.ts`

- [ ] **Step 1: Write failing firmware protocol static test**

Create `tests/firmware-haas-protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'firmware/haas/combrief_remote');

describe('HaaS firmware protocol module', () => {
  it('defines protocol version and message limits matching desktop', () => {
    const header = readFileSync(join(root, 'protocol/protocol.h'), 'utf8');
    expect(header).toContain('#define COMBRIEF_PROTOCOL_VERSION 1');
    expect(header).toContain('#define COMBRIEF_MAX_BRIEF_LEN 64');
    expect(header).toContain('#define COMBRIEF_MAX_CONTENT_LEN 1024');
    expect(header).toContain('#define COMBRIEF_MAX_OPTIONS 8');
    expect(header).toContain('#define COMBRIEF_MAX_OPTION_LABEL_LEN 24');
  });

  it('can build hello and decision JSON messages', () => {
    const source = readFileSync(join(root, 'protocol/protocol.c'), 'utf8');
    expect(source).toContain('combrief_protocol_build_hello');
    expect(source).toContain('combrief_protocol_build_decision');
    expect(source).toContain('"type":"hello"');
    expect(source).toContain('"type":"decision"');
    expect(source).toContain('"platform":"haas-edu-k1"');
  });

  it('tracks summary/full display mode and current request in app state', () => {
    const header = readFileSync(join(root, 'app_state/app_state.h'), 'utf8');
    expect(header).toContain('COMBRIEF_DISPLAY_SUMMARY');
    expect(header).toContain('COMBRIEF_DISPLAY_FULL');
    expect(header).toContain('decision_id');
    expect(header).toContain('selected_option');
    expect(header).toContain('full_page');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/firmware-haas-protocol.test.ts`

Expected: FAIL because protocol and app_state files do not exist.

- [ ] **Step 3: Create app state header**

Create `firmware/haas/combrief_remote/app_state/app_state.h`:

```c
#ifndef COMBRIEF_APP_STATE_H
#define COMBRIEF_APP_STATE_H

#include <stdbool.h>
#include <stddef.h>

#define COMBRIEF_MAX_APPS 2
#define COMBRIEF_MAX_OPTIONS 8
#define COMBRIEF_MAX_TEXT 1025
#define COMBRIEF_MAX_LABEL 25
#define COMBRIEF_MAX_ID 65

typedef enum {
    COMBRIEF_DISPLAY_SUMMARY = 0,
    COMBRIEF_DISPLAY_FULL = 1,
} combrief_display_mode_t;

typedef enum {
    COMBRIEF_REMOTE_ADVERTISING = 0,
    COMBRIEF_REMOTE_CONNECTED_IDLE = 1,
    COMBRIEF_REMOTE_SHOWING_REQUEST = 2,
    COMBRIEF_REMOTE_DECISION_SENT = 3,
} combrief_remote_state_t;

typedef struct {
    char id[COMBRIEF_MAX_ID];
    char label[COMBRIEF_MAX_LABEL];
} combrief_option_t;

typedef struct {
    bool connected;
    combrief_remote_state_t remote_state;
    combrief_display_mode_t display_mode;
    char app_version[COMBRIEF_MAX_LABEL];
    char primary_status[COMBRIEF_MAX_LABEL];
    int battery;
    char decision_id[COMBRIEF_MAX_ID];
    char source_label[COMBRIEF_MAX_LABEL];
    char kind[COMBRIEF_MAX_LABEL];
    char brief[65];
    char content[COMBRIEF_MAX_TEXT];
    combrief_option_t options[COMBRIEF_MAX_OPTIONS];
    int option_count;
    int selected_option;
    int full_page;
    bool waiting_resolved;
} combrief_app_state_t;

void combrief_app_state_init(void);
combrief_app_state_t *combrief_app_state_get(void);
void combrief_app_state_set_connected(bool connected);
void combrief_app_state_clear_request(void);
void combrief_app_state_select_next(void);
void combrief_app_state_select_prev(void);
void combrief_app_state_toggle_full(void);
void combrief_app_state_next_page(void);
void combrief_app_state_prev_page(void);
void combrief_app_state_mark_decision_sent(void);

#endif
```

- [ ] **Step 4: Create app state source**

Create `firmware/haas/combrief_remote/app_state/app_state.c`:

```c
#include "app_state.h"
#include <string.h>

static combrief_app_state_t g_state;

void combrief_app_state_init(void)
{
    memset(&g_state, 0, sizeof(g_state));
    g_state.connected = false;
    g_state.remote_state = COMBRIEF_REMOTE_ADVERTISING;
    g_state.display_mode = COMBRIEF_DISPLAY_SUMMARY;
    g_state.battery = -1;
}

combrief_app_state_t *combrief_app_state_get(void)
{
    return &g_state;
}

void combrief_app_state_set_connected(bool connected)
{
    g_state.connected = connected;
    g_state.remote_state = connected ? COMBRIEF_REMOTE_CONNECTED_IDLE : COMBRIEF_REMOTE_ADVERTISING;
    if (!connected) combrief_app_state_clear_request();
}

void combrief_app_state_clear_request(void)
{
    g_state.decision_id[0] = '\0';
    g_state.source_label[0] = '\0';
    g_state.kind[0] = '\0';
    g_state.brief[0] = '\0';
    g_state.content[0] = '\0';
    memset(g_state.options, 0, sizeof(g_state.options));
    g_state.option_count = 0;
    g_state.selected_option = 0;
    g_state.full_page = 0;
    g_state.waiting_resolved = false;
    g_state.display_mode = COMBRIEF_DISPLAY_SUMMARY;
    if (g_state.connected) g_state.remote_state = COMBRIEF_REMOTE_CONNECTED_IDLE;
}

void combrief_app_state_select_next(void)
{
    if (g_state.option_count <= 0) return;
    g_state.selected_option = (g_state.selected_option + 1) % g_state.option_count;
}

void combrief_app_state_select_prev(void)
{
    if (g_state.option_count <= 0) return;
    g_state.selected_option =
        (g_state.selected_option + g_state.option_count - 1) % g_state.option_count;
}

void combrief_app_state_toggle_full(void)
{
    g_state.display_mode = g_state.display_mode == COMBRIEF_DISPLAY_SUMMARY
        ? COMBRIEF_DISPLAY_FULL
        : COMBRIEF_DISPLAY_SUMMARY;
}

void combrief_app_state_next_page(void)
{
    g_state.full_page += 1;
}

void combrief_app_state_prev_page(void)
{
    if (g_state.full_page > 0) g_state.full_page -= 1;
}

void combrief_app_state_mark_decision_sent(void)
{
    g_state.waiting_resolved = true;
    g_state.remote_state = COMBRIEF_REMOTE_DECISION_SENT;
}
```

- [ ] **Step 5: Create protocol header**

Create `firmware/haas/combrief_remote/protocol/protocol.h`:

```c
#ifndef COMBRIEF_PROTOCOL_H
#define COMBRIEF_PROTOCOL_H

#include <stddef.h>
#include <stdbool.h>
#include "../app_state/app_state.h"

#define COMBRIEF_PROTOCOL_VERSION 1
#define COMBRIEF_MAX_BRIEF_LEN 64
#define COMBRIEF_MAX_CONTENT_LEN 1024
#define COMBRIEF_MAX_OPTIONS 8
#define COMBRIEF_MAX_OPTION_LABEL_LEN 24
#define COMBRIEF_REMOTE_NAME "ComBrief-Remote"
#define COMBRIEF_REMOTE_PLATFORM "haas-edu-k1"
#define COMBRIEF_REMOTE_FW_VERSION "0.1.0"

bool combrief_protocol_build_hello(char *out, size_t out_len, int battery);
bool combrief_protocol_build_decision(char *out, size_t out_len, const char *decision_id, const char *option_id, long long ts);
bool combrief_protocol_apply_host_message(const char *json, combrief_app_state_t *state);

#endif
```

- [ ] **Step 6: Create protocol source**

Create `firmware/haas/combrief_remote/protocol/protocol.c`:

```c
#include "protocol.h"
#include <stdio.h>
#include <string.h>

static void copy_json_string_field(char *dest, size_t dest_len, const char *json, const char *key)
{
    const char *found = strstr(json, key);
    if (!found || dest_len == 0) return;
    found = strchr(found, ':');
    if (!found) return;
    found = strchr(found, '"');
    if (!found) return;
    found += 1;
    const char *end = strchr(found, '"');
    if (!end) return;
    size_t len = (size_t)(end - found);
    if (len >= dest_len) len = dest_len - 1;
    memcpy(dest, found, len);
    dest[len] = '\0';
}

bool combrief_protocol_build_hello(char *out, size_t out_len, int battery)
{
    int written = snprintf(
        out,
        out_len,
        "{\"protocol\":1,\"type\":\"hello\",\"deviceName\":\"ComBrief-Remote\",\"platform\":\"haas-edu-k1\",\"fwVersion\":\"0.1.0\",\"battery\":%d,\"capabilities\":{\"display\":\"oled\",\"keys\":[\"K1\",\"K2\",\"K3\",\"K4\"],\"briefFullToggle\":true,\"maxOptions\":8,\"maxBriefLen\":64,\"maxContentLen\":1024}}",
        battery
    );
    return written > 0 && (size_t)written < out_len;
}

bool combrief_protocol_build_decision(char *out, size_t out_len, const char *decision_id, const char *option_id, long long ts)
{
    int written = snprintf(
        out,
        out_len,
        "{\"protocol\":1,\"type\":\"decision\",\"decisionId\":\"%s\",\"optionId\":\"%s\",\"ts\":%lld}",
        decision_id,
        option_id,
        ts
    );
    return written > 0 && (size_t)written < out_len;
}

bool combrief_protocol_apply_host_message(const char *json, combrief_app_state_t *state)
{
    if (!json || !state) return false;
    if (strstr(json, "\"protocol\":1") == NULL) return false;

    if (strstr(json, "\"type\":\"state\"") != NULL) {
        copy_json_string_field(state->app_version, sizeof(state->app_version), json, "appVersion");
        copy_json_string_field(state->primary_status, sizeof(state->primary_status), json, "status");
        return true;
    }

    if (strstr(json, "\"type\":\"request\"") != NULL) {
        copy_json_string_field(state->decision_id, sizeof(state->decision_id), json, "decisionId");
        copy_json_string_field(state->source_label, sizeof(state->source_label), json, "sourceLabel");
        copy_json_string_field(state->kind, sizeof(state->kind), json, "kind");
        copy_json_string_field(state->brief, sizeof(state->brief), json, "brief");
        copy_json_string_field(state->content, sizeof(state->content), json, "content");
        state->option_count = 2;
        strncpy(state->options[0].id, "allow", sizeof(state->options[0].id) - 1);
        strncpy(state->options[0].label, "Allow", sizeof(state->options[0].label) - 1);
        strncpy(state->options[1].id, "deny", sizeof(state->options[1].id) - 1);
        strncpy(state->options[1].label, "Deny", sizeof(state->options[1].label) - 1);
        state->selected_option = 0;
        state->full_page = 0;
        state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
        state->remote_state = COMBRIEF_REMOTE_SHOWING_REQUEST;
        state->waiting_resolved = false;
        return true;
    }

    if (strstr(json, "\"type\":\"resolved\"") != NULL) {
        combrief_app_state_clear_request();
        return true;
    }

    return false;
}
```

- [ ] **Step 7: Run firmware protocol test**

Run: `npm test -- tests/firmware-haas-protocol.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit firmware state and protocol**

Run:

```bash
git add firmware/haas/combrief_remote/app_state firmware/haas/combrief_remote/protocol tests/firmware-haas-protocol.test.ts
git commit -m "feat(firmware): add HaaS state and protocol modules"
```

---

### Task 10: Firmware BLE, Display, Input, LED, and Power Modules

**Files:**
- Create: `firmware/haas/combrief_remote/ble_service/ble_service.h`
- Create: `firmware/haas/combrief_remote/ble_service/ble_service.c`
- Create: `firmware/haas/combrief_remote/display/display.h`
- Create: `firmware/haas/combrief_remote/display/display.c`
- Create: `firmware/haas/combrief_remote/input/input.h`
- Create: `firmware/haas/combrief_remote/input/input.c`
- Create: `firmware/haas/combrief_remote/led/led.h`
- Create: `firmware/haas/combrief_remote/led/led.c`
- Create: `firmware/haas/combrief_remote/power/power.h`
- Create: `firmware/haas/combrief_remote/power/power.c`
- Test: `tests/firmware-haas-modules.test.ts`

- [ ] **Step 1: Write failing firmware module static test**

Create `tests/firmware-haas-modules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'firmware/haas/combrief_remote');

describe('HaaS firmware modules', () => {
  it('contains BLE, display, input, led, and power modules', () => {
    for (const dir of ['ble_service', 'display', 'input', 'led', 'power']) {
      expect(existsSync(join(root, dir, `${dir}.h`)) || existsSync(join(root, dir, `${dir.replace('_service', '')}.h`))).toBe(true);
    }
  });

  it('BLE service advertises ComBrief Remote and sends hello', () => {
    const source = readFileSync(join(root, 'ble_service/ble_service.c'), 'utf8');
    expect(source).toContain('ComBrief-Remote');
    expect(source).toContain('7b5c0001-8d4a-4c3a-9b4f-434252465001');
    expect(source).toContain('combrief_protocol_build_hello');
    expect(source).toContain('combrief_ble_send_json');
  });

  it('input maps K1 through K4 to selection, paging, and decision', () => {
    const source = readFileSync(join(root, 'input/input.c'), 'utf8');
    expect(source).toContain('COMBRIEF_KEY_K1');
    expect(source).toContain('COMBRIEF_KEY_K2');
    expect(source).toContain('COMBRIEF_KEY_K3');
    expect(source).toContain('COMBRIEF_KEY_K4');
    expect(source).toContain('combrief_protocol_build_decision');
  });

  it('LED module encodes the required priority states', () => {
    const source = readFileSync(join(root, 'led/led.c'), 'utf8');
    expect(source).toContain('red');
    expect(source).toContain('green');
    expect(source).toContain('blue');
    expect(source).toContain('COMBRIEF_REMOTE_SHOWING_REQUEST');
    expect(source).toContain('COMBRIEF_REMOTE_ADVERTISING');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/firmware-haas-modules.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Create BLE service module**

Create `firmware/haas/combrief_remote/ble_service/ble_service.h`:

```c
#ifndef COMBRIEF_BLE_SERVICE_H
#define COMBRIEF_BLE_SERVICE_H

void combrief_ble_service_start(void);
void combrief_ble_send_json(const char *json);
void combrief_ble_handle_host_write(const char *json);

#endif
```

Create `firmware/haas/combrief_remote/ble_service/ble_service.c`:

```c
#include "ble_service.h"
#include "../app_state/app_state.h"
#include "../protocol/protocol.h"
#include <stdio.h>

#define COMBRIEF_BLE_NAME "ComBrief-Remote"
#define COMBRIEF_SERVICE_UUID "7b5c0001-8d4a-4c3a-9b4f-434252465001"
#define COMBRIEF_HOST_TX_UUID "7b5c0002-8d4a-4c3a-9b4f-434252465001"
#define COMBRIEF_DEVICE_TX_UUID "7b5c0003-8d4a-4c3a-9b4f-434252465001"

void combrief_ble_send_json(const char *json)
{
    printf("BLE notify: %s\n", json);
}

void combrief_ble_service_start(void)
{
    char hello[512];
    printf("BLE advertising as %s\n", COMBRIEF_BLE_NAME);
    printf("BLE service %s host_tx %s device_tx %s\n", COMBRIEF_SERVICE_UUID, COMBRIEF_HOST_TX_UUID, COMBRIEF_DEVICE_TX_UUID);
    combrief_app_state_set_connected(true);
    if (combrief_protocol_build_hello(hello, sizeof(hello), 78)) {
        combrief_ble_send_json(hello);
        printf("hello sent\n");
    }
}

void combrief_ble_handle_host_write(const char *json)
{
    if (combrief_protocol_apply_host_message(json, combrief_app_state_get())) {
        printf("host message accepted\n");
    } else {
        printf("host message ignored\n");
    }
}
```

- [ ] **Step 4: Create display module**

Create `firmware/haas/combrief_remote/display/display.h`:

```c
#ifndef COMBRIEF_DISPLAY_H
#define COMBRIEF_DISPLAY_H

void combrief_display_init(void);
void combrief_display_tick(void);

#endif
```

Create `firmware/haas/combrief_remote/display/display.c`:

```c
#include "display.h"
#include "../app_state/app_state.h"
#include <stdio.h>

void combrief_display_init(void)
{
    printf("Display init\n");
}

void combrief_display_tick(void)
{
    combrief_app_state_t *state = combrief_app_state_get();
    if (!state->connected) {
        printf("OLED: ComBrief Remote | Waiting BLE...\n");
        return;
    }
    if (state->remote_state == COMBRIEF_REMOTE_SHOWING_REQUEST || state->remote_state == COMBRIEF_REMOTE_DECISION_SENT) {
        if (state->display_mode == COMBRIEF_DISPLAY_FULL) {
            printf("OLED: %s %s %d | %.32s\n", state->source_label, state->kind, state->full_page + 1, state->content);
        } else {
            const char *label = state->option_count > 0 ? state->options[state->selected_option].label : "";
            printf("OLED: %s %s | %.32s | > %s\n", state->source_label, state->kind, state->brief, label);
        }
        if (state->waiting_resolved) printf("OLED: Waiting host...\n");
        return;
    }
    printf("OLED: ComBrief v%s | %s | Batt %d%%\n", state->app_version, state->primary_status, state->battery);
}
```

- [ ] **Step 5: Create input module**

Create `firmware/haas/combrief_remote/input/input.h`:

```c
#ifndef COMBRIEF_INPUT_H
#define COMBRIEF_INPUT_H

typedef enum {
    COMBRIEF_KEY_NONE = 0,
    COMBRIEF_KEY_K1,
    COMBRIEF_KEY_K2,
    COMBRIEF_KEY_K3,
    COMBRIEF_KEY_K4,
} combrief_key_t;

void combrief_input_init(void);
void combrief_input_poll(void);
void combrief_input_handle_key(combrief_key_t key);

#endif
```

Create `firmware/haas/combrief_remote/input/input.c`:

```c
#include "input.h"
#include "../app_state/app_state.h"
#include "../ble_service/ble_service.h"
#include "../protocol/protocol.h"
#include <stdio.h>
#include <time.h>

void combrief_input_init(void)
{
    printf("Input init\n");
}

void combrief_input_poll(void)
{
}

void combrief_input_handle_key(combrief_key_t key)
{
    combrief_app_state_t *state = combrief_app_state_get();
    if (state->remote_state != COMBRIEF_REMOTE_SHOWING_REQUEST) return;

    if (state->display_mode == COMBRIEF_DISPLAY_FULL) {
        if (key == COMBRIEF_KEY_K1 || key == COMBRIEF_KEY_K3) combrief_app_state_toggle_full();
        if (key == COMBRIEF_KEY_K2) combrief_app_state_prev_page();
        if (key == COMBRIEF_KEY_K4) combrief_app_state_next_page();
        return;
    }

    if (key == COMBRIEF_KEY_K2) combrief_app_state_select_prev();
    if (key == COMBRIEF_KEY_K3) combrief_app_state_toggle_full();
    if (key == COMBRIEF_KEY_K4) combrief_app_state_select_next();
    if (key == COMBRIEF_KEY_K1 && state->option_count > 0) {
        char decision[256];
        const char *option_id = state->options[state->selected_option].id;
        if (combrief_protocol_build_decision(decision, sizeof(decision), state->decision_id, option_id, (long long)time(NULL) * 1000)) {
            combrief_ble_send_json(decision);
            combrief_app_state_mark_decision_sent();
            printf("selection sent\n");
        }
    }
}
```

- [ ] **Step 6: Create LED and power modules**

Create `firmware/haas/combrief_remote/led/led.h`:

```c
#ifndef COMBRIEF_LED_H
#define COMBRIEF_LED_H

void combrief_led_init(void);
void combrief_led_tick(void);

#endif
```

Create `firmware/haas/combrief_remote/led/led.c`:

```c
#include "led.h"
#include "../app_state/app_state.h"
#include <stdio.h>

void combrief_led_init(void)
{
    printf("LED init\n");
}

void combrief_led_tick(void)
{
    combrief_app_state_t *state = combrief_app_state_get();
    if (state->remote_state == COMBRIEF_REMOTE_ADVERTISING) {
        printf("LED red green blue chase\n");
        return;
    }
    if (state->remote_state == COMBRIEF_REMOTE_SHOWING_REQUEST || state->remote_state == COMBRIEF_REMOTE_DECISION_SENT) {
        printf("LED red fast blink\n");
        return;
    }
    if (state->primary_status[0] != '\0' && state->primary_status[0] == 'w') {
        printf("LED blue breathe\n");
        return;
    }
    printf("LED green solid\n");
}
```

Create `firmware/haas/combrief_remote/power/power.h`:

```c
#ifndef COMBRIEF_POWER_H
#define COMBRIEF_POWER_H

void combrief_power_init(void);
void combrief_power_tick(void);
int combrief_power_battery_percent(void);

#endif
```

Create `firmware/haas/combrief_remote/power/power.c`:

```c
#include "power.h"
#include "../app_state/app_state.h"

void combrief_power_init(void)
{
    combrief_app_state_get()->battery = 78;
}

void combrief_power_tick(void)
{
}

int combrief_power_battery_percent(void)
{
    return combrief_app_state_get()->battery;
}
```

- [ ] **Step 7: Run firmware module and structure tests**

Run:

```bash
npm test -- tests/firmware-haas-modules.test.ts tests/firmware-haas-structure.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit firmware modules**

Run:

```bash
git add firmware/haas/combrief_remote/ble_service firmware/haas/combrief_remote/display firmware/haas/combrief_remote/input firmware/haas/combrief_remote/led firmware/haas/combrief_remote/power tests/firmware-haas-modules.test.ts
git commit -m "feat(firmware): add HaaS remote runtime modules"
```

---

### Task 11: End-to-End Manual Validation Guide

**Files:**
- Create: `docs/guides/combrief-remote-haas-validation.md`
- Test: `tests/combrief-remote-haas-guide.test.ts`

- [ ] **Step 1: Write failing guide test**

Create `tests/combrief-remote-haas-guide.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ComBrief Remote HaaS validation guide', () => {
  it('documents desktop, firmware, and end-to-end validation steps', () => {
    const guide = readFileSync(join(process.cwd(), 'docs/guides/combrief-remote-haas-validation.md'), 'utf8');
    for (const text of [
      'npm test',
      'npm run build',
      'HaaS Studio',
      '烧录',
      'ComBrief-Remote',
      'Connect Remote',
      'K1',
      'K2',
      'K3',
      'K4',
      'resolved',
      'Slack',
    ]) {
      expect(guide).toContain(text);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/combrief-remote-haas-guide.test.ts`

Expected: FAIL because validation guide does not exist.

- [ ] **Step 3: Create validation guide**

Create `docs/guides/combrief-remote-haas-validation.md`:

```markdown
# ComBrief Remote HaaS EDU K1 Validation Guide

## 1. Desktop validation

Run:

```bash
npm test
npm run build
```

Expected result:

- All Vitest tests pass.
- TypeScript build passes.
- `dist/renderer/hardware-bridge.html` exists.
- `dist/renderer/hardware-bridge.js` exists.
- `dist/preload/hardware-bridge-preload.js` exists.

## 2. Firmware import and flash

1. Open HaaS Studio.
2. Copy `firmware/haas/combrief_remote` to `solutions/combrief_remote` in the AliOS Things workspace.
3. Select HaaS EDU K1 as the target board.
4. Build the `combrief_remote` solution.
5. Connect HaaS EDU K1 by USB.
6. 烧录 the firmware.
7. Open 串口日志.

Expected serial log includes:

```text
ComBrief Remote boot
BLE advertising as ComBrief-Remote
hello sent
```

## 3. BLE connection

1. Start ComBrief.
2. Open Settings.
3. Enable ComBrief Remote.
4. Click Connect Remote.
5. Select `ComBrief-Remote`.
6. Confirm status shows connected, firmware version, and battery.

## 4. Request confirmation

1. Trigger a Cursor or Claude Code permission request.
2. Confirm the HaaS OLED shows the source, kind, brief text, and options.
3. Press K2 and K4 to move the selected option.
4. Press K3 to switch between summary and full content.
5. Press K1 to submit the selected option.
6. Confirm the ComBrief hook is released.
7. Confirm HaaS returns to the status page after `resolved`.

## 5. Race validation

1. Trigger another request.
2. Resolve it from Slack before pressing K1 on HaaS.
3. Confirm HaaS shows handled elsewhere or returns to the status page.
4. Trigger another request.
5. Resolve it from HaaS first.
6. Confirm Slack updates to show the request was handled.
```

- [ ] **Step 4: Run guide test**

Run: `npm test -- tests/combrief-remote-haas-guide.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit validation guide**

Run:

```bash
git add docs/guides/combrief-remote-haas-validation.md tests/combrief-remote-haas-guide.test.ts
git commit -m "docs(hardware): add HaaS validation guide"
```

---

### Task 12: Full Verification and Final Commit Check

**Files:**
- No source creation required if prior tasks pass.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Check branch status**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected:

- Branch is `feature/combrief-remote-haas-edu-k1`.
- Working tree is clean.
- Recent commits include desktop bridge, settings controls, firmware modules, and validation guide.

- [ ] **Step 4: Manual validation note**

Record the current manual validation state in the task summary:

```text
Desktop automated validation: npm test PASS, npm run build PASS.
HaaS toolchain state: device available, toolchain setup still required before flash.
Manual hardware validation: pending until HaaS Studio / AliOS Things build and flash are complete.
```

## Execution Notes

- Keep `MockHardwareTransport` in the repository. It remains the unit-test and no-device development transport.
- Do not introduce native BLE packages in this phase.
- Do not add BLE chunking in this phase. If Web Bluetooth writes fail because payloads are too large, reduce `content` length and document the observed byte limit.
- Keep all BLE-originated JSON behind existing protocol guards before forwarding to `DecisionService`.
- The firmware parser in this plan is intentionally simple for first hardware bring-up. If AliOS provides a JSON parser in the configured toolchain, replace the string-field extraction with that parser during execution and keep the externally visible behavior unchanged.
