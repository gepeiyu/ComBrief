import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function extractHardwareEnabledHandler(): string {
  const source = readFileSync(
    join(process.cwd(), 'src/renderer/settings.js'),
    'utf8',
  );
  const start = source.indexOf('if (hardwareEnabledEl) {');
  expect(start).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error('hardwareEnabledEl handler block was not closed');
}

describe('settings renderer hardware controls', () => {
  it('handles hardware enable failures without unhandled rejections', () => {
    const handler = extractHardwareEnabledHandler();

    expect(handler).toContain('hardwareEnabledEl.onchange = async () =>');
    expect(handler).toContain('hardwareEnabledEl.disabled = true');
    expect(handler).toContain(
      'await window.combrief?.setConfig({ hardware: { enabled: hardwareEnabledEl.checked } })',
    );
    expect(handler).toContain('await refresh();');
    expect(handler).toContain('catch (err)');
    expect(handler).toContain(
      'showError(err instanceof Error ? err.message : String(err));',
    );
    expect(handler).toMatch(/catch \(err\) \{[\s\S]*try \{[\s\S]*await refresh\(\);[\s\S]*\} catch \{[\s\S]*\}/);
    expect(handler).toContain('finally');
    expect(handler).toContain('hardwareEnabledEl.disabled = false');
  });
});
