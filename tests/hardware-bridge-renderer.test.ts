import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string): string {
  const fullPath = join(process.cwd(), path);
  expect(existsSync(fullPath), `${path} should exist`).toBe(true);
  return existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : '';
}

function extractBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  expect(start, `${marker} should exist`).toBeGreaterThanOrEqual(0);

  const open = source.indexOf('{', start);
  expect(open, `${marker} should have a block`).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`${marker} block was not closed`);
}

function createBridgeDocument() {
  const clickHandlers = new Map<string, () => void>();
  const elements = new Map<string, { textContent: string; disabled?: boolean; addEventListener?: (event: string, handler: () => void) => void }>([
    [
      'connect-button',
      {
        textContent: '',
        disabled: false,
        addEventListener(event, handler) {
          if (event === 'click') clickHandlers.set('connect-button', handler);
        },
      },
    ],
    ['bridge-status', { textContent: '' }],
  ]);

  return {
    document: {
      getElementById(id: string) {
        return elements.get(id) ?? null;
      },
    },
    getConnectButton() {
      return elements.get('connect-button') ?? null;
    },
    clickConnect() {
      clickHandlers.get('connect-button')?.();
    },
  };
}

describe('hardware bridge renderer assets', () => {
  it('exposes a bridge-only preload API on window.combriefHardwareBridge', () => {
    const preload = readProjectFile('src/preload/hardware-bridge-preload.ts');

    expect(preload).toContain("contextBridge.exposeInMainWorld('combriefHardwareBridge'");
    expect(preload).toContain('onStartScan');
    expect(preload).toContain('onConnect');
    expect(preload).toContain('onDisconnect');
    expect(preload).toContain('onSendHostMessage');
    expect(preload).toContain('sendReady');
    expect(preload).toContain('sendStatus');
    expect(preload).toContain('sendDeviceMessage');
    expect(preload).toContain('sendError');
    expect(preload).toContain('ipcRenderer.on');
    expect(preload).toContain('ipcRenderer.off');
    expect(preload).toContain('HARDWARE_BRIDGE_CHANNELS');
    expect(preload).not.toContain("exposeInMainWorld('combrief'");
    expect(preload).not.toContain('listApps');
    expect(preload).not.toContain('setConfig');
  });

  it('forwards only object payloads for host messages from preload', () => {
    const preload = readProjectFile('src/preload/hardware-bridge-preload.ts');
    const objectCommandBlock = extractBlock(preload, 'function onBridgeObjectCommand');

    expect(objectCommandBlock).toContain('if (isObject(payload))');
    expect(objectCommandBlock).toContain('handler(payload);');
    expect(preload).toContain(
      'onSendHostMessage: (handler: BridgeHandler) => onBridgeObjectCommand(HARDWARE_BRIDGE_CHANNELS.sendHostMessage, handler)',
    );
  });

  it('loads the hardware bridge renderer script and pairing controls', () => {
    const html = readProjectFile('src/renderer/hardware-bridge.html');

    expect(html).toContain('<script src="hardware-bridge.js"></script>');
    expect(html).toContain('id="connect-button"');
    expect(html).toContain('Connect ComBrief Remote');
    expect(html).toContain('id="bridge-status"');
  });

  it('copies hardware bridge renderer assets into the renderer output directory', () => {
    const copyScript = readProjectFile('scripts/copy-extensions.mjs');
    const rendererCopyBlock = extractBlock(copyScript, 'for (const file of [');

    expect(copyScript).toContain("const rendererOut = join(root, 'dist', 'renderer');");
    expect(copyScript).toContain('mkdirSync(rendererOut, { recursive: true });');
    expect(rendererCopyBlock).toContain("'hardware-bridge.html'");
    expect(rendererCopyBlock).toContain("'hardware-bridge.js'");
    expect(rendererCopyBlock).toContain("const src = join(root, 'src', 'renderer', file);");
    expect(rendererCopyBlock).toContain('cpSync(src, join(rendererOut, file));');
  });

  it('signals ready after registering bridge command listeners', () => {
    const preload = readProjectFile('src/preload/hardware-bridge-preload.ts');
    const renderer = readProjectFile('src/renderer/hardware-bridge.js');

    expect(preload).toContain('sendReady');
    expect(preload).toContain('ipcRenderer.send(HARDWARE_BRIDGE_CHANNELS.ready)');
    expect(renderer).toContain('window.combriefHardwareBridge?.sendReady?.();');
    expect(renderer.indexOf('window.combriefHardwareBridge?.sendReady?.();')).toBeGreaterThan(
      renderer.indexOf('window.combriefHardwareBridge?.onSendHostMessage'),
    );
  });

  it('uses Web Bluetooth with the ComBrief remote service and characteristics', () => {
    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const connectOnceBlock = extractBlock(renderer, 'async function connectOnce(activeEpoch)');

    expect(renderer).toContain("const SERVICE_UUID = '7b5c0001-8d4a-4c3a-9b4f-434252465001'");
    expect(renderer).toContain("const HOST_TX_UUID = '7b5c0002-8d4a-4c3a-9b4f-434252465001'");
    expect(renderer).toContain("const DEVICE_TX_UUID = '7b5c0003-8d4a-4c3a-9b4f-434252465001'");
    expect(renderer).toContain('TextEncoder');
    expect(renderer).toContain('TextDecoder');
    expect(connectOnceBlock).toContain('navigator.bluetooth.requestDevice');
    expect(connectOnceBlock).toContain('filters: [{ name: REMOTE_NAME, services: [SERVICE_UUID] }]');
    expect(connectOnceBlock).toContain('optionalServices: [SERVICE_UUID]');
    expect(connectOnceBlock).toContain('getPrimaryService(SERVICE_UUID)');
    expect(connectOnceBlock).toContain('getCharacteristic(HOST_TX_UUID)');
    expect(connectOnceBlock).toContain('getCharacteristic(DEVICE_TX_UUID)');
    expect(connectOnceBlock).toContain('startNotifications');
  });

  it('only starts Web Bluetooth from the pairing button click handler', () => {
    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const startScanBlock = extractBlock(renderer, 'window.combriefHardwareBridge?.onStartScan');
    const connectCommandBlock = extractBlock(renderer, 'window.combriefHardwareBridge?.onConnect');

    expect(startScanBlock).not.toContain('connect()');
    expect(startScanBlock).not.toContain('requestDevice');
    expect(connectCommandBlock).not.toContain('connect()');
    expect(connectCommandBlock).not.toContain('requestDevice');
    expect(renderer).toContain("const connectButton = document.getElementById('connect-button');");
    expect(renderer).toContain("connectButton?.addEventListener('click'");
  });

  it('guards concurrent connect requests with a shared in-flight promise', () => {
    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const connectBlock = extractBlock(renderer, 'async function connect()');

    expect(renderer).toContain('let connectPromise = null;');
    expect(connectBlock).toContain('if (connectPromise)');
    expect(connectBlock).toContain('return connectPromise;');
    expect(connectBlock).toContain('const activeEpoch = connectionEpoch + 1;');
    expect(connectBlock).toContain('connectionEpoch = activeEpoch;');
    expect(connectBlock).toContain('connectPromise = connectOnce(activeEpoch)');
    expect(connectBlock).toContain('const activePromise = connectPromise;');
    expect(connectBlock).toContain('finally');
    expect(connectBlock).toContain('if (connectPromise === activePromise)');
    expect(connectBlock).toContain('connectPromise = null;');
  });

  it('disables the pairing button only while pairing is in progress', async () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }

    function flush(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const callbacks = new Map<string, (payload?: unknown) => void>();
    const bridgeDocument = createBridgeDocument();
    const request = deferred<unknown>();
    const context = createContext({
      TextDecoder,
      TextEncoder,
      setTimeout,
      document: bridgeDocument.document,
      navigator: {
        bluetooth: {
          requestDevice: async () => request.promise,
        },
      },
      window: {
        combriefHardwareBridge: {
          onStartScan: (handler: (payload?: unknown) => void) => callbacks.set('startScan', handler),
          onConnect: (handler: (payload?: unknown) => void) => callbacks.set('connect', handler),
          onDisconnect: (handler: (payload?: unknown) => void) => callbacks.set('disconnect', handler),
          onSendHostMessage: (handler: (payload?: unknown) => void) => callbacks.set('sendHostMessage', handler),
          sendStatus: () => undefined,
          sendDeviceMessage: () => undefined,
          sendError: () => undefined,
        },
      },
    });

    new Script(renderer).runInContext(context);

    expect(bridgeDocument.getConnectButton()?.disabled).toBe(false);

    bridgeDocument.clickConnect();
    await flush();

    expect(bridgeDocument.getConnectButton()?.disabled).toBe(true);

    request.resolve({
      name: 'remote',
      gatt: {
        async connect() {
          throw new Error('pairing failed');
        },
      },
      addEventListener: () => undefined,
    });
    await flush();
    await flush();

    expect(bridgeDocument.getConnectButton()?.disabled).toBe(false);
  });

  it('cancels stale in-flight connects before they can publish connected status', () => {
    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const connectOnceBlock = extractBlock(renderer, 'async function connectOnce(activeEpoch)');
    const disconnectBlock = extractBlock(renderer, 'function disconnect()');

    expect(renderer).toContain('let connectionEpoch = 0;');
    expect(renderer).toContain('function isCurrentConnection(activeEpoch)');
    expect(renderer).toContain('function abortStaleConnection(activeEpoch, resources)');
    expect(renderer).toContain('function cleanupConnectionResources(resources)');
    expect(renderer).toContain('function publishConnectionResources(resources)');
    expect(disconnectBlock).toContain('connectionEpoch += 1;');
    expect(disconnectBlock).toContain('connectPromise = null;');
    expect(connectOnceBlock).toContain('abortStaleConnection(activeEpoch, resources)');
    expect(connectOnceBlock.match(/abortStaleConnection\(activeEpoch, resources\)/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(connectOnceBlock).toContain('connected: true');
    expect(connectOnceBlock).toContain('if (!isCurrentConnection(activeEpoch))');
  });

  it('does not let a stale connect cleanup disconnect the newer active connection', async () => {
    type Deferred<T> = {
      promise: Promise<T>;
      resolve: (value: T) => void;
    };
    type FakeCharacteristic = {
      addEventListener: (event: string, listener: unknown) => void;
      removeEventListener: (event: string, listener: unknown) => void;
      listeners: Map<string, Set<unknown>>;
      removed: Array<{ event: string; listener: unknown }>;
      startNotifications: () => Promise<void>;
      writeValueWithoutResponse: () => Promise<void>;
    };
    type FakeDevice = {
      name: string;
      gatt: {
        connected: boolean;
        connect: () => Promise<unknown>;
        disconnect: () => void;
        disconnectCalls: number;
      };
      addEventListener: (event: string, listener: unknown) => void;
      removeEventListener: (event: string, listener: unknown) => void;
      listeners: Map<string, Set<unknown>>;
      removed: Array<{ event: string; listener: unknown }>;
    };

    function deferred<T>(): Deferred<T> {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }

    function flush(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    function createCharacteristic(): FakeCharacteristic {
      const listeners = new Map<string, Set<unknown>>();
      return {
        listeners,
        removed: [],
        addEventListener(event: string, listener: unknown) {
          const eventListeners = listeners.get(event) ?? new Set<unknown>();
          eventListeners.add(listener);
          listeners.set(event, eventListeners);
        },
        removeEventListener(event: string, listener: unknown) {
          this.removed.push({ event, listener });
          listeners.get(event)?.delete(listener);
        },
        startNotifications: async () => undefined,
        writeValueWithoutResponse: async () => undefined,
      };
    }

    function createServer(hostTx: FakeCharacteristic, deviceTx: FakeCharacteristic) {
      return {
        async getPrimaryService() {
          return {
            async getCharacteristic(uuid: string) {
              return uuid.startsWith('7b5c0002') ? hostTx : deviceTx;
            },
          };
        },
      };
    }

    function createDevice(name: string, connectPromise: Promise<unknown>): FakeDevice {
      const listeners = new Map<string, Set<unknown>>();
      const gatt = {
        connected: false,
        disconnectCalls: 0,
        async connect() {
          const server = await connectPromise;
          gatt.connected = true;
          return server;
        },
        disconnect() {
          gatt.disconnectCalls += 1;
          gatt.connected = false;
        },
      };

      return {
        name,
        gatt,
        listeners,
        removed: [],
        addEventListener(event: string, listener: unknown) {
          const eventListeners = listeners.get(event) ?? new Set<unknown>();
          eventListeners.add(listener);
          listeners.set(event, eventListeners);
        },
        removeEventListener(event: string, listener: unknown) {
          this.removed.push({ event, listener });
          listeners.get(event)?.delete(listener);
        },
      };
    }

    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const callbacks = new Map<string, (payload?: unknown) => void>();
    const statuses: Array<Record<string, unknown>> = [];
    const oldGatt = deferred<unknown>();
    const oldHostTx = createCharacteristic();
    const oldDeviceTx = createCharacteristic();
    const oldServer = createServer(oldHostTx, oldDeviceTx);
    const oldDevice = createDevice('old-remote', oldGatt.promise);
    const newHostTx = createCharacteristic();
    const newDeviceTx = createCharacteristic();
    const newServer = createServer(newHostTx, newDeviceTx);
    const newDevice = createDevice('new-remote', Promise.resolve(newServer));
    const requestDevices = [oldDevice, newDevice];
    const bridgeDocument = createBridgeDocument();

    const context = createContext({
      TextDecoder,
      TextEncoder,
      setTimeout,
      document: bridgeDocument.document,
      navigator: {
        bluetooth: {
          requestDevice: async () => {
            const nextDevice = requestDevices.shift();
            if (!nextDevice) throw new Error('no fake device queued');
            return nextDevice;
          },
        },
      },
      window: {
        combriefHardwareBridge: {
          onStartScan: (handler: (payload?: unknown) => void) => callbacks.set('startScan', handler),
          onConnect: (handler: (payload?: unknown) => void) => callbacks.set('connect', handler),
          onDisconnect: (handler: (payload?: unknown) => void) => callbacks.set('disconnect', handler),
          onSendHostMessage: (handler: (payload?: unknown) => void) => callbacks.set('sendHostMessage', handler),
          sendStatus: (status: Record<string, unknown>) => statuses.push(status),
          sendDeviceMessage: () => undefined,
          sendError: () => undefined,
        },
      },
    });

    new Script(renderer).runInContext(context);

    bridgeDocument.clickConnect();
    await flush();
    callbacks.get('disconnect')?.();
    bridgeDocument.clickConnect();
    await flush();
    expect(newDevice.gatt.connected).toBe(true);
    expect(newDeviceTx.listeners.get('characteristicvaluechanged')?.size).toBe(1);

    oldGatt.resolve(oldServer);
    await flush();

    expect(newDevice.gatt.disconnectCalls).toBe(0);
    expect(newDeviceTx.removed).toHaveLength(0);
    expect(newDeviceTx.listeners.get('characteristicvaluechanged')?.size).toBe(1);
    expect(statuses.filter((status) => status.connected === true)).toHaveLength(1);
    expect(statuses.filter((status) => status.connected === true).at(0)?.deviceName).toBe('new-remote');
  });

  it('ignores stale device disconnect events after a newer connection is active', async () => {
    type Deferred<T> = {
      promise: Promise<T>;
      resolve: (value: T) => void;
    };
    type FakeCharacteristic = {
      addEventListener: (event: string, listener: unknown) => void;
      removeEventListener: (event: string, listener: unknown) => void;
      listeners: Map<string, Set<unknown>>;
      removed: Array<{ event: string; listener: unknown }>;
      startNotifications: () => Promise<void>;
      writeValueWithoutResponse: () => Promise<void>;
    };
    type FakeDevice = {
      name: string;
      gatt: {
        connected: boolean;
        connect: () => Promise<unknown>;
        disconnect: () => void;
        disconnectCalls: number;
      };
      addEventListener: (event: string, listener: unknown) => void;
      removeEventListener: (event: string, listener: unknown) => void;
      listeners: Map<string, Set<unknown>>;
      removed: Array<{ event: string; listener: unknown }>;
    };

    function deferred<T>(): Deferred<T> {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }

    function flush(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    function createCharacteristic(): FakeCharacteristic {
      const listeners = new Map<string, Set<unknown>>();
      return {
        listeners,
        removed: [],
        addEventListener(event: string, listener: unknown) {
          const eventListeners = listeners.get(event) ?? new Set<unknown>();
          eventListeners.add(listener);
          listeners.set(event, eventListeners);
        },
        removeEventListener(event: string, listener: unknown) {
          this.removed.push({ event, listener });
          listeners.get(event)?.delete(listener);
        },
        startNotifications: async () => undefined,
        writeValueWithoutResponse: async () => undefined,
      };
    }

    function createServer(hostTx: FakeCharacteristic, deviceTx: FakeCharacteristic) {
      return {
        async getPrimaryService() {
          return {
            async getCharacteristic(uuid: string) {
              return uuid.startsWith('7b5c0002') ? hostTx : deviceTx;
            },
          };
        },
      };
    }

    function createDevice(name: string, connectPromise: Promise<unknown>): FakeDevice {
      const listeners = new Map<string, Set<unknown>>();
      const gatt = {
        connected: false,
        disconnectCalls: 0,
        async connect() {
          const server = await connectPromise;
          gatt.connected = true;
          return server;
        },
        disconnect() {
          gatt.disconnectCalls += 1;
          gatt.connected = false;
        },
      };

      return {
        name,
        gatt,
        listeners,
        removed: [],
        addEventListener(event: string, listener: unknown) {
          const eventListeners = listeners.get(event) ?? new Set<unknown>();
          eventListeners.add(listener);
          listeners.set(event, eventListeners);
        },
        removeEventListener(event: string, listener: unknown) {
          this.removed.push({ event, listener });
          listeners.get(event)?.delete(listener);
        },
      };
    }

    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const callbacks = new Map<string, (payload?: unknown) => void>();
    const statuses: Array<Record<string, unknown>> = [];
    const oldGatt = deferred<unknown>();
    const oldHostTx = createCharacteristic();
    const oldDeviceTx = createCharacteristic();
    const oldServer = createServer(oldHostTx, oldDeviceTx);
    const oldDevice = createDevice('old-remote', oldGatt.promise);
    const newHostTx = createCharacteristic();
    const newDeviceTx = createCharacteristic();
    const newServer = createServer(newHostTx, newDeviceTx);
    const newDevice = createDevice('new-remote', Promise.resolve(newServer));
    const requestDevices = [oldDevice, newDevice];
    const bridgeDocument = createBridgeDocument();

    const context = createContext({
      TextDecoder,
      TextEncoder,
      setTimeout,
      document: bridgeDocument.document,
      navigator: {
        bluetooth: {
          requestDevice: async () => {
            const nextDevice = requestDevices.shift();
            if (!nextDevice) throw new Error('no fake device queued');
            return nextDevice;
          },
        },
      },
      window: {
        combriefHardwareBridge: {
          onStartScan: (handler: (payload?: unknown) => void) => callbacks.set('startScan', handler),
          onConnect: (handler: (payload?: unknown) => void) => callbacks.set('connect', handler),
          onDisconnect: (handler: (payload?: unknown) => void) => callbacks.set('disconnect', handler),
          onSendHostMessage: (handler: (payload?: unknown) => void) => callbacks.set('sendHostMessage', handler),
          sendStatus: (status: Record<string, unknown>) => statuses.push(status),
          sendDeviceMessage: () => undefined,
          sendError: () => undefined,
        },
      },
    });

    new Script(renderer).runInContext(context);

    bridgeDocument.clickConnect();
    await flush();
    const oldDisconnectListener = oldDevice.listeners.get('gattserverdisconnected')?.values().next().value;
    expect(oldDisconnectListener).toBeTypeOf('function');

    callbacks.get('disconnect')?.();
    bridgeDocument.clickConnect();
    await flush();
    expect(newDevice.gatt.connected).toBe(true);
    expect(newDeviceTx.listeners.get('characteristicvaluechanged')?.size).toBe(1);
    const disconnectedCountBefore = statuses.filter((status) => status.connected === false).length;

    (oldDisconnectListener as () => void)();
    await flush();

    expect(newDevice.gatt.disconnectCalls).toBe(0);
    expect(newDeviceTx.removed).toHaveLength(0);
    expect(newDeviceTx.listeners.get('characteristicvaluechanged')?.size).toBe(1);
    expect(statuses.filter((status) => status.connected === false)).toHaveLength(disconnectedCountBefore);
    expect(statuses.filter((status) => status.connected === true)).toHaveLength(1);
    expect(statuses.filter((status) => status.connected === true).at(0)?.deviceName).toBe('new-remote');

    oldGatt.resolve(oldServer);
    await flush();
  });

  it('parses notification JSON before forwarding device messages', () => {
    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const notificationBlock = extractBlock(renderer, 'function handleDeviceNotification');

    expect(notificationBlock).toContain('const text = decoder.decode(value);');
    expect(notificationBlock).toContain('JSON.parse(text)');
    expect(notificationBlock).toContain('sendDeviceMessage(JSON.parse(text))');
  });

  it('removes saved notification and disconnect listeners before resetting connection state', () => {
    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const removeListenerBlock = extractBlock(renderer, 'function removeDeviceNotificationListener()');
    const removeDisconnectBlock = extractBlock(renderer, 'function removeDeviceDisconnectListener()');
    const resetBlock = extractBlock(renderer, 'function resetConnectionState()');

    expect(renderer).toContain('let notificationListener = null;');
    expect(renderer).toContain('let disconnectListenerDevice = null;');
    expect(renderer).toContain('resources.localNotificationListener = handleDeviceNotification;');
    expect(renderer).toContain("addEventListener('characteristicvaluechanged', resources.localNotificationListener)");
    expect(renderer).toContain('resources.localDisconnectListenerDevice = resources.localDevice;');
    expect(renderer).toContain('resources.localDisconnectListener = () =>');
    expect(renderer).toContain('handleDisconnectedFor(activeEpoch, resources.localDevice, resources);');
    expect(renderer).toContain("addEventListener?.('gattserverdisconnected', resources.localDisconnectListener)");
    expect(removeListenerBlock).toContain("removeEventListener('characteristicvaluechanged', notificationListener)");
    expect(removeListenerBlock).toContain('notificationListener = null;');
    expect(removeDisconnectBlock).toContain("removeEventListener?.('gattserverdisconnected', disconnectListener)");
    expect(removeDisconnectBlock).toContain('disconnectListener = null;');
    expect(removeDisconnectBlock).toContain('disconnectListenerDevice = null;');
    expect(resetBlock).toContain('removeDeviceNotificationListener();');
    expect(resetBlock).toContain('removeDeviceDisconnectListener();');
  });

  it('updates bridge status on disconnect and sends initial started status', () => {
    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const handleDisconnectedBlock = extractBlock(renderer, 'function handleDisconnected()');
    const disconnectBlock = extractBlock(renderer, 'function disconnect()');

    expect(handleDisconnectedBlock).toContain('resetConnectionState();');
    expect(handleDisconnectedBlock).toContain('sendStatus({ connected: false, scanning: false, deviceName: null });');
    expect(disconnectBlock).toContain('device.gatt.disconnect();');
    expect(disconnectBlock).toContain('handleDisconnected();');
    expect(renderer).toMatch(/sendStatus\(\{ started: true \}\);\s*$/);
  });

  it('registers bridge commands and reports v1 oversize writes as errors', () => {
    const renderer = readProjectFile('src/renderer/hardware-bridge.js');
    const sendHostMessageBlock = extractBlock(renderer, 'async function sendHostMessage');

    expect(renderer).toContain('const BRIDGE_V1_SINGLE_FRAME_MAX_BYTES = 1400;');
    expect(renderer).toContain('const MAX_HOST_MESSAGE_BYTES = BRIDGE_V1_SINGLE_FRAME_MAX_BYTES;');
    expect(renderer).toContain('window.combriefHardwareBridge?.onStartScan');
    expect(renderer).toContain('window.combriefHardwareBridge?.onConnect');
    expect(renderer).toContain("connectButton?.addEventListener('click'");
    expect(renderer).toContain('window.combriefHardwareBridge?.onDisconnect');
    expect(renderer).toContain('window.combriefHardwareBridge?.onSendHostMessage');
    expect(sendHostMessageBlock).toContain('byteLength > MAX_HOST_MESSAGE_BYTES');
    expect(sendHostMessageBlock).toContain('v1 single-frame limit');
    expect(sendHostMessageBlock).toContain('reportError(error);');
    expect(sendHostMessageBlock).toContain('writeValueWithoutResponse');
    expect(sendHostMessageBlock).toContain('writeValue');
  });
});
