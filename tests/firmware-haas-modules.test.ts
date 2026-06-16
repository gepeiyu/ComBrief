import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const firmwareDir = join(process.cwd(), 'firmware', 'haas', 'combrief_remote');
const moduleNames = ['ble_service', 'display', 'input', 'led', 'power'] as const;

const readFirmwareFile = (name: string) => readFileSync(join(firmwareDir, name), 'utf8');

const expectFile = (name: string) => {
  const path = join(firmwareDir, name);
  expect(existsSync(path), `${name} should exist`).toBe(true);
  return readFirmwareFile(name);
};

const compileAndRunFirmwareHarness = (
  source: string,
  modules: readonly string[] = ['app_state', 'protocol', 'input'],
  cflags: readonly string[] = [],
) => {
  const dir = mkdtempSync(join(tmpdir(), 'combrief-firmware-modules-'));
  try {
    const harnessPath = join(dir, 'harness.c');
    const binaryPath = join(dir, 'harness');
    writeFileSync(harnessPath, source);
    const fakeAosHalDir = join(dir, 'aos', 'hal');
    mkdirSync(fakeAosHalDir, { recursive: true });
    writeFileSync(
      join(fakeAosHalDir, 'adc.h'),
      '#include <stdint.h>\ntypedef struct { int port; struct { int sampling_cycle; } config; void *priv; } adc_dev_t; int hal_adc_init(adc_dev_t *adc); int hal_adc_value_get(adc_dev_t *adc, uint32_t *output, uint32_t timeout); int hal_adc_finalize(adc_dev_t *adc);\n',
    );
    const hzkStubPath = join(dir, 'hzk16_stub.c');
    writeFileSync(
      hzkStubPath,
      '#include <stdint.h>\nint hzk16_init(void) { return 0; }\nuint8_t hzk16_draw_utf8_line(uint8_t x, uint8_t y, const char *text, uint8_t mode) { (void)y; (void)text; (void)mode; return x; }\n',
    );
    writeFileSync(
      join(dir, 'hal_oled.h'),
      '#include <stdint.h>\n#include <stdio.h>\nstatic inline uint8_t sh1106_init(void) { return 0; }\nstatic inline void OLED_Clear(void) {}\nstatic inline void OLED_Show_String(int x, int y, const uint8_t *text, int size, int mode) { (void)x; (void)y; (void)text; (void)size; (void)mode;\n#ifdef COMBRIEF_TEST_OLED_ASCII_CHECK\n  for (const uint8_t *p = text; p != 0 && *p != 0; ++p) { if (*p < 0x20 || *p > 0x7e) { printf("FAIL_NON_ASCII_OLED %u\\n", (unsigned int)*p); break; } }\n#endif\n}\nstatic inline void OLED_Refresh_GRAM(void) {}\n',
    );
    const compileArgs = [
      '-std=c99',
      '-Wall',
      '-Wextra',
      ...cflags,
      '-I',
      join(firmwareDir, 'app_state'),
      '-I',
      join(firmwareDir, 'protocol'),
      '-I',
      join(firmwareDir, 'input'),
      '-I',
      join(firmwareDir, 'ble_service'),
      '-I',
      join(firmwareDir, 'display'),
      '-I',
      join(firmwareDir, 'led'),
      '-I',
      join(firmwareDir, 'power'),
      '-I',
      dir,
      harnessPath,
      ...modules.map((moduleName) => join(firmwareDir, moduleName, `${moduleName}.c`)),
      ...(cflags.includes('-DBOARD_HAASEDUK1') && modules.includes('display') ? [hzkStubPath] : []),
      '-o',
      binaryPath,
    ];
    execFileSync('cc', compileArgs, { cwd: process.cwd(), stdio: 'pipe' });
    return execFileSync(binaryPath, [], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('HaaS ComBrief Remote Task 10 firmware modules', () => {
  it('creates BLE, display, input, LED, and power source pairs', () => {
    for (const moduleName of moduleNames) {
      expectFile(`${moduleName}/${moduleName}.h`);
      expectFile(`${moduleName}/${moduleName}.c`);
    }
  });

  it('declares BLE identity, desktop UUIDs, hello send, and host write handling', () => {
    const source = expectFile('ble_service/ble_service.c');
    const header = expectFile('ble_service/ble_service.h');

    for (const text of [
      'ComBrief',
      'COMBRIEF_BLE_SERVICE_UUID',
      'COMBRIEF_BLE_HOST_TX_UUID',
      'COMBRIEF_BLE_DEVICE_TX_UUID',
      'combrief_protocol_build_hello',
      'combrief_ble_send_json',
      'combrief_protocol_apply_host_message',
      'ble_service_start',
      'ble_service_handle_host_write',
      'ble_service_on_connected',
      'ble_service_on_disconnected',
    ]) {
      expect(source).toContain(text);
    }

    expect(header).toContain('#define COMBRIEF_BLE_SERVICE_UUID "7b5c0001-8d4a-4c3a-9b4f-434252465001"');
    expect(header).toContain('#define COMBRIEF_BLE_HOST_TX_UUID "7b5c0002-8d4a-4c3a-9b4f-434252465001"');
    expect(header).toContain('#define COMBRIEF_BLE_DEVICE_TX_UUID "7b5c0003-8d4a-4c3a-9b4f-434252465001"');
    expect(source).not.toContain('434252465002');
    expect(source).not.toContain('434252465003');
  });

  it('uses connectable advertising with the complete name and no scan-response dependency', () => {
    const source = expectFile('ble_service/ble_service.c');
    const advBlock = source.slice(
      source.indexOf('void ble_service_start_advertising'),
      source.indexOf('void ble_service_tick'),
    );

    const adArrayBlock = advBlock.slice(
      advBlock.indexOf('ad_data_t ad[]'),
      advBlock.indexOf('adv_param_t param'),
    );

    expect(advBlock).toContain('ADV_IND');
    expect(adArrayBlock).toContain('AD_DATA_TYPE_NAME_COMPLETE');
    expect(adArrayBlock).not.toContain('AD_DATA_TYPE_UUID128_ALL');
    expect(advBlock).toContain('NULL,');
    expect(advBlock).toContain('0,');
    expect(advBlock).not.toContain('ad_data_t sd[]');
    expect(advBlock).not.toContain('BLE_ARRAY_NUM(sd)');
  });

  it('maps summary keys to decision, option selection, and full mode', () => {
    const source = expectFile('input/input.c');

    for (const text of [
      'COMBRIEF_KEY_K1',
      'COMBRIEF_KEY_K2',
      'COMBRIEF_KEY_K3',
      'COMBRIEF_KEY_K4',
      'combrief_protocol_build_decision',
      'combrief_app_state_mark_decision_sent',
      'COMBRIEF_DISPLAY_SUMMARY',
      'combrief_app_state_select_prev',
      'combrief_app_state_toggle_full',
      'combrief_app_state_select_next',
    ]) {
      expect(source).toContain(text);
    }

    expect(source).toMatch(/COMBRIEF_DISPLAY_SUMMARY[\s\S]*COMBRIEF_KEY_K1[\s\S]*combrief_input_send_decision/);
    expect(source).toMatch(/COMBRIEF_KEY_K2[\s\S]*combrief_app_state_select_prev/);
    expect(source).toMatch(/COMBRIEF_KEY_K3[\s\S]*combrief_app_state_toggle_full/);
    expect(source).toMatch(/COMBRIEF_KEY_K4[\s\S]*combrief_app_state_select_next/);
  });

  it('maps full mode keys to line scrolling, K1 confirm, and K3 summary return', () => {
    const source = expectFile('input/input.c');

    for (const text of [
      'COMBRIEF_DISPLAY_FULL',
      'combrief_input_prev_detail_line',
      'combrief_input_next_detail_line',
      'return summary',
      'full_page',
      'combrief_input_send_decision',
    ]) {
      expect(source).toContain(text);
    }

    expect(source).toMatch(/COMBRIEF_DISPLAY_FULL[\s\S]*COMBRIEF_KEY_K2[\s\S]*combrief_input_prev_detail_line/);
    expect(source).toMatch(/COMBRIEF_DISPLAY_FULL[\s\S]*COMBRIEF_KEY_K4[\s\S]*combrief_input_next_detail_line/);
    expect(source).toMatch(/COMBRIEF_DISPLAY_FULL[\s\S]*COMBRIEF_KEY_K1[\s\S]*combrief_input_send_decision/);
    expect(source).toMatch(/COMBRIEF_DISPLAY_FULL[\s\S]*COMBRIEF_KEY_K3[\s\S]*COMBRIEF_DISPLAY_SUMMARY/);
  });

  it('renders LED states by red, green, and blue priority', () => {
    const source = expectFile('led/led.c');

    for (const text of [
      'COMBRIEF_LED_RED',
      'COMBRIEF_LED_GREEN',
      'COMBRIEF_LED_BLUE',
      'COMBRIEF_REMOTE_ADVERTISING',
      'COMBRIEF_REMOTE_SHOWING_REQUEST',
      'COMBRIEF_REMOTE_WAITING_RESOLVED',
      'connected idle',
      'connected working',
      'blue breathing',
      'priority',
    ]) {
      expect(source).toContain(text);
    }

    expect(source.indexOf('COMBRIEF_LED_RED')).toBeLessThan(source.indexOf('COMBRIEF_LED_GREEN'));
    expect(source.indexOf('COMBRIEF_LED_GREEN')).toBeLessThan(source.indexOf('COMBRIEF_LED_BLUE'));
  });

  it('cycles disconnected and advertising LEDs slowly red then green then blue', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "led.h"

int main(void)
{
    combrief_app_state_t *state;
    app_state_init();
    state = combrief_app_state_get_mutable();

    for (int i = 0; i < 12; i++) {
        led_render();
    }

    combrief_app_state_set_ble_connected(state, false);
    for (int i = 0; i < 12; i++) {
        led_render();
    }

    return 0;
}
`, ['app_state', 'led']);

    const ledLines = output.split('\n').filter((line) => line.startsWith('LED '));
    expect(ledLines.slice(0, 12)).toEqual([
      'LED red: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED red: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED red: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED red: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED green: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED green: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED green: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED green: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED blue: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED blue: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED blue: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED blue: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
    ]);
    expect(ledLines.slice(12, 24)).toEqual(ledLines.slice(0, 12));
  });

  it('renders connected idle green and connected working blue breathing', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "led.h"

int main(void)
{
    combrief_app_state_t *state;
    app_state_init();
    state = combrief_app_state_get_mutable();

    combrief_app_state_set_ble_connected(state, true);
    led_render();

    state->remote_state = COMBRIEF_REMOTE_IDLE;
    combrief_app_state_set_primary_status(state, "working: sync");
    led_render();

    state->remote_state = COMBRIEF_REMOTE_DECISION_PENDING;
    led_render();

    return 0;
}
`, ['app_state', 'led']);

    expect(output).toContain('LED green: connected idle');
    expect(output).toContain('LED blue: connected working blue breathing on');
    expect(output).toContain('LED red: COMBRIEF_REMOTE_SHOWING_REQUEST connected working priority');
  });

  it('renders real desktop state apps working as connected working blue breathing', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "led.h"
#include "protocol.h"

int main(void)
{
    combrief_app_state_t *state;
    const char *working_json = "{\"protocol\":1,\"type\":\"state\",\"appName\":\"ComBrief\",\"appVersion\":\"0.1.0\",\"apps\":[{\"id\":\"cursor\",\"label\":\"Cursor\",\"status\":\"idle\"},{\"id\":\"claude-code\",\"label\":\"Claude Code\",\"status\":\"working\"}],\"primary\":\"claude-code\",\"ts\":123}";
    const char *idle_json = "{\"protocol\":1,\"type\":\"state\",\"appName\":\"ComBrief\",\"appVersion\":\"0.1.0\",\"apps\":[{\"id\":\"cursor\",\"label\":\"Cursor\",\"status\":\"idle\"},{\"id\":\"claude-code\",\"label\":\"Claude Code\",\"status\":\"idle\"}],\"primary\":\"claude-code\",\"ts\":124}";
    const char *other_working_json = "{\"protocol\":1,\"type\":\"state\",\"appName\":\"ComBrief\",\"appVersion\":\"0.1.0\",\"apps\":[{\"id\":\"cursor\",\"label\":\"Cursor\",\"status\":\"idle\"},{\"id\":\"claude-code\",\"label\":\"Claude Code\",\"status\":\"working\"}],\"primary\":\"cursor\",\"ts\":125}";

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_protocol_apply_host_message(state, working_json);
    led_render();

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_protocol_apply_host_message(state, idle_json);
    led_render();

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_protocol_apply_host_message(state, other_working_json);
    led_render();

    return 0;
}
`, ['app_state', 'protocol', 'led']);

    const ledLines = output.split('\n').filter((line) => line.startsWith('LED '));
    expect(ledLines.slice(-3)).toEqual([
      'LED blue: connected working blue breathing on',
      'LED green: connected idle',
      'LED blue: connected working blue breathing on',
    ]);
  });

  it('renders real desktop waiting_user state as red on HaaS', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "led.h"
#include "protocol.h"

int main(void)
{
    combrief_app_state_t *state;
    const char *waiting_json = "{\"protocol\":1,\"type\":\"state\",\"appName\":\"ComBrief\",\"appVersion\":\"0.1.0\",\"apps\":[{\"id\":\"cursor\",\"label\":\"C\",\"status\":\"idle\"},{\"id\":\"claude-code\",\"label\":\"CC\",\"status\":\"waiting_user\"}],\"primary\":\"claude-code\",\"ts\":126}";

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_protocol_apply_host_message(state, waiting_json);
    led_render();
    return 0;
}
`, ['app_state', 'protocol', 'led']);

    expect(output).toContain('connected waiting user red breathing on');
  });

  it('pulses the blue working LED instead of keeping it constantly on', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "led.h"
#include "protocol.h"

int main(void)
{
    combrief_app_state_t *state;
    const char *working_json = "{\"protocol\":1,\"type\":\"state\",\"appName\":\"ComBrief\",\"appVersion\":\"0.1.0\",\"apps\":[{\"id\":\"claude-code\",\"label\":\"CC\",\"status\":\"working\"}],\"primary\":\"claude-code\",\"ts\":127}";

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_protocol_apply_host_message(state, working_json);
    led_render();
    led_render();
    led_render();
    led_render();
    return 0;
}
`, ['app_state', 'protocol', 'led']);

    expect(output).toContain('LED blue: connected working blue breathing on');
    expect(output).toContain('LED blue off: connected working blue breathing');
  });

  it('renders OLED status copy with a board-safe left margin and binds to HaaS SH1106 display API', () => {
    const source = expectFile('display/display.c');

    for (const text of [
      'Waiting BLE',
      'OLED: Apps -',
      'OLED: Summary',
      'OLED: Detail',
      'Expired',
      'Handled elsewhere',
      'last_resolved_result',
      'strcmp',
      'Summary',
      'Full',
      'COMBRIEF_DISPLAY_SUMMARY',
      'COMBRIEF_DISPLAY_FULL',
      'hal_oled.h',
      'sh1106_init',
      'OLED_Clear',
      'hzk16_draw_utf8_line',
      'OLED_Refresh_GRAM',
      'COMBRIEF_OLED_LEFT_MARGIN',
    ]) {
      expect(source).toContain(text);
    }

    expect(source).toMatch(/#define COMBRIEF_OLED_LEFT_MARGIN\s+[1-9]\d*/);
    expect(source).not.toContain('hzk16_draw_utf8_line(0,');
    expect(source).toMatch(/strcmp\(result, "expired"\)/);
    expect(source).toMatch(/strcmp\(result, "handled_elsewhere"\)/);
  });

  it('binds LED rendering to the HaaS EDU K1 board LED driver', () => {
    const source = expectFile('led/led.c');

    for (const text of [
      'led_switch',
      'LED1_NUM',
      'LED2_NUM',
      'LED3_NUM',
      'LED_ON',
      'LED_OFF',
    ]) {
      expect(source).toContain(text);
    }
  });

  it('binds K1-K4 input handling to the HaaS EDU K1 key driver', () => {
    const source = expectFile('input/input.c');

    for (const text of [
      'key_init',
      'EDK_KEY_1',
      'EDK_KEY_2',
      'EDK_KEY_3',
      'EDK_KEY_4',
      'combrief_input_handle_key',
    ]) {
      expect(source).toContain(text);
    }
  });

  it('stores resolved result after applying resolved message and clearing request', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "protocol.h"

static int failures = 0;

static void check_string(const char *name, const char *actual, const char *expected)
{
    if (strcmp(actual, expected) != 0) {
        printf("FAIL %s expected %s got %s\n", name, expected, actual);
        failures++;
    }
}

static void check_bool(const char *name, bool actual, bool expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected ? 1 : 0, actual ? 1 : 0);
        failures++;
    }
}

int main(void)
{
    combrief_app_state_t state;
    combrief_option_t options[1];
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "allow");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "Allow");

    combrief_app_state_init(&state);
    combrief_app_state_set_ble_connected(&state, true);
    (void)combrief_app_state_set_request(&state, "req-1", "Need approval", "Full content", options, 1);
    combrief_app_state_mark_decision_sent(&state);

    check_bool("apply resolved", combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"resolved\",\"decisionId\":\"req-1\",\"result\":\"handled_elsewhere\"}"), true);
    check_string("resolved result", state.last_resolved_result, "handled_elsewhere");
    check_string("request cleared", state.decision_id, "");
    check_bool("waiting cleared", state.waiting_resolved, false);

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`);

    expect(output).toContain('ok');
  });

  it('renders resolved display based on saved result value', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "display.h"

int main(void)
{
    combrief_app_state_t *state;
    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);

    combrief_app_state_mark_resolved(state, "expired");
    display_render();

    combrief_app_state_mark_resolved(state, "handled_elsewhere");
    display_render();

    combrief_app_state_mark_resolved(state, "selected");
    display_render();

    return 0;
}
`, ['app_state', 'display']);

    expect(output).toContain('OLED: Expired');
    expect(output).toContain('OLED: Handled elsewhere');
    expect(output).toContain('OLED: resolved result selected');
  });

  it('renders connected idle display as one app per line with bracketed statuses', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "display.h"
#include "protocol.h"

int main(void)
{
    combrief_app_state_t *state;
    const char *state_json = "{\"protocol\":1,\"type\":\"state\",\"appName\":\"ComBrief\",\"appVersion\":\"0.1.0\",\"apps\":[{\"id\":\"cursor\",\"label\":\"C\",\"status\":\"idle\"},{\"id\":\"claude-code\",\"label\":\"CC\",\"status\":\"idle\"}],\"primary\":\"claude-code\",\"ts\":123}";
    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_protocol_apply_host_message(state, state_json);
    display_render();
    return 0;
}
`, ['app_state', 'protocol', 'display']);

    expect(output).toContain('OLED: Apps - C [OK]\nCC [OK]');
    expect(output).not.toContain('C OK | CC OK');
    expect(output).not.toContain('Battery --%');
    expect(output).not.toContain('Host connected');
  });

  it('renders waiting user status with ASCII text that HaaS OLED can show', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "display.h"
#include "protocol.h"

int main(void)
{
    combrief_app_state_t *state;
    const char *state_json = "{\"protocol\":1,\"type\":\"state\",\"appName\":\"ComBrief\",\"appVersion\":\"0.1.0\",\"apps\":[{\"id\":\"cursor\",\"label\":\"C\",\"status\":\"idle\"},{\"id\":\"claude-code\",\"label\":\"CC\",\"status\":\"waiting_user\"}],\"primary\":\"claude-code\",\"ts\":123}";
    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_protocol_apply_host_message(state, state_json);
    display_render();
    return 0;
}
`, ['app_state', 'protocol', 'display']);

    expect(output).toContain('OLED: Apps - C [OK]\nCC [ASK]');
    expect(output).not.toContain('需确认');
  });

  it('renders request summary as brief plus selected option arrows without button hints', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "display.h"

int main(void)
{
    combrief_app_state_t *state;
    combrief_option_t options[3];
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "allow");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "Allow");
    snprintf(options[1].id, sizeof(options[1].id), "%s", "deny");
    snprintf(options[1].label, sizeof(options[1].label), "%s", "Deny");
    snprintf(options[2].id, sizeof(options[2].id), "%s", "other");
    snprintf(options[2].label, sizeof(options[2].label), "%s", "Other");

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_app_state_set_request(state, "req-1", "Need approval", "line1\nline2\nline3", options, 3);
    display_render();
    combrief_app_state_select_next(state);
    display_render();
    return 0;
}
`, ['app_state', 'display']);

    expect(output).toContain('OLED: Summary Need approval | line2 | > Allow | Deny | Other');
    expect(output).toContain('OLED: Summary Need approval | line2 | Allow | > Deny | Other');
    expect(output).not.toContain('K1 OK');
    expect(output).not.toContain('K2/K4');
  });

  it('renders Chinese request text directly with HZK summary layout', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "display.h"

int main(void)
{
    combrief_app_state_t *state;
    combrief_option_t options[2];
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "1");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "对");
    snprintf(options[1].id, sizeof(options[1].id), "%s", "2");
    snprintf(options[1].label, sizeof(options[1].label), "%s", "错");

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_app_state_set_request(state, "req-zh", "最近提交包含\nMongo集成测试?", "最近提交包含\nMongo集成测试?", options, 2);
    display_render();
    return 0;
}
`, ['app_state', 'display']);

    expect(output).toContain('OLED: Summary 最近提交包含 | Mongo集成测试? | > 对 | 错 |');
  });

  it('keeps active request display when a normal state update arrives', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "display.h"
#include "protocol.h"

int main(void)
{
    combrief_app_state_t *state;
    combrief_option_t options[2];
    const char *state_json = "{\"protocol\":1,\"type\":\"state\",\"appName\":\"ComBrief\",\"appVersion\":\"0.1.0\",\"apps\":[{\"id\":\"claude-code\",\"label\":\"CC\",\"status\":\"idle\"}],\"primary\":\"claude-code\",\"ts\":123}";
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "yes");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "Yes");
    snprintf(options[1].id, sizeof(options[1].id), "%s", "no");
    snprintf(options[1].label, sizeof(options[1].label), "%s", "No");

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_app_state_set_request(state, "req-1", "Do you want", "Full content", options, 2);
    (void)combrief_protocol_apply_host_message(state, state_json);
    display_render();
    return 0;
}
`, ['app_state', 'protocol', 'display']);

    expect(output).toContain('OLED: Summary Do you want |  | > Yes | No |');
    expect(output).not.toContain('OLED: Apps - CC [OK]');
  });

  it('renders full detail as four content lines and scrolls one line with K4 and K2', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "display.h"
#include "input.h"

static bool capture_send(const char *json)
{
    (void)json;
    return true;
}

int main(void)
{
    combrief_app_state_t *state;
    combrief_option_t options[1];
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "ok");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "OK");

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_app_state_set_request(state, "req-1", "Need approval", "L1\nL2\nL3\nL4\nL5\nL6", options, 1);
    (void)combrief_input_handle_key(state, COMBRIEF_KEY_K3, capture_send);
    display_render();
    (void)combrief_input_handle_key(state, COMBRIEF_KEY_K4, capture_send);
    display_render();
    (void)combrief_input_handle_key(state, COMBRIEF_KEY_K2, capture_send);
    display_render();
    return 0;
}
`, ['app_state', 'display', 'input', 'protocol']);

    expect(output).toContain('OLED: Detail L1 | L2 | L3 | L4');
    expect(output).toContain('OLED: Detail L2 | L3 | L4 | L5');
    expect(output.split('OLED: Detail L1 | L2 | L3 | L4').length - 1).toBe(2);
    expect(output).not.toContain('ComBrief | Full');
    expect(output).not.toContain('K1/K3 Summary');
  });

  it('confirms the currently selected option from detail mode with K1', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "input.h"

static int failures = 0;
static char sent_json[256];

static bool capture_send(const char *json)
{
    snprintf(sent_json, sizeof(sent_json), "%s", json);
    return true;
}

static void check_bool(const char *name, bool actual, bool expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected ? 1 : 0, actual ? 1 : 0);
        failures++;
    }
}

static void check_contains(const char *name, const char *actual, const char *expected)
{
    if (strstr(actual, expected) == NULL) {
        printf("FAIL %s expected %s in %s\n", name, expected, actual);
        failures++;
    }
}

int main(void)
{
    combrief_app_state_t *state;
    combrief_option_t options[2];
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "allow");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "Allow");
    snprintf(options[1].id, sizeof(options[1].id), "%s", "deny");
    snprintf(options[1].label, sizeof(options[1].label), "%s", "Deny");

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_app_state_set_request(state, "req-1", "Need approval", "L1\nL2\nL3\nL4\nL5", options, 2);
    check_bool("K4 selects second", combrief_input_handle_key(state, COMBRIEF_KEY_K4, capture_send), true);
    check_bool("K3 enters detail", combrief_input_handle_key(state, COMBRIEF_KEY_K3, capture_send), true);
    check_bool("K1 confirms from detail", combrief_input_handle_key(state, COMBRIEF_KEY_K1, capture_send), true);
    check_contains("selected second option", sent_json, "\"optionId\":\"deny\"");
    check_bool("waiting resolved", state->waiting_resolved, true);

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`, ['app_state', 'input', 'protocol']);

    expect(output).toContain('ok');
  });

  it('does not show a fake battery percent when HaaS ADC readings are invalid', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include "aos/hal/adc.h"

#include "app_state.h"
#include "display.h"
#include "power.h"

int hal_adc_init(adc_dev_t *adc)
{
    (void)adc;
    return 0;
}

int hal_adc_value_get(adc_dev_t *adc, uint32_t *output, uint32_t timeout)
{
    (void)adc;
    (void)timeout;
    *output = 1;
    return 0;
}

int hal_adc_finalize(adc_dev_t *adc)
{
    (void)adc;
    return 0;
}

bool combrief_ble_send_json(const char *json)
{
    (void)json;
    return true;
}

int main(void)
{
    app_state_init();
    power_init();
    combrief_app_state_set_ble_connected(combrief_app_state_get_mutable(), true);
    display_render();
    return 0;
}
`, ['app_state', 'display', 'power', 'protocol'], ['-DBOARD_HAASEDUK1']);

    expect(output).toContain('OLED: Apps - Ready');
    expect(output).not.toContain('Battery --%');
    expect(output).not.toContain('Battery 78%');
  });

  it('clears resolved display after one display tick', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "display.h"

int main(void)
{
    combrief_app_state_t *state;
    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    combrief_app_state_mark_resolved(state, "expired");

    display_tick();
    display_tick();

    return 0;
}
`, ['app_state', 'display']);

    expect(output).toContain('OLED: Expired\nOLED: Apps - Ready');
    expect(output).not.toContain('Battery --%');
  });

  it('lets the HaaS BLE stack use its default address and avoids automatic advertising names', () => {
    const source = expectFile('ble_service/ble_service.c');

    expect(source).toContain('.dev_addr = NULL');
    expect(source).toContain('.dev_name = NULL');
    expect(source).toContain('ble_stack_set_name(g_device_name)');
    expect(source).not.toContain('COMBRIEF_BLE_DEVICE_ADDR');
    expect(source).not.toContain('DEV_ADDR_LE_RANDOM, COMBRIEF_BLE_DEVICE_ADDR');
  });

  it('binds BLE service to the HaaS BLE GATT server APIs', () => {
    const source = expectFile('ble_service/ble_service.c');

    for (const text of [
      'aos/ble.h',
      'hci_h4_driver_init',
      'ble_stack_init',
      'ble_stack_event_register',
      'ble_stack_gatt_registe_service',
      'GATT_PRIMARY_SERVICE_DEFINE',
      'GATT_CHAR_DEFINE',
      'GATT_CHAR_VAL_DEFINE',
      'GATT_CHAR_CCC_DEFINE',
      'GATT_CHRC_PROP_WRITE',
      'GATT_CHRC_PROP_WRITE_WITHOUT_RESP',
      'GATT_CHRC_PROP_NOTIFY',
      'EVENT_GAP_CONN_CHANGE',
      'EVENT_GATT_CHAR_WRITE',
      'EVENT_GATT_CHAR_CCC_CHANGE',
      'ble_stack_adv_start',
      'ble_stack_adv_stop',
      'ble_stack_gatt_notificate',
    ]) {
      expect(source).toContain(text);
    }
  });

  it('binds power reporting to HaaS ADC voltage sampling with fallback', () => {
    const source = expectFile('power/power.c');

    for (const text of [
      'aos/hal/adc.h',
      'hal_adc_init',
      'hal_adc_value_get',
      'hal_adc_finalize',
      'COMBRIEF_POWER_HAAS_ADC_PORT',
      'COMBRIEF_POWER_MIN_MV',
      'COMBRIEF_POWER_MAX_MV',
      'battery percent',
      'COMBRIEF_POWER_UNKNOWN_BATTERY_PERCENT',
      'COMBRIEF_POWER_REPORT_PERIOD_TICKS',
      'combrief_protocol_build_battery',
      'combrief_ble_send_json',
      'combrief_app_state_set_battery',
    ]) {
      expect(source).toContain(text);
    }
  });

  it('executes C input behavior without resending while waiting for resolved', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "input.h"

static int failures = 0;
static int send_count = 0;

static bool capture_send(const char *json)
{
    if (json == NULL || strstr(json, "\"type\":\"decision\"") == NULL) {
        printf("FAIL send payload %s\n", json == NULL ? "null" : json);
        failures++;
        return false;
    }
    send_count++;
    return true;
}

static void check_bool(const char *name, bool actual, bool expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected ? 1 : 0, actual ? 1 : 0);
        failures++;
    }
}

static void check_int(const char *name, int actual, int expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected, actual);
        failures++;
    }
}

static void seed_request(combrief_app_state_t *state)
{
    combrief_option_t options[2];
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "allow");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "Allow");
    snprintf(options[1].id, sizeof(options[1].id), "%s", "deny");
    snprintf(options[1].label, sizeof(options[1].label), "%s", "Deny");
    (void)combrief_app_state_set_request(state, "req-1", "Need approval", "Full content", options, 2);
}

int main(void)
{
    combrief_app_state_t state;
    combrief_app_state_init(&state);
    combrief_app_state_set_ble_connected(&state, true);
    seed_request(&state);

    check_bool("first K1 sends decision", combrief_input_handle_key(&state, COMBRIEF_KEY_K1, capture_send), true);
    check_int("sent once", send_count, 1);
    check_bool("waiting resolved marked", state.waiting_resolved, true);

    check_bool("second K1 blocked", combrief_input_handle_key(&state, COMBRIEF_KEY_K1, capture_send), false);
    check_int("still sent once", send_count, 1);

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`);

    expect(output).toContain('ok');
  });

  it('clears active and waiting request state across BLE disconnect and reconnect', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"

static int failures = 0;

static void check_bool(const char *name, bool actual, bool expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected ? 1 : 0, actual ? 1 : 0);
        failures++;
    }
}

static void check_int(const char *name, int actual, int expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected, actual);
        failures++;
    }
}

static void check_string(const char *name, const char *actual, const char *expected)
{
    if (strcmp(actual, expected) != 0) {
        printf("FAIL %s expected %s got %s\n", name, expected, actual);
        failures++;
    }
}

static void seed_request(combrief_app_state_t *state, const char *decision_id)
{
    combrief_option_t options[2];
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "allow");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "Allow");
    snprintf(options[1].id, sizeof(options[1].id), "%s", "deny");
    snprintf(options[1].label, sizeof(options[1].label), "%s", "Deny");
    (void)combrief_app_state_set_request(state, decision_id, "Need approval", "Sensitive full content", options, 2);
    state->display_mode = COMBRIEF_DISPLAY_FULL;
    state->full_page = 3;
}

static void check_cleared_disconnected(const combrief_app_state_t *state)
{
    check_bool("BLE disconnected", state->ble_connected, false);
    check_int("remote disconnected", (int)state->remote_state, (int)COMBRIEF_REMOTE_DISCONNECTED);
    check_int("display summary", (int)state->display_mode, (int)COMBRIEF_DISPLAY_SUMMARY);
    check_string("decision cleared", state->decision_id, "");
    check_string("brief cleared", state->brief, "");
    check_string("content cleared", state->content, "");
    check_int("options cleared", (int)state->option_count, 0);
    check_int("full page reset", (int)state->full_page, 0);
    check_bool("waiting cleared", state->waiting_resolved, false);
    check_string("status disconnected", state->primary_status, "Disconnected");
}

static void check_reconnected_idle(const combrief_app_state_t *state)
{
    check_bool("BLE reconnected", state->ble_connected, true);
    check_int("remote idle", (int)state->remote_state, (int)COMBRIEF_REMOTE_IDLE);
    check_int("display still summary", (int)state->display_mode, (int)COMBRIEF_DISPLAY_SUMMARY);
    check_string("decision still cleared", state->decision_id, "");
    check_int("options still cleared", (int)state->option_count, 0);
    check_bool("waiting still cleared", state->waiting_resolved, false);
    check_string("status ready", state->primary_status, "Ready");
}

int main(void)
{
    combrief_app_state_t state;

    combrief_app_state_init(&state);
    combrief_app_state_set_ble_connected(&state, true);
    seed_request(&state, "active-req");
    combrief_app_state_set_ble_connected(&state, false);
    check_cleared_disconnected(&state);
    combrief_app_state_set_ble_connected(&state, true);
    check_reconnected_idle(&state);

    combrief_app_state_init(&state);
    combrief_app_state_set_ble_connected(&state, true);
    seed_request(&state, "waiting-req");
    combrief_app_state_mark_decision_sent(&state);
    combrief_app_state_set_ble_connected(&state, false);
    check_cleared_disconnected(&state);
    combrief_app_state_set_ble_connected(&state, true);
    check_reconnected_idle(&state);

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`, ['app_state']);

    expect(output).toContain('ok');
  });

  it('refuses BLE sends while disconnected and leaves K1 request unsent when not connected', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "ble_service.h"
#include "input.h"

static int failures = 0;
static int send_count = 0;

static bool capture_send(const char *json)
{
    (void)json;
    send_count++;
    return true;
}

static void check_bool(const char *name, bool actual, bool expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected ? 1 : 0, actual ? 1 : 0);
        failures++;
    }
}

static void check_int(const char *name, int actual, int expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected, actual);
        failures++;
    }
}

static void seed_request(combrief_app_state_t *state)
{
    combrief_option_t options[1];
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "allow");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "Allow");
    (void)combrief_app_state_set_request(state, "req-offline", "Need approval", "Full content", options, 1);
}

int main(void)
{
    combrief_app_state_t state;

    app_state_init();
    ble_service_init(NULL, NULL);
    check_bool("send rejected before connection", combrief_ble_send_json("{\"protocol\":1}"), false);
    ble_service_on_connected();
    check_bool("send allowed when connected", combrief_ble_send_json("{\"protocol\":1}"), true);
    ble_service_on_disconnected();
    check_bool("send rejected after disconnect", combrief_ble_send_json("{\"protocol\":1}"), false);

    combrief_app_state_init(&state);
    seed_request(&state);
    check_bool("offline K1 blocked", combrief_input_handle_key(&state, COMBRIEF_KEY_K1, capture_send), false);
    check_int("offline K1 did not send", send_count, 0);
    check_bool("offline K1 did not mark waiting", state.waiting_resolved, false);

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`, ['app_state', 'protocol', 'input', 'ble_service']);

    expect(output).toContain('ok');
  });

  it('accepts HaaS GATT host writes regardless of write flag and only rejects offsets', () => {
    const source = expectFile('ble_service/ble_service.c');
    const writeBlock = source.slice(
      source.indexOf('static void handle_gatt_write'),
      source.indexOf('static void handle_gatt_ccc_change'),
    );

    expect(writeBlock).toContain('event_data->offset != 0');
    expect(writeBlock).not.toContain('event_data->flag != 0');
    expect(writeBlock).toContain('flag=%u');
  });

  it('sends hello only after notifications are enabled and retries until host sync arrives', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "ble_service.h"

int main(void)
{
    app_state_init();
    ble_service_init(NULL, NULL);

    ble_service_on_connected();
    printf("MARK connected\n");
    ble_service_tick();
    printf("MARK before notify\n");

    ble_service_on_notify_enabled(true);
    printf("MARK notify enabled\n");
    for (int i = 0; i < 4; i++) {
        ble_service_tick();
    }
    printf("MARK retried\n");

    (void)ble_service_handle_host_write("{\"protocol\":1,\"type\":\"state\",\"primary\":\"working\"}");
    for (int i = 0; i < 4; i++) {
        ble_service_tick();
    }
    printf("MARK host synced\n");
    return 0;
}
`, ['app_state', 'protocol', 'ble_service']);

    const beforeNotify = output.slice(output.indexOf('MARK connected'), output.indexOf('MARK before notify'));
    const afterNotify = output.slice(output.indexOf('MARK before notify'), output.indexOf('MARK retried'));
    const afterHostSync = output.slice(output.indexOf('MARK retried'), output.indexOf('MARK host synced'));

    expect(beforeNotify).not.toContain('ComBrief BLE notify characteristic=');
    expect(afterNotify.match(/ComBrief BLE notify characteristic=/g)?.length).toBeGreaterThanOrEqual(2);
    expect(afterHostSync).not.toContain('ComBrief BLE notify characteristic=');
  });

  it('reassembles small BLE host write chunks before applying host JSON', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "ble_service.h"

static int failures;

static void check_bool(const char *label, bool actual, bool expected)
{
    if (actual != expected) {
        printf("FAIL %s expected=%d actual=%d\n", label, expected ? 1 : 0, actual ? 1 : 0);
        failures++;
    }
}

static void check_str(const char *label, const char *actual, const char *expected)
{
    if (strcmp(actual, expected) != 0) {
        printf("FAIL %s expected=%s actual=%s\n", label, expected, actual);
        failures++;
    }
}

int main(void)
{
    combrief_app_state_t *state;

    app_state_init();
    ble_service_init(NULL, NULL);
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);

    check_bool("first chunk pending", ble_service_handle_host_write(">{\"protocol\":1,\"ty"), true);
    check_bool("restart chunk pending", ble_service_handle_host_write(">{\"protocol\":1,\"ty"), true);
    check_str("not applied before final chunk", state->primary_status, "Ready");
    check_bool("final chunk applies", ble_service_handle_host_write("!pe\":\"state\",\"primary\":\"working\"}"), true);
    check_str("applied after final chunk", state->primary_status, "working");

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`, ['app_state', 'protocol', 'ble_service']);

    expect(output).toContain('ok');
  });

  it('does not log full BLE payloads or full display content', () => {
    const bleSource = expectFile('ble_service/ble_service.c');
    const displaySource = expectFile('display/display.c');

    expect(bleSource).not.toMatch(/printf\([^;]*%s[^;]*json/s);
    expect(bleSource).not.toMatch(/printf\([^;]*json[^;]*%s/s);
    expect(displaySource).not.toMatch(/printf\([^;]*state->content/s);

    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "display.h"

int main(void)
{
    combrief_app_state_t *state;
    combrief_option_t options[1];
    memset(options, 0, sizeof(options));
    snprintf(options[0].id, sizeof(options[0].id), "%s", "allow");
    snprintf(options[0].label, sizeof(options[0].label), "%s", "Allow");

    app_state_init();
    state = combrief_app_state_get_mutable();
    combrief_app_state_set_ble_connected(state, true);
    (void)combrief_app_state_set_request(state, "req-secret", "Need approval", "SECRET_FULL_CONTENT_SHOULD_NOT_LOG", options, 1);
    state->display_mode = COMBRIEF_DISPLAY_FULL;
    display_render();

    return 0;
}
`, ['app_state', 'display']);

    expect(output).not.toContain('SECRET_FULL_CONTENT_SHOULD_NOT_LOG');
    expect(output).toContain('OLED: Detail');
  });
});
