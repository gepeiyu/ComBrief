import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 与 extensions/cursor/bridge.mjs 中 EVENT_MAP 保持同步 */
const EVENT_MAP: Record<string, string> = {
  beforeSubmitPrompt: 'beforeSubmitPrompt',
  UserPromptSubmit: 'beforeSubmitPrompt',
  preToolUse: 'preToolUse',
  PreToolUse: 'preToolUse',
  stop: 'stop',
  Stop: 'stop',
  AgentResponse: 'afterAgentResponse',
  AgentThought: 'afterAgentThought',
};

describe('bridge EVENT_MAP', () => {
  it('maps Cursor stdin hook_event_name aliases', () => {
    expect(EVENT_MAP.UserPromptSubmit).toBe('beforeSubmitPrompt');
    expect(EVENT_MAP.AgentResponse).toBe('afterAgentResponse');
    expect(EVENT_MAP.AgentThought).toBe('afterAgentThought');
    expect(EVENT_MAP.Stop).toBe('stop');
  });

  it('bridge resolves hook_event_name from stdin', () => {
    const bridgeSrc = readFileSync(
      join(process.cwd(), 'extensions/cursor/bridge.mjs'),
      'utf8',
    );
    expect(bridgeSrc).toContain('input.hook_event_name');
    expect(bridgeSrc).not.toContain("reportState(config, 'heartbeat'");
  });
});
