import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockSession = {
  setPermissionCheckHandler: ReturnType<typeof vi.fn>;
  setPermissionRequestHandler: ReturnType<typeof vi.fn>;
  checkPermission: (webContents: unknown, permission: string, requestingOrigin?: string) => boolean;
  requestPermission: (webContents: unknown, permission: string) => boolean;
};

type MockWindow = {
  destroyed: boolean;
  webContents: {
    on: ReturnType<typeof vi.fn>;
    emitSelectBluetoothDevice: (devices: Array<{ deviceId: string; deviceName?: string }>) => string;
    session: MockSession;
  };
  emitClosed: () => void;
  loadFile: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
};

const electronMock = vi.hoisted(() => {
  type IpcListener = (event: { sender: unknown }) => void;
  const instances: MockWindow[] = [];
  const ipcListeners = new Map<string, Set<IpcListener>>();
  const loadFileSettlers: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  const ipcMain = {
    on: vi.fn((channel: string, listener: IpcListener) => {
      const channelListeners = ipcListeners.get(channel) ?? new Set<IpcListener>();
      channelListeners.add(listener);
      ipcListeners.set(channel, channelListeners);
      return ipcMain;
    }),
    off: vi.fn((channel: string, listener: IpcListener) => {
      ipcListeners.get(channel)?.delete(listener);
      return ipcMain;
    }),
  };
  const BrowserWindow = vi.fn((options: unknown) => {
    const handlers = new Map<string, Array<() => void>>();
    let selectBluetoothDeviceHandler:
      | ((
          event: { preventDefault: ReturnType<typeof vi.fn> },
          devices: Array<{ deviceId: string; deviceName?: string }>,
          callback: (deviceId: string) => void,
        ) => void)
      | null = null;
    let permissionCheckHandler:
      | ((webContents: unknown, permission: string, requestingOrigin: string) => boolean)
      | null = null;
    let permissionRequestHandler:
      | ((webContents: unknown, permission: string, callback: (granted: boolean) => void) => void)
      | null = null;
    const session: MockSession = {
      setPermissionCheckHandler: vi.fn((handler: typeof permissionCheckHandler) => {
        permissionCheckHandler = handler;
      }),
      setPermissionRequestHandler: vi.fn((handler: typeof permissionRequestHandler) => {
        permissionRequestHandler = handler;
      }),
      checkPermission(webContents, permission, requestingOrigin = 'file:///app/renderer/hardware-bridge.html') {
        return permissionCheckHandler?.(webContents, permission, requestingOrigin) ?? false;
      },
      requestPermission(webContents, permission) {
        let granted = false;
        permissionRequestHandler?.(webContents, permission, (nextGranted) => {
          granted = nextGranted;
        });
        return granted;
      },
    };
    const webContents = {
      on: vi.fn((event: string, handler: typeof selectBluetoothDeviceHandler) => {
        if (event === 'select-bluetooth-device') {
          selectBluetoothDeviceHandler = handler;
        }
        return webContents;
      }),
      emitSelectBluetoothDevice(devices: Array<{ deviceId: string; deviceName?: string }>) {
        let selected = 'not-called';
        selectBluetoothDeviceHandler?.(
          { preventDefault: vi.fn() },
          devices,
          (deviceId) => {
            selected = deviceId;
          },
        );
        return selected;
      },
      session,
    };
    const window: MockWindow = {
      destroyed: false,
      webContents,
      emitClosed: () => {
        for (const handler of handlers.get('closed') ?? []) {
          handler();
        }
      },
      loadFile: vi.fn(
        () =>
          new Promise<void>((resolve, reject) => {
            loadFileSettlers.push({ resolve, reject });
          }),
      ),
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return window;
      }),
      off: vi.fn((event: string, handler: () => void) => {
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((item) => item !== handler),
        );
        return window;
      }),
      show: vi.fn(),
      focus: vi.fn(),
      destroy: vi.fn(() => {
        window.destroyed = true;
      }),
      isDestroyed: vi.fn(() => window.destroyed),
    };

    instances.push(window);
    return window;
  });

  return {
    BrowserWindow,
    ipcMain,
    instances,
    reset() {
      ipcListeners.clear();
      BrowserWindow.mockClear();
      ipcMain.on.mockClear();
      ipcMain.off.mockClear();
      instances.length = 0;
      while (loadFileSettlers.shift()) {
        // drain pending load settlers from previous tests
      }
    },
    emitIpc(channel: string, sender: unknown) {
      for (const listener of ipcListeners.get(channel) ?? []) {
        listener({ sender });
      }
    },
    listenerCount(channel: string) {
      return ipcListeners.get(channel)?.size ?? 0;
    },
    resolveNextLoadFile() {
      const settler = loadFileSettlers.shift();
      settler?.resolve();
      return Boolean(settler);
    },
    rejectNextLoadFile(error = new Error('load failed')) {
      const settler = loadFileSettlers.shift();
      settler?.reject(error);
      return Boolean(settler);
    },
  };
});

vi.mock('electron', () => ({
  BrowserWindow: electronMock.BrowserWindow,
  ipcMain: electronMock.ipcMain,
}));

import { HARDWARE_BRIDGE_CHANNELS } from '../src/main/hardware/bridge-ipc';

import { createWebBluetoothBridgeWindowManager } from '../src/main/hardware/web-bluetooth-bridge-window';

beforeEach(() => {
  electronMock.reset();
});

describe('WebBluetoothBridgeWindowManager', () => {
  it('creates a hidden bridge BrowserWindow and reuses it', () => {
    const rendererPath = '/app/renderer/web-bluetooth-bridge.html';
    const preloadPath = '/app/preload/web-bluetooth-bridge-preload.js';
    const manager = createWebBluetoothBridgeWindowManager({ rendererPath, preloadPath });

    const firstWindow = manager.ensureWindow();
    const secondWindow = manager.ensureWindow();

    expect(secondWindow).toBe(firstWindow);
    expect(manager.getWindow()).toBe(firstWindow);
    expect(electronMock.BrowserWindow).toHaveBeenCalledOnce();
    expect(electronMock.BrowserWindow).toHaveBeenCalledWith({
      show: false,
      width: 360,
      height: 260,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    expect(firstWindow.loadFile).toHaveBeenCalledOnce();
    expect(firstWindow.loadFile).toHaveBeenCalledWith(rendererPath);
  });

  it('waits for load and renderer ready IPC before reporting ready', async () => {
    const rendererPath = '/app/renderer/web-bluetooth-bridge.html';
    const preloadPath = '/app/preload/web-bluetooth-bridge-preload.js';
    const manager = createWebBluetoothBridgeWindowManager({ rendererPath, preloadPath });

    const readyPromise = manager.ensureWindowReady();
    let readyWindow: MockWindow | null = null;
    readyPromise.then((window) => {
      readyWindow = window as unknown as MockWindow;
    });
    await Promise.resolve();

    expect(readyWindow).toBeNull();
    expect(electronMock.BrowserWindow).toHaveBeenCalledOnce();
    expect(electronMock.instances[0]?.loadFile).toHaveBeenCalledWith(rendererPath);

    electronMock.resolveNextLoadFile();
    await Promise.resolve();
    expect(readyWindow).toBeNull();

    electronMock.emitIpc(HARDWARE_BRIDGE_CHANNELS.ready, { send: vi.fn() });
    await Promise.resolve();
    expect(readyWindow).toBeNull();

    electronMock.emitIpc(HARDWARE_BRIDGE_CHANNELS.ready, electronMock.instances[0]?.webContents);
    await expect(readyPromise).resolves.toBe(electronMock.instances[0]);
    expect(readyWindow).toBe(electronMock.instances[0]);

    await expect(manager.ensureWindowReady()).resolves.toBe(electronMock.instances[0]);
    expect(electronMock.instances[0]?.loadFile).toHaveBeenCalledOnce();
  });

  it('configures Web Bluetooth device selection for the ComBrief Remote', () => {
    const manager = createWebBluetoothBridgeWindowManager({
      rendererPath: '/app/renderer/web-bluetooth-bridge.html',
      preloadPath: '/app/preload/web-bluetooth-bridge-preload.js',
    });

    const window = manager.ensureWindow();

    expect(window.webContents.on).toHaveBeenCalledWith(
      'select-bluetooth-device',
      expect.any(Function),
    );
    expect(window.webContents.emitSelectBluetoothDevice([
      { deviceId: 'keyboard', deviceName: 'Keyboard' },
      { deviceId: 'remote', deviceName: 'ComBrief-Remote v1' },
    ])).toBe('remote');
    expect(window.webContents.emitSelectBluetoothDevice([
      { deviceId: 'first', deviceName: 'First Device' },
    ])).toBe('first');
    expect(window.webContents.emitSelectBluetoothDevice([])).toBe('');
  });

  it('shows and focuses the ready bridge window for pairing', async () => {
    const manager = createWebBluetoothBridgeWindowManager({
      rendererPath: '/app/renderer/hardware-bridge.html',
      preloadPath: '/app/preload/hardware-bridge-preload.js',
    });

    const pairingPromise = manager.showPairingWindow();
    electronMock.resolveNextLoadFile();
    electronMock.emitIpc(HARDWARE_BRIDGE_CHANNELS.ready, electronMock.instances[0]?.webContents);

    await expect(pairingPromise).resolves.toBe(electronMock.instances[0]);
    expect(electronMock.instances[0]?.show).toHaveBeenCalledOnce();
    expect(electronMock.instances[0]?.focus).toHaveBeenCalledOnce();
  });
  it('configures minimal Web Bluetooth permissions for the bridge session', () => {
    const manager = createWebBluetoothBridgeWindowManager({
      rendererPath: '/app/renderer/web-bluetooth-bridge.html',
      preloadPath: '/app/preload/web-bluetooth-bridge-preload.js',
    });

    const window = manager.ensureWindow();

    expect(window.webContents.session.setPermissionCheckHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(window.webContents.session.setPermissionRequestHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it('clears the cached window after closed and creates a new one', () => {
    const manager = createWebBluetoothBridgeWindowManager({
      rendererPath: '/app/renderer/web-bluetooth-bridge.html',
      preloadPath: '/app/preload/web-bluetooth-bridge-preload.js',
    });

    const firstWindow = manager.ensureWindow();
    firstWindow.emitClosed();
    const secondWindow = manager.ensureWindow();

    expect(manager.getWindow()).toBe(secondWindow);
    expect(secondWindow).not.toBe(firstWindow);
    expect(electronMock.BrowserWindow).toHaveBeenCalledTimes(2);
  });

  it('scopes Web Bluetooth permissions to the bridge webContents only', () => {
    const manager = createWebBluetoothBridgeWindowManager({
      rendererPath: '/app/renderer/hardware-bridge.html',
      preloadPath: '/app/preload/hardware-bridge-preload.js',
    });

    const window = manager.ensureWindow();
    const otherWebContents = { id: 'other' };

    expect(window.webContents.session.checkPermission(window.webContents, 'bluetooth')).toBe(true);
    expect(window.webContents.session.checkPermission(window.webContents, 'bluetooth-scan')).toBe(true);
    expect(window.webContents.session.checkPermission(otherWebContents, 'bluetooth')).toBe(false);
    expect(window.webContents.session.checkPermission(null, 'bluetooth')).toBe(false);
    expect(window.webContents.session.checkPermission(window.webContents, 'media')).toBe(false);
    expect(window.webContents.session.requestPermission(window.webContents, 'bluetooth')).toBe(true);
    expect(window.webContents.session.requestPermission(otherWebContents, 'bluetooth')).toBe(false);
    expect(window.webContents.session.requestPermission(window.webContents, 'media')).toBe(false);
  });

  it('rejects pending readiness and clears the ready listener when closed before ready', async () => {
    const manager = createWebBluetoothBridgeWindowManager({
      rendererPath: '/app/renderer/hardware-bridge.html',
      preloadPath: '/app/preload/hardware-bridge-preload.js',
    });

    const readyPromise = manager.ensureWindowReady();
    expect(electronMock.listenerCount(HARDWARE_BRIDGE_CHANNELS.ready)).toBe(1);

    electronMock.instances[0]?.emitClosed();

    await expect(readyPromise).rejects.toThrow('ComBrief Remote bridge closed before ready');
    expect(electronMock.listenerCount(HARDWARE_BRIDGE_CHANNELS.ready)).toBe(0);
  });

  it('rejects pending readiness and clears the ready listener when destroyed before ready', async () => {
    const manager = createWebBluetoothBridgeWindowManager({
      rendererPath: '/app/renderer/hardware-bridge.html',
      preloadPath: '/app/preload/hardware-bridge-preload.js',
    });

    const readyPromise = manager.ensureWindowReady();
    expect(electronMock.listenerCount(HARDWARE_BRIDGE_CHANNELS.ready)).toBe(1);

    manager.destroy();

    await expect(readyPromise).rejects.toThrow('ComBrief Remote bridge destroyed before ready');
    expect(electronMock.listenerCount(HARDWARE_BRIDGE_CHANNELS.ready)).toBe(0);
  });

  it('rejects pending readiness and clears the ready listener when loadFile fails', async () => {
    const manager = createWebBluetoothBridgeWindowManager({
      rendererPath: '/app/renderer/hardware-bridge.html',
      preloadPath: '/app/preload/hardware-bridge-preload.js',
    });

    const readyPromise = manager.ensureWindowReady();
    expect(electronMock.listenerCount(HARDWARE_BRIDGE_CHANNELS.ready)).toBe(1);

    electronMock.rejectNextLoadFile(new Error('load failed'));

    await expect(readyPromise).rejects.toThrow('load failed');
    expect(electronMock.listenerCount(HARDWARE_BRIDGE_CHANNELS.ready)).toBe(0);
  });

  it('rejects pending readiness and clears the ready listener when ready ack times out', async () => {
    vi.useFakeTimers();
    try {
      const manager = createWebBluetoothBridgeWindowManager({
        rendererPath: '/app/renderer/hardware-bridge.html',
        preloadPath: '/app/preload/hardware-bridge-preload.js',
      });

      const readyPromise = manager.ensureWindowReady();
      expect(electronMock.listenerCount(HARDWARE_BRIDGE_CHANNELS.ready)).toBe(1);

      electronMock.resolveNextLoadFile();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(readyPromise).rejects.toThrow(
        'ComBrief Remote bridge renderer did not signal ready in time',
      );
      expect(electronMock.listenerCount(HARDWARE_BRIDGE_CHANNELS.ready)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('destroys and clears the cached window', () => {
    const manager = createWebBluetoothBridgeWindowManager({
      rendererPath: '/app/renderer/web-bluetooth-bridge.html',
      preloadPath: '/app/preload/web-bluetooth-bridge-preload.js',
    });

    const window = manager.ensureWindow();
    manager.destroy();

    expect(window.destroy).toHaveBeenCalledOnce();
    expect(manager.getWindow()).toBeNull();
  });
});
