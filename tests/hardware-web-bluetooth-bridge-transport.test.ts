import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HARDWARE_BRIDGE_CHANNELS } from '../src/main/hardware/bridge-ipc';
import type { HardwareHostMessage } from '../src/main/hardware/protocol';
import type { WebBluetoothBridgeWindowManager } from '../src/main/hardware/web-bluetooth-bridge-window';

const electronMock = vi.hoisted(() => {
  type Listener = (event: { sender: unknown }, payload: unknown) => void;
  const listeners = new Map<string, Set<Listener>>();

  const ipcMain = {
    on: vi.fn((channel: string, listener: Listener) => {
      const channelListeners = listeners.get(channel) ?? new Set<Listener>();
      channelListeners.add(listener);
      listeners.set(channel, channelListeners);
      return ipcMain;
    }),
    off: vi.fn((channel: string, listener: Listener) => {
      listeners.get(channel)?.delete(listener);
      return ipcMain;
    }),
  };

  return {
    ipcMain,
    emit(channel: string, payload: unknown, sender: unknown = null) {
      for (const listener of listeners.get(channel) ?? []) {
        listener({ sender }, payload);
      }
    },
    listenerCount(channel: string) {
      return listeners.get(channel)?.size ?? 0;
    },
    reset() {
      listeners.clear();
      ipcMain.on.mockClear();
      ipcMain.off.mockClear();
    },
  };
});

vi.mock('electron', () => ({
  ipcMain: electronMock.ipcMain,
}));

import { WebBluetoothBridgeTransport } from '../src/main/hardware/web-bluetooth-bridge-transport';

type MockBridgeWindow = {
  webContents: {
    send: ReturnType<typeof vi.fn>;
  };
};

function createBridgeWindow(): MockBridgeWindow {
  return {
    webContents: {
      send: vi.fn(),
    },
  };
}

function createHarness(
  initialWindow: MockBridgeWindow | null = createBridgeWindow(),
  options: { deferReady?: boolean; readyError?: Error; pairingError?: Error } = {},
) {
  let bridgeWindow = initialWindow;
  let resolveReady: ((window: MockBridgeWindow) => void) | null = null;
  const manager: WebBluetoothBridgeWindowManager & {
    ensureWindowReady: ReturnType<typeof vi.fn>;
  } = {
    ensureWindow: vi.fn(() => {
      if (!bridgeWindow) {
        bridgeWindow = createBridgeWindow();
      }

      return bridgeWindow as never;
    }),
    ensureWindowReady: vi.fn(() => {
      const window = manager.ensureWindow() as unknown as MockBridgeWindow;
      if (options.readyError) {
        return Promise.reject(options.readyError);
      }
      if (!options.deferReady) {
        return Promise.resolve(window as never);
      }

      return new Promise((resolve) => {
        resolveReady = () => resolve(window as never);
      });
    }),
    getWindow: vi.fn(() => bridgeWindow as never),
    showPairingWindow: vi.fn(async () => {
      if (options.pairingError) {
        throw options.pairingError;
      }

      return manager.ensureWindowReady();
    }),
    destroy: vi.fn(),
  };
  const transport = new WebBluetoothBridgeTransport(manager);

  return {
    transport,
    manager,
    get window() {
      return bridgeWindow;
    },
    clearWindow() {
      bridgeWindow = null;
    },
    resolveReady() {
      if (!bridgeWindow) {
        throw new Error('Bridge window is missing');
      }
      resolveReady?.(bridgeWindow);
    },
    emit(channel: string, payload: unknown, sender: unknown = bridgeWindow?.webContents) {
      electronMock.emit(channel, payload, sender);
    },
    listenerCount(channel: string) {
      return electronMock.listenerCount(channel);
    },
  };
}

function hostMessage(): HardwareHostMessage {
  return {
    protocol: 1,
    type: 'state',
    appName: 'ComBrief',
    appVersion: '0.1.2',
    apps: [{ id: 'claude-code', label: 'CC', status: 'idle' }],
    ts: 1_710_000_000_000,
  };
}

beforeEach(() => {
  electronMock.reset();
});

describe('WebBluetoothBridgeTransport', () => {
  it('starts the bridge once without requesting Web Bluetooth scan', async () => {
    const harness = createHarness();

    await harness.transport.start();

    expect(harness.manager.ensureWindowReady).toHaveBeenCalledOnce();
    expect(harness.window?.webContents.send).not.toHaveBeenCalledWith(
      HARDWARE_BRIDGE_CHANNELS.startScan,
    );
    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: false,
      lastError: null,
    });
    expect(harness.listenerCount(HARDWARE_BRIDGE_CHANNELS.statusChanged)).toBe(1);
    expect(harness.listenerCount(HARDWARE_BRIDGE_CHANNELS.deviceMessage)).toBe(1);
    expect(harness.listenerCount(HARDWARE_BRIDGE_CHANNELS.error)).toBe(1);

    harness.emit(HARDWARE_BRIDGE_CHANNELS.statusChanged, {
      started: true,
      connected: true,
      scanning: false,
      deviceName: 'ComBrief-Remote',
      lastError: 'old error',
    });
    await harness.transport.start();

    expect(harness.manager.ensureWindowReady).toHaveBeenCalledTimes(2);
    expect(harness.window?.webContents.send).not.toHaveBeenCalledWith(
      HARDWARE_BRIDGE_CHANNELS.startScan,
    );
    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: true,
      lastError: null,
    });
    expect(harness.listenerCount(HARDWARE_BRIDGE_CHANNELS.statusChanged)).toBe(1);
    expect(harness.listenerCount(HARDWARE_BRIDGE_CHANNELS.deviceMessage)).toBe(1);
    expect(harness.listenerCount(HARDWARE_BRIDGE_CHANNELS.error)).toBe(1);
  });

  it('waits for the bridge window to be ready without sending start scan', async () => {
    const harness = createHarness(createBridgeWindow(), { deferReady: true });

    const startPromise = harness.transport.start();
    await Promise.resolve();

    expect(harness.manager.ensureWindowReady).toHaveBeenCalledOnce();
    expect(harness.window?.webContents.send).not.toHaveBeenCalled();

    harness.resolveReady();
    await startPromise;

    expect(harness.window?.webContents.send).not.toHaveBeenCalledWith(
      HARDWARE_BRIDGE_CHANNELS.startScan,
    );
    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: false,
      lastError: null,
    });
  });

  it('opens the pairing window only from the explicit pairing method', async () => {
    const harness = createHarness();

    await harness.transport.start();
    await harness.transport.openPairing();

    expect(harness.manager.showPairingWindow).toHaveBeenCalledOnce();
    expect(harness.window?.webContents.send).not.toHaveBeenCalledWith(
      HARDWARE_BRIDGE_CHANNELS.startScan,
    );
    expect(harness.window?.webContents.send).not.toHaveBeenCalledWith(
      HARDWARE_BRIDGE_CHANNELS.connect,
    );
    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: false,
      lastError: null,
    });
  });

  it('rejects pairing window failures after recording the last error', async () => {
    const harness = createHarness(createBridgeWindow(), {
      pairingError: new Error('pairing window failed'),
    });

    await harness.transport.start();

    await expect(harness.transport.openPairing()).rejects.toThrow('pairing window failed');
    expect(harness.manager.showPairingWindow).toHaveBeenCalledOnce();
    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: false,
      lastError: 'pairing window failed',
    });
  });

  it('does not send start scan when stop cancels a pending window ready wait', async () => {
    const harness = createHarness(createBridgeWindow(), { deferReady: true });

    const startPromise = harness.transport.start();
    await Promise.resolve();
    await harness.transport.stop();
    harness.resolveReady();
    await startPromise;

    expect(harness.window?.webContents.send).not.toHaveBeenCalledWith(
      HARDWARE_BRIDGE_CHANNELS.startScan,
    );
    expect(harness.transport.getStatus()).toEqual({
      started: false,
      connected: false,
      lastError: null,
    });
  });

  it('records a ready failure without throwing or starting the bridge', async () => {
    const harness = createHarness(createBridgeWindow(), {
      readyError: new Error('bridge ready timed out'),
    });

    await expect(harness.transport.start()).resolves.toBeUndefined();

    expect(harness.manager.ensureWindowReady).toHaveBeenCalledOnce();
    expect(harness.window?.webContents.send).not.toHaveBeenCalledWith(
      HARDWARE_BRIDGE_CHANNELS.startScan,
    );
    expect(harness.transport.getStatus()).toEqual({
      started: false,
      connected: false,
      lastError: 'bridge ready timed out',
    });
    expect(harness.listenerCount(HARDWARE_BRIDGE_CHANNELS.statusChanged)).toBe(0);
    expect(harness.listenerCount(HARDWARE_BRIDGE_CHANNELS.deviceMessage)).toBe(0);
    expect(harness.listenerCount(HARDWARE_BRIDGE_CHANNELS.error)).toBe(0);
  });

  it('rejects send before start even when the bridge window exists', async () => {
    const harness = createHarness();

    await expect(harness.transport.send(hostMessage())).rejects.toThrow(
      'ComBrief Remote bridge is not started',
    );
    expect(harness.window?.webContents.send).not.toHaveBeenCalled();
  });

  it('sends host messages through the bridge window after start and errors when unavailable', async () => {
    const harness = createHarness();
    const message = hostMessage();

    await harness.transport.start();
    await harness.transport.send(message);

    expect(harness.window?.webContents.send).toHaveBeenCalledWith(
      HARDWARE_BRIDGE_CHANNELS.sendHostMessage,
      message,
    );

    harness.clearWindow();
    await expect(harness.transport.send(message)).rejects.toThrow(
      'ComBrief Remote bridge is not running',
    );
  });

  it('forwards only valid hardware device messages and supports unsubscribe', async () => {
    const harness = createHarness();
    const handler = vi.fn();
    const unsubscribe = harness.transport.onMessage(handler);

    await harness.transport.start();
    harness.emit(HARDWARE_BRIDGE_CHANNELS.deviceMessage, {
      protocol: 1,
      type: 'hello',
      deviceName: 'ComBrief-Remote',
      platform: 'haas-edu-k1',
      fwVersion: '0.1.0',
      battery: 88,
    });
    harness.emit(HARDWARE_BRIDGE_CHANNELS.deviceMessage, {
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    });
    harness.emit(HARDWARE_BRIDGE_CHANNELS.deviceMessage, {
      protocol: 1,
      type: 'battery',
      battery: 72,
      ts: 1_710_000_000_002,
    });
    harness.emit(HARDWARE_BRIDGE_CHANNELS.deviceMessage, {
      protocol: 1,
      type: 'decision',
      decisionId: 'request-2',
      optionId: 'deny',
    });
    harness.emit(HARDWARE_BRIDGE_CHANNELS.deviceMessage, {
      protocol: 1,
      type: 'state',
      appName: 'ComBrief',
    });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls.map(([message]) => message.type)).toEqual([
      'hello',
      'decision',
      'battery',
    ]);

    unsubscribe();
    harness.emit(HARDWARE_BRIDGE_CHANNELS.deviceMessage, {
      protocol: 1,
      type: 'battery',
      battery: 70,
    });

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('maps valid status changes and bridge errors into transport status', async () => {
    const harness = createHarness();

    await harness.transport.start();
    harness.emit(HARDWARE_BRIDGE_CHANNELS.statusChanged, {
      started: true,
      connected: true,
      scanning: false,
      deviceName: 'ComBrief-Remote',
      lastError: 'connect warning',
    });

    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: true,
      lastError: 'connect warning',
    });

    harness.emit(HARDWARE_BRIDGE_CHANNELS.statusChanged, {
      started: 'true',
      connected: false,
      scanning: false,
      deviceName: null,
      lastError: null,
    });

    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: true,
      lastError: 'connect warning',
    });

    harness.emit(HARDWARE_BRIDGE_CHANNELS.error, 'pairing failed');
    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: true,
      lastError: 'pairing failed',
    });

    harness.emit(HARDWARE_BRIDGE_CHANNELS.error, { message: 'not trusted' });
    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: true,
      lastError: 'Unknown bridge error',
    });
  });

  it('ignores bridge IPC events from non-bridge senders', async () => {
    const harness = createHarness();
    const handler = vi.fn();
    const foreignSender = { send: vi.fn() };

    harness.transport.onMessage(handler);
    await harness.transport.start();

    harness.emit(
      HARDWARE_BRIDGE_CHANNELS.statusChanged,
      {
        started: true,
        connected: true,
        scanning: false,
        deviceName: 'ComBrief-Remote',
        lastError: 'spoofed status',
      },
      foreignSender,
    );
    harness.emit(HARDWARE_BRIDGE_CHANNELS.error, 'spoofed error', foreignSender);
    harness.emit(
      HARDWARE_BRIDGE_CHANNELS.deviceMessage,
      {
        protocol: 1,
        type: 'decision',
        decisionId: 'request-1',
        optionId: 'allow',
        ts: 1_710_000_000_001,
      },
      foreignSender,
    );

    expect(harness.transport.getStatus()).toEqual({
      started: true,
      connected: false,
      lastError: null,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('disconnects and stops forwarding bridge messages after stop', async () => {
    const harness = createHarness();
    const handler = vi.fn();

    harness.transport.onMessage(handler);
    await harness.transport.start();
    await harness.transport.stop();

    expect(harness.window?.webContents.send).toHaveBeenLastCalledWith(
      HARDWARE_BRIDGE_CHANNELS.disconnect,
    );
    expect(harness.transport.getStatus()).toEqual({
      started: false,
      connected: false,
      lastError: null,
    });
    expect(harness.manager.destroy).toHaveBeenCalledOnce();

    harness.emit(HARDWARE_BRIDGE_CHANNELS.deviceMessage, {
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
