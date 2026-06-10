import type {
  HardwareDeviceMessage,
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
  send(message: HardwareHostMessage): Promise<void>;
  onMessage(handler: (message: HardwareDeviceMessage) => void): () => void;
}
