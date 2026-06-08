import { describe, it, expect } from 'vitest';
import { buildHookStdout } from '../src/main/slack/hook-stdout';

describe('buildHookStdout', () => {
  it('PermissionRequest allow once includes updatedInput', () => {
    const toolInput = { command: 'ls tmp/' };
    const out = buildHookStdout({
      hookEvent: 'permissionRequest',
      toolName: 'Bash',
      toolInput,
      action: { kind: 'allowOnce' },
    });
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(j.hookSpecificOutput.decision.behavior).toBe('allow');
    expect(j.hookSpecificOutput.decision.updatedInput).toEqual(toolInput);
    expect(j.hookSpecificOutput.decision.updatedPermissions).toBeUndefined();
  });

  it('PermissionRequest allow always echoes suggestion', () => {
    const suggestion = {
      type: 'addRules',
      rules: [{ toolName: 'Read', ruleContent: 'tmp/*' }],
      behavior: 'allow',
      destination: 'localSettings',
    };
    const toolInput = { file_path: 'tmp/foo' };
    const out = buildHookStdout({
      hookEvent: 'permissionRequest',
      toolName: 'Read',
      toolInput,
      action: { kind: 'allowAlways', suggestion },
    });
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.decision.updatedPermissions).toEqual([
      suggestion,
    ]);
  });

  it('PermissionRequest AskUserQuestion with answers', () => {
    const toolInput = {
      questions: [{ question: 'Pick?', options: [{ label: 'A' }] }],
    };
    const out = buildHookStdout({
      hookEvent: 'permissionRequest',
      toolName: 'AskUserQuestion',
      toolInput,
      action: { kind: 'option', optionLabel: 'A' },
    });
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(j.hookSpecificOutput.decision.behavior).toBe('allow');
    expect(j.hookSpecificOutput.decision.updatedInput.answers['Pick?']).toBe(
      'A',
    );
  });

  it('PreToolUse AskUserQuestion with answers (legacy format)', () => {
    const toolInput = {
      questions: [{ question: 'Pick?', options: [{ label: 'A' }] }],
    };
    const out = buildHookStdout({
      hookEvent: 'preToolUse',
      toolName: 'AskUserQuestion',
      toolInput,
      action: { kind: 'option', optionLabel: 'A' },
    });
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(j.hookSpecificOutput.updatedInput.answers['Pick?']).toBe('A');
  });

  it('PermissionRequest ExitPlanMode allow', () => {
    const toolInput = { plan: '# Plan' };
    const out = buildHookStdout({
      hookEvent: 'permissionRequest',
      toolName: 'ExitPlanMode',
      toolInput,
      action: { kind: 'allowOnce' },
    });
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(j.hookSpecificOutput.decision.behavior).toBe('allow');
  });

  it('PermissionRequest ExitPlanMode deny', () => {
    const out = buildHookStdout({
      hookEvent: 'permissionRequest',
      toolName: 'ExitPlanMode',
      toolInput: { plan: '# Plan' },
      action: { kind: 'deny', reason: 'Not now' },
    });
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(j.hookSpecificOutput.decision.behavior).toBe('deny');
    expect(j.hookSpecificOutput.decision.message).toBe('Not now');
  });

  it('PreToolUse ExitPlanMode deny (legacy format)', () => {
    const out = buildHookStdout({
      hookEvent: 'preToolUse',
      toolName: 'ExitPlanMode',
      toolInput: { plan: '# Plan' },
      action: { kind: 'deny', reason: 'Not now' },
    });
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(j.hookSpecificOutput.permissionDecisionReason).toBe('Not now');
  });
});
