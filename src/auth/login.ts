/**
 * Interactive authorization-code login: starts a loopback HTTP listener,
 * opens the bexio consent page in the browser, exchanges the returned code
 * and persists the tokens.
 *
 * The redirect URI (default `http://127.0.0.1:33771/callback`) must be listed
 * under "Allowed redirect URLs" of the app at https://developer.bexio.com.
 */
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  BexioOAuth,
  BexioOAuthError,
  generatePkce,
  generateState,
  type OAuthTokens,
  type TokenStore,
} from '../client/oauth.js';

export const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:33771/callback';

export interface LoginFlowOptions {
  oauth: BexioOAuth;
  store: TokenStore;
  scopes: readonly string[];
  /** Loopback redirect URI; host must be 127.0.0.1 or localhost. */
  redirectUri?: string;
  /** Skip spawning a browser (the URL is always printed via onMessage). */
  openBrowser?: boolean;
  /** Abort the flow after this many milliseconds (default 300 000). */
  timeoutMs?: number;
  /** Receives progress messages (the authorization URL, success note). */
  onMessage?: (message: string) => void;
}

/** HTML-escapes values echoed into the result page (query params are attacker-reachable). */
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const RESULT_PAGE = (title: string, body: string, ok: boolean): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
  `<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto;">` +
  `<h1 style="color:${ok ? '#0a7d33' : '#b00020'}">${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`;

/** Spawns the platform's URL opener; failures are ignored (URL is printed anyway). */
function openInBrowser(url: string): void {
  try {
    // Guard: only ever hand http(s) URLs to the openers.
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    if (process.platform === 'win32') {
      // NOT `cmd /c start`: cmd splits an unquoted URL at every `&`, truncating
      // the query string and treating the fragments as commands. rundll32's
      // FileProtocolHandler takes the URL as a plain argument, uninterpreted.
      spawn('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Best effort only.
  }
}

/** Strips control characters and caps length before echoing IdP-supplied text to the terminal. */
function sanitizeForTerminal(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 32 || (code >= 127 && code <= 159);
    if (!isControl) out += ch;
    if (out.length >= 200) break;
  }
  return out;
}

/**
 * Runs the full login flow and resolves with the granted tokens
 * (already persisted to the store).
 */
export function runLoginFlow(options: LoginFlowOptions): Promise<OAuthTokens> {
  const redirectUri = new URL(options.redirectUri ?? DEFAULT_REDIRECT_URI);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(redirectUri.hostname)) {
    throw new BexioOAuthError(
      `The redirect URI must point to the loopback interface, got host "${redirectUri.hostname}"`,
    );
  }
  const port = Number(redirectUri.port || 80);
  const expectedPath = redirectUri.pathname;
  const state = generateState();
  const pkce = generatePkce();
  const notify = options.onMessage ?? (() => undefined);
  const timeoutMs = options.timeoutMs ?? 300_000;

  const authUrl = options.oauth.buildAuthorizationUrl({
    redirectUri: redirectUri.toString(),
    scopes: options.scopes,
    state,
    pkce,
  });

  return new Promise<OAuthTokens>((resolve, reject) => {
    let settled = false;
    /** Set synchronously before the (async) code exchange: the code is single-use. */
    let codeConsumed = false;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      handleRequest(req, res).catch(() => {
        // Malformed request (e.g. unparsable target). Answer 400 and keep listening.
        try {
          res.writeHead(400, { Connection: 'close' }).end();
        } catch {
          /* response may already be closed */
        }
      });
    });

    const finish = (error: Error | undefined, tokens?: OAuthTokens): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      // Release kept-alive browser sockets so the process can exit promptly.
      server.closeAllConnections?.();
      if (error) reject(error);
      else resolve(tokens!);
    };

    const timer = setTimeout(() => {
      finish(new BexioOAuthError(`Login timed out after ${Math.round(timeoutMs / 1000)}s — no browser callback received.`));
    }, timeoutMs);

    const html = (res: ServerResponse, status: number, page: string): void => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
      res.end(page);
    };

    async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const url = new URL(req.url ?? '/', redirectUri.origin);
      if (url.pathname !== expectedPath) {
        res.writeHead(404, { Connection: 'close' }).end();
        return;
      }

      // Replays/refreshes after the flow finished (or while the exchange is in
      // flight) must never trigger a second token exchange: the IdP treats
      // authorization-code reuse as an attack and may revoke the session.
      if (settled || codeConsumed) {
        html(res, 200, RESULT_PAGE('bexio login', 'This login was already completed. You can close this tab.', true));
        return;
      }

      const returnedState = url.searchParams.get('state');
      const stateValid = returnedState !== null && returnedState === state;

      const errorParam = url.searchParams.get('error');
      if (errorParam && stateValid) {
        // Only honour error callbacks that carry our state (RFC 6749 echoes it
        // on error redirects); anything else is a stray or forged request.
        const description = sanitizeForTerminal(url.searchParams.get('error_description') ?? '');
        const safeError = sanitizeForTerminal(errorParam);
        html(res, 400, RESULT_PAGE('bexio login failed', `${safeError}: ${description}`, false));
        finish(new BexioOAuthError(`Authorization was denied: ${safeError} ${description}`.trim(), safeError));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code || !stateValid) {
        html(res, 400, RESULT_PAGE('bexio login failed', 'Missing code or state mismatch. Please retry the login.', false));
        // May be a stray/forged request — keep listening until timeout.
        return;
      }

      codeConsumed = true;
      // A valid callback is in hand; the timeout must no longer race the exchange.
      clearTimeout(timer);
      try {
        const tokens = await options.oauth.exchangeCode({
          code,
          redirectUri: redirectUri.toString(),
          codeVerifier: pkce.verifier,
        });
        await options.store.save(tokens);
        html(
          res,
          200,
          RESULT_PAGE(
            'bexio login successful',
            'The MCP server is now authorized. You can close this tab and return to the terminal.',
            true,
          ),
        );
        notify('Login successful; tokens stored.');
        finish(undefined, tokens);
      } catch (error) {
        html(res, 500, RESULT_PAGE('bexio login failed', 'Token exchange failed — see the terminal for details.', false));
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    }

    server.on('error', (error) => {
      finish(
        new BexioOAuthError(
          `Could not start the loopback listener on ${redirectUri.origin} (${error.message}). ` +
            'Is another login still running, or the port in use? Override with --redirect-uri.',
        ),
      );
    });

    // Bind strictly to the loopback interface ("[::1]" needs the brackets stripped for listen()).
    const listenHost =
      redirectUri.hostname === 'localhost' ? '127.0.0.1' : redirectUri.hostname.replace(/^\[|\]$/g, '');
    server.listen(port, listenHost, () => {
      notify(`Waiting for the browser login on ${redirectUri.toString()} …`);
      notify(`If no browser opened, visit:\n  ${authUrl}`);
      if (options.openBrowser !== false) openInBrowser(authUrl);
    });
  });
}
