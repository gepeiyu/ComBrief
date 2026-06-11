import { BrowserWindow, ipcMain } from 'electron';
import { HARDWARE_BRIDGE_CHANNELS } from './bridge-ipc';

export interface WebBluetoothBridgeWindowManagerOptions {
  rendererPath: string;
  preloadPath: string;
}

type BluetoothDevice = {
  deviceId: string;
  deviceName?: string;
};

type ReadyState = {
  promise: Promise<BrowserWindow>;
  reject: (error: Error) => void;
  cleanup: () => void;
};

const BRIDGE_READY_TIMEOUT_MS = 10_000;

export interface WebBluetoothBridgeWindowManager {
  ensureWindow(): BrowserWindow;
  ensureWindowReady(): Promise<BrowserWindow>;
  showPairingWindow(): Promise<BrowserWindow>;
  getWindow(): BrowserWindow | null;
  destroy(): void;
}

function isBridgeBluetoothPermission(permission: string): boolean {
  return permission === 'bluetooth' || permission === 'bluetooth-scan';
}

function chooseBluetoothDevice(devices: BluetoothDevice[]): string {
  const preferred = devices.find((device) =>
    device.deviceName?.startsWith('ComBrief-Remote'),
  );
  return preferred?.deviceId ?? devices[0]?.deviceId ?? '';
}

function configureBluetoothSession(window: BrowserWindow): void {
  window.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    callback(chooseBluetoothDevice(devices));
  });
  const bridgeSession = window.webContents.session;
  bridgeSession.setPermissionCheckHandler((webContents, permission) =>
    webContents === window.webContents && isBridgeBluetoothPermission(permission),
  );
  bridgeSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(webContents === window.webContents && isBridgeBluetoothPermission(permission));
  });
}

function createReadyState(window: BrowserWindow, rendererPath: string): ReadyState {
  let settled = false;
  let rejectReady!: (error: Error) => void;

  const cleanupCallbacks: Array<() => void> = [];
  const cleanup = () => {
    for (const cleanupCallback of cleanupCallbacks.splice(0)) {
      cleanupCallback();
    }
  };
  const reject = (error: Error) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectReady(error);
  };

  const rendererReady = new Promise<void>((resolve, rejectRendererReady) => {
    rejectReady = rejectRendererReady;
    const readyListener = (event: Electron.IpcMainEvent) => {
      if (event.sender !== window.webContents) {
        return;
      }

      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const timeout = setTimeout(() => {
      reject(new Error('ComBrief Remote bridge renderer did not signal ready in time'));
    }, BRIDGE_READY_TIMEOUT_MS);
    const closedListener = () => {
      reject(new Error('ComBrief Remote bridge closed before ready'));
    };

    ipcMain.on(HARDWARE_BRIDGE_CHANNELS.ready, readyListener);
    window.on('closed', closedListener);
    cleanupCallbacks.push(
      () => ipcMain.off(HARDWARE_BRIDGE_CHANNELS.ready, readyListener),
      () => clearTimeout(timeout),
      () => window.off('closed', closedListener),
    );
  });

  const promise = Promise.all([
    window.loadFile(rendererPath).catch((error: unknown) => {
      reject(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }),
    rendererReady,
  ]).then(() => window);

  return {
    promise,
    reject,
    cleanup,
  };
}

export function createWebBluetoothBridgeWindowManager(
  options: WebBluetoothBridgeWindowManagerOptions,
): WebBluetoothBridgeWindowManager {
  let bridgeWindow: BrowserWindow | null = null;
  let bridgeWindowReady: ReadyState | null = null;

  function clearBridgeWindow(nextWindow: BrowserWindow): void {
    if (bridgeWindow === nextWindow) {
      bridgeWindow = null;
      bridgeWindowReady = null;
    }
  }

  function getWindow(): BrowserWindow | null {
    if (bridgeWindow === null || bridgeWindow.isDestroyed()) {
      return null;
    }

    return bridgeWindow;
  }

  function ensureWindow(): BrowserWindow {
    const existingWindow = getWindow();
    if (existingWindow) {
      return existingWindow;
    }

    const nextWindow = new BrowserWindow({
      show: false,
      width: 360,
      height: 260,
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    bridgeWindow = nextWindow;
    configureBluetoothSession(nextWindow);
    bridgeWindowReady = createReadyState(nextWindow, options.rendererPath);
    void bridgeWindowReady.promise.catch(() => undefined);
    nextWindow.on('closed', () => {
      bridgeWindowReady?.reject(new Error('ComBrief Remote bridge closed before ready'));
      clearBridgeWindow(nextWindow);
    });

    return nextWindow;
  }

  function ensureWindowReady(): Promise<BrowserWindow> {
    const window = ensureWindow();
    return bridgeWindowReady?.promise ?? Promise.resolve(window);
  }

  async function showPairingWindow(): Promise<BrowserWindow> {
    const window = await ensureWindowReady();
    window.show();
    window.focus();
    return window;
  }

  function destroy(): void {
    const existingWindow = getWindow();
    bridgeWindowReady?.reject(new Error('ComBrief Remote bridge destroyed before ready'));
    bridgeWindowReady = null;
    bridgeWindow = null;

    if (existingWindow) {
      existingWindow.destroy();
    }
  }

  return {
    ensureWindow,
    ensureWindowReady,
    showPairingWindow,
    getWindow,
    destroy,
  };
}
