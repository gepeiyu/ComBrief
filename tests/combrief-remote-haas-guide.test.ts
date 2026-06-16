import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const guidePath = join(process.cwd(), 'docs', 'guides', 'combrief-remote-haas-validation.md');
const readGuide = () => readFileSync(guidePath, 'utf8');

describe('ComBrief Remote HaaS end-to-end validation guide', () => {
  it('documents the required automated, desktop, firmware, and hardware validation steps', () => {
    const guide = readGuide();

    for (const text of [
      'npm test',
      'npm run build',
      'HaaS Studio',
      '烧录',
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
      'Connect Remote',
      'K1',
      'K2',
      'K3',
      'K4',
      'resolved',
      'Slack',
    ]) {
      expect(guide).toContain(text);
    }
  });

  it('states current firmware validation limits and disconnect semantics', () => {
    const guide = readGuide();

    for (const text of [
      '当前仓库不编译 HaaS 固件',
      'OLED/K1-K4/LED/BLE GATT/ADC battery 已接入 HaaS EDU K1 API',
      'HaaS SDK 实机验证',
      'Disconnect 是临时断开',
    ]) {
      expect(guide).toContain(text);
    }
  });
});
