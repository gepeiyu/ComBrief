import { describe, expect, it } from 'vitest';
import {
  COMBRIEF_REMOTE_NAME,
  COMBRIEF_REMOTE_SERVICE_UUID,
  COMBRIEF_REMOTE_HOST_TX_UUID,
  COMBRIEF_REMOTE_DEVICE_TX_UUID,
  COMBRIEF_REMOTE_DEVICE_INFO_UUID,
  COMBRIEF_REMOTE_CONTROL_UUID,
  clampHardwareText,
  isHardwareDecisionMessage,
  isHardwareHelloMessage,
  isHardwareHostAckMessage,
  isHardwareBatteryMessage,
  hardwareProtocolLimits,
  type HardwareHostMessage,
  type HardwareDeviceMessage,
  type HardwareBatteryMessage,
  type HardwareRequestKind,
  type HardwareRequestMessage,
  type HardwareResolvedResult,
  type HardwareStatus,
} from '../src/main/hardware/protocol';

type Expect<T extends true> = T;
type RequestKeys = keyof HardwareRequestMessage;
type RequestOptionKeys = keyof HardwareRequestMessage['options'][number];
type _RequestOmitsDanger = Expect<'danger' extends RequestKeys ? false : true>;
type _RequestOptionsOmitDetails = Expect<
  'details' extends RequestOptionKeys ? false : true
>;

void (0 as unknown as _RequestOmitsDanger);
void (0 as unknown as _RequestOptionsOmitDetails);

describe('hardware protocol', () => {
  it('uses the finalized ComBrief Remote name and service UUID', () => {
    expect(COMBRIEF_REMOTE_NAME).toBe('ComBrief');
    expect(COMBRIEF_REMOTE_SERVICE_UUID).toBe(
      '7b5c0001-8d4a-4c3a-9b4f-434252465001',
    );
  });

  it('uses the finalized characteristic UUIDs', () => {
    expect(COMBRIEF_REMOTE_HOST_TX_UUID).toBe(
      '7b5c0002-8d4a-4c3a-9b4f-434252465001',
    );
    expect(COMBRIEF_REMOTE_DEVICE_TX_UUID).toBe(
      '7b5c0003-8d4a-4c3a-9b4f-434252465001',
    );
    expect(COMBRIEF_REMOTE_DEVICE_INFO_UUID).toBe(
      '7b5c0004-8d4a-4c3a-9b4f-434252465001',
    );
    expect(COMBRIEF_REMOTE_CONTROL_UUID).toBe(
      '7b5c0005-8d4a-4c3a-9b4f-434252465001',
    );
  });

  it('defines finalized hardware protocol limits', () => {
    expect(hardwareProtocolLimits).toEqual({
      maxBriefLen: 48,
      maxContentLen: 80,
      maxOptions: 3,
      maxOptionLabelLen: 12,
    });
  });

  it('clamps text to hardware protocol limits', () => {
    expect(clampHardwareText('abcdef', 3)).toBe('abc');
    expect(clampHardwareText('', 3)).toBe('');
    expect(clampHardwareText('ok', hardwareProtocolLimits.maxBriefLen)).toBe('ok');
  });

  it('accepts valid decision messages', () => {
    expect(
      isHardwareDecisionMessage({
        protocol: 1,
        type: 'decision',
        decisionId: 'request-1',
        optionId: 'allow',
        ts: 1710000000000,
      }),
    ).toBe(true);
  });

  it('rejects malformed decision messages', () => {
    expect(isHardwareDecisionMessage({ type: 'decision' })).toBe(false);
    expect(
      isHardwareDecisionMessage({
        protocol: 2,
        type: 'decision',
        decisionId: 'request-1',
        optionId: 'allow',
        ts: 1710000000000,
      }),
    ).toBe(false);
    expect(
      isHardwareDecisionMessage({
        protocol: 1,
        type: 'decision',
        decisionId: 'request-1',
        optionId: 'allow',
      }),
    ).toBe(false);
    expect(
      isHardwareDecisionMessage({
        protocol: 1,
        type: 'decision',
        decisionId: 'request-1',
        ts: 1710000000000,
      }),
    ).toBe(false);
  });

  it('accepts valid host ACK messages', () => {
    expect(
      isHardwareHostAckMessage({
        protocol: 1,
        type: 'ack',
        hostMessageId: 'host-123',
        ok: true,
        ts: 1710000000000,
      }),
    ).toBe(true);
    expect(
      isHardwareHostAckMessage({
        protocol: 1,
        type: 'ack',
        hostMessageId: 'host-123',
        ok: false,
        error: 'parse failed',
        ts: 1710000000000,
      }),
    ).toBe(true);
  });

  it('rejects malformed host ACK messages', () => {
    expect(isHardwareHostAckMessage({ type: 'ack' })).toBe(false);
    expect(
      isHardwareHostAckMessage({
        protocol: 1,
        type: 'ack',
        id: 'host-123',
        ok: true,
      }),
    ).toBe(false);
    expect(
      isHardwareHostAckMessage({
        protocol: 1,
        type: 'ack',
        hostMessageId: 'host-123',
        ok: 'true',
      }),
    ).toBe(false);
  });

  it('accepts valid hello and battery messages', () => {
    expect(
      isHardwareHelloMessage({
        protocol: 1,
        type: 'hello',
        deviceName: 'ComBrief',
        platform: 'haas-edu-k1',
        fwVersion: '0.1.0',
        battery: 78,
      }),
    ).toBe(true);
    expect(
      isHardwareBatteryMessage({
        protocol: 1,
        type: 'battery',
        battery: 78,
        ts: 1710000000000,
      }),
    ).toBe(true);
  });

  it('rejects malformed hello and battery messages', () => {
    expect(isHardwareHelloMessage({ type: 'hello' })).toBe(false);
    expect(
      isHardwareHelloMessage({
        protocol: 2,
        type: 'hello',
        deviceName: 'ComBrief',
        platform: 'haas-edu-k1',
        fwVersion: '0.1.0',
      }),
    ).toBe(false);
    expect(
      isHardwareHelloMessage({
        protocol: 1,
        type: 'hello',
        deviceName: 'ComBrief',
        platform: 'haas-edu-k1',
        fwVersion: '0.1.0',
        battery: Number.NaN,
      }),
    ).toBe(false);
    expect(isHardwareBatteryMessage({ protocol: 1, type: 'battery' })).toBe(false);
    expect(
      isHardwareBatteryMessage({ protocol: 1, type: 'battery', battery: '78' }),
    ).toBe(false);
    expect(
      isHardwareBatteryMessage({
        protocol: 1,
        type: 'battery',
        battery: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
  });

  it('request messages do not include danger or details options', () => {
    const request: HardwareRequestMessage = {
      protocol: 1,
      type: 'request',
      appName: 'ComBrief',
      appVersion: '0.1.2',
      decisionId: 'request-1',
      source: 'claude-code',
      sourceLabel: 'CC',
      kind: 'SHELL',
      brief: 'npm install noble',
      content: 'npm install @abandonware/noble',
      options: [
        { id: 'allow', label: 'Allow' },
        { id: 'deny', label: 'Deny' },
      ],
      defaultFocus: 'allow',
    };

    expect(JSON.stringify(request)).not.toContain('danger');
    expect(request.options.map((o) => o.id)).not.toContain('details');
  });

  it('covers the minimal message set and enums from the spec', () => {
    const statuses: HardwareStatus[] = [
      'offline',
      'idle',
      'working',
      'waiting_user',
    ];
    const requestKinds: HardwareRequestKind[] = [
      'SHELL',
      'MCP',
      'ASK',
      'PLAN',
      'PERMISSION',
    ];
    const resolvedResults: HardwareResolvedResult[] = [
      'approved',
      'denied',
      'selected',
      'handled_elsewhere',
      'expired',
      'failed',
    ];
    const hostMessages: HardwareHostMessage[] = [
      {
        protocol: 1,
        type: 'state',
        appName: 'ComBrief',
        appVersion: '0.1.2',
        apps: [{ id: 'claude-code', label: 'CC', status: statuses[2] }],
        primary: 'claude-code',
        ts: 1710000000000,
      },
      {
        protocol: 1,
        type: 'request',
        appName: 'ComBrief',
        appVersion: '0.1.2',
        decisionId: 'request-1',
        source: 'claude-code',
        sourceLabel: 'CC',
        kind: requestKinds[0],
        brief: 'npm install noble',
        content: 'npm install @abandonware/noble',
        options: [{ id: 'allow', label: 'Allow' }],
        defaultFocus: 'allow',
      },
      {
        protocol: 1,
        type: 'resolved',
        decisionId: 'request-1',
        result: resolvedResults[0],
        message: 'Approved by Remote',
      },
    ];
    const deviceMessages: HardwareDeviceMessage[] = [
      {
        protocol: 1,
        type: 'hello',
        deviceName: 'ComBrief',
        platform: 'haas-edu-k1',
        fwVersion: '0.1.0',
        battery: 78,
      },
      {
        protocol: 1,
        type: 'decision',
        decisionId: 'request-1',
        optionId: 'allow',
        ts: 1710000000000,
      },
      {
        protocol: 1,
        type: 'battery',
        battery: 78,
        ts: 1710000001000,
      } satisfies HardwareBatteryMessage,
    ];

    expect(hostMessages.map((message) => message.type)).toEqual([
      'state',
      'request',
      'resolved',
    ]);
    expect(deviceMessages.map((message) => message.type)).toEqual([
      'hello',
      'decision',
      'battery',
    ]);
    expect(requestKinds).toContain('PERMISSION');
  });
});
