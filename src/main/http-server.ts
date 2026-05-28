import http from 'node:http';
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
      res.end(JSON.stringify({ ok: true, version: '0.1.0' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/state') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as {
            appId: string;
            event: string;
            sessionId?: string;
            timestamp?: number;
            meta?: StateMeta;
          };
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
      });
      return;
    }

    res.writeHead(404).end();
  });
}
