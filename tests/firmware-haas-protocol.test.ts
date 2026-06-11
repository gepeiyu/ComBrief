import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const firmwareDir = join(process.cwd(), 'firmware', 'haas', 'combrief_remote');
const readFirmwareFile = (name: string) => readFileSync(join(firmwareDir, name), 'utf8');

const expectFile = (name: string) => {
  const path = join(firmwareDir, name);
  expect(existsSync(path), `${name} should exist`).toBe(true);
  return readFirmwareFile(name);
};

const extractFunction = (source: string, name: string) => {
  const start = source.indexOf(name);
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  const nextFunction = source.slice(start + name.length).search(/\n[a-z_]+\s+[a-zA-Z0-9_]+\(/);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, start + name.length + nextFunction);
};

const compileAndRunFirmwareHarness = (source: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'combrief-firmware-'));
  try {
    const harnessPath = join(dir, 'harness.c');
    const binaryPath = join(dir, 'harness');
    writeFileSync(harnessPath, source);
    execFileSync(
      'cc',
      [
        '-std=c99',
        '-Wall',
        '-Wextra',
        '-I',
        join(firmwareDir, 'app_state'),
        '-I',
        join(firmwareDir, 'protocol'),
        harnessPath,
        join(firmwareDir, 'app_state', 'app_state.c'),
        join(firmwareDir, 'protocol', 'protocol.c'),
        '-o',
        binaryPath,
      ],
      { cwd: process.cwd(), stdio: 'pipe' },
    );
    return execFileSync(binaryPath, [], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('HaaS ComBrief Remote firmware protocol modules', () => {
  it('executes C protocol behavior for resolved validation and device payloads', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "protocol.h"

static int failures = 0;

static void check_bool(const char *name, bool actual, bool expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected ? 1 : 0, actual ? 1 : 0);
        failures++;
    }
}

static void check_contains(const char *name, const char *value, const char *needle)
{
    if (strstr(value, needle) == NULL) {
        printf("FAIL %s missing %s in %s\n", name, needle, value);
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
    (void)combrief_app_state_set_request(state, decision_id, "Need approval", "Full content", options, 2);
}

int main(void)
{
    char payload[512];
    combrief_app_state_t state;

    combrief_app_state_init(&state);
    seed_request(&state, "req-1");
    check_bool(
        "valid resolved clears active request",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"resolved\",\"decisionId\":\"req-1\",\"result\":\"selected\"}"),
        true);
    check_bool("resolved cleared request", state.decision_id[0] == '\0', true);

    seed_request(&state, "req-1");
    check_bool(
        "resolved missing decisionId",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"resolved\",\"result\":\"selected\"}"),
        false);
    check_bool(
        "resolved missing result",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"resolved\",\"decisionId\":\"req-1\"}"),
        false);
    check_bool(
        "resolved nested fields rejected",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"resolved\",\"nested\":{\"decisionId\":\"req-1\",\"result\":\"selected\"}}"),
        false);
    check_bool(
        "resolved mismatched decisionId rejected",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"resolved\",\"decisionId\":\"other\",\"result\":\"selected\"}"),
        false);
    check_bool(
        "resolved invalid result rejected",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"resolved\",\"decisionId\":\"req-1\",\"result\":\"maybe\"}"),
        false);
    check_bool(
        "concatenated objects rejected",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1}{\"type\":\"resolved\",\"decisionId\":\"req-1\",\"result\":\"selected\"}"),
        false);
    check_bool("concatenated objects keep request", strcmp(state.decision_id, "req-1") == 0, true);

    check_bool(
        "protocol exponent rejected",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1e2,\"type\":\"state\",\"primary\":\"bad\"}"),
        false);
    check_bool(
        "protocol suffix rejected",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1-1,\"type\":\"state\",\"primary\":\"bad\"}"),
        false);
    check_bool(
        "trailing garbage rejected",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"state\",\"primary\":\"bad\"} garbage"),
        false);

    combrief_app_state_mark_decision_sent(&state);
    check_bool("waiting resolved blocks decision", combrief_protocol_build_decision(payload, sizeof(payload), &state), false);

    combrief_app_state_clear_request(&state);
    seed_request(&state, "req-2");
    check_bool("hello payload builds", combrief_protocol_build_hello(payload, sizeof(payload), &state), true);
    check_contains("hello protocol", payload, "\"protocol\":1");
    check_contains("hello type", payload, "\"type\":\"hello\"");
    check_contains("hello device", payload, "\"deviceName\":\"ComBrief-Remote\"");
    check_contains("hello platform", payload, "\"platform\":\"haas-edu-k1\"");
    check_contains("hello fw", payload, "\"fwVersion\":\"0.1.0\"");

    check_bool("decision payload builds", combrief_protocol_build_decision(payload, sizeof(payload), &state), true);
    check_contains("decision protocol", payload, "\"protocol\":1");
    check_contains("decision type", payload, "\"type\":\"decision\"");
    check_contains("decision id", payload, "\"decisionId\":\"req-2\"");
    check_contains("decision option", payload, "\"optionId\":\"allow\"");
    check_contains("decision ts", payload, "\"ts\":");

    check_bool("battery payload builds", combrief_protocol_build_battery(payload, sizeof(payload), &state), true);
    check_contains("battery protocol", payload, "\"protocol\":1");
    check_contains("battery type", payload, "\"type\":\"battery\"");
    check_contains("battery value", payload, "\"battery\":100");

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`);

    expect(output).toContain('ok');
  });

  it('declares protocol limits and remote identity constants', () => {
    const header = expectFile('protocol/protocol.h');

    for (const text of [
      '#define COMBRIEF_PROTOCOL_VERSION 1',
      '#define COMBRIEF_MAX_BRIEF_LEN 64',
      '#define COMBRIEF_MAX_CONTENT_LEN 1024',
      '#define COMBRIEF_MAX_OPTIONS 8',
      '#define COMBRIEF_MAX_OPTION_LABEL_LEN 24',
      '#define COMBRIEF_REMOTE_NAME "ComBrief-Remote"',
      '#define COMBRIEF_REMOTE_PLATFORM "haas-edu-k1"',
      '#define COMBRIEF_REMOTE_FW_VERSION "0.1.0"',
    ]) {
      expect(header).toContain(text);
    }
  });

  it('builds device-to-desktop JSON matching desktop validators', () => {
    const source = expectFile('protocol/protocol.c');

    const hello = extractFunction(source, 'combrief_protocol_build_hello');
    for (const text of [
      '\\"protocol\\":1',
      '\\"type\\":\\"hello\\"',
      '\\"deviceName\\":\\"%s\\"',
      '\\"platform\\":\\"%s\\"',
      '\\"fwVersion\\":\\"%s\\"',
      'COMBRIEF_REMOTE_NAME',
      'COMBRIEF_REMOTE_PLATFORM',
      'COMBRIEF_REMOTE_FW_VERSION',
    ]) {
      expect(hello).toContain(text);
    }

    const battery = extractFunction(source, 'combrief_protocol_build_battery');
    for (const text of ['\\"protocol\\":1', '\\"type\\":\\"battery\\"', '\\"battery\\":%u']) {
      expect(battery).toContain(text);
    }

    const decision = extractFunction(source, 'combrief_protocol_build_decision');
    for (const text of [
      '\\"protocol\\":1',
      '\\"type\\":\\"decision\\"',
      '\\"decisionId\\":\\"%s\\"',
      '\\"optionId\\":\\"%s\\"',
      '\\"ts\\":%u',
    ]) {
      expect(decision).toContain(text);
    }
  });

  it('does not emit fields rejected or ignored by the desktop validators', () => {
    const source = expectFile('protocol/protocol.c');

    expect(source).not.toContain('protocolVersion');
    expect(source).not.toContain('selectedOption');
    expect(source).not.toContain('\\"name\\"');
  });

  it('recognizes host state, request, and resolved messages with protocol checks', () => {
    const header = expectFile('protocol/protocol.h');
    const source = expectFile('protocol/protocol.c');

    expect(header).toContain('combrief_protocol_apply_host_message');
    expect(source).toContain('has_message_type');
    expect(source).toContain('top_level_string_equals');
    expect(source).toContain('has_protocol_version');
    expect(source).toContain('is_json_object');
    expect(source).toContain('return false');
  });

  it('rejects malformed state and request messages instead of accepting pseudo matches', () => {
    const source = expectFile('protocol/protocol.c');

    for (const text of [
      'if (!is_json_object(json) || !has_protocol_version(json))',
      'state_changed',
      'return state_changed',
      "decision_id[0] == '\\0'",
      'option_count == 0',
      'return false',
    ]) {
      expect(source).toContain(text);
    }
  });

  it('documents the v1 lightweight request option parser limits', () => {
    const source = expectFile('protocol/protocol.c');

    expect(source).toContain('v1 lightweight parser');
    expect(source).toContain('options');
    expect(source).toContain('id/label');
  });

  it('declares app state display modes, remote states, and request fields', () => {
    const header = expectFile('app_state/app_state.h');

    for (const text of [
      'COMBRIEF_DISPLAY_SUMMARY',
      'COMBRIEF_DISPLAY_FULL',
      'combrief_remote_state_t',
      'decision_id',
      'selected_option',
      'full_page',
      'waiting_resolved',
    ]) {
      expect(header).toContain(text);
    }
  });

  it('implements app state transitions for selection, display mode, and request lifecycle', () => {
    const source = expectFile('app_state/app_state.c');

    for (const text of [
      'combrief_app_state_select_next',
      'combrief_app_state_select_prev',
      'combrief_app_state_toggle_full',
      'combrief_app_state_mark_decision_sent',
      'combrief_app_state_clear_request',
    ]) {
      expect(source).toContain(text);
    }
  });

  it('keeps selection and display mode unchanged while waiting for resolved', () => {
    const source = expectFile('app_state/app_state.c');

    expect(source).toContain('combrief_app_state_is_waiting_resolved');
    expect(extractFunction(source, 'combrief_app_state_select_next')).toContain('combrief_app_state_is_waiting_resolved(state)');
    expect(extractFunction(source, 'combrief_app_state_select_prev')).toContain('combrief_app_state_is_waiting_resolved(state)');
    expect(extractFunction(source, 'combrief_app_state_toggle_full')).toContain('combrief_app_state_is_waiting_resolved(state)');
  });

  it('refuses to build duplicate decision payloads while waiting for resolved', () => {
    const source = expectFile('protocol/protocol.c');
    const decision = extractFunction(source, 'combrief_protocol_build_decision');

    expect(decision).toContain('state->waiting_resolved');
    expect(decision).toContain('COMBRIEF_REMOTE_WAITING_RESOLVED');
    expect(decision).toContain('return false');
  });

  it('validates resolved host messages against the active request before clearing state', () => {
    const source = expectFile('protocol/protocol.c');

    expect(source).toContain('apply_resolved_message');
    expect(source).toContain('is_resolved_result');
    expect(source).toContain('extract_top_level_string(json, "\\"decisionId\\""');
    expect(source).toContain('extract_top_level_string(json, "\\"result\\""');
    expect(source).toContain("decision_id[0] == '\\0'");
    expect(source).toContain("result[0] == '\\0'");
    expect(source).toContain('strcmp(decision_id, state->decision_id) != 0');
    expect(source).toContain('return false');
  });

  it('rejects pseudo protocol versions and non-object/trailing-garbage messages', () => {
    const source = expectFile('protocol/protocol.c');
    const protocolCheck = extractFunction(source, 'has_protocol_version');
    const objectCheck = extractFunction(source, 'is_json_object');

    expect(protocolCheck).toContain("*cursor == ','");
    expect(protocolCheck).toContain("*cursor == '}'");
    expect(protocolCheck).toContain('return false');
    expect(objectCheck).toContain('object_depth == 0');
    expect(objectCheck).toContain("return *cursor == '\\0'");
    expect(source).toContain('if (!is_json_object(json) || !has_protocol_version(json))');
  });

  it('only applies top-level state fields and keeps apps working detection scoped', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "protocol.h"

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

int main(void)
{
    combrief_app_state_t state;

    combrief_app_state_init(&state);
    combrief_app_state_set_ble_connected(&state, true);
    combrief_app_state_set_battery(&state, 88);
    combrief_app_state_set_primary_status(&state, "Ready");

    check_bool(
        "nested state fields ignored",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"state\",\"nested\":{\"connected\":false,\"battery\":1,\"status\":\"working\"}}"),
        false);
    check_bool("nested kept connected", state.ble_connected, true);
    check_int("nested kept remote idle", (int)state.remote_state, (int)COMBRIEF_REMOTE_IDLE);
    check_int("nested kept battery", (int)state.battery_percent, 88);
    check_string("nested kept status", state.primary_status, "Ready");

    check_bool(
        "state text pseudo key ignored",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"state\",\"note\":\"text says \\\"connected\\\":false and \\\"status\\\":\\\"working\\\"\"}"),
        false);
    check_bool("text kept connected", state.ble_connected, true);
    check_int("text kept battery", (int)state.battery_percent, 88);
    check_string("text kept status", state.primary_status, "Ready");

    check_bool(
        "top-level state fields apply",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"state\",\"connected\":true,\"battery\":64,\"primaryStatus\":\"Idle\"}"),
        true);
    check_bool("top-level connected", state.ble_connected, true);
    check_int("top-level battery", (int)state.battery_percent, 64);
    check_string("top-level primaryStatus", state.primary_status, "Idle");

    check_bool(
        "apps working still applies",
        combrief_protocol_apply_host_message(&state, "{\"protocol\":1,\"type\":\"state\",\"apps\":[{\"id\":\"cursor\",\"status\":\"idle\"},{\"id\":\"agent\",\"status\":\"working\"}],\"primary\":\"cursor\"}"),
        true);
    check_string("apps working status", state.primary_status, "working");

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`);

    expect(output).toContain('ok');
  });

  it('parses request options with braces in labels without corrupting option boundaries', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "protocol.h"

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

int main(void)
{
    combrief_app_state_t state;
    const char *request_json = "{\"protocol\":1,\"type\":\"request\",\"decisionId\":\"req-brace\",\"brief\":\"Need approval\",\"content\":\"full content with } brace\",\"options\":[{\"id\":\"allow\",\"label\":\"Allow } with { nested-like text\"},{\"id\":\"deny\",\"label\":\"Deny after brace\"}]}";

    combrief_app_state_init(&state);
    combrief_app_state_set_ble_connected(&state, true);

    check_bool("request applied", combrief_protocol_apply_host_message(&state, request_json), true);
    check_string("decision id", state.decision_id, "req-brace");
    check_int("option count", (int)state.option_count, 2);
    check_string("first option id", state.options[0].id, "allow");
    check_string("first option label", state.options[0].label, "Allow } with { nested-li");
    check_string("second option id", state.options[1].id, "deny");
    check_string("second option label", state.options[1].label, "Deny after brace");

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`);

    expect(output).toContain('ok');
  });

  it('uses only direct request option id and label fields inside option objects', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "protocol.h"

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

int main(void)
{
    combrief_app_state_t state;
    const char *request_json = "{\"protocol\":1,\"type\":\"request\",\"decisionId\":\"req-nested\",\"brief\":\"Need approval\",\"options\":[{\"meta\":{\"id\":\"fake\",\"label\":\"Fake\"},\"id\":\"real\",\"label\":\"Allow\"}]}";

    combrief_app_state_init(&state);
    combrief_app_state_set_ble_connected(&state, true);

    check_bool("request applied", combrief_protocol_apply_host_message(&state, request_json), true);
    check_int("option count", (int)state.option_count, 1);
    check_string("option id", state.options[0].id, "real");
    check_string("option label", state.options[0].label, "Allow");

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`);

    expect(output).toContain('ok');
  });

  it('ignores nested app status when deriving primary status from apps', () => {
    const output = compileAndRunFirmwareHarness(String.raw`
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "app_state.h"
#include "protocol.h"

static int failures = 0;

static void check_bool(const char *name, bool actual, bool expected)
{
    if (actual != expected) {
        printf("FAIL %s expected %d got %d\n", name, expected ? 1 : 0, actual ? 1 : 0);
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

int main(void)
{
    combrief_app_state_t state;
    const char *state_json = "{\"protocol\":1,\"type\":\"state\",\"apps\":[{\"id\":\"cursor\",\"label\":\"Cursor\",\"meta\":{\"status\":\"working\"},\"status\":\"idle\"}],\"primary\":\"cursor\"}";

    combrief_app_state_init(&state);
    combrief_app_state_set_ble_connected(&state, true);

    check_bool("state applied", combrief_protocol_apply_host_message(&state, state_json), true);
    check_string("primary status", state.primary_status, "idle");

    if (failures != 0) {
        return 1;
    }
    printf("ok\n");
    return 0;
}
`);

    expect(output).toContain('ok');
  });
});
