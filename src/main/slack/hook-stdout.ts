import type { PermissionUpdateEntry } from './permission-suggestions';

export type DecisionAction =
  | { kind: 'allow' }
  | { kind: 'allowOnce' }
  | { kind: 'allowAlways'; suggestion: PermissionUpdateEntry }
  | { kind: 'deny'; reason?: string }
  | { kind: 'option'; optionLabel: string };

export interface BuildHookStdoutInput {
  appId?: string;
  hookEvent: 'permissionRequest' | 'preToolUse';
  toolName: string;
  toolInput: Record<string, unknown>;
  action: DecisionAction;
}

function askUserAnswers(
  toolInput: Record<string, unknown>,
  optionLabel: string,
): Record<string, string> {
  const answers: Record<string, string> = {};
  const questions = toolInput.questions;
  if (Array.isArray(questions)) {
    for (const q of questions) {
      if (q && typeof q === 'object' && 'question' in q) {
        answers[String((q as { question: unknown }).question)] = optionLabel;
      }
    }
  }
  return answers;
}

function isAllowAction(action: DecisionAction): boolean {
  return (
    action.kind === 'allow' ||
    action.kind === 'allowOnce' ||
    action.kind === 'allowAlways'
  );
}

function buildCursorHookStdout(action: DecisionAction): string {
  const permission = isAllowAction(action) ? 'allow' : 'deny';
  const out: Record<string, unknown> = { permission };
  if (permission === 'deny' && action.kind === 'deny' && action.reason) {
    out.user_message = action.reason;
  }
  return JSON.stringify(out);
}

export function buildHookStdout(input: BuildHookStdoutInput): string {
  const { appId, hookEvent, toolName, toolInput, action } = input;

  if (appId === 'cursor') {
    return buildCursorHookStdout(action);
  }

  if (toolName === 'AskUserQuestion' && action.kind === 'option') {
    const updatedInput = {
      ...toolInput,
      questions: toolInput.questions,
      answers: askUserAnswers(toolInput, action.optionLabel),
    };
    if (hookEvent === 'permissionRequest') {
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'allow', updatedInput },
        },
      });
    }
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput,
      },
    });
  }

  if (toolName === 'ExitPlanMode') {
    if (hookEvent === 'permissionRequest') {
      if (isAllowAction(action)) {
        return JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: { behavior: 'allow', updatedInput: toolInput },
          },
        });
      }
      const decision: Record<string, unknown> = { behavior: 'deny' };
      if (action.kind === 'deny' && action.reason) {
        decision.message = action.reason;
      }
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision,
        },
      });
    }
    if (isAllowAction(action)) {
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      });
    }
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          action.kind === 'deny'
            ? action.reason ?? 'Denied via Slack'
            : 'Denied via Slack',
      },
    });
  }

  if (hookEvent === 'permissionRequest') {
    if (isAllowAction(action)) {
      const decision: Record<string, unknown> = {
        behavior: 'allow',
        updatedInput: toolInput,
      };
      if (action.kind === 'allowAlways') {
        decision.updatedPermissions = [action.suggestion];
      }
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision,
        },
      });
    }

    if (action.kind === 'deny') {
      const decision: Record<string, unknown> = { behavior: 'deny' };
      if (action.reason) {
        decision.message = action.reason;
      }
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision,
        },
      });
    }
  }

  const behavior = action.kind === 'allow' ? 'allow' : 'deny';
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: behavior,
    },
  });
}
