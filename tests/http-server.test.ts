import { describe, it, expect, vi } from 'vitest';
import http from 'node:http';
import { createCombriefServer } from '../src/main/http-server';

function request(
  server: http.Server,
  method: string,
  path: string,
  body?: object,
  token?: string,
): Promise<{ status: number; json: unknown }> {
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no addr');
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            json: JSON.parse(raw || '{}'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('http-server', () => {
  it('health returns ok', async () => {
    const server = createCombriefServer({
      token: 'secret',
      registeredApps: new Set(['cursor']),
      onState: vi.fn(),
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const res = await request(server, 'GET', '/v1/health', undefined, 'secret');
    expect(res.status).toBe(200);
    server.close();
  });

  it('rejects unknown appId', async () => {
    const server = createCombriefServer({
      token: 'secret',
      registeredApps: new Set(['cursor']),
      onState: vi.fn(),
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const res = await request(
      server,
      'POST',
      '/v1/state',
      { appId: 'unknown', event: 'stop', timestamp: Date.now() },
      'secret',
    );
    expect(res.status).toBe(400);
    server.close();
  });

  it('accepts valid state and calls onState', async () => {
    const onState = vi.fn();
    const server = createCombriefServer({
      token: 'secret',
      registeredApps: new Set(['cursor']),
      onState,
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const res = await request(
      server,
      'POST',
      '/v1/state',
      { appId: 'cursor', event: 'stop', timestamp: Date.now() },
      'secret',
    );
    expect(res.status).toBe(200);
    expect(onState).toHaveBeenCalledOnce();
    server.close();
  });

  it('notifies when local terminal resolves a decision', async () => {
    const onLocalDecisionResolved = vi.fn();
    const decisionService = {
      resolveLocalTerminal: vi.fn(() => true),
    };
    const server = createCombriefServer({
      token: 'secret',
      registeredApps: new Set(['claude-code']),
      onState: vi.fn(),
      getDecisionService: () => decisionService as never,
      onLocalDecisionResolved,
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));

    const res = await request(
      server,
      'POST',
      '/v1/decision/local-resolved',
      {
        appId: 'claude-code',
        sessionId: 'sess-local',
        toolName: 'Bash',
        kind: 'allow',
      },
      'secret',
    );

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    expect(onLocalDecisionResolved).toHaveBeenCalledWith({
      appId: 'claude-code',
      sessionId: 'sess-local',
      toolName: 'Bash',
    });
    server.close();
  });
});
