import { ipcMain } from 'electron';
import {
  HARDWARE_BRIDGE_CHANNELS,
  isHardwareBridgeHostMessageResult,
  isHardwareBridgeStatus,
} from './bridge-ipc';
import type {
  HardwareDeviceMessage,
  HardwareFastStateSignal,
  HardwareHostMessage,
} from './protocol';
import {
  isHardwareBatteryMessage,
  isHardwareDecisionMessage,
  isHardwareHelloMessage,
  isHardwareHostAckMessage,
} from './protocol';
import type { HardwareConnectionStatus, HardwareTransport } from './transport';
import type { WebBluetoothBridgeWindowManager } from './web-bluetooth-bridge-window';

const HOST_MESSAGE_ACK_BASE_MS = 2_000;
const HOST_MESSAGE_ACK_PER_CHUNK_MS = 250;
const BLE_CHUNK_PAYLOAD_BYTES = 19;

function hostMessageAckTimeoutMs(message: HardwareHostMessage): number {
  const bytes = Buffer.byteLength(JSON.stringify(message), 'utf8');
  const chunks = Math.max(1, Math.ceil(bytes / BLE_CHUNK_PAYLOAD_BYTES));
  return HOST_MESSAGE_ACK_BASE_MS + chunks * HOST_MESSAGE_ACK_PER_CHUNK_MS;
}

type BridgeIpcListener = (event: Electron.IpcMainEvent, payload: unknown) => void;

export interface WebBluetoothBridgeTransportCallbacks {
  onConnected?: () => void;
}

export class WebBluetoothBridgeTransport implements HardwareTransport {
  private status: HardwareConnectionStatus = {
    started: false,
    connected: false,
    lastError: null,
  };

  private readonly messageHandlers = new Set<(message: HardwareDeviceMessage) => void>();
  private readonly pendingHostMessages = new Map<
    string,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout | null;
      ackRequired: boolean;
      ackReceived: boolean;
      ackOk: boolean;
      ackError?: string;
    }
  >();
  private subscribed = false;
  private startGeneration = 0;
  private nextHostMessageSeq = 1;

  private readonly statusChangedListener: BridgeIpcListener = (event, payload) => {
    if (!this.isBridgeSender(event) || !isHardwareBridgeStatus(payload)) {
      return;
    }

    const wasConnected = this.status.connected;
    this.status = {
      started: payload.started,
      connected: payload.connected,
      lastError: payload.lastError,
    };
    if (!wasConnected && payload.connected) {
      this.callbacks.onConnected?.();
    }
  };

  private readonly deviceMessageListener: BridgeIpcListener = (event, payload) => {
    if (!this.isBridgeSender(event) || !this.status.started || !isHardwareDeviceMessage(payload)) {
      return;
    }

    if (isHardwareHostAckMessage(payload)) {
      this.resolveHostAck(payload.hostMessageId, payload.ok, payload.error);
      return;
    }

    for (const handler of this.messageHandlers) {
      handler(payload);
    }
  };

  private readonly hostMessageResultListener: BridgeIpcListener = (event, payload) => {
    if (!this.isBridgeSender(event) || !isHardwareBridgeHostMessageResult(payload)) {
      return;
    }

    const pending = this.pendingHostMessages.get(payload.id);
    if (!pending) {
      return;
    }

    if (payload.ok) {
      if (!pending.ackRequired) {
        this.pendingHostMessages.delete(payload.id);
        pending.resolve();
        return;
      }
      if (pending.ackReceived) {
        this.pendingHostMessages.delete(payload.id);
        if (pending.ackOk) {
          pending.resolve();
        } else {
          const message = pending.ackError || 'ComBrief Remote rejected host message';
          this.status = { ...this.status, lastError: message };
          pending.reject(new Error(message));
        }
        return;
      }
      pending.timeout = setTimeout(() => {
        this.pendingHostMessages.delete(payload.id);
        const error = new Error('ComBrief Remote bridge did not confirm host message write');
        this.status = { ...this.status, lastError: error.message };
        pending.reject(error);
      }, HOST_MESSAGE_ACK_BASE_MS);
      return;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }
    this.pendingHostMessages.delete(payload.id);
    const message = payload.error || 'ComBrief Remote host message write failed';
    this.status = { ...this.status, lastError: message };
    pending.reject(new Error(message));
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
    private readonly callbacks: WebBluetoothBridgeTransportCallbacks = {},
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

  async openPairing(options?: { autoConnect?: boolean }): Promise<void> {
    try {
      await this.manager.showPairingWindow(options);
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
    this.clearPendingHostMessages('ComBrief Remote bridge stopped');
    this.status = { started: false, connected: false, lastError: null };
    this.manager.destroy();
  }

  getStatus(): HardwareConnectionStatus {
    this.refreshWindowStatus();
    return { ...this.status };
  }

  async sendFastState(signal: HardwareFastStateSignal): Promise<void> {
    if (!this.status.started) {
      throw new Error('ComBrief Remote bridge is not started');
    }

    const bridgeWindow = this.manager.getWindow();
    if (!bridgeWindow) {
      this.markBridgeWindowClosed();
      throw new Error('ComBrief Remote bridge is not running');
    }

    bridgeWindow.webContents.send(HARDWARE_BRIDGE_CHANNELS.sendFastState, signal);
  }

  async send(message: HardwareHostMessage): Promise<void> {
    if (!this.status.started) {
      throw new Error('ComBrief Remote bridge is not started');
    }

    const bridgeWindow = this.manager.getWindow();
    if (!bridgeWindow) {
      this.markBridgeWindowClosed();
      throw new Error('ComBrief Remote bridge is not running');
    }

    const id = `h${this.nextHostMessageSeq}`;
    this.nextHostMessageSeq = this.nextHostMessageSeq >= 999999 ? 1 : this.nextHostMessageSeq + 1;
    const ackRequired = message.type !== 'state';
    const messageWithAckId: HardwareHostMessage = ackRequired ? { ...message, hostMessageId: id } : message;

    if (!ackRequired) {
      bridgeWindow.webContents.send(HARDWARE_BRIDGE_CHANNELS.sendHostMessage, {
        id,
        message: messageWithAckId,
      });
      return;
    }

    const result = new Promise<void>((resolve, reject) => {
      this.pendingHostMessages.set(id, {
        resolve,
        reject,
        timeout: null,
        ackRequired,
        ackReceived: false,
        ackOk: false,
      });
    });

    bridgeWindow.webContents.send(HARDWARE_BRIDGE_CHANNELS.sendHostMessage, {
      id,
      message: messageWithAckId,
    });

    return result;
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

  private refreshWindowStatus(): void {
    if (this.status.started && !this.manager.getWindow()) {
      this.markBridgeWindowClosed();
    }
  }

  private markBridgeWindowClosed(): void {
    this.status = {
      started: false,
      connected: false,
      lastError: 'ComBrief Remote bridge window closed',
    };
    this.clearPendingHostMessages('ComBrief Remote bridge window closed');
  }

  private clearPendingHostMessages(reason: string): void {
    for (const [id, pending] of this.pendingHostMessages) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error(reason));
      this.pendingHostMessages.delete(id);
    }
  }

  private resolveHostAck(id: string, ok: boolean, error: string | undefined): void {
    const pending = this.pendingHostMessages.get(id);
    if (!pending) {
      return;
    }

    if (pending.timeout === null) {
      pending.ackReceived = true;
      pending.ackOk = ok;
      pending.ackError = error;
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingHostMessages.delete(id);
    if (ok) {
      pending.resolve();
      return;
    }

    const message = error || 'ComBrief Remote rejected host message';
    this.status = { ...this.status, lastError: message };
    pending.reject(new Error(message));
  }

  private subscribeBridgeEvents(): void {
    if (this.subscribed) {
      return;
    }

    this.bridgeIpcMain.on(HARDWARE_BRIDGE_CHANNELS.statusChanged, this.statusChangedListener);
    this.bridgeIpcMain.on(HARDWARE_BRIDGE_CHANNELS.deviceMessage, this.deviceMessageListener);
    this.bridgeIpcMain.on(HARDWARE_BRIDGE_CHANNELS.hostMessageResult, this.hostMessageResultListener);
    this.bridgeIpcMain.on(HARDWARE_BRIDGE_CHANNELS.error, this.errorListener);
    this.subscribed = true;
  }

  private unsubscribeBridgeEvents(): void {
    if (!this.subscribed) {
      return;
    }

    this.bridgeIpcMain.off(HARDWARE_BRIDGE_CHANNELS.statusChanged, this.statusChangedListener);
    this.bridgeIpcMain.off(HARDWARE_BRIDGE_CHANNELS.deviceMessage, this.deviceMessageListener);
    this.bridgeIpcMain.off(HARDWARE_BRIDGE_CHANNELS.hostMessageResult, this.hostMessageResultListener);
    this.bridgeIpcMain.off(HARDWARE_BRIDGE_CHANNELS.error, this.errorListener);
    this.subscribed = false;
  }
}

function isHardwareDeviceMessage(value: unknown): value is HardwareDeviceMessage {
  return (
    isHardwareHelloMessage(value) ||
    isHardwareHostAckMessage(value) ||
    isHardwareDecisionMessage(value) ||
    isHardwareBatteryMessage(value)
  );
}
