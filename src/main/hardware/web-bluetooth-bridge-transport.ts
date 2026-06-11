import { ipcMain } from 'electron';
import {
  HARDWARE_BRIDGE_CHANNELS,
  isHardwareBridgeStatus,
} from './bridge-ipc';
import type {
  HardwareDeviceMessage,
  HardwareHostMessage,
} from './protocol';
import {
  isHardwareBatteryMessage,
  isHardwareDecisionMessage,
  isHardwareHelloMessage,
} from './protocol';
import type { HardwareConnectionStatus, HardwareTransport } from './transport';
import type { WebBluetoothBridgeWindowManager } from './web-bluetooth-bridge-window';

type BridgeIpcListener = (event: Electron.IpcMainEvent, payload: unknown) => void;

export class WebBluetoothBridgeTransport implements HardwareTransport {
  private status: HardwareConnectionStatus = {
    started: false,
    connected: false,
    lastError: null,
  };

  private readonly messageHandlers = new Set<(message: HardwareDeviceMessage) => void>();
  private subscribed = false;
  private startGeneration = 0;

  private readonly statusChangedListener: BridgeIpcListener = (event, payload) => {
    if (!this.isBridgeSender(event) || !isHardwareBridgeStatus(payload)) {
      return;
    }

    this.status = {
      started: payload.started,
      connected: payload.connected,
      lastError: payload.lastError,
    };
  };

  private readonly deviceMessageListener: BridgeIpcListener = (event, payload) => {
    if (!this.isBridgeSender(event) || !this.status.started || !isHardwareDeviceMessage(payload)) {
      return;
    }

    for (const handler of this.messageHandlers) {
      handler(payload);
    }
  };

  private readonly errorListener: BridgeIpcListener = (event, payload) => {
    if (!this.isBridgeSender(event)) {
      return;
    }

    this.status = {
      ...this.status,
      lastError: typeof payload === 'string' ? payload : 'Unknown bridge error',
    };
  };

  constructor(
    private readonly manager: WebBluetoothBridgeWindowManager,
    private readonly bridgeIpcMain: Pick<Electron.IpcMain, 'on' | 'off'> = ipcMain,
  ) {}

  async start(): Promise<void> {
    const generation = this.startGeneration + 1;
    this.startGeneration = generation;
    try {
      await this.manager.ensureWindowReady();
    } catch (error) {
      if (generation !== this.startGeneration) {
        return;
      }

      this.status = {
        started: false,
        connected: false,
        lastError: error instanceof Error ? error.message : String(error),
      };
      return;
    }
    if (generation !== this.startGeneration) {
      return;
    }

    this.subscribeBridgeEvents();
    this.status = {
      started: true,
      connected: this.status.connected,
      lastError: null,
    };
  }

  async openPairing(): Promise<void> {
    try {
      await this.manager.showPairingWindow();
    } catch (error) {
      this.status = {
        ...this.status,
        lastError: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.startGeneration += 1;
    const bridgeWindow = this.manager.getWindow();
    if (bridgeWindow) {
      bridgeWindow.webContents.send(HARDWARE_BRIDGE_CHANNELS.disconnect);
    }

    this.unsubscribeBridgeEvents();
    this.status = { started: false, connected: false, lastError: null };
    this.manager.destroy();
  }

  getStatus(): HardwareConnectionStatus {
    return { ...this.status };
  }

  async send(message: HardwareHostMessage): Promise<void> {
    if (!this.status.started) {
      throw new Error('ComBrief Remote bridge is not started');
    }

    const bridgeWindow = this.manager.getWindow();
    if (!bridgeWindow) {
      throw new Error('ComBrief Remote bridge is not running');
    }

    bridgeWindow.webContents.send(HARDWARE_BRIDGE_CHANNELS.sendHostMessage, message);
  }

  onMessage(handler: (message: HardwareDeviceMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  private isBridgeSender(event: Electron.IpcMainEvent): boolean {
    return event.sender === this.manager.getWindow()?.webContents;
  }

  private subscribeBridgeEvents(): void {
    if (this.subscribed) {
      return;
    }

    this.bridgeIpcMain.on(HARDWARE_BRIDGE_CHANNELS.statusChanged, this.statusChangedListener);
    this.bridgeIpcMain.on(HARDWARE_BRIDGE_CHANNELS.deviceMessage, this.deviceMessageListener);
    this.bridgeIpcMain.on(HARDWARE_BRIDGE_CHANNELS.error, this.errorListener);
    this.subscribed = true;
  }

  private unsubscribeBridgeEvents(): void {
    if (!this.subscribed) {
      return;
    }

    this.bridgeIpcMain.off(HARDWARE_BRIDGE_CHANNELS.statusChanged, this.statusChangedListener);
    this.bridgeIpcMain.off(HARDWARE_BRIDGE_CHANNELS.deviceMessage, this.deviceMessageListener);
    this.bridgeIpcMain.off(HARDWARE_BRIDGE_CHANNELS.error, this.errorListener);
    this.subscribed = false;
  }
}

function isHardwareDeviceMessage(value: unknown): value is HardwareDeviceMessage {
  return (
    isHardwareHelloMessage(value) ||
    isHardwareDecisionMessage(value) ||
    isHardwareBatteryMessage(value)
  );
}
