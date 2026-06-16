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
      { id: 'allow', label: '允许' },
      { id: 'deny', label: '拒绝' },
    ]);
    expect(msg.brief).toBe('执行命令\nnpm install @abandonware/noble');
    expect(msg.content).toContain('cwd: <workspace>/ComBrief');
    expect(JSON.stringify(msg)).not.toContain('danger');
    expect(msg.options.map((o) => o.id)).not.toContain('details');
  });

  it('builds readable Chinese shell permission summaries with allow-always option', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      sessionId: 'sess-pr-count',
      cwd: '/Users/silverwing/XSQX/Source/quyeya',
      toolName: 'Bash',
      toolInput: {
        command:
          'repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner) && gh api search/issues -f q="repo:$repo is:pr" --jq \'.total_count\'',
        description: '统计当前仓库所有 PR 数量',
      },
      raw: {
        permission_suggestions: [
          {
            type: 'addRules',
            rules: [{ toolName: 'Bash', ruleContent: 'gh repo * && gh api *' }],
          },
        ],
      },
    };

    const msg = buildHardwareRequest('request-pr-count', body, '0.1.3', 30_000);

    expect(msg.brief).toBe('执行命令\ngh repo view');
    expect(msg.options).toEqual([
      { id: 'allow', label: '允许' },
      { id: 'allowAlways:0', label: '总是允许' },
      { id: 'deny', label: '拒绝' },
    ]);
    expect(JSON.stringify(msg)).not.toContain('Do you want to proceed');
    expect(JSON.stringify(msg)).not.toContain('Yes, Bash');
    expect(Buffer.byteLength(JSON.stringify(msg), 'utf8')).toBeLessThanOrEqual(500);
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
    expect(msg.brief).toBe('First version support?');
    expect(msg.defaultFocus).toBe('option:0');
    expect(msg.options).toEqual([
      { id: 'option:0', label: 'macOS + Wind' },
      { id: 'option:1', label: 'macOS only' },
    ]);
    expect(msg.content).toContain('First version support?');
  });

  it('keeps Chinese AskUserQuestion requests under the BLE single-frame limit', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      toolName: 'AskUserQuestion',
      toolInput: {
        questions: [
          {
            question:
              '这个项目的说明建议：新产品或功能工作优先使用 /ce-brainstorm，再使用 /ce-plan，对吗？',
            options: [
              { label: '对，项目 CLAUDE.md 中明确写了这一建议。' },
              { label: '错，项目 CLAUDE.md 中没有这一建议。' },
            ],
          },
        ],
      },
    };

    const msg = buildHardwareRequest('request-chinese-ask', body, '0.1.3', 30_000);

    expect(Buffer.byteLength(msg.brief, 'utf8')).toBeLessThanOrEqual(
      hardwareProtocolLimits.maxBriefLen,
    );
    expect(Buffer.byteLength(msg.content, 'utf8')).toBeLessThanOrEqual(
      hardwareProtocolLimits.maxContentLen,
    );
    for (const option of msg.options) {
      expect(Buffer.byteLength(option.label, 'utf8')).toBeLessThanOrEqual(
        hardwareProtocolLimits.maxOptionLabelLen,
      );
    }
    expect(Buffer.byteLength(JSON.stringify(msg), 'utf8')).toBeLessThanOrEqual(500);
  });

  it('keeps real Chinese AskUserQuestion requests with UUID under the BLE frame limit', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      toolName: 'AskUserQuestion',
      toolInput: {
        questions: [
          {
            question:
              '这个项目的说明建议：新产品或功能工作优先使用 /ce-brainstorm，再使用 /ce-plan，对吗？',
            options: [
              { label: '对，项目 CLAUDE.md 中明确写了这一建议。' },
              { label: '错，项目 CLAUDE.md 中没有这一建议。' },
            ],
          },
        ],
      },
    };

    const msg = buildHardwareRequest(
      '19f2c6eb-df25-4422-b461-fdc22937aff9',
      body,
      '0.1.3',
      60 * 60 * 1000,
      1_710_000_000_000,
    );

    expect(Buffer.byteLength(JSON.stringify(msg), 'utf8')).toBeLessThanOrEqual(500);
  });

  it('keeps Chinese AskUserQuestion prompts readable on HZK-capable OLED', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      toolName: 'AskUserQuestion',
      toolInput: {
        questions: [
          {
            question: '这个项目最近的提交记录中包含与 Mongo 集成测试相关的提交，判断对错？',
            options: [
              { label: '对\n     最近提交中有 fix(tests): 修复真实 Mongo 集成测试问题 和 docs: 记录 Mongo 集成测试环境状态。' },
              { label: '错\n     最近提交中没有提到 Mongo 集成测试。' },
            ],
          },
        ],
      },
    };

    const msg = buildHardwareRequest('request-chinese-mongo', body, '0.1.3', 30_000);

    expect(msg.brief).not.toContain('Q:');
    expect(msg.brief).toContain('Mongo');
    expect(msg.brief).toContain('集成测试');
    expect(msg.content).toContain('这个项目最近');
    expect(msg.content).toContain('Mongo');
    expect(msg.content).toContain('集成测试');
    expect(msg.options).toEqual([
      { id: 'option:0', label: '对' },
      { id: 'option:1', label: '错' },
    ]);
    expect(JSON.stringify(msg)).not.toContain('Yes');
    expect(JSON.stringify(msg)).not.toContain('No');
    expect(Buffer.byteLength(JSON.stringify(msg), 'utf8')).toBeLessThanOrEqual(500);
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

  it('builds Claude permission requests with suggestion options for HaaS', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      toolName: 'Bash',
      toolInput: { command: 'gh pr create' },
      raw: {
        permission_suggestions: [
          {
            type: 'addRules',
            rules: [{ toolName: 'Bash', ruleContent: 'gh pr *' }],
          },
        ],
      },
    };

    const msg = buildHardwareRequest('request-permission', body, '0.1.2', 30_000);

    expect(msg.brief).toBe('执行命令\ngh pr create');
    expect(msg.options).toEqual([
      { id: 'allow', label: '允许' },
      { id: 'allowAlways:0', label: '总是允许' },
      { id: 'deny', label: '拒绝' },
    ]);
  });

  it('keeps serialized hardware requests within the HaaS single-write payload limit', () => {
    const body: DecisionWaitBody = {
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      sessionId: 'sess-large-request',
      toolName: 'AskUserQuestion',
      toolInput: {
        questions: [
          {
            question: 'Q'.repeat(2000),
            options: Array.from({ length: 8 }, (_, index) => ({
              label: `Option ${index} ${'L'.repeat(80)}`,
            })),
          },
        ],
      },
      raw: 'R'.repeat(2000),
    };

    const msg = buildHardwareRequest('request-large', body, '0.1.2', 30_000);

    expect(Buffer.byteLength(JSON.stringify(msg), 'utf8')).toBeLessThanOrEqual(500);
    expect(msg.content.length).toBeLessThan(2000);
    expect(msg.options.length).toBeLessThanOrEqual(hardwareProtocolLimits.maxOptions);
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
