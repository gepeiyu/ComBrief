import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainIndexSource = () =>
  readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8');

describe('main hardware wiring', () => {
  it('uses the Web Bluetooth bridge transport in production wiring', () => {
    const source = mainIndexSource();

    expect(source).toContain(
      "import { WebBluetoothBridgeTransport } from './hardware/web-bluetooth-bridge-transport';",
    );
    expect(source).toContain(
      "import { createWebBluetoothBridgeWindowManager } from './hardware/web-bluetooth-bridge-window';",
    );
    expect(source).toMatch(
      /new WebBluetoothBridgeTransport\(\s*bridgeWindowManager,\s*ipcMain\s*\)/,
    );
    expect(source).not.toContain('new MockHardwareTransport()');
  });

  it('configures bridge window assets for the packaged preload and renderer', () => {
    const source = mainIndexSource();

    expect(source).toContain(
      "preloadPath: join(__dirname, '..', 'preload', 'hardware-bridge-preload.js')",
    );
    expect(source).toContain(
      "rendererPath: join(__dirname, '..', 'renderer', 'hardware-bridge.html')",
    );
  });

  it('hardware connect opens the Web Bluetooth pairing window after starting runtime', () => {
    const source = mainIndexSource();

    expect(source).toContain("ipcMain.handle('hardware:connect'");
    expect(source).toContain("ipcMain.handle('hardware:disconnect'");
    expect(source).toContain(
      'hardwareTransport = new WebBluetoothBridgeTransport(bridgeWindowManager, ipcMain);',
    );
    expect(source).toContain('await hardwareRuntime.start();\n    await hardwareTransport.openPairing();');
  });
  it('pushes a state snapshot when the remote sends hello after pairing', () => {
    const source = mainIndexSource();

    expect(source).toContain('onHello: () => sendHardwareStateSnapshotSafely()');
  });

});
