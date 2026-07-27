/**
 * Tool registry for the bexio MCP server.
 *
 * Domain modules declare {@link BexioToolDefinition}s; {@link registerBexioTools}
 * turns them into MCP tools with uniform behaviour:
 * - results are JSON-serialized and truncated at a configurable size
 * - bexio API errors are mapped to readable tool errors with actionable hints
 * - write modes reject (or hide) writes outside the configured safety policy
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

/** Server-side write policy. */
export const WRITE_MODES = ['read-only', 'drafts', 'full'] as const;
export type WriteMode = (typeof WRITE_MODES)[number];

/**
 * Writes permitted by the conservative `drafts` policy.
 *
 * Quote updates and position mutations receive additional runtime guards
 * below: only not-yet-issued quotes and custom quote positions are mutable.
 * Everything not listed here remains read-only in this mode.
 */
const DRAFT_WRITE_ACTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  bexio_contacts: new Set(['create', 'update']),
  bexio_contact_relations: new Set(['create', 'delete']),
  bexio_quotes: new Set(['create', 'update']),
  bexio_document_positions: new Set(['create', 'update', 'delete']),
};

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
  /**
   * Server-side write policy. `drafts` permits contact maintenance and
   * not-yet-issued quote drafting while blocking send/issue/delete and every
   * other business write. Default: `full`.
   */
  writeMode?: WriteMode;
  /** @deprecated Use `writeMode: "read-only"`. Kept for API compatibility. */
  readOnly?: boolean;
  /** Truncation threshold for tool results, in characters. */
  maxResultChars?: number;
}

function effectiveWriteMode(options: RegisterToolsOptions): WriteMode {
  return options.readOnly === true ? 'read-only' : (options.writeMode ?? 'full');
}

function enabledWriteActions(
  toolName: string,
  declaredWriteActions: ReadonlySet<string>,
  mode: WriteMode,
): ReadonlySet<string> {
  if (mode === 'full') return declaredWriteActions;
  if (mode === 'read-only') return new Set();
  const allowed = DRAFT_WRITE_ACTIONS[toolName] ?? new Set<string>();
  return new Set([...declaredWriteActions].filter((action) => allowed.has(action)));
}

function policyNote(mode: WriteMode, enabledWrites: ReadonlySet<string>, hasWrites: boolean): string {
  if (mode === 'full' || !hasWrites) return '';
  if (mode === 'read-only') {
    return (
      '\n\nNOTE: The server runs in read-only mode; write actions and the server-filesystem ' +
      '"save_path" option are disabled.'
    );
  }
  if (enabledWrites.size === 0) {
    return (
      '\n\nNOTE: The server runs in drafts mode; all write actions and the server-filesystem ' +
      '"save_path" option on this tool are disabled.'
    );
  }
  return (
    `\n\nNOTE: The server runs in drafts mode. Allowed write actions on this tool: ` +
    `${[...enabledWrites].map((action) => `"${action}"`).join(', ')}. Other write actions are disabled. ` +
    'Quote updates and custom-position mutations are accepted only while the quote is still an unissued draft. ' +
    'The server-filesystem "save_path" option is disabled.'
  );
}

function policyInputSchema(
  inputSchema: ZodRawShape,
  actionSchema: z.ZodTypeAny | undefined,
  actionValues: readonly string[],
  declaredWrites: ReadonlySet<string>,
  enabledWrites: ReadonlySet<string>,
  mode: WriteMode,
): ZodRawShape {
  if (mode === 'full') return inputSchema;
  const projected: ZodRawShape = { ...inputSchema };
  if (actionSchema instanceof z.ZodEnum) {
    const actions = actionValues.filter((action) => !declaredWrites.has(action) || enabledWrites.has(action));
    if (actions.length > 0) {
      let projectedAction = z.enum(actions as [string, ...string[]]);
      if (actionSchema.description) projectedAction = projectedAction.describe(actionSchema.description);
      projected.action = projectedAction;
    }
  }
  return projected;
}

async function writePolicyDenial(
  client: BexioClient,
  toolName: string,
  action: string | undefined,
  args: Record<string, unknown>,
  declaredWrites: ReadonlySet<string>,
  enabledWrites: ReadonlySet<string>,
  mode: WriteMode,
): Promise<string | undefined> {
  if (mode !== 'full' && typeof args.save_path === 'string' && args.save_path.trim().length > 0) {
    return (
      'Argument "save_path" is disabled outside full write mode because it writes to the MCP server filesystem. ' +
      'Omit it to return the document inline.'
    );
  }
  if (action === undefined || !declaredWrites.has(action) || mode === 'full') return undefined;
  if (!enabledWrites.has(action)) {
    return (
      `Action "${action}" is disabled: this bexio MCP server runs in ${mode} write mode ` +
      '(BEXIO_WRITE_MODE).'
    );
  }
  if (mode !== 'drafts') return undefined;

  let quoteId: number | undefined;
  if (toolName === 'bexio_quotes') {
    if (action === 'create') {
      const payload = args.payload;
      const positions =
        payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).positions)
          ? ((payload as Record<string, unknown>).positions as unknown[])
          : [];
      if (
        positions.some(
          (position) =>
            !position ||
            typeof position !== 'object' ||
            (position as Record<string, unknown>).type !== 'KbPositionCustom',
        )
      ) {
        return (
          'Quote creation in drafts mode accepts only inline positions with type="KbPositionCustom". ' +
          'Create the draft without other position types or use full write mode.'
        );
      }
    } else if (action === 'update') {
      quoteId = typeof args.id === 'number' ? args.id : undefined;
      if (quoteId === undefined) return 'Argument "id" is required for action "update".';
    }
  } else if (toolName === 'bexio_document_positions') {
    if (args.document_type !== 'kb_offer' || args.position_type !== 'custom') {
      return (
        `Action "${action}" is disabled in drafts mode for this position: only custom positions ` +
        'on quotes (document_type="kb_offer", position_type="custom") may be changed.'
      );
    }
    quoteId = typeof args.document_id === 'number' ? args.document_id : undefined;
    if (quoteId === undefined) return 'Argument "document_id" is required for this position action.';
  }

  if (quoteId !== undefined) {
    const quote = await client.quotes.get(quoteId);
    const networkLink = typeof quote.network_link === 'string' ? quote.network_link.trim() : '';
    if (quote.kb_item_status_id !== 1 || networkLink.length > 0) {
      return (
        `Quote ${quoteId} is not an editable draft and cannot be changed in drafts mode ` +
        `(status=${quote.kb_item_status_id}). Issue, send and post-issue mutations are intentionally blocked.`
      );
    }
  }
  return undefined;
}

/** Registers tool definitions on an MCP server, applying group/write-policy filters. */
export function registerBexioTools(
  server: McpServer,
  client: BexioClient,
  definitions: readonly AnyBexioToolDefinition[],
  options: RegisterToolsOptions = {},
): void {
  const maxChars = options.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS;
  const allowedGroups = options.groups && options.groups.length > 0 ? new Set(options.groups) : null;
  const writeMode = effectiveWriteMode(options);

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
    const enabledWrites = enabledWriteActions(def.name, writeActions, writeMode);
    const effectiveReadOnlyTool = enabledWrites.size === 0;

    if (effectiveReadOnlyTool && isToolWriteOnly(actionValues, writeActions)) continue;
    const inputSchema = policyInputSchema(
      def.inputSchema,
      actionSchema,
      actionValues,
      writeActions,
      enabledWrites,
      writeMode,
    );

    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description + policyNote(writeMode, enabledWrites, writeActions.size > 0),
        inputSchema,
        annotations: {
          title: def.title,
          readOnlyHint: isReadOnlyTool || effectiveReadOnlyTool,
          destructiveHint: (def.destructiveActions ?? []).some((action) => enabledWrites.has(action)),
          idempotentHint: isReadOnlyTool || effectiveReadOnlyTool,
          openWorldHint: true,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          const action = typeof args.action === 'string' ? args.action : undefined;
          const denied = await writePolicyDenial(
            client,
            def.name,
            action,
            args,
            writeActions,
            enabledWrites,
            writeMode,
          );
          if (denied) return toolError(denied);
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
