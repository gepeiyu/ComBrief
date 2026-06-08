/** 与 src/main/slack/hook-stdout.ts 保持同步（供 remote-gate 子进程使用） */

function askUserAnswers(toolInput, optionLabel) {
  const answers = {};
  const questions = toolInput.questions;
  if (Array.isArray(questions)) {
    for (const q of questions) {
      if (q && typeof q === 'object' && 'question' in q) {
        answers[String(q.question)] = optionLabel;
      }
    }
  }
  return answers;
}

function isAllowAction(action) {
  return (
    action.kind === 'allow' ||
    action.kind === 'allowOnce' ||
    action.kind === 'allowAlways'
  );
}

export function buildHookStdout({ hookEvent, toolName, toolInput, action }) {
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
      const decision = { behavior: 'deny' };
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
        permissionDecisionReason: action.reason ?? 'Denied locally',
      },
    });
  }

  if (hookEvent === 'permissionRequest') {
    if (isAllowAction(action)) {
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

  const behavior = action.kind === 'allow' ? 'allow' : 'deny';
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: behavior,
    },
  });
}
