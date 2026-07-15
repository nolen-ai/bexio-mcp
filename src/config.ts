/**
 * Configuration for the bexio MCP CLI, resolved from environment variables
 * and command-line arguments (arguments win).
 *
 * | Variable            | Flag              | Meaning                                             |
 * |---------------------|-------------------|-----------------------------------------------------|
 * | BEXIO_API_TOKEN     | --token           | API token (PAT or OAuth access token). Required.    |
 * | BEXIO_BASE_URL      | --base-url        | API host override (default https://api.bexio.com)   |
 * | BEXIO_LANGUAGE      | --language        | Accept-Language for translated fields (e.g. "de")   |
 * | BEXIO_TOOL_GROUPS   | --groups          | Comma-separated tool groups to enable (default all) |
 * | BEXIO_READ_ONLY     | --read-only       | "true"/"1" disables all write actions               |
 * | BEXIO_TIMEOUT_MS    | --timeout-ms      | Per-request timeout in milliseconds                 |
 */
import { BexioConfigError } from './client/errors.js';
import { TOOL_GROUPS, type ToolGroup } from './mcp/registry.js';

export interface BexioMcpConfig {
  token: string;
  baseUrl?: string;
  language?: string;
  groups?: ToolGroup[];
  readOnly: boolean;
  timeoutMs?: number;
}

const FLAG_TO_KEY: Record<string, keyof BexioMcpConfig | 'help' | 'version' | 'listTools'> = {
  '--token': 'token',
  '--base-url': 'baseUrl',
  '--language': 'language',
  '--groups': 'groups',
  '--read-only': 'readOnly',
  '--timeout-ms': 'timeoutMs',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
  '--list-tools': 'listTools',
};

export interface ParsedCli {
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

/** Parses CLI arguments and environment into a config; never exits the process. */
export function parseCliConfig(argv: readonly string[], env: NodeJS.ProcessEnv): ParsedCli {
  const values: Partial<Record<string, string>> = {};
  const switches = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const key = FLAG_TO_KEY[flag];
    if (key === undefined) return { error: `Unknown option "${flag}". Use --help for usage.` };
    if (key === 'help' || key === 'version' || key === 'listTools' || key === 'readOnly') {
      switches.add(key);
      if (inline !== undefined) values[key] = inline;
      continue;
    }
    let value = inline;
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) return { error: `Option "${flag}" expects a value.` };
    }
    values[key] = value;
  }

  if (switches.has('help')) return { help: true };
  if (switches.has('version')) return { version: true };

  try {
    const token = values.token ?? env.BEXIO_API_TOKEN ?? '';
    const groupsRaw = values.groups ?? env.BEXIO_TOOL_GROUPS;
    const timeoutRaw = values.timeoutMs ?? env.BEXIO_TIMEOUT_MS;
    const timeoutMs = timeoutRaw !== undefined ? Number(timeoutRaw) : undefined;
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      return { error: `Invalid timeout "${timeoutRaw}": expected a positive number of milliseconds.` };
    }
    const config: BexioMcpConfig = {
      token,
      baseUrl: values.baseUrl ?? env.BEXIO_BASE_URL,
      language: values.language ?? env.BEXIO_LANGUAGE,
      groups: groupsRaw !== undefined ? parseGroups(groupsRaw) : undefined,
      readOnly: switches.has('readOnly') ? values.readOnly === undefined || parseBool(values.readOnly) : parseBool(env.BEXIO_READ_ONLY),
      timeoutMs,
    };
    return { config, listTools: switches.has('listTools') };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export const CLI_USAGE = `bexio-mcp — MCP server for the bexio API

Usage: bexio-mcp [options]

Options:
  --token <token>        bexio API token (or env BEXIO_API_TOKEN)
  --groups <a,b,…>       Tool groups to enable: ${TOOL_GROUPS.join(', ')} (default: all)
  --read-only            Disable all write actions (or env BEXIO_READ_ONLY=true)
  --language <code>      Accept-Language for translated fields, e.g. "de" (or env BEXIO_LANGUAGE)
  --base-url <url>       API host override (or env BEXIO_BASE_URL)
  --timeout-ms <ms>      Per-request timeout (or env BEXIO_TIMEOUT_MS)
  --list-tools           Print the tools that would be registered and exit
  -v, --version          Print version and exit
  -h, --help             Show this help

Get a Personal Access Token at https://developer.bexio.com/pat and run:
  BEXIO_API_TOKEN=… bexio-mcp
`;
