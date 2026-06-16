export const HARDWARE_PROTOCOL_VERSION = 1 as const;
export const COMBRIEF_REMOTE_NAME = 'ComBrief' as const;

export const COMBRIEF_REMOTE_SERVICE_UUID =
  '7b5c0001-8d4a-4c3a-9b4f-434252465001' as const;
export const COMBRIEF_REMOTE_HOST_TX_UUID =
  '7b5c0002-8d4a-4c3a-9b4f-434252465001' as const;
export const COMBRIEF_REMOTE_DEVICE_TX_UUID =
  '7b5c0003-8d4a-4c3a-9b4f-434252465001' as const;
export const COMBRIEF_REMOTE_DEVICE_INFO_UUID =
  '7b5c0004-8d4a-4c3a-9b4f-434252465001' as const;
export const COMBRIEF_REMOTE_CONTROL_UUID =
  '7b5c0005-8d4a-4c3a-9b4f-434252465001' as const;

export const hardwareProtocolLimits = {
  maxBriefLen: 48,
  maxContentLen: 80,
  maxOptions: 3,
  maxOptionLabelLen: 12,
} as const;

export type HardwareStatus = 'offline' | 'idle' | 'working' | 'waiting_user';

export type HardwareRequestKind =
  | 'SHELL'
  | 'MCP'
  | 'ASK'
  | 'PLAN'
  | 'PERMISSION';

export interface HardwareOption {
  id: string;
  label: string;
}

export interface HardwareHelloMessage {
  protocol: typeof HARDWARE_PROTOCOL_VERSION;
  type: 'hello';
  deviceName: string;
  platform: 'haas-edu-k1' | string;
  fwVersion: string;
  battery?: number;
  capabilities?: {
    display?: string;
    keys?: string[];
    briefFullToggle?: boolean;
    maxOptions?: number;
    maxBriefLen?: number;
    maxContentLen?: number;
  };
}

export interface HardwareBatteryMessage {
  protocol: typeof HARDWARE_PROTOCOL_VERSION;
  type: 'battery';
  battery: number;
  ts?: number;
}

export interface HardwareStateMessage {
  protocol: typeof HARDWARE_PROTOCOL_VERSION;
  type: 'state';
  appName?: 'ComBrief';
  appVersion?: string;
  apps?: Array<{
    id: string;
    label: string;
    status: HardwareStatus;
  }>;
  appSummary?: string;
  primary?: string;
  primaryStatus?: HardwareStatus;
  ts?: number;
}

export interface HardwareRequestMessage {
  protocol: typeof HARDWARE_PROTOCOL_VERSION;
  type: 'request';
  appName: 'ComBrief';
  appVersion: string;
  decisionId: string;
  source: string;
  sourceLabel: string;
  kind: HardwareRequestKind;
  brief: string;
  content: string;
  options: HardwareOption[];
  defaultFocus: string;
  expiresAt?: number;
}

export interface HardwareDecisionMessage {
  protocol: typeof HARDWARE_PROTOCOL_VERSION;
  type: 'decision';
  decisionId: string;
  optionId: string;
  ts: number;
}

export type HardwareResolvedResult =
  | 'approved'
  | 'denied'
  | 'selected'
  | 'handled_elsewhere'
  | 'expired'
  | 'failed';

export interface HardwareResolvedMessage {
  protocol: typeof HARDWARE_PROTOCOL_VERSION;
  type: 'resolved';
  decisionId: string;
  result: HardwareResolvedResult;
  message: string;
}

export type HardwareHostMessage =
  | HardwareStateMessage
  | HardwareRequestMessage
  | HardwareResolvedMessage;

export type HardwareDeviceMessage =
  | HardwareHelloMessage
  | HardwareDecisionMessage
  | HardwareBatteryMessage;

export function clampHardwareText(value: string, maxBytes: number): string {
  let used = 0;
  let result = '';
  for (const char of value) {
    const bytes = Buffer.byteLength(char, 'utf8');
    if (used + bytes > maxBytes) break;
    result += char;
    used += bytes;
  }
  return result;
}

export function isHardwareHelloMessage(
  value: unknown,
): value is HardwareHelloMessage {
  if (!value || typeof value !== 'object') return false;

  const msg = value as Record<string, unknown>;
  return (
    msg.protocol === HARDWARE_PROTOCOL_VERSION &&
    msg.type === 'hello' &&
    typeof msg.deviceName === 'string' &&
    msg.deviceName.length > 0 &&
    typeof msg.platform === 'string' &&
    msg.platform.length > 0 &&
    typeof msg.fwVersion === 'string' &&
    msg.fwVersion.length > 0 &&
    (msg.battery === undefined ||
      (typeof msg.battery === 'number' && Number.isFinite(msg.battery)))
  );
}

export function isHardwareBatteryMessage(
  value: unknown,
): value is HardwareBatteryMessage {
  if (!value || typeof value !== 'object') return false;

  const msg = value as Record<string, unknown>;
  return (
    msg.protocol === HARDWARE_PROTOCOL_VERSION &&
    msg.type === 'battery' &&
    typeof msg.battery === 'number' &&
    Number.isFinite(msg.battery)
  );
}

export function isHardwareDecisionMessage(
  value: unknown,
): value is HardwareDecisionMessage {
  if (!value || typeof value !== 'object') return false;

  const msg = value as Record<string, unknown>;
  return (
    msg.protocol === HARDWARE_PROTOCOL_VERSION &&
    msg.type === 'decision' &&
    typeof msg.decisionId === 'string' &&
    msg.decisionId.length > 0 &&
    typeof msg.optionId === 'string' &&
    msg.optionId.length > 0 &&
    typeof msg.ts === 'number'
  );
}
