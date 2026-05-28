import { describe, it, expect } from 'vitest';
import { normalizeHookEvent } from '../src/main/bridge/map-event';

describe('normalizeHookEvent', () => {
  it('maps Cursor stop', () => {
    expect(normalizeHookEvent('cursor', 'stop')).toBe('stop');
  });

  it('maps Claude Stop', () => {
    expect(normalizeHookEvent('claude-code', 'Stop')).toBe('stop');
  });

  it('maps Claude PermissionRequest', () => {
    expect(normalizeHookEvent('claude-code', 'PermissionRequest')).toBe(
      'permissionRequest',
    );
  });

  it('maps Claude UserPromptSubmit', () => {
    expect(normalizeHookEvent('claude-code', 'UserPromptSubmit')).toBe(
      'beforeSubmitPrompt',
    );
  });

  it('maps Cursor afterAgentThought', () => {
    expect(normalizeHookEvent('cursor', 'afterAgentThought')).toBe(
      'afterAgentThought',
    );
  });

  it('maps Claude PostToolUseFailure', () => {
    expect(normalizeHookEvent('claude-code', 'PostToolUseFailure')).toBe(
      'postToolUseFailure',
    );
  });
});
