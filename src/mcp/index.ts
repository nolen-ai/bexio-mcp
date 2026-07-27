/**
 * MCP server factory for bexio.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BexioClient } from '../client/index.js';
import { registerBexioTools, type RegisterToolsOptions } from './registry.js';
import { allBexioTools } from './tools/index.js';
import { VERSION } from '../version.js';

export interface BexioMcpServerOptions extends RegisterToolsOptions {
  /** Pre-configured client. */
  client: BexioClient;
  /** Override the advertised server name/version (defaults to bexio-mcp / package version). */
  serverInfo?: { name?: string; version?: string };
}

/**
 * Creates an MCP server exposing the bexio API as tools.
 * Connect it to any transport (stdio, streamable HTTP, in-memory):
 *
 * ```ts
 * const server = createBexioMcpServer({ client: new BexioClient({ token }) });
 * await server.connect(new StdioServerTransport());
 * ```
 */
export function createBexioMcpServer(options: BexioMcpServerOptions): McpServer {
  const server = new McpServer(
    {
      name: options.serverInfo?.name ?? 'bexio-mcp',
      version: options.serverInfo?.version ?? VERSION,
    },
    {
      capabilities: { tools: {} },
      instructions:
        'Tools for the bexio business software API (Swiss accounting/ERP): contacts, quotes, orders, invoices, ' +
        'purchase, accounting, banking, items & stock, projects, time tracking, files and payroll. ' +
        'Most tools take an "action" argument; each action\'s required arguments are listed in the tool description. ' +
        'Monetary amounts and quantities follow each endpoint\'s schema (many 2.0 sales endpoints use decimal strings, newer endpoints use numbers; at most 6 decimal places). Dates use ISO 8601 (YYYY-MM-DD). ' +
        'Legacy search actions take "search_criteria": an array of {field, value, criteria} conditions combined with AND.',
    },
  );
  registerBexioTools(server, options.client, allBexioTools, options);
  return server;
}

export { registerBexioTools } from './registry.js';
export type {
  BexioToolDefinition,
  RegisterToolsOptions,
  ToolGroup,
  ToolResult,
  WriteMode,
} from './registry.js';
export { TOOL_GROUPS, WRITE_MODES } from './registry.js';
export { allBexioTools } from './tools/index.js';
