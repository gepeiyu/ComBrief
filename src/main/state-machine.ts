/**
 * 状态灯规则见 docs/STATE-RULES.md
 *
 * 回合由 beforeSubmitPrompt/UserPromptSubmit 开始，由 stop/Stop 结束。
 * 回合内一切 Agent 活动（含 afterAgentResponse、afterAgentThought）保持黄灯。
 */

export type LightStatus = 'idle' | 'working' | 'waiting_user' | 'offline';

export type StateEvent =
  | 'sessionStart'
  | 'sessionEnd'
  | 'beforeSubmitPrompt'
  | 'preToolUse'
  | 'postToolUse'
  | 'postToolUseFailure'
  | 'beforeShellExecution'
  | 'afterShellExecution'
  | 'afterAgentResponse'
  | 'afterAgentThought'
  | 'subagentStart'
  | 'subagentStop'
  | 'stop'
  | 'permissionRequest'
  | 'heartbeat';

export interface StateMeta {
  stopStatus?: 'completed' | 'aborted' | 'error';
  failureType?: 'timeout' | 'error' | 'permission_denied';
  toolName?: string;
}

export interface AppState {
  status: LightStatus;
  lastEventAt: number;
  lastHeartbeatAt: number;
  /** Shell/MCP 的 preToolUse：等待用户点 Run 的起始时间 */
  pendingApprovalSince: number | null;
}

/** 需要用户点 Run / 允许的 Cursor 工具名 */
export function needsRunApproval(toolName?: string): boolean {
  if (!toolName) return false;
  if (toolName === 'Shell') return true;
  if (toolName.startsWith('MCP:')) return true;
  return false;
}

function duringTurn(_current: LightStatus): LightStatus {
  return 'working';
}

export function reduceState(
  current: LightStatus,
  event: StateEvent,
  meta?: StateMeta,
): LightStatus {
  switch (event) {
    case 'sessionEnd':
      return 'offline';

    case 'sessionStart':
      return current === 'offline' ? 'idle' : current;

    case 'stop':
      return 'idle';

    case 'permissionRequest':
      if (current === 'offline') return current;
      if (current === 'waiting_user') return 'waiting_user';
      return 'working';

    case 'postToolUseFailure':
      if (meta?.failureType === 'permission_denied') {
        if (current === 'offline') return current;
        if (current === 'waiting_user') return 'waiting_user';
        return 'working';
      }
      return duringTurn(current);

    case 'beforeSubmitPrompt':
      return duringTurn(current);

    case 'beforeShellExecution':
      // 用户已点 Run、命令开始跑 → 回到黄灯（避免执行过程中一直红灯）
      return current === 'waiting_user' ? 'working' : current;

    case 'preToolUse':
      if (current === 'waiting_user') return 'waiting_user';
      return duringTurn(current);

    case 'postToolUse':
    case 'afterShellExecution':
    case 'afterAgentResponse':
    case 'afterAgentThought':
    case 'subagentStart':
    case 'subagentStop':
      return duringTurn(current);

    case 'heartbeat':
      return current === 'offline' ? 'idle' : current;

    default:
      return current;
  }
}

export function updatePendingApproval(
  event: StateEvent,
  timestamp: number,
  pendingApprovalSince: number | null,
  meta?: StateMeta,
): number | null {
  switch (event) {
    case 'preToolUse':
      return needsRunApproval(meta?.toolName) ? timestamp : pendingApprovalSince;
    case 'permissionRequest':
      return pendingApprovalSince ?? timestamp;
    case 'postToolUseFailure':
      if (meta?.failureType === 'permission_denied') {
        return pendingApprovalSince ?? timestamp;
      }
      return null;
    case 'postToolUse':
    case 'afterShellExecution':
    case 'beforeShellExecution':
    case 'stop':
    case 'sessionEnd':
    case 'beforeSubmitPrompt':
      return null;
    default:
      return pendingApprovalSince;
  }
}

/** Shell/MCP：preToolUse 后长时间无 postToolUse → 在等 Run */
export function applyPendingApprovalTimeout(
  app: AppState,
  thresholdMs: number,
  now = Date.now(),
): AppState {
  if (app.pendingApprovalSince === null) return app;
  if (app.status !== 'working') return app;
  if (now - app.pendingApprovalSince < thresholdMs) return app;
  return { ...app, status: 'waiting_user' };
}

/** 保留 API；不再用静默超时猜绿灯 */
export function applyIdleAfterWorking(app: AppState): AppState {
  return app;
}

export function applyHeartbeatTimeout(
  app: AppState,
  _timeoutMs: number,
  _now = Date.now(),
): AppState {
  return app;
}
