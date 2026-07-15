/**
 * bexio-mcp — MCP server and typed client for the bexio API.
 *
 * - `bexio-mcp` (this entry): MCP server factory, tool definitions and the client.
 * - `bexio-mcp/client`: only the typed API client (no MCP dependency).
 */
export * from './client/index.js';
export {
  createBexioMcpServer,
  registerBexioTools,
  allBexioTools,
  TOOL_GROUPS,
} from './mcp/index.js';
export type {
  BexioMcpServerOptions,
} from './mcp/index.js';
export type {
  BexioToolDefinition,
  RegisterToolsOptions,
  ToolGroup,
  ToolResult,
} from './mcp/registry.js';
export { defineTool, searchCriteriaSchema, listParamsShape, requireArg, unknownAction, InvalidToolArgumentsError } from './mcp/registry.js';
export { documentResult } from './mcp/binary.js';
export type { DocumentPayload } from './mcp/binary.js';
export { parseCliConfig, CLI_USAGE } from './config.js';
export type { BexioMcpConfig } from './config.js';
export { VERSION } from './version.js';
