import type { PermissionUpdateEntry } from './permission-suggestions';

export type DecisionAction =
  | { kind: 'allow' }
  | { kind: 'allowOnce' }
  | { kind: 'allowAlways'; suggestion: PermissionUpdateEntry }
  | { kind: 'deny'; reason?: string }
  | { kind: 'option'; optionLabel: string };

export interface BuildHookStdoutInput {
  hookEvent: 'permissionRequest' | 'preToolUse';
  toolName: string;
  toolInput: Record<string, unknown>;
  action: DecisionAction;
}

export function buildHookStdout(input: BuildHookStdoutInput): string {
  const { hookEvent, toolName, toolInput, action } = input;

  if (hookEvent === 'permissionRequest') {
    if (
      action.kind === 'allow' ||
      action.kind === 'allowOnce' ||
      action.kind === 'allowAlways'
    ) {
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

  if (toolName === 'AskUserQuestion' && action.kind === 'option') {
    const questions = toolInput.questions;
    const answers: Record<string, string> = {};
    if (Array.isArray(questions)) {
      for (const q of questions) {
        if (q && typeof q === 'object' && 'question' in q) {
          const key = String((q as { question: unknown }).question);
          answers[key] = action.optionLabel;
        }
      }
    }
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: {
          ...toolInput,
          questions: toolInput.questions,
          answers,
        },
      },
    });
  }

  if (toolName === 'ExitPlanMode') {
    if (action.kind === 'allow') {
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
          action.kind === 'deny' ? action.reason ?? 'Denied via Slack' : 'Denied via Slack',
      },
    });
  }

  const behavior = action.kind === 'allow' ? 'allow' : 'deny';
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: behavior,
    },
  });
}
