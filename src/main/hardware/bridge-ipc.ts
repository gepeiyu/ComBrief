export const HARDWARE_BRIDGE_CHANNELS = {
  ready: 'hardwareBridge:ready',
  startScan: 'hardwareBridge:startScan',
  connect: 'hardwareBridge:connect',
  disconnect: 'hardwareBridge:disconnect',
  sendHostMessage: 'hardwareBridge:sendHostMessage',
  getStatus: 'hardwareBridge:getStatus',
  statusChanged: 'hardwareBridge:statusChanged',
  deviceMessage: 'hardwareBridge:deviceMessage',
  error: 'hardwareBridge:error',
} as const;

export interface HardwareBridgeStatus {
  started: boolean;
  connected: boolean;
  scanning: boolean;
  deviceName: string | null;
  lastError: string | null;
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

export function isHardwareBridgeStatus(value: unknown): value is HardwareBridgeStatus {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const status = value as Record<string, unknown>;

  return (
    typeof status.started === 'boolean' &&
    typeof status.connected === 'boolean' &&
    typeof status.scanning === 'boolean' &&
    isStringOrNull(status.deviceName) &&
    isStringOrNull(status.lastError)
  );
}
