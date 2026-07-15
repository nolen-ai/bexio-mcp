import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startBexioHttpServer, type RunningHttpServer } from '../src/mcp/http-server.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

let running: RunningHttpServer | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function connectClient(url: string, bearer?: string) {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined,
  });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
  return { client, transport };
}

describe('startBexioHttpServer', () => {
  it('serves multiple users concurrently, each acting as their own bexio identity', async () => {
    const seenTokens: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization ?? '(none)';
      seenTokens.push(auth);
      return jsonResponse([{ id: seenTokens.length, token_seen: auth }]);
    });
    running = await startBexioHttpServer({
      host: '127.0.0.1',
      port: 0,
      clientOptions: { fetch: fetchMock as typeof fetch },
    });

    const userA = await connectClient(running.url, 'token-user-a');
    const userB = await connectClient(running.url, 'token-user-b');
    expect(running.sessionCount()).toBe(2);

    const [resultA, resultB] = await Promise.all([
      userA.client.callTool({ name: 'bexio_bank_accounts', arguments: { action: 'list' } }),
      userB.client.callTool({ name: 'bexio_bank_accounts', arguments: { action: 'list' } }),
    ]);
    expect(resultA.isError).toBeFalsy();
    expect(resultB.isError).toBeFalsy();
    expect(seenTokens.sort()).toEqual(['Bearer token-user-a', 'Bearer token-user-b']);

    await userA.client.close();
    await userB.client.close();
  });

  it('rejects anonymous sessions when no shared identity is configured', async () => {
    running = await startBexioHttpServer({ host: '127.0.0.1', port: 0 });
    await expect(connectClient(running.url)).rejects.toThrow(/401|Authentication/i);
    expect(running.sessionCount()).toBe(0);
  });

  it('lets anonymous sessions use the shared server identity on loopback binds', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer server-identity');
      return jsonResponse([]);
    });
    running = await startBexioHttpServer({
      host: '127.0.0.1',
      port: 0,
      serverIdentity: 'server-identity',
      clientOptions: { fetch: fetchMock as typeof fetch },
    });
    const anon = await connectClient(running.url);
    const result = await anon.client.callTool({ name: 'bexio_bank_accounts', arguments: { action: 'list' } });
    expect(result.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await anon.client.close();
  });

  it('refuses the shared identity on non-loopback binds unless explicitly allowed', async () => {
    const logs: string[] = [];
    running = await startBexioHttpServer({
      host: '0.0.0.0',
      port: 0,
      serverIdentity: 'server-identity',
      log: (m) => logs.push(m),
    });
    // Reach it via loopback address, but the BIND was 0.0.0.0 -> fallback disabled.
    const url = running.url.replace('0.0.0.0', '127.0.0.1');
    await expect(connectClient(url)).rejects.toThrow(/401|Authentication/i);
    expect(logs.join('\n')).toContain('shared server identity is DISABLED');
    // With a bearer it still works (pass-through).
    const withToken = await connectClient(url, 'my-own-token');
    expect(running.sessionCount()).toBe(1);
    await withToken.client.close();
  });

  it('terminating a session removes it server-side', async () => {
    running = await startBexioHttpServer({ host: '127.0.0.1', port: 0, serverIdentity: 't' });
    const { client, transport } = await connectClient(running.url);
    expect(running.sessionCount()).toBe(1);
    await transport.terminateSession();
    await client.close();
    await vi.waitFor(() => {
      if (running!.sessionCount() !== 0) throw new Error('session still alive');
    });
  });

  it('answers health checks without auth', async () => {
    running = await startBexioHttpServer({ host: '127.0.0.1', port: 0 });
    const health = await fetch(running.url.replace('/mcp', '/healthz'));
    expect(health.status).toBe(200);
    expect(await health.text()).toBe('ok');
  });

  it('returns 400/-32700 for malformed JSON on an existing session (not 500)', async () => {
    running = await startBexioHttpServer({ host: '127.0.0.1', port: 0 });
    const { client, transport } = await connectClient(running.url, 'tok');
    const response = await fetch(running.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer tok',
        'mcp-session-id': transport.sessionId!,
      },
      body: '{not json',
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: number } };
    expect(payload.error.code).toBe(-32700);
    await client.close();
  });

  it('requires a bearer on every request of a pass-through session and 404s unknown sessions', async () => {
    running = await startBexioHttpServer({ host: '127.0.0.1', port: 0 });
    const { client, transport } = await connectClient(running.url, 'tok');
    const base = {
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }),
    };
    const noBearer = await fetch(running.url, {
      ...base,
      headers: { ...base.headers, 'mcp-session-id': transport.sessionId! },
    });
    expect(noBearer.status).toBe(401);
    const unknownSession = await fetch(running.url, {
      ...base,
      headers: { ...base.headers, Authorization: 'Bearer tok', 'mcp-session-id': 'nope' },
    });
    expect(unknownSession.status).toBe(404);
    await client.close();
  });

  it('rejects bearer-carrying requests on a shared-identity session (409)', async () => {
    running = await startBexioHttpServer({ host: '127.0.0.1', port: 0, serverIdentity: 'server-tok' });
    const { client, transport } = await connectClient(running.url); // anonymous, shared identity
    const response = await fetch(running.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer sneaky-user-token',
        'mcp-session-id': transport.sessionId!,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }),
    });
    expect(response.status).toBe(409);
    await client.close();
  });

  it('caps concurrent sessions with 503', async () => {
    running = await startBexioHttpServer({ host: '127.0.0.1', port: 0, maxSessions: 2 });
    const a = await connectClient(running.url, 'a');
    const b = await connectClient(running.url, 'b');
    await expect(connectClient(running.url, 'c')).rejects.toThrow(/503|Session limit/i);
    await a.client.close();
    await b.client.close();
  });

  it('rejects rebound Host headers on loopback binds (DNS-rebinding protection)', async () => {
    running = await startBexioHttpServer({ host: '127.0.0.1', port: 0 });
    const port = Number(new URL(running.url).port);
    // fetch/undici refuses to override Host, so use node:http directly.
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: 'Bearer tok',
            Host: 'evil.example.com', // simulated DNS rebinding
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
        }),
      );
    });
    expect(status).toBe(403);
    expect(running.sessionCount()).toBe(0);
  });

  it('rejects oversized bodies with 413', async () => {
    running = await startBexioHttpServer({ host: '127.0.0.1', port: 0 });
    const response = await fetch(running.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer tok',
      },
      body: `{"pad":"${'x'.repeat(9 * 1024 * 1024)}"}`,
    }).catch(() => undefined);
    // Depending on timing the server may reset the socket after responding.
    if (response) expect(response.status).toBe(413);
  });
});
