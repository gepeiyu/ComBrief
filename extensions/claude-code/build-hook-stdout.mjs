/** 与 src/main/slack/hook-stdout.ts 保持同步（供 remote-gate 子进程使用） */

export function buildHookStdout({ hookEvent, toolName, toolInput, action }) {
  if (hookEvent === 'permissionRequest') {
    if (
      action.kind === 'allow' ||
      action.kind === 'allowOnce' ||
      action.kind === 'allowAlways'
    ) {
      const decision = {
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
      const decision = { behavior: 'deny' };
      if (action.reason) decision.message = action.reason;
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision,
        },
      });
    }
  }

  if (toolName === 'AskUserQuestion' && action.kind === 'option') {
    const answers = {};
    const questions = toolInput.questions;
    if (Array.isArray(questions)) {
      for (const q of questions) {
        if (q && typeof q === 'object' && 'question' in q) {
          answers[String(q.question)] = action.optionLabel;
        }
      }
    }
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { ...toolInput, questions: toolInput.questions, answers },
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
        permissionDecisionReason: action.reason ?? 'Denied locally',
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
