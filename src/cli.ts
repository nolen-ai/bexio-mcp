/**
 * `bexio-mcp` command-line entry point: stdio MCP server plus the
 * OAuth companion commands (login / logout / whoami).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FileTokenStore, defaultTokenStorePath } from './auth/token-store.js';
import { runLoginFlow, DEFAULT_REDIRECT_URI } from './auth/login.js';
import { BexioClient } from './client/index.js';
import type { TokenProvider } from './client/http.js';
import { BASE_OIDC_SCOPES, BexioOAuth, OAuthTokenProvider } from './client/oauth.js';
import { createBexioMcpServer } from './mcp/index.js';
import { scopesForGroups } from './mcp/scopes.js';
import { allBexioTools } from './mcp/tools/index.js';
import { CLI_USAGE, parseCliConfig, type BexioMcpConfig } from './config.js';
import { VERSION } from './version.js';

const err = (message: string): void => void process.stderr.write(`${message}\n`);
const out = (message: string): void => void process.stdout.write(`${message}\n`);

/**
 * Picks the token source for API-calling commands:
 * a static token (BEXIO_API_TOKEN) wins; otherwise stored OAuth tokens
 * with automatic refresh via the app's client credentials.
 */
function resolveTokenSource(config: BexioMcpConfig): TokenProvider | undefined {
  if (config.token) return config.token;
  if (config.clientId && config.clientSecret) {
    const oauth = new BexioOAuth({ clientId: config.clientId, clientSecret: config.clientSecret });
    const store = new FileTokenStore(config.tokenStorePath ?? defaultTokenStorePath(), config.clientId);
    const provider = new OAuthTokenProvider(oauth, store);
    return provider.accessTokenProvider();
  }
  return undefined;
}

function missingAuthMessage(): string {
  return (
    'No bexio credentials configured. Either:\n' +
    '  1. Personal Access Token: set BEXIO_API_TOKEN (create one at https://developer.bexio.com/pat), or\n' +
    '  2. App workflow (OAuth): set BEXIO_CLIENT_ID and BEXIO_CLIENT_SECRET for your app from\n' +
    '     https://developer.bexio.com and run "bexio-mcp login" once to authorize.\n'
  );
}

async function commandLogin(config: BexioMcpConfig): Promise<void> {
  if (!config.clientId || !config.clientSecret) {
    err(
      'login requires the OAuth app credentials: set BEXIO_CLIENT_ID and BEXIO_CLIENT_SECRET\n' +
        '(create an app at https://developer.bexio.com; add the redirect URL ' +
        `${config.redirectUri ?? DEFAULT_REDIRECT_URI} to its "Allowed redirect URLs").`,
    );
    process.exit(2);
  }
  const oauth = new BexioOAuth({ clientId: config.clientId, clientSecret: config.clientSecret });
  const store = new FileTokenStore(config.tokenStorePath ?? defaultTokenStorePath(), config.clientId);
  const apiScopes = config.scopes ?? scopesForGroups(config.groups, config.readOnly);
  const scopes = [...new Set([...BASE_OIDC_SCOPES, ...apiScopes])];

  err(`Requesting scopes: ${scopes.join(' ')}`);
  const tokens = await runLoginFlow({
    oauth,
    store,
    scopes,
    redirectUri: config.redirectUri,
    openBrowser: !config.noBrowser,
    onMessage: err,
  });
  err(`Granted scopes: ${tokens.scope ?? '(not reported)'}`);
  err(`Tokens stored in ${store.location}`);
  err('You can now start the server: bexio-mcp serve (with BEXIO_CLIENT_ID/BEXIO_CLIENT_SECRET set).');
}

async function commandLogout(config: BexioMcpConfig): Promise<void> {
  const store = new FileTokenStore(config.tokenStorePath ?? defaultTokenStorePath(), config.clientId);
  const tokens = await store.load();
  if (tokens?.refreshToken && config.clientId && config.clientSecret) {
    const oauth = new BexioOAuth({ clientId: config.clientId, clientSecret: config.clientSecret });
    await oauth.revoke(tokens.refreshToken, 'refresh_token');
    err('Refresh token revoked at the identity provider.');
  } else if (tokens?.refreshToken) {
    err('Note: tokens deleted locally only — set BEXIO_CLIENT_ID/BEXIO_CLIENT_SECRET to also revoke them at the identity provider.');
  }
  await store.clear();
  err(`Stored tokens removed (${store.location}).`);
}

async function commandWhoami(config: BexioMcpConfig): Promise<void> {
  const token = resolveTokenSource(config);
  if (token === undefined) {
    err(missingAuthMessage());
    process.exit(1);
  }
  const client = new BexioClient({ token, baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });
  const me = await client.users.me();
  out(JSON.stringify(me, null, 2));
}

async function commandServe(config: BexioMcpConfig, listTools: boolean): Promise<void> {
  if (listTools) {
    const groups = config.groups && config.groups.length > 0 ? new Set(config.groups) : null;
    for (const tool of allBexioTools) {
      if (groups && !groups.has(tool.group)) continue;
      out(`${tool.name}  [${tool.group}]  ${tool.title}`);
    }
    return;
  }

  const token = resolveTokenSource(config);
  if (token === undefined) {
    err(missingAuthMessage());
    process.exit(1);
  }

  const client = new BexioClient({
    token,
    baseUrl: config.baseUrl,
    language: config.language,
    timeoutMs: config.timeoutMs,
  });
  const server = createBexioMcpServer({
    client,
    groups: config.groups,
    readOnly: config.readOnly,
  });

  await server.connect(new StdioServerTransport());
  // The process stays alive on the stdio transport; exit cleanly when it closes.
  process.stdin.on('close', () => {
    void server.close().finally(() => process.exit(0));
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  for (const secretFlag of ['--token', '--client-secret']) {
    if (argv.some((a) => a === secretFlag || a.startsWith(`${secretFlag}=`))) {
      err(
        `Warning: passing secrets via ${secretFlag} exposes them in the process list; ` +
          'prefer the corresponding environment variable.',
      );
    }
  }
  const parsed = parseCliConfig(argv, process.env);

  if (parsed.error) {
    err(parsed.error);
    process.exit(2);
  }
  if (parsed.help) {
    out(CLI_USAGE);
    return;
  }
  if (parsed.version) {
    out(VERSION);
    return;
  }

  const config = parsed.config!;
  switch (parsed.command) {
    case 'login':
      return commandLogin(config);
    case 'logout':
      return commandLogout(config);
    case 'whoami':
      return commandWhoami(config);
    case 'serve':
    default:
      return commandServe(config, parsed.listTools === true);
  }
}

main().catch((error: unknown) => {
  err(`bexio-mcp fatal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
