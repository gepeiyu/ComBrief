import { describe, it, expect } from 'vitest';
import {
  reduceState,
  applyHeartbeatTimeout,
  applyPendingApprovalTimeout,
  applyIdleAfterWorking,
  updatePendingApproval,
  needsRunApproval,
} from '../src/main/state-machine';

describe('reduceState — turn lifecycle', () => {
  it('starts turn on beforeSubmitPrompt', () => {
    expect(reduceState('idle', 'beforeSubmitPrompt')).toBe('working');
  });

  it('ends turn on stop (any status) → idle', () => {
    expect(reduceState('working', 'stop')).toBe('idle');
    expect(reduceState('working', 'stop', { stopStatus: 'aborted' })).toBe(
      'idle',
    );
    expect(reduceState('working', 'stop', { stopStatus: 'error' })).toBe('idle');
    expect(reduceState('waiting_user', 'stop', { stopStatus: 'completed' })).toBe(
      'idle',
    );
  });

  it('sessionEnd → offline', () => {
    expect(reduceState('idle', 'sessionEnd')).toBe('offline');
  });

  it('sessionStart from offline → idle', () => {
    expect(reduceState('offline', 'sessionStart')).toBe('idle');
  });
});

describe('reduceState — planning stays yellow', () => {
  it('afterAgentResponse keeps working', () => {
    expect(reduceState('working', 'afterAgentResponse')).toBe('working');
  });

  it('afterAgentThought keeps working', () => {
    expect(reduceState('working', 'afterAgentThought')).toBe('working');
  });

  it('subagent hooks keep working', () => {
    expect(reduceState('working', 'subagentStart')).toBe('working');
    expect(reduceState('working', 'subagentStop')).toBe('working');
  });
});

describe('reduceState — waiting user', () => {
  it('permissionRequest stays working until pending timeout', () => {
    expect(reduceState('working', 'permissionRequest')).toBe('working');
  });

  it('permission_denied postToolUseFailure stays working until pending timeout', () => {
    expect(
      reduceState('working', 'postToolUseFailure', {
        failureType: 'permission_denied',
      }),
    ).toBe('working');
  });

  it('beforeShellExecution returns to working from waiting_user', () => {
    expect(reduceState('working', 'beforeShellExecution')).toBe('working');
    expect(reduceState('waiting_user', 'beforeShellExecution')).toBe('working');
  });

  it('preToolUse does not immediately go red', () => {
    expect(
      reduceState('working', 'preToolUse', { toolName: 'Shell' }),
    ).toBe('working');
  });
});

describe('applyIdleAfterWorking', () => {
  it('is disabled (no silent green)', () => {
    const app = {
      status: 'working' as const,
      lastEventAt: 0,
      lastHeartbeatAt: 0,
      pendingApprovalSince: null,
    };
    expect(applyIdleAfterWorking(app).status).toBe('working');
  });
});

describe('applyPendingApprovalTimeout', () => {
  it('turns working into waiting_user when Shell approval is slow', () => {
    const app = {
      status: 'working' as const,
      lastEventAt: 0,
      lastHeartbeatAt: 0,
      pendingApprovalSince: 0,
    };
    expect(applyPendingApprovalTimeout(app, 5_000, 5_500).status).toBe(
      'waiting_user',
    );
  });

  it('turns working into waiting_user after permissionRequest delay', () => {
    const app = {
      status: 'working' as const,
      lastEventAt: 0,
      lastHeartbeatAt: 0,
      pendingApprovalSince: 1_000,
    };
    expect(applyPendingApprovalTimeout(app, 5_000, 6_500).status).toBe(
      'waiting_user',
    );
  });
});

describe('needsRunApproval', () => {
  it('detects Shell and MCP tools', () => {
    expect(needsRunApproval('Shell')).toBe(true);
    expect(needsRunApproval('MCP:filesystem')).toBe(true);
    expect(needsRunApproval('Read')).toBe(false);
  });
});

describe('applyHeartbeatTimeout', () => {
  it('does not force offline', () => {
    const app = {
      status: 'idle' as const,
      lastEventAt: Date.now() - 120_000,
      lastHeartbeatAt: Date.now() - 120_000,
      pendingApprovalSince: null,
    };
    expect(applyHeartbeatTimeout(app, 45_000).status).toBe('idle');
  });
});
