import type {
  HardwareDeviceMessage,
  HardwareFastStateSignal,
  HardwareHostMessage,
} from './protocol';

export interface HardwareConnectionStatus {
  started: boolean;
  connected: boolean;
  lastError: string | null;
}

export interface HardwareTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): HardwareConnectionStatus;
  sendFastState(signal: HardwareFastStateSignal): Promise<void>;
  send(message: HardwareHostMessage): Promise<void>;
  onMessage(handler: (message: HardwareDeviceMessage) => void): () => void;
}
