import { describe, expect, it } from 'vitest';
import {
  HARDWARE_BRIDGE_CHANNELS,
  isHardwareBridgeHostMessageResult,
  isHardwareBridgeStatus,
  type HardwareBridgeStatus,
} from '../src/main/hardware/bridge-ipc';

describe('hardware bridge IPC contract', () => {
  it('defines stable IPC channel names', () => {
    expect(HARDWARE_BRIDGE_CHANNELS).toEqual({
      ready: 'hardwareBridge:ready',
      startScan: 'hardwareBridge:startScan',
      connect: 'hardwareBridge:connect',
      disconnect: 'hardwareBridge:disconnect',
      sendFastState: 'hardwareBridge:sendFastState',
      sendHostMessage: 'hardwareBridge:sendHostMessage',
      hostMessageResult: 'hardwareBridge:hostMessageResult',
      getStatus: 'hardwareBridge:getStatus',
      statusChanged: 'hardwareBridge:statusChanged',
      deviceMessage: 'hardwareBridge:deviceMessage',
      error: 'hardwareBridge:error',
    });
  });

  it('accepts valid hardware bridge status objects', () => {
    const status: HardwareBridgeStatus = {
      started: true,
      connected: false,
      scanning: true,
      deviceName: 'ComBrief',
      lastError: null,
    };

    expect(isHardwareBridgeStatus(status)).toBe(true);
    expect(
      isHardwareBridgeStatus({
        started: false,
        connected: true,
        scanning: false,
        deviceName: null,
        lastError: 'connect failed',
      }),
    ).toBe(true);
  });

  it('rejects malformed hardware bridge status objects', () => {
    expect(isHardwareBridgeStatus(null)).toBe(false);
    expect(isHardwareBridgeStatus(undefined)).toBe(false);
    expect(isHardwareBridgeStatus('status')).toBe(false);
    expect(
      isHardwareBridgeStatus({
        started: true,
        connected: false,
        deviceName: null,
        lastError: null,
      }),
    ).toBe(false);
    expect(
      isHardwareBridgeStatus({
        started: 'true',
        connected: false,
        scanning: true,
        deviceName: null,
        lastError: null,
      }),
    ).toBe(false);
    expect(
      isHardwareBridgeStatus({
        started: true,
        connected: false,
        scanning: true,
        deviceName: 123,
        lastError: null,
      }),
    ).toBe(false);
    expect(
      isHardwareBridgeStatus({
        started: true,
        connected: false,
        scanning: true,
        deviceName: null,
        lastError: false,
      }),
    ).toBe(false);
  });

  it('accepts only valid host message write results', () => {
    expect(
      isHardwareBridgeHostMessageResult({ id: 'host-1', ok: true, error: null }),
    ).toBe(true);
    expect(
      isHardwareBridgeHostMessageResult({ id: 'host-1', ok: false, error: 'GATT failed' }),
    ).toBe(true);
    expect(isHardwareBridgeHostMessageResult({ id: 'host-1', ok: true })).toBe(false);
    expect(
      isHardwareBridgeHostMessageResult({ id: 'host-1', ok: 'true', error: null }),
    ).toBe(false);
    expect(
      isHardwareBridgeHostMessageResult({ id: 1, ok: true, error: null }),
    ).toBe(false);
  });
});
