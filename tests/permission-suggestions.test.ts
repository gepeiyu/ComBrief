import { describe, it, expect } from 'vitest';
import {
  extractPermissionSuggestions,
  formatPermissionSuggestionLabel,
} from '../src/main/slack/permission-suggestions';

describe('permission-suggestions', () => {
  it('extracts permission_suggestions from raw hook input', () => {
    const raw = {
      permission_suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: 'Read', ruleContent: 'tmp/*' }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
    };
    expect(extractPermissionSuggestions(raw)).toHaveLength(1);
  });

  it('formats addRules label for Slack button', () => {
    const label = formatPermissionSuggestionLabel(
      {
        type: 'addRules',
        rules: [{ toolName: 'Read', ruleContent: 'tmp/*' }],
      },
      'Read',
      (d) => `Always: ${d}`,
    );
    expect(label).toBe('Always: Read: tmp/*');
  });
});
