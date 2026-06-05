import { describe, it, expect, vi } from 'vitest';
import { DecisionQueue } from '../src/main/decision-queue';
import { DecisionService } from '../src/main/decision-service';
import { defaultConfig } from '../src/main/config';
import { getSlackCardLabels } from '../src/main/i18n/messages';

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
});
