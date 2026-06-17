#!/usr/bin/env node
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';

const APP_ID = 'cursor';
const home = join(homedir(), '.combrief');

function eventLoggingEnabled(config) {
  return config?.eventLoggingEnabled === true;
}

function logError(config, message) {
  if (!eventLoggingEnabled(config)) return;
  mkdirSync(join(home, 'logs'), { recursive: true });
  appendFileSync(
    join(home, 'logs', 'remote-gate.log'),
    `${new Date().toISOString()} [${APP_ID}] ${message}\n`,
  );
}

function loadConfig() {
  return JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
}

function loadInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function resolveHookEvent(input) {
  return (
    process.argv[2] ??
    process.env.CURSOR_HOOK_EVENT ??
    input.hook_event_name ??
    input.hook_event ??
    null
  );
}

function normalizeGateEvent(event) {
  if (event === 'preToolUse' || event === 'PreToolUse') return 'preToolUse';
  if (event === 'beforeShellExecution' || event === 'BeforeShellExecution') {
    return 'preToolUse';
  }
  return null;
}

function isShellGateEvent(event) {
  return event === 'beforeShellExecution' || event === 'BeforeShellExecution';
}

function decisionChannelEnabled(config) {
  return Boolean(
    config.slack?.enabled ||
      (config.hardware?.enabled && config.hardware?.decisionPushEnabled),
  );
}

function postJson(config, path, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: config.port,
        path,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${config.token}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(raw || '{}') });
          } catch {
            resolve({ status: res.statusCode ?? 0, json: {} });
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

async function reportState(config, event, input) {
  const toolName = input.tool_name ?? input.toolName ?? input.tool ?? input.name;
  const body = JSON.stringify({
    appId: APP_ID,
    event,
    timestamp: Date.now(),
    sessionId: input.conversation_id ?? input.session_id,
    ...(toolName ? { meta: { toolName } } : {}),
  });
  try {
    await postJson(config, '/v1/state', body, 2_500);
  } catch (err) {
    logError(config, `state ${event}: ${err}`);
  }
}

const input = loadInput();
const argvEvent = process.argv[2] ?? process.env.CURSOR_HOOK_EVENT ?? null;
const inputEvent = input.hook_event_name ?? input.hook_event ?? null;
if (argvEvent && inputEvent && argvEvent !== inputEvent) {
  process.exit(0);
}

const rawEvent = resolveHookEvent(input);
const hookEvent = normalizeGateEvent(rawEvent);
if (!hookEvent) {
  process.exit(0);
}

if (!existsSync(join(home, 'config.json'))) {
  process.exit(0);
}

const config = loadConfig();
if (!decisionChannelEnabled(config)) {
  process.exit(0);
}

await reportState(config, hookEvent, input);

const decisionTimeoutMs = config.slack?.decisionTimeoutMs ?? 600_000;
const toolName = input.tool_name ?? input.toolName ?? input.tool ?? input.name ?? (isShellGateEvent(rawEvent) ? 'Shell' : 'unknown');
const rawToolInput = input.tool_input ?? input.toolInput ?? input.input ?? input.args ?? {};
const toolInput =
  isShellGateEvent(rawEvent) &&
  typeof rawToolInput === 'object' &&
  rawToolInput !== null &&
  !Array.isArray(rawToolInput)
    ? { ...rawToolInput, ...(typeof input.command === 'string' ? { command: input.command } : {}) }
    : rawToolInput;
const waitBody = JSON.stringify({
  appId: APP_ID,
  hookEvent,
  sessionId: input.conversation_id ?? input.session_id,
  cwd: input.cwd,
  toolName,
  toolInput,
  raw: input,
});

try {
  const res = await postJson(
    config,
    '/v1/decision/wait',
    waitBody,
    decisionTimeoutMs + 30_000,
  );
  if (res.status >= 200 && res.status < 300 && res.json.hookStdout) {
    process.stdout.write(`${res.json.hookStdout}\n`);
  }
} catch (err) {
  logError(config, `decision wait: ${err}`);
}

process.exit(0);
