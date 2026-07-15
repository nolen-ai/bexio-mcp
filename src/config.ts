/**
 * Configuration for the bexio MCP CLI, resolved from environment variables
 * and command-line arguments (arguments win).
 *
 * | Variable            | Flag              | Meaning                                             |
 * |---------------------|-------------------|-----------------------------------------------------|
 * | BEXIO_API_TOKEN     | --token           | Static API token (PAT or OAuth access token).       |
 * | BEXIO_CLIENT_ID     | --client-id       | OAuth app client id (developer.bexio.com).          |
 * | BEXIO_CLIENT_SECRET | --client-secret   | OAuth app client secret.                            |
 * | BEXIO_SCOPES        | --scopes          | Space/comma-separated scopes for `login`.           |
 * | BEXIO_REDIRECT_URI  | --redirect-uri    | Loopback redirect URI registered on the app.        |
 * | BEXIO_TOKEN_STORE   | --token-store     | Path of the OAuth token file (default ~/.bexio-mcp).|
 * | BEXIO_NO_BROWSER    | --no-browser      | Do not spawn a browser on `login`; print the URL.   |
 * | BEXIO_BASE_URL      | --base-url        | API host override (default https://api.bexio.com)   |
 * | BEXIO_LANGUAGE      | --language        | Accept-Language for translated fields (e.g. "de")   |
 * | BEXIO_TOOL_GROUPS   | --groups          | Comma-separated tool groups to enable (default all) |
 * | BEXIO_READ_ONLY     | --read-only       | "true"/"1" disables all write actions               |
 * | BEXIO_TIMEOUT_MS    | --timeout-ms      | Per-request timeout in milliseconds                 |
 */
import { BexioConfigError } from './client/errors.js';
import { TOOL_GROUPS, type ToolGroup } from './mcp/registry.js';

export type CliCommand = 'serve' | 'login' | 'logout' | 'whoami';

const COMMANDS: readonly CliCommand[] = ['serve', 'login', 'logout', 'whoami'];

export interface BexioMcpConfig {
  token: string;
  clientId?: string;
  clientSecret?: string;
  /** Scopes for the `login` command (undefined = derive from groups). */
  scopes?: string[];
  redirectUri?: string;
  tokenStorePath?: string;
  noBrowser: boolean;
  baseUrl?: string;
  language?: string;
  groups?: ToolGroup[];
  readOnly: boolean;
  timeoutMs?: number;
}

type ValueKey =
  | 'token'
  | 'clientId'
  | 'clientSecret'
  | 'scopes'
  | 'redirectUri'
  | 'tokenStorePath'
  | 'baseUrl'
  | 'language'
  | 'groups'
  | 'timeoutMs';
type SwitchKey = 'readOnly' | 'noBrowser' | 'help' | 'version' | 'listTools';

const FLAG_TO_KEY: Record<string, ValueKey | SwitchKey> = {
  '--token': 'token',
  '--client-id': 'clientId',
  '--client-secret': 'clientSecret',
  '--scopes': 'scopes',
  '--redirect-uri': 'redirectUri',
  '--token-store': 'tokenStorePath',
  '--base-url': 'baseUrl',
  '--language': 'language',
  '--groups': 'groups',
  '--read-only': 'readOnly',
  '--no-browser': 'noBrowser',
  '--timeout-ms': 'timeoutMs',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
  '--list-tools': 'listTools',
};

const SWITCH_KEYS: ReadonlySet<string> = new Set(['readOnly', 'noBrowser', 'help', 'version', 'listTools']);

export interface ParsedCli {
  command?: CliCommand;
  config?: BexioMcpConfig;
  help?: boolean;
  version?: boolean;
  listTools?: boolean;
  error?: string;
}

function parseBool(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseGroups(value: string): ToolGroup[] {
  const groups = value
    .split(',')
    .map((g) => g.trim().toLowerCase())
    .filter((g) => g.length > 0);
  const invalid = groups.filter((g) => !(TOOL_GROUPS as readonly string[]).includes(g));
  if (invalid.length > 0) {
    throw new BexioConfigError(
      `Unknown tool group(s): ${invalid.join(', ')}. Valid groups: ${TOOL_GROUPS.join(', ')}`,
    );
  }
  return groups as ToolGroup[];
}

function parseScopes(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parses CLI arguments and environment into a config; never exits the process. */
export function parseCliConfig(argv: readonly string[], env: NodeJS.ProcessEnv): ParsedCli {
  const values: Partial<Record<ValueKey | SwitchKey, string>> = {};
  const switches = new Set<SwitchKey>();
  let command: CliCommand | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('-')) {
      if (command !== undefined) return { error: `Unexpected argument "${arg}".` };
      if (!(COMMANDS as readonly string[]).includes(arg)) {
        return { error: `Unknown command "${arg}". Commands: ${COMMANDS.join(', ')}.` };
      }
      command = arg as CliCommand;
      continue;
    }
    const [flag, inline] = arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, undefined];
    const key = FLAG_TO_KEY[flag];
    if (key === undefined) return { error: `Unknown option "${flag}". Use --help for usage.` };
    if (SWITCH_KEYS.has(key)) {
      switches.add(key as SwitchKey);
      if (inline !== undefined) values[key] = inline;
      continue;
    }
    let value = inline;
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) return { error: `Option "${flag}" expects a value.` };
    }
    values[key as ValueKey] = value;
  }

  const switchOn = (key: SwitchKey): boolean =>
    switches.has(key) && (values[key] === undefined || parseBool(values[key]));

  if (switchOn('help')) return { help: true };
  if (switchOn('version')) return { version: true };

  try {
    const groupsRaw = values.groups ?? env.BEXIO_TOOL_GROUPS;
    const scopesRaw = values.scopes ?? env.BEXIO_SCOPES;
    const timeoutRaw = values.timeoutMs ?? env.BEXIO_TIMEOUT_MS;
    const timeoutMs = timeoutRaw !== undefined ? Number(timeoutRaw) : undefined;
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      return { error: `Invalid timeout "${timeoutRaw}": expected a positive number of milliseconds.` };
    }
    const config: BexioMcpConfig = {
      token: values.token ?? env.BEXIO_API_TOKEN ?? '',
      clientId: values.clientId ?? env.BEXIO_CLIENT_ID,
      clientSecret: values.clientSecret ?? env.BEXIO_CLIENT_SECRET,
      scopes: scopesRaw !== undefined ? parseScopes(scopesRaw) : undefined,
      redirectUri: values.redirectUri ?? env.BEXIO_REDIRECT_URI,
      tokenStorePath: values.tokenStorePath ?? env.BEXIO_TOKEN_STORE,
      noBrowser: switches.has('noBrowser')
        ? values.noBrowser === undefined || parseBool(values.noBrowser)
        : parseBool(env.BEXIO_NO_BROWSER),
      baseUrl: values.baseUrl ?? env.BEXIO_BASE_URL,
      language: values.language ?? env.BEXIO_LANGUAGE,
      groups: groupsRaw !== undefined ? parseGroups(groupsRaw) : undefined,
      readOnly: switches.has('readOnly')
        ? values.readOnly === undefined || parseBool(values.readOnly)
        : parseBool(env.BEXIO_READ_ONLY),
      timeoutMs,
    };
    return { command: command ?? 'serve', config, listTools: switchOn('listTools') };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export const CLI_USAGE = `bexio-mcp — MCP server for the bexio API

Usage: bexio-mcp [command] [options]

Commands:
  serve                  Start the MCP server on stdio (default)
  login                  Authorize via the bexio app OAuth flow (browser) and store tokens
  logout                 Revoke (best effort) and delete the stored OAuth tokens
  whoami                 Show the authenticated bexio user

Authentication (choose one):
  --token <token>        Static token: PAT from https://developer.bexio.com/pat
                         (or env BEXIO_API_TOKEN)
  --client-id <id>       OAuth app credentials from https://developer.bexio.com
  --client-secret <sec>  (or env BEXIO_CLIENT_ID / BEXIO_CLIENT_SECRET);
                         run "bexio-mcp login" once, then "serve" uses the stored,
                         auto-refreshing tokens

Login options:
  --scopes <a b c>       Scopes to request (default: derived from --groups; space/comma separated)
  --redirect-uri <uri>   Loopback redirect URI (default http://127.0.0.1:33771/callback);
                         must be registered on the bexio app
  --token-store <path>   Token file location (default ~/.bexio-mcp/tokens.json)
  --no-browser           Print the authorization URL instead of opening a browser

Server options:
  --groups <a,b,…>       Tool groups to enable (default: all)
  --read-only            Disable all write actions (or env BEXIO_READ_ONLY=true)
  --language <code>      Accept-Language for translated fields, e.g. "de"
  --base-url <url>       API host override
  --timeout-ms <ms>      Per-request timeout
  --list-tools           Print the tools that would be registered and exit
  -v, --version          Print version and exit
  -h, --help             Show this help
`;
