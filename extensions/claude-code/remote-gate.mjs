#!/usr/bin/env node
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { promptLocalDecision } from './permission-prompt.mjs';

const APP_ID = 'claude-code';
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
    process.env.CLAUDE_HOOK_EVENT ??
    input.hook_event_name ??
    null
  );
}

function isGateEvent(hookName, input) {
  if (hookName === 'PermissionRequest') return true;
  if (hookName === 'PreToolUse') {
    const tool = input.tool_name ?? input.toolName;
    return tool === 'AskUserQuestion' || tool === 'ExitPlanMode';
  }
  return false;
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
  const body = JSON.stringify({
    appId: APP_ID,
    event,
    timestamp: Date.now(),
    sessionId: input.session_id ?? input.session_id,
    meta: { toolName: input.tool_name },
  });
  try {
    await postJson(config, '/v1/state', body, 2_500);
  } catch (err) {
    logError(config, `state ${event}: ${err}`);
  }
}

async function notifyLocalResolved(config, payload) {
  try {
    await postJson(
      config,
      '/v1/decision/local-resolved',
      JSON.stringify(payload),
      2_500,
    );
  } catch (err) {
    logError(config, `local-resolved: ${err}`);
  }
}

const input = loadInput();
const argvEvent =
  process.argv[2] ?? process.env.CLAUDE_HOOK_EVENT ?? null;
const inputEvent = input.hook_event_name ?? input.hook_event ?? null;
// bridge chain 会用错误事件 stdin 调用 gate；必须与 argv 事件一致
if (argvEvent && inputEvent && argvEvent !== inputEvent) {
  process.exit(0);
}

const hookName = resolveHookEvent(input);

if (!hookName || !isGateEvent(hookName, input)) {
  process.exit(0);
}

if (!existsSync(join(home, 'config.json'))) {
  process.exit(0);
}

const config = loadConfig();
if (!config.slack?.enabled) {
  process.exit(0);
}

const hookEvent =
  hookName === 'PermissionRequest' ? 'permissionRequest' : 'preToolUse';

await reportState(config, 'permissionRequest', input);

const waitBody = JSON.stringify({
  appId: APP_ID,
  hookEvent,
  sessionId: input.session_id,
  cwd: input.cwd,
  toolName: input.tool_name ?? input.toolName ?? 'unknown',
  toolInput: input.tool_input ?? {},
  raw: input,
});

const timeoutMs = (config.slack?.decisionTimeoutMs ?? 600_000) + 30_000;
const locale = config.locale ?? 'en';

const slackWait = postJson(config, '/v1/decision/wait', waitBody, timeoutMs);
const localWait = promptLocalDecision(input, locale);

try {
  const winner = await Promise.race([
    slackWait.then((res) => ({ source: 'slack', res })),
    localWait.then((local) =>
      local ? { source: 'local', local } : new Promise(() => {}),
    ),
  ]);

  if (winner.source === 'local') {
    await notifyLocalResolved(config, {
      appId: APP_ID,
      sessionId: input.session_id,
      toolName: input.tool_name ?? input.toolName ?? 'unknown',
      kind: winner.local.resolution.kind,
      detail: winner.local.resolution.detail,
    });
    process.stdout.write(`${winner.local.stdout}\n`);
  } else if (
    winner.res.status >= 200 &&
    winner.res.status < 300 &&
    winner.res.json.hookStdout
  ) {
    process.stdout.write(`${winner.res.json.hookStdout}\n`);
  }
} catch (err) {
  logError(config, `decision wait: ${err}`);
}

process.exit(0);
