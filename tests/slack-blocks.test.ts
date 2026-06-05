import { describe, it, expect } from 'vitest';
import {
  buildDecisionBlocks,
  buildResolvedDecisionBlocks,
} from '../src/main/slack/blocks';

describe('buildDecisionBlocks', () => {
  it('includes allow/deny for permission mode', () => {
    const blocks = buildDecisionBlocks({
      requestId: 'req-1',
      title: 'Confirm',
      toolName: 'Bash',
      cwdLabel: 'proj',
      sessionLabel: 'abc123',
      summary: 'npm test',
      mode: 'permission',
    });
    const actions = blocks.find(
      (b) => b && typeof b === 'object' && (b as { type: string }).type === 'actions',
    ) as { elements: { value: string }[] };
    expect(actions.elements).toHaveLength(2);
    expect(JSON.parse(actions.elements[0].value).action).toBe('allowOnce');
  });

  it('adds divider and time context', () => {
    const blocks = buildDecisionBlocks({
      requestId: 'req-time',
      title: 'Confirm',
      toolName: 'Bash',
      cwdLabel: 'proj',
      sessionLabel: 'abc123',
      summary: 'npm test',
      mode: 'permission',
      timeFooter: '🕐 *请求时间* 2026/06/05 10:00:00',
    });
    expect(blocks[0]).toEqual({ type: 'divider' });
    expect((blocks[1] as { elements: { text: string }[] }).elements[0].text).toContain(
      '请求时间',
    );
  });

  it('shows allow-once, allow-always, and deny for permission suggestions', () => {
    const blocks = buildDecisionBlocks({
      requestId: 'req-3',
      title: 'Confirm',
      toolName: 'Read',
      cwdLabel: 'proj',
      sessionLabel: 'abc123',
      summary: 'read tmp/foo',
      mode: 'permission',
      permissionButtons: [
        { label: 'Allow once', action: 'allowOnce', style: 'primary' },
        { label: 'Always allow: Read: tmp/*', action: 'allowAlways', suggestionIndex: 0 },
        { label: 'Deny', action: 'deny', style: 'danger' },
      ],
    });
    const actions = blocks.find(
      (b) => b && typeof b === 'object' && (b as { type: string }).type === 'actions',
    ) as { elements: { value: string }[] };
    expect(actions.elements).toHaveLength(3);
    expect(JSON.parse(actions.elements[1].value).action).toBe('allowAlways');
    expect(JSON.parse(actions.elements[1].value).suggestionIndex).toBe(0);
  });

  it('replaces action buttons with resolved status', () => {
    const input = {
      requestId: 'req-2',
      title: 'Confirm',
      toolName: 'Bash',
      cwdLabel: 'proj',
      sessionLabel: 'abc123',
      summary: 'npm test',
      mode: 'permission' as const,
    };
    const blocks = buildResolvedDecisionBlocks(input, '✅ *Allowed*');
    expect(
      blocks.some(
        (b) =>
          b &&
          typeof b === 'object' &&
          (b as { type: string }).type === 'actions',
      ),
    ).toBe(false);
    const status = blocks.at(-1) as { text: { text: string } };
    expect(status.text.text).toBe('✅ *Allowed*');
  });
});
