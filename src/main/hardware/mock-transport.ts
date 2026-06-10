import type {
  HardwareDeviceMessage,
  HardwareHostMessage,
} from './protocol';
import type { HardwareConnectionStatus, HardwareTransport } from './transport';

export class MockHardwareTransport implements HardwareTransport {
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

  async stop(): Promise<void> {
    this.status = { started: false, connected: false, lastError: null };
  }

  getStatus(): HardwareConnectionStatus {
    return { ...this.status };
  }

  async send(message: HardwareHostMessage): Promise<void> {
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
