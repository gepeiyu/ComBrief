# ComBrief Remote HaaS EDU K1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use tre:subagent-driven-development (recommended) or tre:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ComBrief Remote support for HaaS EDU K1, starting with a tested desktop-side hardware channel and ending with a validated BLE/OLED/button firmware path.

**Architecture:** Add a `src/main/hardware/` boundary that converts ComBrief app state and `DecisionService` pending decisions into a small JSON protocol for ComBrief Remote. Keep BLE behind a `HardwareTransport` abstraction so decision logic can be tested with `MockHardwareTransport` before native BLE and AliOS firmware are implemented.

**Tech Stack:** Electron main process, TypeScript, Vitest, BLE GATT JSON protocol, AliOS Things 3.3 / HaaS Studio for firmware.

---

## Scope Split

This specification touches two independently testable subsystems:

1. **Desktop-side ComBrief integration** — TypeScript protocol, request builder, decision mapping, mock transport, runtime, `DecisionService`, config, settings UI, and tests.
2. **HaaS EDU K1 firmware** — AliOS Things project, BLE service, OLED UI, button handling, LEDs, and serial/host validation.

Implement desktop-side tasks first. They produce working, testable software without a physical HaaS device. Firmware tasks depend on the protocol types from the desktop tasks but can be developed in a separate AliOS Things workspace once the desktop protocol is stable.

## File Structure

### Desktop files

- Create: `src/main/hardware/protocol.ts` — protocol constants, message types, validation helpers, payload truncation helpers.
- Create: `src/main/hardware/request-builder.ts` — converts `DecisionWaitBody + requestId + appVersion` into `HardwareRequestMessage`.
- Create: `src/main/hardware/decision-mapper.ts` — converts `HardwareDecisionMessage + PendingDecision` into existing `DecisionAction`.
- Create: `src/main/hardware/transport.ts` — transport interface and connection status types.
- Create: `src/main/hardware/mock-transport.ts` — in-memory transport for tests and early development.
- Create: `src/main/hardware/runtime.ts` — runtime that owns transport lifecycle, status, state push, request push, and device messages.
- Create later: `src/main/hardware/ble-transport.ts` — real BLE GATT implementation after mock flow is tested.
- Modify: `src/main/config.ts` — add default `hardware` config.
- Modify: `src/main/decision-service.ts` — add hardware channel support and `resolveFromHardware()`.
- Modify: `src/main/app-controller.ts` — expose current app state snapshot and push state changes to hardware runtime.
- Modify: `src/main/index.ts` — construct hardware runtime, restart on config changes, add IPC methods.
- Modify: `src/preload/settings-preload.ts` — expose hardware IPC methods.
- Modify: `src/renderer/settings.html` — add ComBrief Remote settings section.
- Modify: `src/renderer/settings.js` — bind hardware settings/status/test actions.
- Modify: i18n message files under `src/main/i18n/` as required by current project structure.

### Desktop tests

- Create: `tests/hardware-protocol.test.ts`
- Create: `tests/hardware-request-builder.test.ts`
- Create: `tests/hardware-decision-mapper.test.ts`
- Create: `tests/hardware-runtime.test.ts`
- Create: `tests/decision-service-hardware.test.ts`
- Modify: `tests/config.test.ts`

### Firmware files

Actual AliOS paths depend on the HaaS Studio generated workspace. Use one of these layouts:

```text
solutions/combrief_remote/
├─ package.yaml
├─ SConstruct
├─ combrief_remote.c
├─ app_state/
├─ ble_service/
├─ display/
├─ input/
├─ led/
├─ protocol/
└─ power/
```

or, for early validation inside `eduk1_demo`:

```text
solutions/eduk1_demo/k1_apps/combrief_remote/
├─ combrief_remote.c
├─ app_state.c / app_state.h
├─ ble_service.c / ble_service.h
├─ display.c / display.h
├─ input.c / input.h
├─ led.c / led.h
├─ protocol.c / protocol.h
└─ power.c / power.h
```

---

### Task 1: Desktop Protocol Types

**Files:**
- Create: `src/main/hardware/protocol.ts`
- Test: `tests/hardware-protocol.test.ts`

- [ ] **Step 1: Write failing protocol tests**

Create `tests/hardware-protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  COMBRIEF_REMOTE_NAME,
  COMBRIEF_REMOTE_SERVICE_UUID,
  clampHardwareText,
  isHardwareDecisionMessage,
  hardwareProtocolLimits,
  type HardwareRequestMessage,
} from '../src/main/hardware/protocol';

describe('hardware protocol', () => {
  it('uses the finalized ComBrief Remote name and service UUID', () => {
    expect(COMBRIEF_REMOTE_NAME).toBe('ComBrief-Remote');
    expect(COMBRIEF_REMOTE_SERVICE_UUID).toBe(
      '7b5c0001-8d4a-4c3a-9b4f-434252465001',
    );
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
});
```

- [ ] **Step 2: Run protocol tests and verify they fail**

Run: `npm test -- tests/hardware-protocol.test.ts`

Expected: FAIL because `src/main/hardware/protocol.ts` does not exist.

- [ ] **Step 3: Implement protocol types and helpers**

Create `src/main/hardware/protocol.ts`:

```ts
export const HARDWARE_PROTOCOL_VERSION = 1 as const;
export const COMBRIEF_REMOTE_NAME = 'ComBrief-Remote';

export const COMBRIEF_REMOTE_SERVICE_UUID =
  '7b5c0001-8d4a-4c3a-9b4f-434252465001';
export const COMBRIEF_REMOTE_HOST_TX_UUID =
  '7b5c0002-8d4a-4c3a-9b4f-434252465001';
export const COMBRIEF_REMOTE_DEVICE_TX_UUID =
  '7b5c0003-8d4a-4c3a-9b4f-434252465001';
export const COMBRIEF_REMOTE_DEVICE_INFO_UUID =
  '7b5c0004-8d4a-4c3a-9b4f-434252465001';
export const COMBRIEF_REMOTE_CONTROL_UUID =
  '7b5c0005-8d4a-4c3a-9b4f-434252465001';

export const hardwareProtocolLimits = {
  maxBriefLen: 64,
  maxContentLen: 1024,
  maxOptions: 8,
  maxOptionLabelLen: 24,
} as const;

export type HardwareRequestKind =
  | 'SHELL'
  | 'MCP'
  | 'ASK'
  | 'PLAN'
  | 'PERMISSION';

export type HardwareLightStatus =
  | 'offline'
  | 'idle'
  | 'working'
  | 'waiting_user';

export interface HardwareOption {
  id: string;
  label: string;
}

export interface HardwareHelloMessage {
  protocol: 1;
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

export interface HardwareStateMessage {
  protocol: 1;
  type: 'state';
  appName: 'ComBrief';
  appVersion: string;
  apps: Array<{
    id: string;
    label: string;
    status: HardwareLightStatus;
  }>;
  primary?: string;
  ts: number;
}

export interface HardwareRequestMessage {
  protocol: 1;
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
  protocol: 1;
  type: 'decision';
  decisionId: string;
  optionId: string;
  ts?: number;
}

export interface HardwareResolvedMessage {
  protocol: 1;
  type: 'resolved';
  decisionId: string;
  result: 'approved' | 'denied' | 'selected' | 'handled_elsewhere' | 'expired' | 'failed';
  message: string;
}

export interface HardwareBatteryMessage {
  protocol: 1;
  type: 'battery';
  battery: number;
  charging?: boolean;
  ts?: number;
}

export interface HardwareErrorMessage {
  protocol: 1;
  type: 'error';
  code: string;
  message: string;
}

export type HardwareHostMessage =
  | HardwareStateMessage
  | HardwareRequestMessage
  | HardwareResolvedMessage
  | { protocol: 1; type: 'control'; command: string; message?: string };

export type HardwareDeviceMessage =
  | HardwareHelloMessage
  | HardwareDecisionMessage
  | HardwareBatteryMessage
  | HardwareErrorMessage
  | { protocol: 1; type: 'key'; key: string; event: 'short'; screen?: string; ts?: number };

export function clampHardwareText(value: unknown, maxLen: number): string {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  return text.length > maxLen ? text.slice(0, maxLen) : text;
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
    msg.optionId.length > 0
  );
}
```

- [ ] **Step 4: Run protocol tests and verify they pass**

Run: `npm test -- tests/hardware-protocol.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit protocol layer**

Run:

```bash
git add src/main/hardware/protocol.ts tests/hardware-protocol.test.ts
git commit -m "feat: add ComBrief Remote protocol types"
```

---

### Task 2: Hardware Config Defaults

**Files:**
- Modify: `src/main/config.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Write failing config test**

Append to `tests/config.test.ts` inside the existing `describe('config', () => { ... })` block:

```ts
  it('defaultConfig includes disabled ComBrief Remote hardware', () => {
    expect(defaultConfig().hardware).toEqual({
      enabled: false,
      deviceName: 'ComBrief-Remote',
      autoReconnect: true,
      lastDeviceId: '',
      statusPushEnabled: true,
      decisionPushEnabled: true,
    });
  });
```

- [ ] **Step 2: Run config test and verify it fails**

Run: `npm test -- tests/config.test.ts`

Expected: FAIL because `hardware` is not in `CombriefConfig`.

- [ ] **Step 3: Add hardware config**

Modify `src/main/config.ts` near `SlackConfig`:

```ts
export interface HardwareConfig {
  enabled: boolean;
  deviceName: string;
  autoReconnect: boolean;
  lastDeviceId: string;
  statusPushEnabled: boolean;
  decisionPushEnabled: boolean;
}

export function defaultHardwareConfig(): HardwareConfig {
  return {
    enabled: false,
    deviceName: 'ComBrief-Remote',
    autoReconnect: true,
    lastDeviceId: '',
    statusPushEnabled: true,
    decisionPushEnabled: true,
  };
}
```

Add `hardware` to `CombriefConfig`:

```ts
  hardware: HardwareConfig;
```

Add to `defaultConfig()` return value:

```ts
    hardware: defaultHardwareConfig(),
```

Add to `loadConfig()` return value:

```ts
    hardware: {
      ...base.hardware,
      ...(raw.hardware ?? {}),
    },
```

Update `AppController.updateConfig()` later in Task 8 to merge nested hardware config when settings writes arrive.

- [ ] **Step 4: Run config tests**

Run: `npm test -- tests/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit config defaults**

Run:

```bash
git add src/main/config.ts tests/config.test.ts
git commit -m "feat: add ComBrief Remote config defaults"
```

---

### Task 3: Hardware Request Builder

**Files:**
- Create: `src/main/hardware/request-builder.ts`
- Test: `tests/hardware-request-builder.test.ts`

- [ ] **Step 1: Write failing request-builder tests**

Create `tests/hardware-request-builder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildHardwareRequest } from '../src/main/hardware/request-builder';
import type { DecisionWaitBody } from '../src/main/decision/types';

describe('buildHardwareRequest', () => {
  it('builds allow-first shell requests without details or danger', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      sessionId: 'sess-1',
      cwd: '<workspace>/ComBrief',
      toolName: 'Bash',
      toolInput: { command: 'npm install @abandonware/noble' },
    };

    const msg = buildHardwareRequest('request-1', body, '0.1.2', 30_000);

    expect(msg).toMatchObject({
      protocol: 1,
      type: 'request',
      appName: 'ComBrief',
      appVersion: '0.1.2',
      decisionId: 'request-1',
      source: 'claude-code',
      sourceLabel: 'CC',
      kind: 'SHELL',
      defaultFocus: 'allow',
    });
    expect(msg.options).toEqual([
      { id: 'allow', label: 'Allow' },
      { id: 'deny', label: 'Deny' },
    ]);
    expect(msg.brief).toContain('npm install');
    expect(msg.content).toContain('cwd: <workspace>/ComBrief');
    expect(JSON.stringify(msg)).not.toContain('danger');
    expect(msg.options.map((o) => o.id)).not.toContain('details');
  });

  it('builds AskUserQuestion options with option: indexes', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      toolName: 'AskUserQuestion',
      toolInput: {
        questions: [
          {
            question: 'First version support?',
            options: [
              { label: 'macOS + Windows' },
              { label: 'macOS only' },
            ],
          },
        ],
      },
    };

    const msg = buildHardwareRequest('request-ask', body, '0.1.2', 30_000);

    expect(msg.kind).toBe('ASK');
    expect(msg.defaultFocus).toBe('option:0');
    expect(msg.options).toEqual([
      { id: 'option:0', label: 'macOS + Windows' },
      { id: 'option:1', label: 'macOS only' },
    ]);
    expect(msg.content).toContain('First version support?');
  });

  it('builds ExitPlanMode as approve/reject', () => {
    const msg = buildHardwareRequest(
      'request-plan',
      {
        appId: 'claude-code',
        hookEvent: 'permissionRequest',
        toolName: 'ExitPlanMode',
        toolInput: { plan: 'Implement the feature' },
      },
      '0.1.2',
      30_000,
    );

    expect(msg.kind).toBe('PLAN');
    expect(msg.defaultFocus).toBe('allow');
    expect(msg.options).toEqual([
      { id: 'allow', label: 'Approve' },
      { id: 'deny', label: 'Reject' },
    ]);
  });
});
```

- [ ] **Step 2: Run request-builder tests and verify they fail**

Run: `npm test -- tests/hardware-request-builder.test.ts`

Expected: FAIL because `request-builder.ts` does not exist.

- [ ] **Step 3: Implement request builder**

Create `src/main/hardware/request-builder.ts`:

```ts
import { formatToolSummary } from '../slack/tool-summary';
import type { DecisionWaitBody } from '../decision/types';
import {
  HARDWARE_PROTOCOL_VERSION,
  clampHardwareText,
  hardwareProtocolLimits,
  type HardwareOption,
  type HardwareRequestKind,
  type HardwareRequestMessage,
} from './protocol';

function sourceLabel(appId: string): string {
  if (appId === 'claude-code') return 'CC';
  if (appId === 'cursor') return 'CU';
  return appId.slice(0, 2).toUpperCase();
}

function requestKind(body: DecisionWaitBody): HardwareRequestKind {
  if (body.toolName === 'AskUserQuestion') return 'ASK';
  if (body.toolName === 'ExitPlanMode') return 'PLAN';
  if (body.toolName === 'Bash') return 'SHELL';
  if (body.toolName.toLowerCase().includes('mcp')) return 'MCP';
  return 'PERMISSION';
}

function firstLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

function stringifyToolInput(input: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return lines.join('\n');
}

function askOptions(body: DecisionWaitBody): HardwareOption[] {
  const questions = body.toolInput.questions;
  if (!Array.isArray(questions)) return [];
  const labels = questions.flatMap((q) => {
    if (!q || typeof q !== 'object') return [];
    const options = (q as { options?: unknown }).options;
    if (!Array.isArray(options)) return [];
    return options.flatMap((o) => {
      if (!o || typeof o !== 'object') return [];
      const label = (o as { label?: unknown }).label;
      return typeof label === 'string' ? [label] : [];
    });
  });
  return labels.slice(0, hardwareProtocolLimits.maxOptions).map((label, index) => ({
    id: `option:${index}`,
    label: clampHardwareText(label, hardwareProtocolLimits.maxOptionLabelLen),
  }));
}

function askContent(body: DecisionWaitBody): string {
  const questions = body.toolInput.questions;
  if (!Array.isArray(questions)) return stringifyToolInput(body.toolInput);
  return questions
    .flatMap((q) => {
      if (!q || typeof q !== 'object') return [];
      const question = (q as { question?: unknown }).question;
      return typeof question === 'string' ? [question] : [];
    })
    .join('\n');
}

function optionsFor(body: DecisionWaitBody): { options: HardwareOption[]; defaultFocus: string } {
  if (body.toolName === 'AskUserQuestion') {
    const options = askOptions(body);
    return { options, defaultFocus: options[0]?.id ?? 'option:0' };
  }
  if (body.toolName === 'ExitPlanMode') {
    return {
      options: [
        { id: 'allow', label: 'Approve' },
        { id: 'deny', label: 'Reject' },
      ],
      defaultFocus: 'allow',
    };
  }
  return {
    options: [
      { id: 'allow', label: 'Allow' },
      { id: 'deny', label: 'Deny' },
    ],
    defaultFocus: 'allow',
  };
}

function contentFor(body: DecisionWaitBody): string {
  if (body.toolName === 'AskUserQuestion') return askContent(body);
  const lines = [formatToolSummary(body.toolName, body.toolInput)];
  const input = stringifyToolInput(body.toolInput);
  if (input) lines.push(input);
  if (body.cwd) lines.push(`cwd: ${body.cwd}`);
  return lines.filter(Boolean).join('\n');
}

export function buildHardwareRequest(
  requestId: string,
  body: DecisionWaitBody,
  appVersion: string,
  timeoutMs: number,
  now = Date.now(),
): HardwareRequestMessage {
  const content = clampHardwareText(contentFor(body), hardwareProtocolLimits.maxContentLen);
  const { options, defaultFocus } = optionsFor(body);
  return {
    protocol: HARDWARE_PROTOCOL_VERSION,
    type: 'request',
    appName: 'ComBrief',
    appVersion,
    decisionId: requestId,
    source: body.appId,
    sourceLabel: sourceLabel(body.appId),
    kind: requestKind(body),
    brief: clampHardwareText(firstLine(content), hardwareProtocolLimits.maxBriefLen),
    content,
    options,
    defaultFocus,
    expiresAt: now + timeoutMs,
  };
}
```

- [ ] **Step 4: Run request-builder tests**

Run: `npm test -- tests/hardware-request-builder.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit request builder**

Run:

```bash
git add src/main/hardware/request-builder.ts tests/hardware-request-builder.test.ts
git commit -m "feat: build ComBrief Remote requests"
```

---

### Task 4: Hardware Decision Mapper

**Files:**
- Create: `src/main/hardware/decision-mapper.ts`
- Test: `tests/hardware-decision-mapper.test.ts`

- [ ] **Step 1: Write failing mapper tests**

Create `tests/hardware-decision-mapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapHardwareDecisionToAction } from '../src/main/hardware/decision-mapper';
import type { PendingDecision } from '../src/main/decision/types';

function pending(toolName: string, toolInput: Record<string, unknown> = {}): PendingDecision {
  return {
    requestId: 'request-1',
    createdAt: Date.now(),
    body: {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      toolName,
      toolInput,
    },
  };
}

describe('mapHardwareDecisionToAction', () => {
  it('maps allow to allowOnce', () => {
    expect(mapHardwareDecisionToAction({ optionId: 'allow' }, pending('Bash'))).toEqual({
      kind: 'allowOnce',
    });
  });

  it('maps deny to deny', () => {
    expect(mapHardwareDecisionToAction({ optionId: 'deny' }, pending('Bash'))).toEqual({
      kind: 'deny',
    });
  });

  it('maps ExitPlanMode deny with a hardware-specific reason', () => {
    expect(mapHardwareDecisionToAction({ optionId: 'deny' }, pending('ExitPlanMode'))).toEqual({
      kind: 'deny',
      reason: 'Denied via ComBrief Remote',
    });
  });

  it('maps option indexes to AskUserQuestion labels', () => {
    expect(
      mapHardwareDecisionToAction(
        { optionId: 'option:1' },
        pending('AskUserQuestion', {
          questions: [
            {
              question: 'Pick one',
              options: [{ label: 'A' }, { label: 'B' }],
            },
          ],
        }),
      ),
    ).toEqual({ kind: 'option', optionLabel: 'B' });
  });

  it('returns null for invalid option ids', () => {
    expect(mapHardwareDecisionToAction({ optionId: 'option:9' }, pending('AskUserQuestion'))).toBeNull();
    expect(mapHardwareDecisionToAction({ optionId: 'surprise' }, pending('Bash'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run mapper tests and verify they fail**

Run: `npm test -- tests/hardware-decision-mapper.test.ts`

Expected: FAIL because `decision-mapper.ts` does not exist.

- [ ] **Step 3: Implement decision mapper**

Create `src/main/hardware/decision-mapper.ts`:

```ts
import type { PendingDecision } from '../decision/types';
import type { DecisionAction } from '../slack/hook-stdout';

function askOptionLabels(pending: PendingDecision): string[] {
  const questions = pending.body.toolInput.questions;
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((q) => {
    if (!q || typeof q !== 'object') return [];
    const options = (q as { options?: unknown }).options;
    if (!Array.isArray(options)) return [];
    return options.flatMap((o) => {
      if (!o || typeof o !== 'object') return [];
      const label = (o as { label?: unknown }).label;
      return typeof label === 'string' ? [label] : [];
    });
  });
}

export function mapHardwareDecisionToAction(
  decision: { optionId: string },
  pending: PendingDecision,
): DecisionAction | null {
  if (decision.optionId === 'allow') {
    return { kind: 'allowOnce' };
  }
  if (decision.optionId === 'deny') {
    if (pending.body.toolName === 'ExitPlanMode') {
      return { kind: 'deny', reason: 'Denied via ComBrief Remote' };
    }
    return { kind: 'deny' };
  }
  const optionMatch = decision.optionId.match(/^option:(\d+)$/);
  if (optionMatch) {
    const label = askOptionLabels(pending)[Number(optionMatch[1])];
    return label ? { kind: 'option', optionLabel: label } : null;
  }
  return null;
}
```

- [ ] **Step 4: Run mapper tests**

Run: `npm test -- tests/hardware-decision-mapper.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit decision mapper**

Run:

```bash
git add src/main/hardware/decision-mapper.ts tests/hardware-decision-mapper.test.ts
git commit -m "feat: map ComBrief Remote decisions"
```

---

### Task 5: Transport Interface and Mock Runtime

**Files:**
- Create: `src/main/hardware/transport.ts`
- Create: `src/main/hardware/mock-transport.ts`
- Create: `src/main/hardware/runtime.ts`
- Test: `tests/hardware-runtime.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create `tests/hardware-runtime.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { HardwareRuntime } from '../src/main/hardware/runtime';
import { MockHardwareTransport } from '../src/main/hardware/mock-transport';

describe('HardwareRuntime', () => {
  it('records hello and sends state through transport', async () => {
    const transport = new MockHardwareTransport();
    const runtime = new HardwareRuntime(transport);
    await runtime.start();

    transport.emitDeviceMessage({
      protocol: 1,
      type: 'hello',
      deviceName: 'ComBrief-Remote',
      platform: 'haas-edu-k1',
      fwVersion: '0.1.0',
      battery: 80,
    });

    expect(runtime.getStatus()).toMatchObject({
      connected: true,
      deviceName: 'ComBrief-Remote',
      fwVersion: '0.1.0',
      battery: 80,
    });

    await runtime.sendState({
      protocol: 1,
      type: 'state',
      appName: 'ComBrief',
      appVersion: '0.1.2',
      apps: [{ id: 'claude-code', label: 'CC', status: 'idle' }],
      primary: 'claude-code',
      ts: 1,
    });

    expect(transport.sentMessages.at(-1)?.type).toBe('state');
  });

  it('forwards hardware decision messages to callback', async () => {
    const transport = new MockHardwareTransport();
    const onDecision = vi.fn();
    const runtime = new HardwareRuntime(transport, { onDecision });
    await runtime.start();

    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
    });

    expect(onDecision).toHaveBeenCalledWith({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
    });
  });
});
```

- [ ] **Step 2: Run runtime tests and verify they fail**

Run: `npm test -- tests/hardware-runtime.test.ts`

Expected: FAIL because runtime and mock transport do not exist.

- [ ] **Step 3: Implement transport interface**

Create `src/main/hardware/transport.ts`:

```ts
import type { HardwareDeviceMessage, HardwareHostMessage } from './protocol';

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
```

- [ ] **Step 4: Implement mock transport**

Create `src/main/hardware/mock-transport.ts`:

```ts
import type { HardwareDeviceMessage, HardwareHostMessage } from './protocol';
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
    return this.status;
  }

  async send(message: HardwareHostMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  onMessage(handler: (message: HardwareDeviceMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emitDeviceMessage(message: HardwareDeviceMessage): void {
    for (const handler of this.handlers) handler(message);
  }
}
```

- [ ] **Step 5: Implement runtime**

Create `src/main/hardware/runtime.ts`:

```ts
import {
  isHardwareDecisionMessage,
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
    private transport: HardwareTransport,
    private callbacks: HardwareRuntimeCallbacks = {},
  ) {}

  async start(): Promise<void> {
    this.offMessage = this.transport.onMessage((message) => this.handleMessage(message));
    await this.transport.start();
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
    if (message.type === 'hello') {
      this.device = {
        deviceName: message.deviceName,
        platform: message.platform,
        fwVersion: message.fwVersion,
        battery: typeof message.battery === 'number' ? message.battery : null,
      };
      return;
    }
    if (message.type === 'battery') {
      this.device = { ...this.device, battery: message.battery };
      return;
    }
    if (isHardwareDecisionMessage(message)) {
      this.callbacks.onDecision?.(message);
    }
  }
}
```

- [ ] **Step 6: Run runtime tests**

Run: `npm test -- tests/hardware-runtime.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit transport and runtime**

Run:

```bash
git add src/main/hardware/transport.ts src/main/hardware/mock-transport.ts src/main/hardware/runtime.ts tests/hardware-runtime.test.ts
git commit -m "feat: add ComBrief Remote hardware runtime"
```

---

### Task 6: DecisionService Hardware Channel

**Files:**
- Modify: `src/main/decision-service.ts`
- Test: `tests/decision-service-hardware.test.ts`

- [ ] **Step 1: Write failing hardware decision tests**

Create `tests/decision-service-hardware.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { DecisionQueue } from '../src/main/decision-queue';
import { DecisionService } from '../src/main/decision-service';
import { defaultConfig } from '../src/main/config';
import { getSlackCardLabels } from '../src/main/i18n/messages';
import { MockHardwareTransport } from '../src/main/hardware/mock-transport';
import { HardwareRuntime } from '../src/main/hardware/runtime';

describe('DecisionService hardware channel', () => {
  it('sends hardware request even when Slack is disabled', async () => {
    vi.useFakeTimers();
    const queue = new DecisionQueue();
    const transport = new MockHardwareTransport();
    const hardware = new HardwareRuntime(transport);
    await hardware.start();
    const cfg = {
      ...defaultConfig(),
      hardware: { ...defaultConfig().hardware, enabled: true },
      slack: { ...defaultConfig().slack, enabled: false, decisionTimeoutMs: 50_000 },
    };
    const service = new DecisionService(
      () => cfg,
      null,
      queue,
      () => getSlackCardLabels('en'),
      hardware,
    );

    const wait = service.handleWait({
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      sessionId: 'sess-remote',
      toolName: 'Bash',
      toolInput: { command: 'npm install' },
    });

    expect(transport.sentMessages.at(-1)?.type).toBe('request');
    vi.advanceTimersByTime(51_000);
    await wait;
    vi.useRealTimers();
  });

  it('resolves wait when hardware selects allow', async () => {
    vi.useFakeTimers();
    const queue = new DecisionQueue();
    const transport = new MockHardwareTransport();
    let service: DecisionService;
    const hardware = new HardwareRuntime(transport, {
      onDecision: (message) => service.resolveFromHardware(message),
    });
    await hardware.start();
    const cfg = {
      ...defaultConfig(),
      hardware: { ...defaultConfig().hardware, enabled: true },
      slack: { ...defaultConfig().slack, enabled: false, decisionTimeoutMs: 50_000 },
    };
    service = new DecisionService(
      () => cfg,
      null,
      queue,
      () => getSlackCardLabels('en'),
      hardware,
    );

    const wait = service.handleWait({
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      sessionId: 'sess-remote',
      toolName: 'Bash',
      toolInput: { command: 'npm install' },
    });

    const request = transport.sentMessages.find((m) => m.type === 'request');
    expect(request?.type).toBe('request');
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: request.type === 'request' ? request.decisionId : '',
      optionId: 'allow',
    });

    const result = await wait;
    expect(result.hookStdout).toContain('PermissionRequest');
    expect(result.hookStdout).toContain('allow');
    expect(transport.sentMessages.at(-1)?.type).toBe('resolved');
    vi.useRealTimers();
  });

  it('ignores stale hardware decisions after local resolution', async () => {
    vi.useFakeTimers();
    const queue = new DecisionQueue();
    const transport = new MockHardwareTransport();
    const hardware = new HardwareRuntime(transport);
    await hardware.start();
    const cfg = {
      ...defaultConfig(),
      hardware: { ...defaultConfig().hardware, enabled: true },
      slack: { ...defaultConfig().slack, enabled: false, decisionTimeoutMs: 50_000 },
    };
    const service = new DecisionService(
      () => cfg,
      null,
      queue,
      () => getSlackCardLabels('en'),
      hardware,
    );

    const wait = service.handleWait({
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      sessionId: 'sess-local-first',
      toolName: 'Bash',
      toolInput: { command: 'ls' },
    });
    const request = transport.sentMessages.find((m) => m.type === 'request');
    service.tryResolveFromLocal({
      appId: 'claude-code',
      event: 'postToolUse',
      sessionId: 'sess-local-first',
      meta: { toolName: 'Bash' },
    });
    await wait;

    expect(
      service.resolveFromHardware({
        protocol: 1,
        type: 'decision',
        decisionId: request?.type === 'request' ? request.decisionId : '',
        optionId: 'allow',
      }),
    ).toBe(false);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run hardware decision tests and verify they fail**

Run: `npm test -- tests/decision-service-hardware.test.ts`

Expected: FAIL because `DecisionService` constructor and methods do not support hardware.

- [ ] **Step 3: Modify DecisionService constructor and handleWait**

In `src/main/decision-service.ts`, import hardware helpers:

```ts
import { buildHardwareRequest } from './hardware/request-builder';
import { mapHardwareDecisionToAction } from './hardware/decision-mapper';
import type { HardwareDecisionMessage } from './hardware/protocol';
import type { HardwareRuntime } from './hardware/runtime';
```

Update constructor signature:

```ts
  constructor(
    private getConfig: () => CombriefConfig,
    private slack: SlackAdapter | null,
    private queue: DecisionQueue,
    private getCardLabels: () => SlackCardLabels,
    private hardware: HardwareRuntime | null = null,
  ) {}
```

Change early return in `handleWait()` from Slack-only to remote-channel-aware:

```ts
    const hardwareEnabled = cfg.hardware.enabled && cfg.hardware.decisionPushEnabled;
    if (!cfg.slack.enabled && !hardwareEnabled) {
      return { requestId: '', hookStdout: null };
    }
```

After optional Slack `postCard()`, add hardware request send:

```ts
    if (hardwareEnabled && this.hardware) {
      try {
        await this.hardware.sendRequest(
          buildHardwareRequest(
            requestId,
            body,
            process.env.npm_package_version ?? '0.0.0',
            cfg.slack.decisionTimeoutMs,
          ),
        );
      } catch {
        /* hardware channel is best-effort; local and Slack may still resolve */
      }
    }
```

In the `finally` block, before `clearPending()`, preserve the result state by tracking whether queue timed out. Use a local variable:

```ts
    let resolvedForHardware: { result: 'approved' | 'denied' | 'selected' | 'expired'; message: string } | null = null;
```

Set it when queue returns. If `result.hookStdout === null`, use `expired`; otherwise use `approved` as a conservative first pass. Later `resolveFromHardware()` will send a more specific resolved message for hardware-originated decisions.

Add a helper:

```ts
  private async sendHardwareResolved(
    requestId: string,
    result: 'approved' | 'denied' | 'selected' | 'handled_elsewhere' | 'expired' | 'failed',
    message: string,
  ): Promise<void> {
    if (!this.hardware) return;
    try {
      await this.hardware.sendResolved({
        protocol: 1,
        type: 'resolved',
        decisionId: requestId,
        result,
        message,
      });
    } catch {
      /* request already resolved; device update is best-effort */
    }
  }
```

- [ ] **Step 4: Add resolveFromHardware**

Add public method to `DecisionService`:

```ts
  resolveFromHardware(message: HardwareDecisionMessage): boolean {
    const pending = this.pendingMeta.get(message.decisionId);
    if (!pending || !this.queue.isWaiting(message.decisionId)) return false;

    const action = mapHardwareDecisionToAction(message, pending);
    if (!action) return false;

    const hookStdout = buildHookStdout({
      hookEvent: pending.body.hookEvent,
      toolName: pending.body.toolName,
      toolInput: pending.body.toolInput,
      action,
    });
    if (!this.queue.resolve(message.decisionId, { hookStdout })) return false;

    void this.sendHardwareResolved(
      message.decisionId,
      action.kind === 'deny' ? 'denied' : action.kind === 'option' ? 'selected' : 'approved',
      action.kind === 'deny'
        ? 'Denied by Remote'
        : action.kind === 'option'
          ? 'Selected by Remote'
          : 'Approved by Remote',
    );
    void this.updateCardResolved(message.decisionId, this.resolutionFromAction(action, 'remote', pending.body.toolName));
    return true;
  }
```

- [ ] **Step 5: Allow Slack card resolution to say hardware**

Update `CardResolution` to include `via: 'hardware'` wherever it currently says `via: 'slack' | 'local'`.

Update `resolutionStatusText()` minimally:

```ts
    if (resolution.kind === 'allow' && resolution.via === 'hardware') {
      return 'Approved by ComBrief Remote';
    }
    if (resolution.kind === 'deny' && resolution.via === 'hardware') {
      return 'Denied by ComBrief Remote';
    }
    if (resolution.kind === 'option' && resolution.via === 'hardware') {
      return `Selected ${resolution.optionLabel} by ComBrief Remote`;
    }
```

Update `resolutionFromAction()` special user id handling:

```ts
    const via = userId === 'remote' ? 'hardware' : 'slack';
```

Return `via` instead of hard-coded `'slack'`.

- [ ] **Step 6: Run hardware decision tests**

Run: `npm test -- tests/decision-service-hardware.test.ts tests/decision-service.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit hardware decision channel**

Run:

```bash
git add src/main/decision-service.ts tests/decision-service-hardware.test.ts
git commit -m "feat: resolve decisions from ComBrief Remote"
```

---

### Task 7: App State Snapshot and Hardware State Push

**Files:**
- Modify: `src/main/app-controller.ts`
- Test: `tests/app-controller-hardware.test.ts`

- [ ] **Step 1: Write failing AppController state snapshot test**

Create `tests/app-controller-hardware.test.ts` with a minimal fake tray manager:

```ts
import { describe, expect, it } from 'vitest';
import { AppController } from '../src/main/app-controller';
import { defaultConfig } from '../src/main/config';

const tray = {
  setMessages() {},
  setTrayAbbrevResolver() {},
  ensureTray() {},
  ensureHubTray() {},
  removeHubTray() {},
  removeTray() {},
  setStatus() {},
  notify() {},
  showMessage() {},
};

describe('AppController hardware snapshots', () => {
  it('exposes current state snapshot for hardware runtime', () => {
    const controller = new AppController(
      { ...defaultConfig(), apps: ['claude-code', 'cursor'] },
      tray as never,
    );
    controller.bootstrapRegisteredApps();

    controller.handleState({
      appId: 'claude-code',
      event: 'UserPromptSubmit',
      timestamp: 1,
    });

    expect(controller.getHardwareStateSnapshot('0.1.2')).toMatchObject({
      protocol: 1,
      type: 'state',
      appName: 'ComBrief',
      appVersion: '0.1.2',
      primary: 'claude-code',
    });
    expect(controller.getHardwareStateSnapshot('0.1.2').apps).toContainEqual({
      id: 'claude-code',
      label: 'CC',
      status: 'working',
    });
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- tests/app-controller-hardware.test.ts`

Expected: FAIL because `getHardwareStateSnapshot()` does not exist.

- [ ] **Step 3: Implement state snapshot method**

In `src/main/app-controller.ts`, import protocol type:

```ts
import type { HardwareStateMessage } from './hardware/protocol';
```

Add public method:

```ts
  getHardwareStateSnapshot(appVersion: string): HardwareStateMessage {
    const apps = [...this.apps.entries()].map(([id, state]) => ({
      id,
      label: resolveTrayAbbrev(id, this.cfg) || getAppDefinition(id).trayAbbrev,
      status: state.status,
    }));
    const primary =
      apps.find((a) => a.status === 'waiting_user')?.id ??
      apps.find((a) => a.status === 'working')?.id ??
      apps[0]?.id;
    return {
      protocol: 1,
      type: 'state',
      appName: 'ComBrief',
      appVersion,
      apps,
      primary,
      ts: Date.now(),
    };
  }
```

- [ ] **Step 4: Run AppController test**

Run: `npm test -- tests/app-controller-hardware.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit state snapshot**

Run:

```bash
git add src/main/app-controller.ts tests/app-controller-hardware.test.ts
git commit -m "feat: expose hardware state snapshots"
```

---

### Task 8: Wire HardwareRuntime in Main Process

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/config.ts`
- Modify: `src/main/app-controller.ts`
- Test: run existing tests and TypeScript build

- [ ] **Step 1: Update nested hardware config merge**

In `src/main/app-controller.ts`, update `updateConfig()` to merge hardware like Slack:

```ts
      hardware: patch.hardware
        ? { ...this.cfg.hardware, ...patch.hardware }
        : this.cfg.hardware,
```

Keep existing `slack` merge unchanged.

- [ ] **Step 2: Construct HardwareRuntime with Mock transport in development path**

In `src/main/index.ts`, import hardware modules:

```ts
import { HardwareRuntime } from './hardware/runtime';
import { MockHardwareTransport } from './hardware/mock-transport';
```

Add module variable:

```ts
let hardwareRuntime: HardwareRuntime;
```

After `controller.bootstrapRegisteredApps()` construct runtime:

```ts
  hardwareRuntime = new HardwareRuntime(new MockHardwareTransport(), {
    onDecision: (message) => {
      slackRuntime.getDecisionService()?.resolveFromHardware(message);
    },
  });
  if (cfg.hardware.enabled) {
    await hardwareRuntime.start();
  }
```

When constructing `SlackRuntime`, later Task 9 will pass hardware into `DecisionService`; until then update `SlackRuntime` first if needed.

- [ ] **Step 3: Refactor SlackRuntime to accept hardware runtime**

Modify `src/main/slack-runtime.ts` constructor:

```ts
  constructor(
    private getConfig: () => CombriefConfig,
    private getCardLabels: () => SlackCardLabels,
    private getHardwareRuntime: () => HardwareRuntime | null = () => null,
  ) {}
```

Import `HardwareRuntime` type.

When creating `DecisionService`, pass `this.getHardwareRuntime()` as the fifth argument.

- [ ] **Step 4: Push state after state changes**

In `src/main/index.ts` server `onState` callback, after `controller.handleState(payload)` and local resolution, send state if enabled:

```ts
      if (controller.getConfig().hardware.enabled && controller.getConfig().hardware.statusPushEnabled) {
        void hardwareRuntime.sendState(
          controller.getHardwareStateSnapshot(app.getVersion()),
        );
      }
```

Also in `setInterval(() => controller.tickTimeouts(), 1000)`, replace with a block that sends state if timeout changes are later exposed. If `tickTimeouts()` remains void, keep timeout state push for a later refactor and rely on `handleState` for M1.

- [ ] **Step 5: Restart hardware on config changes**

Add helper in `src/main/index.ts`:

```ts
async function restartHardware(): Promise<void> {
  if (controller.getConfig().hardware.enabled) {
    await hardwareRuntime.restart();
    await hardwareRuntime.sendState(controller.getHardwareStateSnapshot(app.getVersion()));
  } else {
    await hardwareRuntime.stop();
  }
}
```

In `config:set`, after Slack restart block:

```ts
    if (partial.hardware !== undefined) {
      await restartHardware();
    }
```

- [ ] **Step 6: Run build and tests**

Run: `npm test -- tests/config.test.ts tests/decision-service.test.ts tests/decision-service-hardware.test.ts tests/app-controller-hardware.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript build succeeds.

- [ ] **Step 7: Commit main-process wiring**

Run:

```bash
git add src/main/index.ts src/main/slack-runtime.ts src/main/app-controller.ts
git commit -m "feat: wire ComBrief Remote runtime"
```

---

### Task 9: Settings UI for ComBrief Remote

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/settings-preload.ts`
- Modify: `src/renderer/settings.html`
- Modify: `src/renderer/settings.js`
- Modify: i18n files under `src/main/i18n/`

- [ ] **Step 1: Add IPC handlers**

In `src/main/index.ts` `registerIpc()`, add:

```ts
  ipcMain.handle('hardware:status', () => hardwareRuntime.getStatus());

  ipcMain.handle('hardware:testDisplay', async () => {
    await hardwareRuntime.sendResolved({
      protocol: 1,
      type: 'resolved',
      decisionId: 'test',
      result: 'selected',
      message: 'Hello Remote',
    });
    return { ok: true };
  });
```

This sends a harmless test message through the same host-message path. Replace with a `control` message once firmware supports `control`.

- [ ] **Step 2: Expose preload API**

In `src/preload/settings-preload.ts`, add:

```ts
  hardwareStatus: () => ipcRenderer.invoke('hardware:status'),
  testHardwareDisplay: () => ipcRenderer.invoke('hardware:testDisplay'),
```

- [ ] **Step 3: Add settings HTML**

In `src/renderer/settings.html`, add after Slack section or before it:

```html
    <hr />
    <h2 id="text-hardwareSection" style="font-size: 14px; margin: 12px 0 8px"></h2>
    <label
      ><input type="checkbox" id="hardwareEnabled" />
      <span id="text-hardwareEnabled"></span
    ></label>
    <p>
      <button type="button" id="hardwareTestDisplay"></button>
      <span id="hardwareStatus" class="hint" style="margin-left: 8px"></span>
    </p>
```

- [ ] **Step 4: Add renderer bindings**

In `src/renderer/settings.js`, add top-level elements:

```js
const hardwareEnabledEl = document.getElementById('hardwareEnabled');
const hardwareTestDisplayEl = document.getElementById('hardwareTestDisplay');
const hardwareStatusEl = document.getElementById('hardwareStatus');
```

In `applyStaticStrings(m)`, add:

```js
  const textHardwareSection = document.getElementById('text-hardwareSection');
  const textHardwareEnabled = document.getElementById('text-hardwareEnabled');
  if (textHardwareSection) textHardwareSection.textContent = m.settings.hardwareSection;
  if (textHardwareEnabled) textHardwareEnabled.textContent = m.settings.hardwareEnabled;
  if (hardwareTestDisplayEl) hardwareTestDisplayEl.textContent = m.settings.hardwareTestDisplay;
```

Add refresh helper:

```js
async function refreshHardwareStatus(m) {
  if (!hardwareStatusEl || !window.combrief?.hardwareStatus) return;
  try {
    const st = await window.combrief.hardwareStatus();
    hardwareStatusEl.textContent = st.connected
      ? `${m.settings.hardwareStatusConnected}${st.fwVersion ? ` · FW ${st.fwVersion}` : ''}${typeof st.battery === 'number' ? ` · ${st.battery}%` : ''}`
      : m.settings.hardwareStatusDisconnected;
    if (st.lastError) hardwareStatusEl.textContent += ` — ${st.lastError}`;
  } catch {
    hardwareStatusEl.textContent = m.settings.hardwareStatusDisconnected;
  }
}
```

In `refresh()`, after hardware config is loaded:

```js
    if (hardwareEnabledEl) hardwareEnabledEl.checked = cfg.hardware?.enabled === true;
    await refreshHardwareStatus(m);
```

Add event handlers:

```js
if (hardwareEnabledEl) {
  hardwareEnabledEl.onchange = () => {
    void window.combrief
      ?.setConfig({ hardware: { enabled: hardwareEnabledEl.checked } })
      .then(() => refresh());
  };
}

if (hardwareTestDisplayEl) {
  hardwareTestDisplayEl.onclick = async () => {
    hardwareTestDisplayEl.disabled = true;
    try {
      await window.combrief?.testHardwareDisplay();
      await refreshHardwareStatus(strings);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      hardwareTestDisplayEl.disabled = false;
    }
  };
}
```

- [ ] **Step 5: Add i18n strings**

Update the project i18n message source under `src/main/i18n/` with these keys in English, Chinese, and Japanese:

```ts
hardwareSection: 'ComBrief Remote',
hardwareEnabled: 'Enable ComBrief Remote',
hardwareTestDisplay: 'Test display',
hardwareStatusConnected: 'Connected',
hardwareStatusDisconnected: 'Disconnected',
```

Chinese equivalents:

```ts
hardwareSection: 'ComBrief Remote',
hardwareEnabled: '启用 ComBrief Remote',
hardwareTestDisplay: '测试显示',
hardwareStatusConnected: '已连接',
hardwareStatusDisconnected: '未连接',
```

Japanese equivalents:

```ts
hardwareSection: 'ComBrief Remote',
hardwareEnabled: 'ComBrief Remote を有効化',
hardwareTestDisplay: '表示をテスト',
hardwareStatusConnected: '接続済み',
hardwareStatusDisconnected: '未接続',
```

- [ ] **Step 6: Run i18n and build tests**

Run: `npm test -- tests/i18n.test.ts tests/config.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit settings UI**

Run:

```bash
git add src/main/index.ts src/preload/settings-preload.ts src/renderer/settings.html src/renderer/settings.js src/main/i18n tests/i18n.test.ts
git commit -m "feat: add ComBrief Remote settings"
```

---

### Task 10: Real BLE Transport Spike

**Files:**
- Create: `src/main/hardware/ble-transport.ts`
- Modify: `package.json`
- Test: manual macOS and Windows BLE scan validation

- [ ] **Step 1: Choose BLE library with a reversible spike**

Use `HardwareTransport` to keep this isolated. Start with the smallest proof of concept for macOS. Candidate package: `@abandonware/noble`.

Run:

```bash
npm install @abandonware/noble
```

Expected: package is added to dependencies and lockfile.

- [ ] **Step 2: Implement scan-only transport first**

Create `src/main/hardware/ble-transport.ts` with a scan-only implementation that compiles but does not replace mock transport by default:

```ts
import type { HardwareDeviceMessage, HardwareHostMessage } from './protocol';
import { COMBRIEF_REMOTE_NAME } from './protocol';
import type { HardwareConnectionStatus, HardwareTransport } from './transport';

export class BleHardwareTransport implements HardwareTransport {
  private handlers = new Set<(message: HardwareDeviceMessage) => void>();
  private status: HardwareConnectionStatus = {
    started: false,
    connected: false,
    lastError: null,
  };

  async start(): Promise<void> {
    this.status = { started: true, connected: false, lastError: null };
    const noble = await import('@abandonware/noble');
    noble.default.on('discover', (peripheral) => {
      if (peripheral.advertisement.localName === COMBRIEF_REMOTE_NAME) {
        this.status = { started: true, connected: false, lastError: null };
      }
    });
    noble.default.startScanning([], false).catch((err: unknown) => {
      this.status = {
        started: true,
        connected: false,
        lastError: err instanceof Error ? err.message : String(err),
      };
    });
  }

  async stop(): Promise<void> {
    const noble = await import('@abandonware/noble');
    noble.default.stopScanning();
    this.status = { started: false, connected: false, lastError: null };
  }

  getStatus(): HardwareConnectionStatus {
    return this.status;
  }

  async send(_message: HardwareHostMessage): Promise<void> {
    throw new Error('BLE send is not implemented in scan-only spike');
  }

  onMessage(handler: (message: HardwareDeviceMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
```

- [ ] **Step 3: Build and document native dependency result**

Run: `npm run build`

Expected: TypeScript build succeeds, or fails with actionable native type/import issues.

Record result in `docs/specs/2026-06-09-combrief-remote-haas-edu-k1-design.md` or a follow-up implementation note.

- [ ] **Step 4: Replace mock transport only behind config after scan succeeds**

In `src/main/index.ts`, choose transport based on an internal flag after scan-only spike is proven:

```ts
const transport = process.env.COMBRIEF_REMOTE_BLE === '1'
  ? new BleHardwareTransport()
  : new MockHardwareTransport();
```

Do not enable BLE by default until macOS and Windows manual validation pass.

- [ ] **Step 5: Manual validation**

macOS:

```text
1. Flash or run a phone/nRF Connect simulator advertising ComBrief-Remote.
2. Start ComBrief with COMBRIEF_REMOTE_BLE=1.
3. Enable ComBrief Remote in settings.
4. Confirm status does not show scan errors.
```

Windows:

```text
1. Repeat the scan test on Windows.
2. Record whether native dependency loads.
3. Record whether scanning requires elevated permissions or pairing.
```

- [ ] **Step 6: Commit BLE spike only if build is stable**

Run:

```bash
git add package.json package-lock.json src/main/hardware/ble-transport.ts src/main/index.ts
git commit -m "feat: spike ComBrief Remote BLE transport"
```

---

### Task 11: Firmware Minimum Validation

**Files:**
- Create in AliOS workspace, not necessarily inside this Electron repo at first.
- Reference design: `docs/specs/2026-06-09-combrief-remote-haas-edu-k1-design.md`

- [ ] **Step 1: Create HaaS Studio project**

Use VS Code + HaaS Studio:

```text
1. Create AliOS Things project.
2. Select solution: eduk1_demo or helloworld_demo.
3. Select board: HaaS EDU K1.
4. Name project: combrief_remote.
5. Confirm project builds without ComBrief changes.
```

Expected: generated project compiles and burns to HaaS EDU K1.

- [ ] **Step 2: Verify baseline build, burn, and serial logs**

Run from the AliOS solution directory:

```bash
aos make
aos burn
```

Open serial monitor at 115200.

Expected: device boots and prints baseline logs.

- [ ] **Step 3: Verify OLED API**

Add a minimal screen draw using the same OLED API style as `eduk1_demo`:

```c
OLED_Clear();
OLED_Show_String(0, 0, "ComBrief v0.1.2", 12, 1);
OLED_Show_String(0, 16, "Remote waiting", 12, 1);
```

If `OLED_Show_String` differs in the generated project, use the equivalent EDU K1 OLED string function found in `eduk1_demo`.

Expected: OLED displays project name and waiting message.

- [ ] **Step 4: Verify K1-K4 short press events**

Add serial logs for each key:

```c
printf("key: K1 short\n");
printf("key: K2 short\n");
printf("key: K3 short\n");
printf("key: K4 short\n");
```

Expected: pressing each key prints the correct log exactly once per short press after debounce.

- [ ] **Step 5: Verify LED modes**

Implement these LED functions using EDU K1 LED GPIO APIs:

```c
void led_all_off(void);
void led_disconnected_chase_tick(void);
void led_idle_green(void);
void led_working_blue_breathe_tick(void);
void led_waiting_red_fast_tick(void);
```

Expected behavior:

```text
disconnected: red -> green -> blue chase
idle: green solid
working: blue breathing
waiting_user: red fast blink
```

- [ ] **Step 6: Verify BLE advertising**

Add `ble_host` to `package.yaml`. Initialize BLE with device name:

```c
#define COMBRIEF_REMOTE_NAME "ComBrief-Remote"
```

Expected: nRF Connect or desktop scanner sees `ComBrief-Remote`.

- [ ] **Step 7: Verify custom GATT write/notify**

Register the service UUID and `host_tx` / `device_tx` characteristics from the spec.

Test with a BLE client:

```json
{"protocol":1,"type":"state","appName":"ComBrief","appVersion":"0.1.2","apps":[{"id":"claude-code","label":"CC","status":"idle"}],"ts":1}
```

Expected: device receives JSON and displays idle state.

Notify this JSON back:

```json
{"protocol":1,"type":"hello","deviceName":"ComBrief-Remote","platform":"haas-edu-k1","fwVersion":"0.1.0","battery":80}
```

Expected: host receives notify payload.

- [ ] **Step 8: Implement request UI state machine**

Use these states:

```c
typedef enum {
  APP_BOOT,
  APP_ADVERTISING,
  APP_CONNECTED_IDLE,
  APP_STATUS,
  APP_REQUEST_BRIEF,
  APP_REQUEST_FULL,
  APP_RESOLVED,
  APP_ERROR
} app_screen_t;
```

Expected:

```text
K1: submit in brief, return in full
K2: option up in brief, page up in full
K3: toggle brief/full
K4: option down in brief, page down in full
```

- [ ] **Step 9: Test with desktop mock and then BLE transport**

First use a BLE client to send request JSON manually. After desktop BLE transport supports write/notify, test with ComBrief.

Expected: HaaS displays `brief + options`, toggles full content with K3, and notifies decision JSON when K1 selects an option in brief mode.

- [ ] **Step 10: Save firmware source into repo after validation**

Once AliOS project structure is stable, copy the ComBrief-specific firmware source into:

```text
firmware/haas-edu-k1/
```

Include `README.md` with exact HaaS Studio, `aos make`, `aos burn`, and serial log instructions.

Commit:

```bash
git add firmware/haas-edu-k1
git commit -m "feat: add HaaS EDU K1 Remote firmware"
```

---

## Final Verification

- [ ] Run desktop tests:

```bash
npm test
```

Expected: all Vitest tests pass.

- [ ] Run desktop build:

```bash
npm run build
```

Expected: TypeScript build succeeds.

- [ ] Verify Git status contains only intended changes before final commit:

```bash
git status --short
```

Expected: no unrelated README or architecture changes are staged for ComBrief Remote commits unless explicitly requested.

- [ ] Manual desktop mock flow:

```text
1. Enable hardware config.
2. Mock transport starts.
3. Trigger a DecisionService wait in test.
4. Emit hardware decision allow.
5. Hook stdout returns allow.
6. Runtime sends resolved message.
```

- [ ] Manual firmware flow:

```text
1. HaaS displays ComBrief v<version> while waiting.
2. Disconnected LED uses red-green-blue chase.
3. Connected idle uses green solid.
4. Working uses blue breathing.
5. Waiting user uses red fast blink.
6. Request brief page shows brief + options.
7. K3 toggles full content.
8. K2/K4 page through full content.
9. K1 returns from full mode.
10. K1 submits selected option in brief mode.
```

## Plan Self-Review

- Spec coverage: desktop protocol, request display model, default focus, no `danger`, no `Details`, LED modes, hardware config, decision channel, BLE transport risk, and AliOS firmware path are each mapped to tasks.
- Placeholder scan: this plan avoids `TBD`, `TODO`, vague "handle edge cases" steps, and unspecified test commands.
- Type consistency: protocol names use `ComBrief-Remote`, `HardwareRequestMessage`, `HardwareDecisionMessage`, `HardwareRuntime`, `HardwareTransport`, and `DecisionAction` consistently.
- Risk handling: real BLE is isolated in Task 10 and not enabled by default until scan/build validation succeeds.
