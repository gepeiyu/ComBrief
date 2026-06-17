import {
  isHardwareBatteryMessage,
  isHardwareDecisionMessage,
  isHardwareHelloMessage,
  type HardwareDecisionMessage,
  type HardwareDeviceMessage,
  type HardwareFastStateSignal,
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
  private fastStateSeq = 0;
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

  async sendState(message: HardwareStateMessage): Promise<void> {
    if (!(message.skipFastWaitingUser && message.primaryStatus === 'waiting_user')) {
      await this.sendFastStateBestEffort(this.fastStateFromState(message));
    }
    return this.send(message);
  }

  sendRequest(message: HardwareRequestMessage): Promise<void> {
    void this.sendFastStateBestEffort({
      seq: this.nextFastStateSeq(),
      label: message.sourceLabel,
      status: 'waiting_user',
    });
    return this.send(message);
  }

  sendResolved(message: HardwareResolvedMessage): Promise<void> {
    return this.send(message);
  }

  private async sendFastStateBestEffort(signal: HardwareFastStateSignal): Promise<void> {
    try {
      await this.sendFastState(signal);
    } catch {
      // Fast state is only a low-latency hint; the reliable host message below is authoritative.
    }
  }

  private async sendFastState(signal: HardwareFastStateSignal): Promise<void> {
    await this.transport.sendFastState(signal);
  }

  private fastStateFromState(message: HardwareStateMessage): HardwareFastStateSignal {
    const primary = message.apps?.find((app) => app.id === message.primary) ?? message.apps?.[0];
    const summaryLine = message.appSummary?.split('\n').find((line) => line.trim().length > 0);
    return {
      seq: this.nextFastStateSeq(),
      label: message.primaryLabel ?? primary?.label ?? summaryLine?.split(' ')[0] ?? 'CB',
      status: message.primaryStatus ?? primary?.status ?? 'idle',
    };
  }

  private nextFastStateSeq(): number {
    this.fastStateSeq = (this.fastStateSeq % 999_999) + 1;
    return this.fastStateSeq;
  }

  private async send(message: HardwareHostMessage): Promise<void> {
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
