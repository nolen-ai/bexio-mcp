/**
 * Streamable HTTP transport for server-side / containerized deployments.
 *
 * Auth model (per MCP session):
 * - **Pass-through (multi-user)**: each client sends `Authorization: Bearer <bexio token>`
 *   (PAT or OAuth access token). The session's API calls run as that identity;
 *   later requests may carry a newer token (upstream refresh) which replaces the
 *   session's token. Nothing is persisted server-side.
 * - **Shared identity (single-tenant)**: requests without a bearer fall back to the
 *   server-configured identity (static token or OAuth store with auto-refresh) —
 *   only when such an identity exists, and, on non-loopback binds, only when
 *   explicitly allowed (`BEXIO_HTTP_SHARED_IDENTITY=true`).
 *
 * TLS is expected to be terminated by a reverse proxy; bind loopback by default.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { BexioClient } from '../client/index.js';
import type { TokenProvider } from '../client/http.js';
import { createBexioMcpServer } from './index.js';
import type { RegisterToolsOptions } from './registry.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface BexioHttpServerOptions extends RegisterToolsOptions {
  /** Bind address. Default `127.0.0.1`; use `0.0.0.0` in containers. */
  host?: string;
  /** TCP port. Default 8722. */
  port?: number;
  /** MCP endpoint path. Default `/mcp`. */
  path?: string;
  /**
   * Fallback identity for requests without a bearer token
   * (static token or auto-refreshing OAuth provider).
   */
  serverIdentity?: TokenProvider;
  /** Allow the shared fallback identity on non-loopback binds. Default false. */
  allowSharedIdentityOnNetwork?: boolean;
  /** Close sessions idle for longer than this (ms). Default 30 minutes. */
  sessionTtlMs?: number;
  /** Maximum concurrent MCP sessions; further initializes get 503. Default 64. */
  maxSessions?: number;
  /**
   * Host header values accepted by the transport's DNS-rebinding protection
   * (e.g. your reverse-proxy hostname). Loopback binds get a safe default;
   * non-loopback binds disable the check unless values are provided here.
   */
  allowedHosts?: readonly string[];
  /** BexioClient options forwarded to every session's client. */
  clientOptions?: {
    baseUrl?: string;
    language?: string;
    timeoutMs?: number;
    fetch?: typeof globalThis.fetch;
  };
  /** Receives operational log lines (default: stderr). */
  log?: (message: string) => void;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  mcpServer: McpServer;
  /** Mutable holder so refreshed upstream bearer tokens keep the session working. */
  tokenHolder?: { current: string };
  lastSeen: number;
}

export interface RunningHttpServer {
  server: Server;
  /** Resolved bind address. */
  url: string;
  /** Number of live MCP sessions (diagnostics). */
  sessionCount: () => number;
  close: () => Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function readBearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

class BodyTooLargeError extends Error {}

function readBody(req: IncomingMessage, limitBytes = 8 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        // Stop consuming but keep the socket usable so a 413 can be written.
        req.pause();
        reject(new BodyTooLargeError('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function jsonError(res: ServerResponse, status: number, message: string, code = -32000): void {
  if (res.headersSent) {
    // Last-resort path after a stream already started: terminate cleanly.
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

/** Starts the streamable HTTP MCP server. Resolves once listening. */
export function startBexioHttpServer(options: BexioHttpServerOptions = {}): Promise<RunningHttpServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8722;
  const path = options.path ?? '/mcp';
  const sessionTtlMs = options.sessionTtlMs ?? 30 * 60 * 1000;
  const maxSessions = options.maxSessions ?? 64;
  const log = options.log ?? ((message: string) => process.stderr.write(`${message}\n`));
  const isLoopback = LOOPBACK_HOSTS.has(host);
  const sharedIdentityEnabled =
    options.serverIdentity !== undefined && (isLoopback || options.allowSharedIdentityOnNetwork === true);

  // DNS-rebinding protection: a browser page can be rebound to reach loopback
  // servers, so loopback binds always validate the Host header. Non-loopback
  // deployments sit behind a proxy whose hostname we cannot guess — validation
  // is enabled there only when the operator lists the accepted hosts.
  // Resolved lazily because the ephemeral port is known only after listen().
  let actualPort = port;
  const resolveAllowedHosts = (): string[] | undefined => {
    if (options.allowedHosts !== undefined && options.allowedHosts.length > 0) return [...options.allowedHosts];
    if (!isLoopback) return undefined;
    return ['127.0.0.1', 'localhost', '[::1]'].flatMap((h) => [h, `${h}:${actualPort}`]);
  };

  if (options.serverIdentity !== undefined && !isLoopback && options.allowSharedIdentityOnNetwork !== true) {
    log(
      'bexio-mcp: shared server identity is DISABLED on this non-loopback bind; ' +
        'clients must send their own Authorization: Bearer token. ' +
        'Set BEXIO_HTTP_SHARED_IDENTITY=true to expose the server identity to every client that can reach this port.',
    );
  }

  const sessions = new Map<string, Session>();

  const destroySession = (sessionId: string): void => {
    const session = sessions.get(sessionId);
    if (!session) return;
    sessions.delete(sessionId);
    void session.mcpServer.close().catch(() => undefined);
  };

  const sweeper = setInterval(() => {
    const cutoff = Date.now() - sessionTtlMs;
    for (const [id, session] of sessions) {
      if (session.lastSeen < cutoff) {
        log(`bexio-mcp: closing idle MCP session ${id}`);
        destroySession(id);
      }
    }
  }, 60_000);
  sweeper.unref();

  async function createSession(bearer: string | undefined): Promise<Session> {
    let tokenHolder: { current: string } | undefined;
    let token: TokenProvider;
    if (bearer !== undefined) {
      const holder = { current: bearer };
      tokenHolder = holder;
      token = () => holder.current;
    } else {
      token = options.serverIdentity!;
    }

    const client = new BexioClient({ token, ...options.clientOptions });
    const mcpServer = createBexioMcpServer({
      client,
      groups: options.groups,
      readOnly: options.readOnly,
      maxResultChars: options.maxResultChars,
    });
    const allowedHosts = resolveAllowedHosts();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: allowedHosts !== undefined,
      allowedHosts: allowedHosts === undefined ? undefined : [...allowedHosts],
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, session);
      },
      onsessionclosed: (sessionId) => {
        destroySession(sessionId);
      },
    });
    const session: Session = { transport, mcpServer, tokenHolder, lastSeen: Date.now() };
    // Server-to-client traffic (e.g. long-lived SSE streams) counts as activity,
    // otherwise the idle sweeper would reap sessions with an open stream.
    const originalSend = transport.send.bind(transport);
    transport.send = (message, sendOptions) => {
      session.lastSeen = Date.now();
      return originalSend(message, sendOptions);
    };
    transport.onclose = () => {
      if (transport.sessionId !== undefined) destroySession(transport.sessionId);
    };
    await mcpServer.connect(transport);
    return session;
  }

  async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const bearer = readBearer(req);
    const sessionId = req.headers['mcp-session-id'];

    // Existing session: refresh its bearer (upstream rotation) and delegate.
    if (typeof sessionId === 'string') {
      const session = sessions.get(sessionId);
      if (!session) {
        jsonError(res, 404, 'Unknown or expired MCP session; re-initialize.', -32001);
        return;
      }
      // Parse the body BEFORE touching any session state.
      let parsed: unknown;
      if (req.method === 'POST') {
        const body = await readBody(req);
        try {
          parsed = JSON.parse(body);
        } catch {
          jsonError(res, 400, 'Request body is not valid JSON.', -32700);
          return;
        }
      }
      if (session.tokenHolder !== undefined) {
        // Pass-through sessions must keep proving possession of a token.
        if (bearer === undefined) {
          jsonError(res, 401, 'This MCP session requires an Authorization: Bearer token on every request.', -32001);
          return;
        }
        // A session is one principal: the newest token simply replaces the old
        // one (upstream refresh). Interleaving different users' tokens on one
        // session id is outside the contract.
        session.tokenHolder.current = bearer;
      } else if (bearer !== undefined) {
        // Shared-identity sessions must not silently execute bearer-carrying
        // requests as the server (confused-deputy risk).
        jsonError(
          res,
          409,
          'This MCP session uses the shared server identity; re-initialize without a session to use your own token.',
          -32001,
        );
        return;
      }
      session.lastSeen = Date.now();
      await session.transport.handleRequest(req, res, parsed);
      return;
    }

    // No session yet: only an initialize POST may create one.
    if (req.method !== 'POST') {
      jsonError(res, 400, 'Missing mcp-session-id header.', -32000);
      return;
    }
    const rawBody = await readBody(req);
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      jsonError(res, 400, 'Request body is not valid JSON.', -32700);
      return;
    }
    if (!isInitializeRequest(parsedBody)) {
      jsonError(res, 400, 'Expected an initialize request when no mcp-session-id is set.', -32000);
      return;
    }
    if (bearer === undefined && !sharedIdentityEnabled) {
      jsonError(
        res,
        401,
        'Authentication required: send "Authorization: Bearer <bexio PAT or OAuth access token>". ' +
          'This server has no shared identity configured for anonymous sessions.',
        -32001,
      );
      return;
    }
    if (sessions.size >= maxSessions) {
      jsonError(res, 503, `Session limit reached (${maxSessions}); retry later or raise maxSessions.`, -32000);
      return;
    }

    const session = await createSession(bearer);
    await session.transport.handleRequest(req, res, parsedBody);
    if (session.transport.sessionId === undefined) {
      // Initialization was rejected (e.g. Host validation) — release the
      // orphaned server instead of leaking it outside the session map.
      void session.mcpServer.close().catch(() => undefined);
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
      return;
    }
    if (url.pathname !== path) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    handleMcpRequest(req, res).catch((error: unknown) => {
      if (error instanceof BodyTooLargeError) {
        jsonError(res, 413, 'Request body too large.', -32600);
        req.destroy();
        return;
      }
      log(`bexio-mcp: request error: ${error instanceof Error ? error.message : String(error)}`);
      jsonError(res, 500, 'Internal server error.');
    });
  });

  return new Promise<RunningHttpServer>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      actualPort = typeof address === 'object' && address !== null ? address.port : port;
      const url = `http://${host}:${actualPort}${path}`;
      log(
        `bexio-mcp: streamable HTTP server listening on ${url} ` +
          `(auth: ${sharedIdentityEnabled ? 'bearer pass-through + shared server identity' : 'bearer pass-through only'})`,
      );
      resolve({
        server,
        url,
        sessionCount: () => sessions.size,
        close: async () => {
          clearInterval(sweeper);
          for (const id of [...sessions.keys()]) destroySession(id);
          // Idle keep-alive sockets would stall server.close() indefinitely;
          // give in-flight responses a short grace period, then cut them.
          server.closeIdleConnections?.();
          const grace = setTimeout(() => server.closeAllConnections?.(), 3_000);
          grace.unref();
          await new Promise<void>((done) => server.close(() => done()));
          clearTimeout(grace);
        },
      });
    });
  });
}
