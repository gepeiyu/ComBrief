import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { HARDWARE_BRIDGE_CHANNELS } from '../main/hardware/bridge-ipc';

type BridgeHandler = (payload?: unknown) => void;

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

function onBridgeCommand(channel: string, handler: BridgeHandler) {
  if (typeof handler !== 'function') {
    return () => undefined;
  }

  const listener = (_event: IpcRendererEvent) => {
    handler();
  };

  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

function onBridgeObjectCommand(channel: string, handler: BridgeHandler) {
  if (typeof handler !== 'function') {
    return () => undefined;
  }

  const listener = (_event: IpcRendererEvent, payload?: unknown) => {
    if (isObject(payload)) {
      handler(payload);
    }
  };

  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

contextBridge.exposeInMainWorld('combriefHardwareBridge', {
  onStartScan: (handler: BridgeHandler) => onBridgeCommand(HARDWARE_BRIDGE_CHANNELS.startScan, handler),
  onConnect: (handler: BridgeHandler) => onBridgeCommand(HARDWARE_BRIDGE_CHANNELS.connect, handler),
  onDisconnect: (handler: BridgeHandler) => onBridgeCommand(HARDWARE_BRIDGE_CHANNELS.disconnect, handler),
  onSendHostMessage: (handler: BridgeHandler) => onBridgeObjectCommand(HARDWARE_BRIDGE_CHANNELS.sendHostMessage, handler),
  sendReady: () => {
    ipcRenderer.send(HARDWARE_BRIDGE_CHANNELS.ready);
  },
  sendStatus: (status: unknown) => {
    if (isObject(status)) {
      ipcRenderer.send(HARDWARE_BRIDGE_CHANNELS.statusChanged, status);
    }
  },
  sendDeviceMessage: (message: unknown) => {
    if (isObject(message)) {
      ipcRenderer.send(HARDWARE_BRIDGE_CHANNELS.deviceMessage, message);
    }
  },
  sendError: (message: unknown) => {
    if (typeof message === 'string') {
      ipcRenderer.send(HARDWARE_BRIDGE_CHANNELS.error, message);
    }
  },
});
