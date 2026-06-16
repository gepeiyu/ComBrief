import type {
  HardwareDeviceMessage,
  HardwareFastStateSignal,
  HardwareHostMessage,
} from './protocol';
import type { HardwareConnectionStatus, HardwareTransport } from './transport';

export class MockHardwareTransport implements HardwareTransport {
  readonly sentFastStates: HardwareFastStateSignal[] = [];
  readonly sentMessages: HardwareHostMessage[] = [];

  private handlers = new Set<(message: HardwareDeviceMessage) => void>();
  private status: HardwareConnectionStatus = {
    started: false,
    connected: false,
    lastError: null,
  };

  async start(): Promise<void> {
    this.status = { started: true, connected: true, lastError: null };
  }

  setConnected(connected: boolean): void {
    this.status = { ...this.status, connected };
  }

  async stop(): Promise<void> {
    this.status = { started: false, connected: false, lastError: null };
  }

  getStatus(): HardwareConnectionStatus {
    return { ...this.status };
  }

  async sendFastState(signal: HardwareFastStateSignal): Promise<void> {
    if (!this.status.started) {
      throw new Error('ComBrief Remote bridge is not started');
    }
    if (!this.status.connected) {
      throw new Error('ComBrief Remote is not connected');
    }
    this.sentFastStates.push(signal);
  }

  async send(message: HardwareHostMessage): Promise<void> {
    if (!this.status.started) {
      throw new Error('ComBrief Remote bridge is not started');
    }
    if (!this.status.connected) {
      throw new Error('ComBrief Remote is not connected');
    }
    this.sentMessages.push(message);
  }

  onMessage(handler: (message: HardwareDeviceMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emitDeviceMessage(message: HardwareDeviceMessage): void {
    for (const handler of this.handlers) {
      handler(message);
    }
  }
}
