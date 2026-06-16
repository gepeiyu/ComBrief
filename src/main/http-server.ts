import http from 'node:http';
import { getAppVersion } from './app-version';
import type { DecisionService } from './decision-service';
import type { DecisionWaitBody } from './decision/types';
import type { StateEvent, StateMeta } from './state-machine';
export interface ServerOptions {
  token: string;
  registeredApps: Set<string>;
  onState: (payload: {
    appId: string;
    event: StateEvent;
    sessionId?: string;
    timestamp: number;
    meta?: StateMeta;
  }) => void;
  onLocalDecisionResolved?: (payload: {
    appId: string;
    sessionId?: string;
    toolName: string;
  }) => void;
  getDecisionService?: () => DecisionService | null;
  getSlackStatus?: () => { connected: boolean; lastError: string | null };
  onSlackTest?: () => Promise<void>;
}

const VALID_EVENTS = new Set<string>([
  'sessionStart',
  'sessionEnd',
  'beforeSubmitPrompt',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'beforeShellExecution',
  'afterShellExecution',
  'afterAgentResponse',
  'afterAgentThought',
  'subagentStart',
  'subagentStop',
  'stop',
  'permissionRequest',
  'heartbeat',
]);

function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}') as T);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export function createCombriefServer(opts: ServerOptions): http.Server {
  return http.createServer((req, res) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${opts.token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: getAppVersion() }));
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/slack/status') {
      const status = opts.getSlackStatus?.() ?? {
        connected: false,
        lastError: null,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...status }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/slack/test') {
      void (async () => {
        try {
          if (!opts.onSlackTest) throw new Error('Slack not available');
          await opts.onSlackTest();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      })();
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/decision/wait') {
      void (async () => {
        try {
          const parsed = await readJsonBody<DecisionWaitBody>(req);
          if (!opts.registeredApps.has(parsed.appId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          const decisionService = opts.getDecisionService?.() ?? null;
          if (!decisionService) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ requestId: '', hookStdout: null }));
            return;
          }
          const result = await decisionService.handleWait({
            ...parsed,
            toolInput: parsed.toolInput ?? {},
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, ...result }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false }));
        }
      })();
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/decision/local-resolved') {
      void (async () => {
        try {
          const parsed = await readJsonBody<{
            appId: string;
            sessionId?: string;
            toolName: string;
            kind: 'allow' | 'deny' | 'allowAlways';
            detail?: string;
          }>(req);
          if (!opts.registeredApps.has(parsed.appId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          const decisionService = opts.getDecisionService?.() ?? null;
          const ok =
            decisionService?.resolveLocalTerminal({
              sessionId: parsed.sessionId,
              toolName: parsed.toolName,
              kind: parsed.kind,
              detail: parsed.detail,
            }) ?? false;
          if (ok) {
            opts.onLocalDecisionResolved?.({
              appId: parsed.appId,
              sessionId: parsed.sessionId,
              toolName: parsed.toolName,
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false }));
        }
      })();
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/state') {
      void (async () => {
        try {
          const parsed = await readJsonBody<{
            appId: string;
            event: string;
            sessionId?: string;
            timestamp?: number;
            meta?: StateMeta;
          }>(req);
          if (!opts.registeredApps.has(parsed.appId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          if (!VALID_EVENTS.has(parsed.event)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          opts.onState({
            appId: parsed.appId,
            event: parsed.event as StateEvent,
            sessionId: parsed.sessionId,
            timestamp: parsed.timestamp ?? Date.now(),
            meta: parsed.meta,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false }));
        }
      })();
      return;
    }

    res.writeHead(404).end();
  });
}
