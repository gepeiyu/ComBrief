#!/usr/bin/env node
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const APP_ID = process.env.COMBRIEF_APP_ID ?? 'claude-code';
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
  PermissionRequest: 'permissionRequest',
  AgentResponse: 'afterAgentResponse',
  AgentThought: 'afterAgentResponse',
};

function resolveHookEvent(input) {
  return (
    process.env.CURSOR_HOOK_EVENT ??
    process.env.CLAUDE_HOOK_EVENT ??
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
  if (event === 'preToolUse') {
    const tool =
      input.tool_name ?? input.toolName ?? input.tool ?? input.name;
    if (typeof tool === 'string' && tool) {
      meta.toolName = tool;
    }
  }
  return Object.keys(meta).length ? meta : undefined;
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
  const url = `http://127.0.0.1:${config.port}/v1/state`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.token}`,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(2_500),
      });
      if (!res.ok) {
        logError(config, `report ${event} HTTP ${res.status}`);
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

process.exit(runChain(input));
