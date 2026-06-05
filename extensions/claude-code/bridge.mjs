#!/usr/bin/env node
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';

const APP_ID = 'claude-code';
const home = join(homedir(), '.combrief');

function eventLoggingEnabled(config) {
  return config?.eventLoggingEnabled === true;
}

function logError(config, message) {
  if (!eventLoggingEnabled(config)) return;
  mkdirSync(join(home, 'logs'), { recursive: true });
  appendFileSync(
    join(home, 'logs', 'bridge.log'),
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

const EVENT_MAP = {
  sessionStart: 'sessionStart',
  sessionEnd: 'sessionEnd',
  beforeSubmitPrompt: 'beforeSubmitPrompt',
  preToolUse: 'preToolUse',
  postToolUse: 'postToolUse',
  postToolUseFailure: 'postToolUseFailure',
  beforeShellExecution: 'beforeShellExecution',
  afterShellExecution: 'afterShellExecution',
  stop: 'stop',
  afterAgentResponse: 'afterAgentResponse',
  SessionStart: 'sessionStart',
  SessionEnd: 'sessionEnd',
  UserPromptSubmit: 'beforeSubmitPrompt',
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  PostToolUseFailure: 'postToolUseFailure',
  PermissionRequest: 'permissionRequest',
  BeforeShellExecution: 'beforeShellExecution',
  AfterShellExecution: 'afterShellExecution',
  Stop: 'stop',
  AgentResponse: 'afterAgentResponse',
  AgentThought: 'afterAgentResponse',
};

function resolveHookEvent(input) {
  return (
    process.argv[2] ??
    process.env.CLAUDE_HOOK_EVENT ??
    process.env.CURSOR_HOOK_EVENT ??
    input.hook_event_name ??
    input.hook_event ??
    null
  );
}

function buildMeta(event, input) {
  const meta = {};
  if (event === 'stop' && input.status) {
    meta.stopStatus = input.status;
  }
  if (event === 'postToolUseFailure' && input.failure_type) {
    meta.failureType = input.failure_type;
  }
  if (event === 'preToolUse' || event === 'postToolUse') {
    const tool =
      input.tool_name ?? input.toolName ?? input.tool ?? input.name;
    if (typeof tool === 'string' && tool) {
      meta.toolName = tool;
    }
  }
  return Object.keys(meta).length ? meta : undefined;
}

function postJson(config, body) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: config.port,
        path: '/v1/state',
        method: 'POST',
        timeout: 2_500,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${config.token}`,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

async function reportState(config, event, input) {
  const meta = buildMeta(event, input);
  const body = JSON.stringify({
    appId: APP_ID,
    event,
    timestamp: Date.now(),
    sessionId: input.conversation_id ?? input.session_id,
    ...(meta ? { meta } : {}),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const status = await postJson(config, body);
      if (status < 200 || status >= 300) {
        logError(config, `report ${event} HTTP ${status}`);
      }
      return;
    } catch (err) {
      if (attempt === 0) continue;
      logError(config, `report ${event} failed: ${err}`);
    }
  }
}

function runChain(input) {
  const chainPath = join(home, 'apps', APP_ID, 'chain.json');
  if (!existsSync(chainPath)) return 0;

  const chain = JSON.parse(readFileSync(chainPath, 'utf8'));
  let exitCode = 0;
  for (const cmd of chain.commands ?? []) {
    const result = spawnSync(cmd, {
      input: JSON.stringify(input),
      encoding: 'utf8',
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0 && result.status !== null) {
      exitCode = result.status;
    }
  }
  return exitCode;
}

const input = loadInput();
const rawEvent = resolveHookEvent(input);
const normalized = rawEvent ? EVENT_MAP[rawEvent] : null;

if (existsSync(join(home, 'config.json'))) {
  const config = loadConfig();
  if (normalized) {
    await reportState(config, normalized, input);
  } else if (rawEvent) {
    logError(config, `unmapped hook event: ${rawEvent}`);
  }
}

if (normalized === 'beforeSubmitPrompt') {
  process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
}

process.exit(runChain(input));
