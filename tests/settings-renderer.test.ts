import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function extractBlock(source: string, start: number): string {
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

  throw new Error(`block starting at ${start} was not closed`);
}

function extractGuardedHandler(guard: string): string {
  const source = readProjectFile('src/renderer/settings.js');
  return extractBlock(source, source.indexOf(guard));
}

function extractFunction(name: string): string {
  const source = readProjectFile('src/renderer/settings.js');
  const start = source.indexOf(`function ${name}`);
  return extractBlock(source, start);
}

function extractHardwareEnabledHandler(): string {
  return extractGuardedHandler('if (hardwareEnabledEl) {');
}

describe('settings renderer hardware controls', () => {
  it('handles hardware enable failures without unhandled rejections', () => {
    const handler = extractHardwareEnabledHandler();

    expect(handler).toContain('hardwareEnabledEl.onchange = async () =>');
    expect(handler).toContain('setHardwareControlsDisabled(true);');
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
    expect(handler).toContain('setHardwareControlsDisabled(false);');
    expect(handler).not.toContain('hardwareEnabledEl.disabled = true');
    expect(handler).not.toContain('hardwareEnabledEl.disabled = false');
  });

  it('renders connect and disconnect buttons in the hardware section', () => {
    const html = readProjectFile('src/renderer/settings.html');

    expect(html).toContain('id="hardwareConnect"');
    expect(html).toContain('id="hardwareDisconnect"');
    expect(html).toContain('id="hardwareTestDisplay"');
  });

  it('reads hardware connect and disconnect elements', () => {
    const source = readProjectFile('src/renderer/settings.js');

    expect(source).toContain(
      "const hardwareConnectEl = document.getElementById('hardwareConnect');",
    );
    expect(source).toContain(
      "const hardwareDisconnectEl = document.getElementById('hardwareDisconnect');",
    );
  });

  it('disables all hardware controls through a shared helper', () => {
    const helper = extractFunction('setHardwareControlsDisabled');

    expect(helper).toContain('disabled');
    expect(helper).toContain('hardwareEnabledEl');
    expect(helper).toContain('hardwareConnectEl');
    expect(helper).toContain('hardwareDisconnectEl');
    expect(helper).toContain('hardwareTestDisplayEl');
    expect(helper).toContain('if (el) el.disabled = disabled;');
  });

  it('wires hardware connect with robust shared busy handling', () => {
    const handler = extractGuardedHandler(
      'if (hardwareConnectEl) {\n  hardwareConnectEl.onclick',
    );

    expect(handler).toContain('hardwareConnectEl.onclick = async () =>');
    expect(handler).toContain('setHardwareControlsDisabled(true);');
    expect(handler).toContain('await window.combrief?.connectHardware?.();');
    expect(handler).toContain('await refresh();');
    expect(handler).toContain('catch (err)');
    expect(handler).toContain(
      'showError(err instanceof Error ? err.message : String(err));',
    );
    expect(handler).toMatch(/catch \(err\) \{[\s\S]*await refreshHardwareStatus\(strings\);/);
    expect(handler).toContain('finally');
    expect(handler).toContain('setHardwareControlsDisabled(false);');
    expect(handler).not.toContain('hardwareConnectEl.disabled = true');
    expect(handler).not.toContain('hardwareConnectEl.disabled = false');
  });

  it('wires hardware disconnect with robust shared busy handling', () => {
    const handler = extractGuardedHandler(
      'if (hardwareDisconnectEl) {\n  hardwareDisconnectEl.onclick',
    );

    expect(handler).toContain('hardwareDisconnectEl.onclick = async () =>');
    expect(handler).toContain('setHardwareControlsDisabled(true);');
    expect(handler).toContain('await window.combrief?.disconnectHardware?.();');
    expect(handler).toContain('await refresh();');
    expect(handler).toContain('catch (err)');
    expect(handler).toContain(
      'showError(err instanceof Error ? err.message : String(err));',
    );
    expect(handler).toMatch(/catch \(err\) \{[\s\S]*await refreshHardwareStatus\(strings\);/);
    expect(handler).toContain('finally');
    expect(handler).toContain('setHardwareControlsDisabled(false);');
    expect(handler).not.toContain('hardwareDisconnectEl.disabled = true');
    expect(handler).not.toContain('hardwareDisconnectEl.disabled = false');
  });

  it('wires hardware test display with robust shared busy handling', () => {
    const handler = extractGuardedHandler(
      'if (hardwareTestDisplayEl) {\n  hardwareTestDisplayEl.onclick',
    );

    expect(handler).toContain('hardwareTestDisplayEl.onclick = async () =>');
    expect(handler).toContain('setHardwareControlsDisabled(true);');
    expect(handler).toContain('await window.combrief?.testHardwareDisplay?.();');
    expect(handler).toContain('if (strings) await refreshHardwareStatus(strings);');
    expect(handler).toContain('catch (err)');
    expect(handler).toContain(
      'showError(err instanceof Error ? err.message : String(err));',
    );
    expect(handler).toContain('finally');
    expect(handler).toContain('setHardwareControlsDisabled(false);');
    expect(handler).not.toContain('hardwareTestDisplayEl.disabled = true');
    expect(handler).not.toContain('hardwareTestDisplayEl.disabled = false');
  });
});

describe('settings preload hardware bridge', () => {
  it('exposes hardware connect and disconnect IPC calls', () => {
    const source = readProjectFile('src/preload/settings-preload.ts');

    expect(source).toContain(
      "connectHardware: () => ipcRenderer.invoke('hardware:connect')",
    );
    expect(source).toContain(
      "disconnectHardware: () => ipcRenderer.invoke('hardware:disconnect')",
    );
  });
});
