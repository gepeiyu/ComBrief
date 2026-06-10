import { describe, expect, it } from 'vitest';
import { buildHardwareRequest } from '../src/main/hardware/request-builder';
import type { DecisionWaitBody } from '../src/main/decision/types';
import { hardwareProtocolLimits } from '../src/main/hardware/protocol';

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

    const msg = buildHardwareRequest(
      'request-1',
      body,
      '0.1.2',
      30_000,
      1_710_000_000_000,
    );

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
      expiresAt: 1_710_000_030_000,
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

  it('maps Shell tool requests to shell kind', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      cwd: '<workspace>/ComBrief',
      toolName: 'Shell',
      toolInput: { command: 'npm test' },
    };

    const msg = buildHardwareRequest('request-shell', body, '0.1.2', 30_000);

    expect(msg.kind).toBe('SHELL');
  });

  it('builds AskUserQuestion options with option indexes', () => {
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

  it('skips empty AskUserQuestion option labels and keeps option ids aligned', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      toolName: 'AskUserQuestion',
      toolInput: {
        questions: [
          {
            question: 'Choose target?',
            options: [
              { label: 'A' },
              { label: '' },
              { label: '   ' },
              { label: 'B' },
            ],
          },
        ],
      },
    };

    const msg = buildHardwareRequest('request-ask-empty', body, '0.1.2', 30_000);

    expect(msg.options).toEqual([
      { id: 'option:0', label: 'A' },
      { id: 'option:1', label: 'B' },
    ]);
    expect(msg.defaultFocus).toBe('option:0');
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

  it('classifies mcp tool names separately from other permission requests', () => {
    const mcpMsg = buildHardwareRequest(
      'request-mcp',
      {
        appId: 'cursor',
        hookEvent: 'permissionRequest',
        toolName: 'mcp__github__create_issue',
        toolInput: { title: 'Ship remote support' },
      },
      '0.1.2',
      30_000,
    );
    const permissionMsg = buildHardwareRequest(
      'request-permission',
      {
        appId: 'cursor',
        hookEvent: 'permissionRequest',
        toolName: 'Write',
        toolInput: { file_path: 'src/main/index.ts' },
      },
      '0.1.2',
      30_000,
    );

    expect(mcpMsg.kind).toBe('MCP');
    expect(permissionMsg.kind).toBe('PERMISSION');
  });

  it('clamps brief, content, option labels, and option count to hardware limits', () => {
    const longQuestion = 'Q'.repeat(hardwareProtocolLimits.maxContentLen + 50);
    const longLabel = 'L'.repeat(hardwareProtocolLimits.maxOptionLabelLen + 10);
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      toolName: 'AskUserQuestion',
      toolInput: {
        questions: [
          {
            question: longQuestion,
            options: Array.from({ length: hardwareProtocolLimits.maxOptions + 2 }, () => ({
              label: longLabel,
            })),
          },
        ],
      },
    };

    const msg = buildHardwareRequest('request-limits', body, '0.1.2', 30_000);

    expect(msg.brief.length).toBeLessThanOrEqual(hardwareProtocolLimits.maxBriefLen);
    expect(msg.content.length).toBeLessThanOrEqual(
      hardwareProtocolLimits.maxContentLen,
    );
    expect(msg.options).toHaveLength(hardwareProtocolLimits.maxOptions);
    expect(msg.options[0].label).toHaveLength(
      hardwareProtocolLimits.maxOptionLabelLen,
    );
    expect(msg.options[0].label).toBe(
      longLabel.slice(0, hardwareProtocolLimits.maxOptionLabelLen),
    );
  });
});
