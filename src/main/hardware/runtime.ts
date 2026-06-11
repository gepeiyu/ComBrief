import {
  isHardwareBatteryMessage,
  isHardwareDecisionMessage,
  isHardwareHelloMessage,
  type HardwareDecisionMessage,
  type HardwareDeviceMessage,
  type HardwareHostMessage,
  type HardwareResolvedMessage,
  type HardwareRequestMessage,
  type HardwareStateMessage,
} from './protocol';
import type { HardwareConnectionStatus, HardwareTransport } from './transport';

export interface HardwareRuntimeCallbacks {
  onDecision?: (message: HardwareDecisionMessage) => void;
  onHello?: () => void | Promise<void>;
}

export interface HardwareRuntimeStatus extends HardwareConnectionStatus {
  deviceName: string | null;
  platform: string | null;
  fwVersion: string | null;
  battery: number | null;
}

export class HardwareRuntime {
  private offMessage: (() => void) | null = null;
  private device = {
    deviceName: null as string | null,
    platform: null as string | null,
    fwVersion: null as string | null,
    battery: null as number | null,
  };

  constructor(
    private readonly transport: HardwareTransport,
    private readonly callbacks: HardwareRuntimeCallbacks = {},
  ) {}

  async start(): Promise<void> {
    let subscribed = false;
    if (!this.offMessage) {
      this.offMessage = this.transport.onMessage((message) => this.handleMessage(message));
      subscribed = true;
    }

    try {
      await this.transport.start();
    } catch (error) {
      if (subscribed) {
        this.offMessage?.();
        this.offMessage = null;
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.offMessage?.();
    this.offMessage = null;
    await this.transport.stop();
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  getStatus(): HardwareRuntimeStatus {
    return { ...this.transport.getStatus(), ...this.device };
  }

  sendState(message: HardwareStateMessage): Promise<void> {
    return this.send(message);
  }

  sendRequest(message: HardwareRequestMessage): Promise<void> {
    return this.send(message);
  }

  sendResolved(message: HardwareResolvedMessage): Promise<void> {
    return this.send(message);
  }

  private async send(message: HardwareHostMessage): Promise<void> {
    if (!this.transport.getStatus().started) return;
    await this.transport.send(message);
  }

  private handleMessage(message: HardwareDeviceMessage): void {
    if (isHardwareHelloMessage(message)) {
      this.device = {
        deviceName: message.deviceName,
        platform: message.platform,
        fwVersion: message.fwVersion,
        battery: typeof message.battery === 'number' ? message.battery : this.device.battery,
      };
      void this.callbacks.onHello?.();
      return;
    }

    if (isHardwareBatteryMessage(message)) {
      this.device = { ...this.device, battery: message.battery };
      return;
    }

    if (isHardwareDecisionMessage(message)) {
      this.callbacks.onDecision?.(message);
    }
  }
}
