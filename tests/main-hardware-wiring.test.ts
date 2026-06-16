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
    expect(source).toContain("import { HardwareStatePusher } from './hardware/state-pusher';");
    expect(source).toContain(
      "import { createWebBluetoothBridgeWindowManager } from './hardware/web-bluetooth-bridge-window';",
    );
    expect(source).toContain(
      'hardwareTransport = new WebBluetoothBridgeTransport(bridgeWindowManager, ipcMain);',
    );
    expect(source).toContain('hardwareStatePusher = new HardwareStatePusher(');
    expect(source).not.toContain('new MockHardwareTransport()');
  });

  it('configures bridge window assets and localized pairing labels', () => {
    const source = mainIndexSource();

    expect(source).toContain(
      "preloadPath: join(__dirname, '..', 'preload', 'hardware-bridge-preload.js')",
    );
    expect(source).toContain(
      "rendererPath: join(__dirname, '..', 'renderer', 'hardware-bridge.html')",
    );
    expect(source).toContain('messages: settingsMessages().remotePairing');
  });

  it('refreshes installed hook scripts on startup before bootstrapping registered apps', () => {
    const source = mainIndexSource();
    const readyStart = source.indexOf('app.whenReady().then(async () => {');
    const startup = source.slice(readyStart);

    expect(source).toContain("import { refreshRegisteredAppScripts } from './installer/install-app';");
    expect(startup).toContain('refreshRegisteredAppScripts(cfg.apps);');
    expect(startup.indexOf('refreshRegisteredAppScripts(cfg.apps);')).toBeLessThan(
      startup.indexOf('controller.bootstrapRegisteredApps();'),
    );
  });

  it('hardware connect opens the Web Bluetooth pairing window after starting runtime', () => {
    const source = mainIndexSource();

    expect(source).toContain("ipcMain.handle('hardware:connect'");
    expect(source).toContain("ipcMain.handle('hardware:disconnect'");
    expect(source).toContain(
      'hardwareTransport = new WebBluetoothBridgeTransport(bridgeWindowManager, ipcMain);',
    );
    expect(source).toContain('await hardwareRuntime.start();\n    await restartSlack();\n    await hardwareTransport.openPairing();');
  });

  it('restarts decision wiring after hardware connect enables the remote', () => {
    const source = mainIndexSource();
    const handlerStart = source.indexOf("ipcMain.handle('hardware:connect'");
    const handlerEnd = source.indexOf("ipcMain.handle('hardware:disconnect'", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handler).toContain('await hardwareRuntime.start();');
    expect(handler).toContain('await restartSlack();');
    expect(handler.indexOf('await restartSlack();')).toBeGreaterThan(
      handler.indexOf('await hardwareRuntime.start();'),
    );
  });

  it('pushes hardware state after timeout ticks change app status', () => {
    const source = mainIndexSource();

    expect(source).toContain('function tickControllerTimeoutsAndPushHardwareState()');
    expect(source).toContain('if (controller.tickTimeouts()) {');
    expect(source).toContain('pushHardwareStateIfEnabled();');
    expect(source).toContain('hasPendingHardwareRequests()');
    expect(source).toContain('hardwareStatePusher.request();');
    expect(source).toContain('resendPendingHardwareRequests()');
    expect(source).toContain('setInterval(() => tickControllerTimeoutsAndPushHardwareState(), 1000);');
  });
  it('uses remote hello, not a connected-time fallback, as the hardware sync entrypoint', () => {
    const source = mainIndexSource();
    const runtimeStart = source.indexOf('hardwareRuntime = new HardwareRuntime(');
    const runtimeEnd = source.indexOf('hardwareStatePusher = new HardwareStatePusher(', runtimeStart);
    const runtimeBlock = source.slice(runtimeStart, runtimeEnd);

    expect(source).not.toContain('CONNECTED_STATE_SYNC_DELAY_MS');
    expect(source).not.toContain('scheduleConnectedHardwareStateSync');
    expect(source).not.toContain('onConnected:');
    expect(runtimeBlock).toContain('onHello: () => {');
    expect(runtimeBlock).toContain('pushHardwareStateIfEnabled();');
    expect(runtimeBlock).toContain('resendPendingHardwareRequests()');
  });

  it('starts the local HTTP server before external hardware and Slack runtimes', () => {
    const source = mainIndexSource();
    const readyStart = source.indexOf('app.whenReady().then(async () => {');
    const startup = source.slice(readyStart);

    expect(startup.indexOf('server.listen(cfg.port')).toBeGreaterThanOrEqual(0);
    expect(startup.indexOf('server.listen(cfg.port')).toBeLessThan(
      startup.indexOf('await hardwareRuntime.start();'),
    );
    expect(startup.indexOf('server.listen(cfg.port')).toBeLessThan(
      startup.indexOf('await slackRuntime.restart();'),
    );
  });

  it('starts the remote and auto-opens pairing when hardware auto reconnect is enabled on startup', () => {
    const source = mainIndexSource();
    const startupStart = source.indexOf('if (cfg.hardware.enabled) {');
    const startupEnd = source.indexOf('await slackRuntime.restart();', startupStart);
    const startup = source.slice(startupStart, startupEnd);

    expect(startup).toContain('await hardwareRuntime.start();');
    expect(startup).toContain('cfg.hardware.autoReconnect');
    expect(startup).toContain('void hardwareTransport.openPairing({ autoConnect: true }).catch(logHardwareStatePushError);');
    expect(startup).not.toContain('await hardwareTransport.openPairing({ autoConnect: true });');
  });

  it('pushes hardware state when local terminal resolves a decision', () => {
    const source = mainIndexSource();
    const serverStart = source.indexOf('const server = createCombriefServer({');
    const serverEnd = source.indexOf('});', serverStart);
    const serverBlock = source.slice(serverStart, serverEnd);

    expect(serverBlock).toContain('onLocalDecisionResolved: (payload) => {');
    expect(serverBlock).toContain('controller.clearPendingApproval(payload.appId);');
    expect(serverBlock).toContain('pushHardwareStateIfEnabled();');
  });

  it('pushes a state snapshot and resends pending requests when the remote sends hello after pairing', () => {
    const source = mainIndexSource();

    expect(source).toContain('onHello: () => {');
    expect(source).toContain('pushHardwareStateIfEnabled();');
    expect(source).toContain('resendPendingHardwareRequests()');
  });

  it('defers permissionRequest state snapshots so hardware request pages can render first', () => {
    const source = mainIndexSource();
    const serverStart = source.indexOf('const server = createCombriefServer({');
    const serverEnd = source.indexOf('});', serverStart);
    const serverBlock = source.slice(serverStart, serverEnd);

    expect(serverBlock).toContain("if (payload.event === 'permissionRequest' && hardwareDecisionPushEnabled()) {");
    expect(serverBlock).toContain('slackRuntime.getDecisionService()?.resendPendingHardwareRequests();');
    expect(serverBlock).toContain('} else {\n        pushHardwareStateIfEnabled();\n      }');
  });

  it('uses test display as an end-to-end request probe with current time', () => {
    const source = mainIndexSource();
    const handlerStart = source.indexOf("ipcMain.handle('hardware:testDisplay'");
    const handlerEnd = source.indexOf("ipcMain.handle('slack:test'", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handler).toContain('const status = hardwareRuntime.getStatus();');
    expect(handler).toContain("throw new Error('ComBrief Remote is not connected');");
    expect(handler).toContain('await hardwareRuntime.sendRequest({');
    expect(handler).toContain('decisionId: `test-${now}`');
    expect(handler).toContain("brief: 'Test display'");
    expect(handler).toContain('content: `ComBrief test\\n${new Date(now).toLocaleTimeString()}');
    expect(handler).toContain("sourceLabel: 'TEST'");
    expect(handler).not.toContain('sendResolved');
  });

  it('resolves test display decisions so K1 returns the remote to ready', () => {
    const source = mainIndexSource();
    const runtimeStart = source.indexOf('hardwareRuntime = new HardwareRuntime(');
    const runtimeEnd = source.indexOf('slackRuntime = new SlackRuntime(', runtimeStart);
    const runtimeBlock = source.slice(runtimeStart, runtimeEnd);

    expect(runtimeBlock).toContain("message.decisionId.startsWith('test-')");
    expect(runtimeBlock).toContain('hardwareRuntime.sendResolved({');
    expect(runtimeBlock).toContain("result: 'selected'");
    expect(runtimeBlock).toContain("message: 'Test display acknowledged'");
    expect(runtimeBlock).toContain('return;');
    expect(runtimeBlock.indexOf('hardwareRuntime.sendResolved({')).toBeLessThan(
      runtimeBlock.indexOf('slackRuntime.getDecisionService()?.resolveFromHardware(message)'),
    );
  });

});
