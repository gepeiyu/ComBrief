import { describe, it, expect, vi } from 'vitest';
import { DecisionQueue } from '../src/main/decision-queue';
import { DecisionService } from '../src/main/decision-service';
import { defaultConfig } from '../src/main/config';
import { getSlackCardLabels } from '../src/main/i18n/messages';
import type { SlackAdapter } from '../src/main/slack/adapter';

describe('DecisionService dual channel', () => {
  it('resolves wait with null when local postToolUse matches session', async () => {
    vi.useFakeTimers();
    const queue = new DecisionQueue();
    const cfg = {
      ...defaultConfig(),
      slack: { ...defaultConfig().slack, enabled: true },
    };
    const service = new DecisionService(
      () => cfg,
      null,
      queue,
      () => getSlackCardLabels('en'),
    );

    const wait = service.handleWait({
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      sessionId: 'sess-1',
      toolName: 'Bash',
      toolInput: { command: 'ls' },
    });

    service.tryResolveFromLocal({
      appId: 'claude-code',
      event: 'postToolUse',
      sessionId: 'sess-1',
      meta: { toolName: 'Bash' },
    });

    const result = await wait;
    expect(result.hookStdout).toBeNull();
    vi.useRealTimers();
  });

  it('ignores postToolUse for different tool', async () => {
    vi.useFakeTimers();
    const queue = new DecisionQueue();
    const cfg = {
      ...defaultConfig(),
      slack: {
        ...defaultConfig().slack,
        enabled: true,
        decisionTimeoutMs: 50_000,
      },
    };
    const service = new DecisionService(
      () => cfg,
      null,
      queue,
      () => getSlackCardLabels('en'),
    );

    const wait = service.handleWait({
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      sessionId: 'sess-2',
      toolName: 'Bash',
      toolInput: {},
    });

    service.tryResolveFromLocal({
      appId: 'claude-code',
      event: 'postToolUse',
      sessionId: 'sess-2',
      meta: { toolName: 'Write' },
    });

    vi.advanceTimersByTime(51_000);
    const result = await wait;
    expect(result.hookStdout).toBeNull();
    vi.useRealTimers();
  });

  it('resolveLocalTerminal ends wait and clears pending', async () => {
    vi.useFakeTimers();
    const queue = new DecisionQueue();
    const cfg = {
      ...defaultConfig(),
      slack: { ...defaultConfig().slack, enabled: true },
    };
    const service = new DecisionService(
      () => cfg,
      null,
      queue,
      () => getSlackCardLabels('en'),
    );

    const wait = service.handleWait({
      appId: 'claude-code',
      hookEvent: 'permissionRequest',
      sessionId: 'sess-local',
      toolName: 'Read',
      toolInput: { file_path: 'tmp/x' },
    });

    expect(
      service.resolveLocalTerminal({
        sessionId: 'sess-local',
        toolName: 'Read',
        kind: 'allow',
      }),
    ).toBe(true);

    const result = await wait;
    expect(result.hookStdout).toBeNull();
    vi.useRealTimers();
  });

  it('uses Cursor name in Slack decision messages for Cursor requests', async () => {
    vi.useFakeTimers();
    const queue = new DecisionQueue();
    const cfg = {
      ...defaultConfig(),
      slack: {
        ...defaultConfig().slack,
        enabled: true,
        channelId: 'C123',
        decisionTimeoutMs: 50_000,
      },
    };
    const postDecisionMessage = vi.fn(async () => '123.456');
    const slack = {
      postDecisionMessage,
      updateDecisionMessage: vi.fn(),
      postTestMessage: vi.fn(),
    } as unknown as SlackAdapter;
    const service = new DecisionService(
      () => cfg,
      slack,
      queue,
      () => getSlackCardLabels('en'),
    );

    const wait = service.handleWait({
      appId: 'cursor',
      hookEvent: 'preToolUse',
      sessionId: 'cursor-slack',
      toolName: 'Shell',
      toolInput: { command: 'node -v' },
    });
    await Promise.resolve();

    expect(postDecisionMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Cursor needs your approval: Shell' }),
    );
    const blocks = postDecisionMessage.mock.calls[0][0].blocks;
    expect(JSON.stringify(blocks)).toContain('Cursor needs your approval');
    expect(JSON.stringify(blocks)).not.toContain('Claude Code needs your approval');

    vi.advanceTimersByTime(51_000);
    await wait;
    vi.useRealTimers();
  });
});
