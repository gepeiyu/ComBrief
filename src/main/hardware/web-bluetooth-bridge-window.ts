import { BrowserWindow, app, ipcMain } from 'electron';
import { HARDWARE_BRIDGE_CHANNELS } from './bridge-ipc';

export interface WebBluetoothBridgeWindowMessages {
  title: string;
  description: string;
  button: string;
  initialStatus: string;
  scanningStatus: string;
  connectingStatus: string;
  connectedStatus: string;
  errorPrefix: string;
}

export interface WebBluetoothBridgeWindowManagerOptions {
  rendererPath: string;
  preloadPath: string;
  messages?: WebBluetoothBridgeWindowMessages;
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

function buildRendererLoadOptions(messages?: WebBluetoothBridgeWindowMessages): Electron.LoadFileOptions | undefined {
  if (!messages) {
    return undefined;
  }

  return {
    query: Object.fromEntries(
      Object.entries(messages).map(([key, value]) => [key, value]),
    ),
  };
}

export interface WebBluetoothBridgeWindowManager {
  ensureWindow(): BrowserWindow;
  ensureWindowReady(): Promise<BrowserWindow>;
  showPairingWindow(options?: { autoConnect?: boolean }): Promise<BrowserWindow>;
  getWindow(): BrowserWindow | null;
  destroy(): void;
}

function isBridgeBluetoothPermission(permission: string): boolean {
  return permission === 'bluetooth' || permission === 'bluetooth-scan';
}

function chooseBluetoothDevice(devices: BluetoothDevice[]): string | null {
  const preferred = devices.find((device) =>
    device.deviceName?.startsWith('ComBrief'),
  );
  if (preferred) {
    return preferred.deviceId;
  }

  if (devices.length === 1) {
    return devices[0].deviceId;
  }

  return null;
}

function configureBluetoothSession(window: BrowserWindow): void {
  window.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    const selectedDeviceId = chooseBluetoothDevice(devices);
    if (selectedDeviceId) {
      callback(selectedDeviceId);
    }
  });
  const bridgeSession = window.webContents.session;
  bridgeSession.setPermissionCheckHandler((webContents, permission) =>
    webContents === window.webContents && isBridgeBluetoothPermission(permission),
  );
  bridgeSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(webContents === window.webContents && isBridgeBluetoothPermission(permission));
  });
}

function createReadyState(
  window: BrowserWindow,
  rendererPath: string,
  messages?: WebBluetoothBridgeWindowMessages,
): ReadyState {
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

  const rendererLoadOptions = buildRendererLoadOptions(messages);
  const rendererLoadPromise = rendererLoadOptions
    ? window.loadFile(rendererPath, rendererLoadOptions)
    : window.loadFile(rendererPath);

  const promise = Promise.all([
    rendererLoadPromise.catch((error: unknown) => {
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
  let destroyingBridgeWindow = false;
  let quittingApp = false;

  app.on('before-quit', () => {
    quittingApp = true;
  });

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
    nextWindow.on('close', (event) => {
      if (destroyingBridgeWindow || quittingApp) {
        return;
      }

      event.preventDefault();
      nextWindow.hide();
    });
    bridgeWindowReady = createReadyState(nextWindow, options.rendererPath, options.messages);
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

  async function showPairingWindow(options?: { autoConnect?: boolean }): Promise<BrowserWindow> {
    const window = await ensureWindowReady();
    window.show();
    window.focus();
    if (options?.autoConnect) {
      window.webContents.send(HARDWARE_BRIDGE_CHANNELS.connect);
    }
    return window;
  }

  function destroy(): void {
    const existingWindow = getWindow();
    bridgeWindowReady?.reject(new Error('ComBrief Remote bridge destroyed before ready'));
    bridgeWindowReady = null;
    bridgeWindow = null;

    if (existingWindow) {
      destroyingBridgeWindow = true;
      try {
        existingWindow.destroy();
      } finally {
        destroyingBridgeWindow = false;
      }
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
