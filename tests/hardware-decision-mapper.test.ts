import { describe, expect, it } from 'vitest';
import { mapHardwareDecisionToAction } from '../src/main/hardware/decision-mapper';
import type { HardwareDecisionMessage } from '../src/main/hardware/protocol';
import type { PendingDecision } from '../src/main/decision/types';

function pendingDecision(
  toolName = 'Bash',
  toolInput: Record<string, unknown> = {},
): PendingDecision {
  return {
    requestId: 'request-1',
    createdAt: 1710000000000,
    body: {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      toolName,
      toolInput,
    },
  };
}

function hardwareDecision(optionId: string): HardwareDecisionMessage {
  return {
    protocol: 1,
    type: 'decision',
    decisionId: 'request-1',
    optionId,
    ts: 1710000000001,
  };
}

describe('hardware decision mapper', () => {
  it('maps allowAlways suggestions to allowAlways actions', () => {
    const pending = pendingDecision('Bash', { command: 'gh pr create' });
    pending.body.raw = {
      permission_suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash', ruleContent: 'gh pr *' }],
        },
      ],
    };

    expect(
      mapHardwareDecisionToAction(hardwareDecision('allowAlways:0'), pending),
    ).toEqual({
      kind: 'allowAlways',
      suggestion: {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'gh pr *' }],
      },
    });
  });

  it('maps allow to allowOnce', () => {
    expect(
      mapHardwareDecisionToAction(hardwareDecision('allow'), pendingDecision()),
    ).toEqual({ kind: 'allowOnce' });
  });

  it('maps deny to deny', () => {
    expect(
      mapHardwareDecisionToAction(hardwareDecision('deny'), pendingDecision()),
    ).toEqual({ kind: 'deny' });
  });

  it('uses a ComBrief Remote denial reason for ExitPlanMode', () => {
    expect(
      mapHardwareDecisionToAction(
        hardwareDecision('deny'),
        pendingDecision('ExitPlanMode', { plan: '# Plan' }),
      ),
    ).toEqual({ kind: 'deny', reason: 'Denied via ComBrief Remote' });
  });

  it('maps AskUserQuestion option ids to option labels', () => {
    const pending = pendingDecision('AskUserQuestion', {
      questions: [
        {
          question: 'Choose target?',
          options: [{ label: 'macOS + Windows' }, { label: 'macOS only' }],
        },
      ],
    });

    expect(mapHardwareDecisionToAction(hardwareDecision('option:1'), pending)).toEqual({
      kind: 'option',
      optionLabel: 'macOS only',
    });
  });

  it('returns null for AskUserQuestion allow and deny option ids', () => {
    const pending = pendingDecision('AskUserQuestion', {
      questions: [
        {
          question: 'Choose target?',
          options: [{ label: 'A' }, { label: 'B' }],
        },
      ],
    });

    expect(mapHardwareDecisionToAction(hardwareDecision('allow'), pending)).toBeNull();
    expect(mapHardwareDecisionToAction(hardwareDecision('deny'), pending)).toBeNull();
  });

  it('returns full AskUserQuestion option labels when hardware labels are clamped', () => {
    const longLabel = 'Use the complete macOS and Windows launch plan';
    const pending = pendingDecision('AskUserQuestion', {
      questions: [
        {
          question: 'Choose target?',
          options: [{ label: longLabel }],
        },
      ],
    });

    expect(mapHardwareDecisionToAction(hardwareDecision('option:0'), pending)).toEqual({
      kind: 'option',
      optionLabel: longLabel,
    });
  });

  it('rejects AskUserQuestion option ids beyond hardware-displayed options', () => {
    const pending = pendingDecision('AskUserQuestion', {
      questions: [
        {
          question: 'Choose target?',
          options: Array.from({ length: 9 }, (_, index) => ({
            label: `Option ${index}`,
          })),
        },
      ],
    });

    expect(mapHardwareDecisionToAction(hardwareDecision('option:8'), pending)).toBeNull();
  });

  it('maps AskUserQuestion option ids after filtering empty labels without shifting', () => {
    const pending = pendingDecision('AskUserQuestion', {
      questions: [
        {
          question: 'Choose target?',
          options: [{ label: 'A' }, { label: '' }, { label: 'B' }],
        },
      ],
    });

    expect(mapHardwareDecisionToAction(hardwareDecision('option:1'), pending)).toEqual({
      kind: 'option',
      optionLabel: 'B',
    });
  });

  it('returns null for invalid option ids and out-of-range options', () => {
    const pending = pendingDecision('AskUserQuestion', {
      questions: [
        {
          question: 'Choose target?',
          options: [{ label: 'macOS + Windows' }],
        },
      ],
    });

    expect(mapHardwareDecisionToAction(hardwareDecision('details'), pending)).toBeNull();
    expect(mapHardwareDecisionToAction(hardwareDecision('option:x'), pending)).toBeNull();
    expect(mapHardwareDecisionToAction(hardwareDecision('option:-1'), pending)).toBeNull();
    expect(mapHardwareDecisionToAction(hardwareDecision('option:1'), pending)).toBeNull();
    expect(
      mapHardwareDecisionToAction(hardwareDecision('option:0'), pendingDecision('Bash')),
    ).toBeNull();
  });
});
