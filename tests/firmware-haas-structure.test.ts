import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const firmwareDir = join(process.cwd(), 'firmware', 'haas', 'combrief_remote');
const readFirmwareFile = (name: string) => readFileSync(join(firmwareDir, name), 'utf8');

describe('HaaS ComBrief Remote firmware skeleton', () => {
  it('includes the required firmware project files', () => {
    for (const file of ['README.md', 'package.yaml', 'SConstruct', 'Makefile', 'combrief_remote.c']) {
      expect(existsSync(join(firmwareDir, file)), `${file} should exist`).toBe(true);
    }
  });

  it('documents HaaS Studio setup, flashing, logs, and desktop verification', () => {
    const readme = readFirmwareFile('README.md');

    for (const text of [
      'HaaS Studio',
      'solutions/combrief_remote',
      '烧录',
      '串口日志',
      'ComBrief',
      'cd /Users/silverwing/develop/alios_iot/solutions/combrief_remote',
      'aos make',
      'ota_rtos.bin',
      'python3 -m serial.tools.list_ports',
      '/dev/cu.usbserial-AU03OSLJ',
      '2ndboot',
      'CCCC',
      'Burn "[...]" success',
      'OLED: Waiting BLE',
      '桌面连接验证步骤',
    ]) {
      expect(readme).toContain(text);
    }
  });

  it('documents current module set, adapter limits, and protocol details', () => {
    const readme = readFirmwareFile('README.md');

    for (const text of [
      'app_state',
      'protocol',
      'ble_service',
      'display',
      'input',
      'led',
      'power',
      'host_tx',
      'device_tx',
      'ADC battery',
      'HaaS Studio',
      'K1',
      'K2',
      'K3',
      'K4',
      'resolved',
    ]) {
      expect(readme).toContain(text);
    }

    expect(readme).not.toContain('不包含 `app_state`、`protocol`、`ble_service`、`display`、`input`、`led`、`power` 模块文件');
  });

  it('declares the BLE service UUID and advertised device name', () => {
    const source = readFirmwareFile('combrief_remote.c');

    expect(source).toContain('7b5c0001-8d4a-4c3a-9b4f-434252465001');
    expect(source).toContain('ComBrief');
  });

  it('references planned module source and include paths in SConstruct', () => {
    const sconstruct = readFirmwareFile('SConstruct');

    for (const modulePath of [
      'app_state',
      'protocol',
      'ble_service',
      'display',
      'input',
      'led',
      'power',
    ]) {
      expect(sconstruct).toContain(modulePath);
    }
  });
});
