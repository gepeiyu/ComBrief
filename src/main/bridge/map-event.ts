import type { StateEvent } from '../state-machine';

const CLAUDE_MAP: Record<string, StateEvent> = {
  SessionStart: 'sessionStart',
  SessionEnd: 'sessionEnd',
  UserPromptSubmit: 'beforeSubmitPrompt',
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  PostToolUseFailure: 'postToolUseFailure',
  Stop: 'stop',
  PermissionRequest: 'permissionRequest',
};

const CURSOR_EVENTS = new Set<StateEvent>([
  'sessionStart',
  'sessionEnd',
  'beforeSubmitPrompt',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'beforeShellExecution',
  'afterShellExecution',
  'afterAgentResponse',
  'afterAgentThought',
  'subagentStart',
  'subagentStop',
  'stop',
]);

export function normalizeHookEvent(
  appId: string,
  raw: string,
): StateEvent | null {
  if (appId === 'cursor') {
    return CURSOR_EVENTS.has(raw as StateEvent) ? (raw as StateEvent) : null;
  }
  if (appId === 'claude-code') {
    return CLAUDE_MAP[raw] ?? null;
  }
  return null;
}
