import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const compileAndRunFirmwareHarness = (source: string, modules: readonly string[] = ['app_state', 'protocol', 'input']) => {
  const dir = mkdtempSync(join(tmpdir(), 'combrief-firmware-modules-'));
  try {
    const harnessPath = join(dir, 'harness.c');
    const binaryPath = join(dir, 'harness');
    writeFileSync(harnessPath, source);
    const compileArgs = [
      '-std=c99',
      '-Wall',
      '-Wextra',
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
      harnessPath,
      ...modules.map((moduleName) => join(firmwareDir, moduleName, `${moduleName}.c`)),
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
      'ComBrief-Remote',
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

    expect(source).toMatch(/COMBRIEF_KEY_K1[\s\S]*combrief_protocol_build_decision[\s\S]*combrief_app_state_mark_decision_sent/);
    expect(source).toMatch(/COMBRIEF_KEY_K2[\s\S]*combrief_app_state_select_prev/);
    expect(source).toMatch(/COMBRIEF_KEY_K3[\s\S]*combrief_app_state_toggle_full/);
    expect(source).toMatch(/COMBRIEF_KEY_K4[\s\S]*combrief_app_state_select_next/);
  });

  it('maps full mode keys to paging and returns to summary', () => {
    const source = expectFile('input/input.c');

    for (const text of [
      'COMBRIEF_DISPLAY_FULL',
      'combrief_input_prev_page',
      'combrief_input_next_page',
      'return summary',
      'full_page',
    ]) {
      expect(source).toContain(text);
    }

    expect(source).toMatch(/COMBRIEF_DISPLAY_FULL[\s\S]*COMBRIEF_KEY_K2[\s\S]*combrief_input_prev_page/);
    expect(source).toMatch(/COMBRIEF_DISPLAY_FULL[\s\S]*COMBRIEF_KEY_K4[\s\S]*combrief_input_next_page/);
    expect(source).toMatch(/COMBRIEF_DISPLAY_FULL[\s\S]*COMBRIEF_KEY_K1[\s\S]*COMBRIEF_DISPLAY_SUMMARY/);
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

  it('cycles disconnected and advertising LEDs red then green then blue', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdio.h>

#include "app_state.h"
#include "led.h"

int main(void)
{
    combrief_app_state_t *state;
    app_state_init();
    state = combrief_app_state_get_mutable();

    led_render();
    led_render();
    led_render();

    combrief_app_state_set_ble_connected(state, false);
    led_render();
    led_render();
    led_render();

    return 0;
}
`, ['app_state', 'led']);

    const ledLines = output.split('\n').filter((line) => line.startsWith('LED '));
    expect(ledLines.slice(0, 3)).toEqual([
      'LED red: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED green: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED blue: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
    ]);
    expect(ledLines.slice(3, 6)).toEqual([
      'LED red: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED green: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
      'LED blue: COMBRIEF_REMOTE_ADVERTISING red green blue cycle',
    ]);
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
    expect(output).toContain('LED blue: connected working blue breathing');
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
      'LED blue: connected working blue breathing',
      'LED green: connected idle',
      'LED blue: connected working blue breathing',
    ]);
  });

  it('renders OLED placeholder copy for BLE, host, resolved, summary, and full views', () => {
    const source = expectFile('display/display.c');

    for (const text of [
      'Waiting BLE',
      'Waiting host',
      'Expired',
      'Handled elsewhere',
      'last_resolved_result',
      'strcmp',
      'Summary',
      'Full',
      'COMBRIEF_DISPLAY_SUMMARY',
      'COMBRIEF_DISPLAY_FULL',
    ]) {
      expect(source).toContain(text);
    }

    expect(source).toMatch(/strcmp\(result, "expired"\)/);
    expect(source).toMatch(/strcmp\(result, "handled_elsewhere"\)/);
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

    expect(output).toContain('OLED: Expired\nOLED: Waiting host');
  });

  it('provides battery percent fallback and periodic reporting hook', () => {
    const source = expectFile('power/power.c');

    for (const text of [
      'battery percent',
      'COMBRIEF_POWER_FALLBACK_BATTERY_PERCENT 78',
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
    expect(output).toContain('OLED: Full page');
  });
});
