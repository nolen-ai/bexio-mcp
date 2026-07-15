/**
 * Tool registry for the bexio MCP server.
 *
 * Domain modules declare {@link BexioToolDefinition}s; {@link registerBexioTools}
 * turns them into MCP tools with uniform behaviour:
 * - results are JSON-serialized and truncated at a configurable size
 * - bexio API errors are mapped to readable tool errors with actionable hints
 * - a read-only mode rejects (or hides) write actions
 * - tools can be filtered by functional group
 */
import { z, type ZodRawShape } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BexioClient } from '../client/index.js';
import { BexioApiError, BexioNetworkError, BexioRateLimitError } from '../client/errors.js';
import { BexioOAuthError } from '../client/oauth.js';

/** Functional tool groups, used to enable a subset of tools (`BEXIO_TOOL_GROUPS`). */
export const TOOL_GROUPS = [
  'contacts',
  'sales',
  'purchase',
  'accounting',
  'banking',
  'items',
  'projects',
  'files',
  'payroll',
  'misc',
] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

/** MCP text content block. */
interface TextContent {
  [key: string]: unknown;
  type: 'text';
  text: string;
}

/** Shape of a tool handler result understood by the MCP SDK. */
export interface ToolResult {
  [key: string]: unknown;
  content: TextContent[];
  isError?: boolean;
}

export interface BexioToolDefinition<Shape extends ZodRawShape = ZodRawShape> {
  /** Tool name, e.g. `bexio_contacts`. */
  name: string;
  /** Human-friendly title, e.g. `bexio Contacts`. */
  title: string;
  /** Tool description shown to the model. Document every action and its required arguments. */
  description: string;
  group: ToolGroup;
  /**
   * Values of the `action` argument that modify data. Used to enforce read-only
   * mode and to derive MCP annotations. Omit for purely read-only tools.
   */
  writeActions?: readonly string[];
  /** Subset of {@link writeActions} that irreversibly destroy data (bexio deletes cannot be undone). */
  destructiveActions?: readonly string[];
  inputSchema: Shape;
  /**
   * Business logic: call the typed client and return the payload. Plain return
   * values are JSON-serialized; return a {@link ToolResult} to take full control.
   */
  handler: (client: BexioClient, args: z.objectOutputType<Shape, z.ZodTypeAny>) => Promise<unknown>;
}

/**
 * Type-erased form of {@link BexioToolDefinition} used for aggregation.
 * Any concretely-typed definition is assignable to it (`args: never` is contravariant-safe).
 */
export interface AnyBexioToolDefinition extends Omit<BexioToolDefinition, 'handler'> {
  handler: (client: BexioClient, args: never) => Promise<unknown>;
}

/** Identity helper that preserves the input-schema type for handler inference. */
export function defineTool<Shape extends ZodRawShape>(def: BexioToolDefinition<Shape>): BexioToolDefinition<Shape> {
  return def;
}

// ---------------------------------------------------------------------------
// Shared schema fragments (import these instead of redefining them per domain)
// ---------------------------------------------------------------------------

/** Operators of the legacy 2.0 search endpoints. */
export const searchCriteriaOperators = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'like',
  'not_like',
  'is_null',
  'not_null',
  'in',
  'not_in',
] as const;

/** `search_criteria` argument for legacy POST `/…/search` endpoints. */
export const searchCriteriaSchema = z
  .array(
    z.object({
      field: z.string().describe('Field name to filter on (see tool description for searchable fields)'),
      value: z
        .union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))])
        .describe('Comparison value; use an array with the "in"/"not_in" operators'),
      criteria: z.enum(searchCriteriaOperators).optional().describe('Comparison operator (default: "like")'),
    }),
  )
  .describe('Search conditions, combined with logical AND');

/** Standard pagination arguments of 2.0/3.0 list endpoints. */
export const listParamsShape = {
  limit: z.number().int().min(1).max(2000).optional().describe('Maximum number of results (default 500, max 2000)'),
  offset: z.number().int().min(0).optional().describe('Number of results to skip (pagination)'),
  order_by: z.string().optional().describe('Field to order by; append "_desc" for descending (e.g. "id_desc")'),
} satisfies ZodRawShape;

/** Reusable `id` argument. */
export const idSchema = z.number().int().describe('Numeric bexio resource id');

// ---------------------------------------------------------------------------
// Result shaping
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RESULT_CHARS = 50_000;

function toTextResult(payload: unknown, maxChars: number): ToolResult {
  let text: string;
  if (payload === undefined || payload === null) {
    text = 'OK (empty response)';
  } else if (typeof payload === 'string') {
    text = payload;
  } else {
    text = JSON.stringify(payload, null, 2);
  }
  if (text.length > maxChars) {
    const itemCount = Array.isArray(payload) ? ` The full result contains ${payload.length} items.` : '';
    text =
      text.slice(0, maxChars) +
      `\n\n[Result truncated: ${text.length} characters total.${itemCount} ` +
      `Narrow the query (limit/offset, search criteria) to see the rest.]`;
  }
  return { content: [{ type: 'text', text }] };
}

function isToolResult(value: unknown): value is ToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as ToolResult).content) &&
    (value as ToolResult).content.every((c) => c && c.type === 'text' && typeof c.text === 'string')
  );
}

function toolError(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function describeApiError(error: BexioApiError): string {
  const lines = [`bexio API error ${error.status} on ${error.method} ${error.path}`];
  if (error instanceof BexioRateLimitError) {
    lines.push(
      `Rate limit exceeded despite retries${error.resetSeconds !== undefined ? `; the limit resets in ${error.resetSeconds}s` : ''}. Wait before retrying.`,
    );
  } else if (error.status === 401) {
    lines.push(
      'The API token was rejected. Check BEXIO_API_TOKEN; note that Personal Access Tokens expire six months after creation (manage them at https://developer.bexio.com/pat).',
    );
  } else if (error.status === 403) {
    lines.push(
      'Access denied: the token is missing the required API scope or the bexio user lacks the corresponding permission/add-on.',
    );
  } else if (error.status === 404) {
    lines.push('Resource not found. Verify the id and that the feature is enabled for this bexio company.');
  } else if (error.status === 422 || error.status === 400) {
    lines.push('The request payload was rejected. Details below; fix the listed fields and retry.');
  }
  if (error.body !== undefined && error.body !== '') {
    const body = typeof error.body === 'string' ? error.body : JSON.stringify(error.body, null, 2);
    lines.push(`Response body: ${body.slice(0, 4000)}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface RegisterToolsOptions {
  /** Only register tools of these groups. Default: all groups. */
  groups?: readonly ToolGroup[];
  /** Reject all write actions and hide write-only tools. Default: false. */
  readOnly?: boolean;
  /** Truncation threshold for tool results, in characters. */
  maxResultChars?: number;
}

/** Registers tool definitions on an MCP server, applying group/read-only filters. */
export function registerBexioTools(
  server: McpServer,
  client: BexioClient,
  definitions: readonly AnyBexioToolDefinition[],
  options: RegisterToolsOptions = {},
): void {
  const maxChars = options.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS;
  const allowedGroups = options.groups && options.groups.length > 0 ? new Set(options.groups) : null;

  const names = new Set<string>();
  for (const def of definitions) {
    if (names.has(def.name)) throw new Error(`Duplicate bexio tool name: ${def.name}`);
    names.add(def.name);

    if (allowedGroups && !allowedGroups.has(def.group)) continue;

    const writeActions = new Set(def.writeActions ?? []);
    const actionSchema = def.inputSchema.action;
    const actionValues: string[] =
      actionSchema instanceof z.ZodEnum ? [...(actionSchema.options as string[])] : [];
    const isReadOnlyTool = writeActions.size === 0;

    if (options.readOnly && isToolWriteOnly(actionValues, writeActions)) continue;

    server.registerTool(
      def.name,
      {
        title: def.title,
        description: options.readOnly
          ? `${def.description}\n\nNOTE: The server runs in read-only mode; write actions are disabled.`
          : def.description,
        inputSchema: def.inputSchema,
        annotations: {
          title: def.title,
          readOnlyHint: isReadOnlyTool || options.readOnly === true,
          destructiveHint: !options.readOnly && (def.destructiveActions?.length ?? 0) > 0,
          idempotentHint: isReadOnlyTool,
          openWorldHint: true,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          const action = typeof args.action === 'string' ? args.action : undefined;
          if (options.readOnly && action !== undefined && writeActions.has(action)) {
            return toolError(
              `Action "${action}" is disabled: this bexio MCP server runs in read-only mode (BEXIO_READ_ONLY).`,
            );
          }
          const result = await def.handler(client, args as never);
          return isToolResult(result) ? result : toTextResult(result, maxChars);
        } catch (error) {
          if (error instanceof BexioApiError) return toolError(describeApiError(error));
          if (error instanceof BexioOAuthError) {
            return toolError(
              `bexio authorization problem: ${error.message}` +
                (error.needsReauthorization ? '\nRe-authorize with "bexio-mcp login", then retry.' : ''),
            );
          }
          if (error instanceof BexioNetworkError) {
            return toolError(`Could not reach the bexio API: ${error.message}`);
          }
          if (error instanceof InvalidToolArgumentsError) return toolError(error.message);
          throw error;
        }
      },
    );
  }
}

function isToolWriteOnly(actionValues: string[], writeActions: ReadonlySet<string>): boolean {
  if (writeActions.size === 0) return false;
  if (actionValues.length === 0) return true; // no action enum: writeActions implies the whole tool writes
  return actionValues.every((a) => writeActions.has(a));
}

/**
 * Raised by tool handlers when arguments are structurally valid but semantically
 * incomplete (e.g. `action: "get"` without `id`). Rendered as a tool error, not a crash.
 */
export class InvalidToolArgumentsError extends Error {}

/** Asserts that an argument required by the selected action is present. */
export function requireArg<T>(value: T | undefined | null, name: string, action: string): T {
  if (value === undefined || value === null) {
    throw new InvalidToolArgumentsError(`Argument "${name}" is required for action "${action}".`);
  }
  return value;
}

/** Signals an `action` value the handler does not know (should be unreachable with enum schemas). */
export function unknownAction(action: never): never {
  throw new InvalidToolArgumentsError(`Unknown action "${String(action)}".`);
}
