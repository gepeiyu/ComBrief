# Slack 远程审批（方案 A）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use tre:subagent-driven-development (recommended) or tre:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 办公室本机 Claude Code 在需要用户确认时，ComBrief 向配置的 Slack 频道发送 Block Kit 卡片；外出用户在 Slack 点按钮后，Hook stdout 返回 `allow`/`deny`/`updatedInput`，使本机 Agent 继续。

**Architecture:** 双 Hook（`bridge.mjs` 异步状态 + `remote-gate.mjs` 阻塞决策）；ComBrief 内 `DecisionQueue` + `SlackAdapter`（Socket Mode 出站）；HTTP `POST /v1/decision/wait` 连接二者。Slack 未启用或失败时 fail-open。

**Tech Stack:** Electron 33、Node 22、`@slack/socket-mode`、`@slack/web-api`、Vitest、现有 `node:http` 本地 API。

**Spec:** [docs/specs/2026-06-05-remote-slack-design.md](../specs/2026-06-05-remote-slack-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/main/config.ts` | `SlackConfig` + defaults in `loadConfig` |
| `src/main/decision-queue.ts` | Pending wait/resolve/timeout |
| `src/main/decision/types.ts` | `DecisionRequest`, `DecisionAction` |
| `src/main/slack/tool-summary.ts` | `formatToolSummary` |
| `src/main/slack/hook-stdout.ts` | `buildHookStdout` |
| `src/main/slack/blocks.ts` | `buildDecisionBlocks` |
| `src/main/slack/adapter.ts` | Socket Mode + `postMessage` + `block_actions` |
| `src/main/decision-service.ts` | Orchestrate queue + Slack + hook stdout |
| `src/main/http-server.ts` | `/v1/decision/wait`, `/v1/slack/test`, `/v1/slack/status` |
| `src/main/index.ts` | Start/stop Slack adapter on config change |
| `extensions/claude-code/remote-gate.mjs` | Blocking hook script |
| `src/main/installer/remote-gate-json.ts` | Inject/remove `remote-gate` in `settings.json` |
| `src/main/installer/install-app.ts` | Copy `remote-gate.mjs`, call inject |
| `src/renderer/settings.html` / `settings.js` | Slack form |
| `src/preload/settings-preload.ts` | `slack:test`, `slack:status` IPC |
| `src/main/i18n/messages.ts` | Slack UI + card strings |
| `README.md` / `README.zh-CN.md` | Slack setup checklist |
| `tests/*.test.ts` | Unit tests (no live Slack in CI) |

---

### Task 1: Config types and defaults

**Files:**
- Modify: `src/main/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write failing test for slack defaults**

```ts
import { describe, it, expect } from 'vitest';
import { defaultConfig, loadConfig } from '../src/main/config';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('slack config', () => {
  it('defaultConfig includes disabled slack', () => {
    expect(defaultConfig().slack).toEqual({
      enabled: false,
      botToken: '',
      appToken: '',
      channelId: '',
      decisionTimeoutMs: 600_000,
      failClosed: false,
      allowedUserIds: [],
    });
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- tests/config.test.ts -t "slack config"`  
Expected: FAIL — `slack` undefined

- [ ] **Step 3: Add `SlackConfig` to config.ts**

```ts
export interface SlackConfig {
  enabled: boolean;
  botToken: string;
  appToken: string;
  channelId: string;
  decisionTimeoutMs: number;
  failClosed: boolean;
  allowedUserIds: string[];
}

export function defaultSlackConfig(): SlackConfig {
  return {
    enabled: false,
    botToken: '',
    appToken: '',
    channelId: '',
    decisionTimeoutMs: 600_000,
    failClosed: false,
    allowedUserIds: [],
  };
}
```

Extend `CombriefConfig` with `slack: SlackConfig`; merge in `defaultConfig()` and `loadConfig()` (shallow merge `raw.slack` over `defaultSlackConfig()`).

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/main/config.ts tests/config.test.ts
git commit -m "feat(config): add SlackConfig with defaults"
```

---

### Task 2: DecisionQueue

**Files:**
- Create: `src/main/decision/types.ts`
- Create: `src/main/decision-queue.ts`
- Test: `tests/decision-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { DecisionQueue } from '../src/main/decision-queue';

describe('DecisionQueue', () => {
  it('resolves wait with hookStdout', async () => {
    const q = new DecisionQueue();
    const wait = q.wait('r1', 5000);
    q.resolve('r1', { hookStdout: '{"ok":true}' });
    await expect(wait).resolves.toEqual({ hookStdout: '{"ok":true}' });
  });

  it('times out with null hookStdout', async () => {
    vi.useFakeTimers();
    const q = new DecisionQueue();
    const wait = q.wait('r1', 1000);
    vi.advanceTimersByTime(1001);
    await expect(wait).resolves.toEqual({ hookStdout: null });
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement DecisionQueue**

```ts
// decision-queue.ts
export interface DecisionResult {
  hookStdout: string | null;
}

export class DecisionQueue {
  private pending = new Map<
    string,
    { resolve: (r: DecisionResult) => void; timer: ReturnType<typeof setTimeout> }
  >();

  wait(requestId: string, timeoutMs: number): Promise<DecisionResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ hookStdout: null });
      }, timeoutMs);
      this.pending.set(requestId, { resolve, timer });
    });
  }

  resolve(requestId: string, result: DecisionResult): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    entry.resolve(result);
    return true;
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/main/decision-queue.ts src/main/decision/types.ts tests/decision-queue.test.ts
git commit -m "feat: DecisionQueue for Slack approval waits"
```

---

### Task 3: hook-stdout and tool-summary

**Files:**
- Create: `src/main/slack/tool-summary.ts`
- Create: `src/main/slack/hook-stdout.ts`
- Test: `tests/hook-stdout.test.ts`

- [ ] **Step 1: Write failing tests** (PermissionRequest allow, AskUserQuestion answer, ExitPlanMode deny)

```ts
import { describe, it, expect } from 'vitest';
import { buildHookStdout } from '../src/main/slack/hook-stdout';

describe('buildHookStdout', () => {
  it('PermissionRequest allow', () => {
    const out = buildHookStdout({
      hookEvent: 'permissionRequest',
      action: 'allow',
    });
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(j.hookSpecificOutput.decision.behavior).toBe('allow');
  });

  it('PreToolUse AskUserQuestion with answers', () => {
    const toolInput = {
      questions: [{ question: 'Pick?', options: [{ label: 'A' }] }],
    };
    const out = buildHookStdout({
      hookEvent: 'preToolUse',
      toolName: 'AskUserQuestion',
      action: 'option',
      optionLabel: 'A',
      toolInput,
    });
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(j.hookSpecificOutput.updatedInput.answers['Pick?']).toBe('A');
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `formatToolSummary` + `buildHookStdout`**

Per spec §5.4: truncate Bash command 500 chars, plan 800, AskUserQuestion list questions, else JSON 400 chars.

`buildHookStdout` branches:
- `permissionRequest` → `decision.behavior` allow/deny
- `preToolUse` + `AskUserQuestion` → merge `questions` + `answers` map
- `preToolUse` + `ExitPlanMode` → allow or deny + `permissionDecisionReason` on deny

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

---

### Task 4: Block Kit builder

**Files:**
- Create: `src/main/slack/blocks.ts`
- Test: `tests/slack-blocks.test.ts`

- [ ] **Step 1: Snapshot test for Bash allow/deny buttons**

Assert blocks contain `action_id` prefix `combrief_decision_` and `value` JSON with `requestId`.

- [ ] **Step 2: Implement `buildDecisionBlocks({ requestId, toolName, cwd, sessionId, summary, mode })`**

`mode`: `'permission' | 'askUser' | 'exitPlan'`.  
AskUserQuestion: one button per option (`action: 'option'`, `optionLabel`).  
Use plain text labels; i18n passed in from caller later.

- [ ] **Step 3: Run — PASS**

- [ ] **Step 4: Commit**

---

### Task 5: SlackAdapter (testable core)

**Files:**
- Create: `src/main/slack/adapter.ts`
- Modify: `package.json` (add dependencies)
- Test: `tests/slack-adapter.test.ts` (mock WebClient)

- [ ] **Step 1: Add dependencies**

```bash
npm install @slack/socket-mode @slack/web-api
```

- [ ] **Step 2: Define interface for injection**

```ts
export interface SlackAdapterDeps {
  postMessage: (args: { channel: string; text: string; blocks: unknown[] }) => Promise<{ ts?: string }>;
  onBlockAction: (handler: (payload: BlockActionPayload) => Promise<void>) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isConnected: () => boolean;
}
```

- [ ] **Step 3: Implement `createSlackAdapter(config, onAction)`**

- Start `SocketModeClient` with `appToken`; handle `interactive` payload type `block_actions`.
- Parse `action.value` JSON: `{ requestId, action, optionLabel? }`.
- Check `allowedUserIds` if non-empty.
- `postDecisionMessage` wraps `chat.postMessage` with `channelId`.
- Track `lastError` string for `/v1/slack/status`.

- [ ] **Step 4: Unit test** — mock deps, simulate block_action → callback invoked

- [ ] **Step 5: Commit**

---

### Task 6: DecisionService + HTTP routes

**Files:**
- Create: `src/main/decision-service.ts`
- Modify: `src/main/http-server.ts`
- Test: `tests/http-decision.test.ts`

- [ ] **Step 1: DecisionService.handleWait(body)`**

1. If `!cfg.slack.enabled` → return 503 or `{ hookStdout: null }` immediately (gate fail-open).
2. `requestId = crypto.randomUUID()`.
3. Build blocks + post to Slack (if adapter disconnected, still register wait — spec: wait until timeout).
4. `return decisionQueue.wait(requestId, cfg.slack.decisionTimeoutMs)` wrapped in HTTP response.
5. On Slack action → `buildHookStdout` → `queue.resolve`.

Store pending metadata: `toolName`, `hookEvent`, `toolInput` keyed by `requestId` until resolve.

- [ ] **Step 2: Extend `createCombriefServer`**

Add optional `decisionService?: DecisionService` in `ServerOptions`.

Routes:
- `POST /v1/decision/wait` — parse body, call `handleWait`, 200 with JSON or 204/null per fail-open
- `POST /v1/slack/test` — post green "ComBrief connected" blocks
- `GET /v1/slack/status` — `{ connected, lastError }`

Keep auth: `Bearer ${token}` on all routes.

- [ ] **Step 3: HTTP test with injected mock DecisionService**

Use `node:http` request to localhost in vitest (pattern from `tests/http-server.test.ts`).

- [ ] **Step 4: Commit**

---

### Task 7: Wire Electron main process

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: On app ready, after `createCombriefServer`**

```ts
let slackAdapter: SlackAdapter | null = null;
let decisionService: DecisionService | null = null;

function restartSlack(cfg: CombriefConfig) {
  slackAdapter?.stop();
  if (!cfg.slack.enabled || !cfg.slack.botToken || !cfg.slack.appToken) {
    slackAdapter = null;
    decisionService = null;
    return;
  }
  slackAdapter = createSlackAdapter(cfg.slack, onAction);
  decisionService = new DecisionService(cfg, slackAdapter, new DecisionQueue());
  slackAdapter.start().catch(/* log */);
}

restartSlack(cfg);
```

Pass `decisionService` into `createCombriefServer`.

- [ ] **Step 2: On `config:set` when slack fields change** — call `restartSlack(controller.getConfig())`

- [ ] **Step 3: Manual smoke** — `npm start`, GET `/v1/health` still works

- [ ] **Step 4: Commit**

---

### Task 8: remote-gate.mjs

**Files:**
- Create: `extensions/claude-code/remote-gate.mjs`
- Modify: `scripts/copy-extensions.mjs` (already copies dir — verify)

- [ ] **Step 1: Implement script** (mirror `bridge.mjs` patterns)

Key logic:

```js
const home = join(homedir(), '.combrief');
const input = loadInput();
const hookName = process.argv[2] ?? input.hook_event_name;
const isGate =
  hookName === 'PermissionRequest' ||
  (hookName === 'PreToolUse' &&
    ['AskUserQuestion', 'ExitPlanMode'].includes(input.tool_name));

if (!isGate) process.exit(0);

const config = loadConfig();
if (!config.slack?.enabled) process.exit(0);

// Fire-and-forget state (optional): POST permissionRequest for tray red
await reportState(config, 'permissionRequest', input).catch(() => {});

const hookEvent =
  hookName === 'PermissionRequest' ? 'permissionRequest' : 'preToolUse';
const body = JSON.stringify({
  appId: 'claude-code',
  hookEvent,
  sessionId: input.session_id,
  cwd: input.cwd,
  toolName: input.tool_name,
  toolInput: input.tool_input ?? {},
  raw: input,
});

const res = await postDecisionWait(config, body);
if (res?.hookStdout) {
  process.stdout.write(res.hookStdout + '\n');
}
process.exit(0);
```

`postDecisionWait`: long-timeout HTTP client (match `decisionTimeoutMs` + buffer).

- [ ] **Step 2: chmod +x in install**

- [ ] **Step 3: Commit**

---

### Task 9: Installer — inject remote-gate hooks

**Files:**
- Create: `src/main/installer/remote-gate-json.ts`
- Modify: `src/main/installer/install-app.ts`
- Test: `tests/remote-gate-json.test.ts`

- [ ] **Step 1: `REMOTE_GATE_EVENTS`**

```ts
export const REMOTE_GATE_HOOKS: Array<{
  event: string;
  matcher?: string;
}> = [
  { event: 'PermissionRequest' },
  { event: 'PreToolUse', matcher: 'AskUserQuestion' },
  { event: 'PreToolUse', matcher: 'ExitPlanMode' },
];
```

`injectRemoteGate(settings, gatePath)` / `removeRemoteGate` — same combrief command detection as `settings-json.ts` (normalize path, filter, append groups).

- [ ] **Step 2: `copyBridgeFiles` → `copyAppExtensionFiles`**

Copy both `bridge.mjs` and `remote-gate.mjs`; Windows: `remote-gate.cmd` via `writeWindowsBridgeCmd`.

- [ ] **Step 3: `installApp` for claude-code** — after `injectClaudeBridge`, call `injectRemoteGate`.

- [ ] **Step 4: `uninstallApp`** — `removeRemoteGate`.

- [ ] **Step 5: Tests + commit**

---

### Task 10: Settings UI + IPC

**Files:**
- Modify: `src/renderer/settings.html`, `src/renderer/settings.js`
- Modify: `src/preload/settings-preload.ts`
- Modify: `src/main/index.ts` (IPC handlers)
- Modify: `src/main/i18n/messages.ts`

- [ ] **Step 1: HTML section `#slack`** — enabled checkbox, bot token, app token, channel id (password inputs), test button, status `<span id="slackStatus">`

- [ ] **Step 2: preload** — `testSlack: () => ipcRenderer.invoke('slack:test')`, `slackStatus: () => ipcRenderer.invoke('slack:status')`

- [ ] **Step 3: IPC** — invoke decisionService/adapter test + status

- [ ] **Step 4: settings.js** — load/save `cfg.slack` via `setConfig`; on test click refresh status

- [ ] **Step 5: i18n** en/zh/ja keys under `settings.slack.*`

- [ ] **Step 6: Commit**

---

### Task 11: README + spec status

**Files:**
- Modify: `README.md`, `README.zh-CN.md`
- Modify: `docs/specs/2026-06-05-remote-slack-design.md` (status → 已批准)

- [ ] **Step 1: Add「Slack 远程确认」** — 5-step Slack App setup from spec §6.3; note fail-open; office outbound Slack API.

- [ ] **Step 2: Link to spec**

- [ ] **Step 3: Commit**

---

### Task 12: End-to-end manual verification

- [ ] **Step 1: Reinstall Claude Code app in ComBrief settings** (refreshes hooks)

- [ ] **Step 2: Enable slack in config**, run `npm start`

- [ ] **Step 3: `claude --channels` not required** — start normal `claude` in test repo

- [ ] **Step 4: Trigger Bash permission** — confirm Slack card + Allow → command runs

- [ ] **Step 5: Document results** in PR description

---

## Spec coverage checklist

| Spec § | Task |
|--------|------|
| 1.1 方案 A 按钮 | Task 4–6 |
| 2 网络/Slack only | Task 11 README |
| 3 双 Hook | Task 8–9 |
| 4 Hook 契约 | Task 8, 3 |
| 5 ComBrief 服务 | Task 2, 5–7 |
| 6 配置/设置 | Task 1, 10 |
| 7 状态灯 | Task 8 optional state POST |
| 8 错误 fail-open | Task 6, 8 |
| 9 安全 allowlist | Task 5 |
| 10 测试 | Tasks 1–6 tests |
| P1 异步通知 | **Out of scope** |

## Plan self-review

- [x] No TBD steps
- [x] P2 / Slack 打字 — not in plan
- [x] P1 notifications — not in plan
- [x] Exact paths and commands
- [x] Matches approved spec

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-06-05-slack-remote-approval.md`.

**Two execution options:**

1. **Subagent-Driven（推荐）** — 每个 Task 派生子 agent，任务间你做 review  
2. **Inline Execution** — 本会话按 Task 顺序实现，检查点暂停

你想用哪种？回复 **1** 或 **2**（或直接说 **开始实现**）。
