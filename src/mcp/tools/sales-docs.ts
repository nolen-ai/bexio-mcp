/**
 * MCP tools for sales document sub-resources: positions, comments,
 * document settings and document templates.
 */
import { z } from 'zod';
import { defineTool, requireArg, unknownAction } from '../registry.js';
import type { BexioClient } from '../../client/index.js';
import type {
  DocumentCommentsApi,
  DocumentCommentCreate,
  DocumentPositionPayload,
  DocumentPositionsApi,
  DocumentSettingsApi,
} from '../../client/resources/sales-docs.js';

/**
 * Mount points this module expects on {@link BexioClient} (added in
 * `client/index.ts` when the module is wired up).
 */
interface SalesDocsClient {
  documentPositions: DocumentPositionsApi;
  documentComments: DocumentCommentsApi;
  documentSettings: DocumentSettingsApi;
}

const salesDocs = (client: BexioClient): SalesDocsClient => client as unknown as SalesDocsClient;

const documentTypeSchema = z
  .enum(['kb_offer', 'kb_order', 'kb_invoice'])
  .describe('Type of the parent document: kb_offer (quote), kb_order (order) or kb_invoice (invoice)');

/**
 * Merged field set of all seven position kinds. bexio ignores fields that do not
 * apply to the chosen position_type; the tool description documents which fields
 * belong to which kind.
 */
const positionPayloadSchema = z
  .object({
    amount: z.string().describe('Quantity, e.g. "5.000000" (custom/article positions)'),
    unit_id: z.number().int().describe('References a unit object (custom/article positions)'),
    account_id: z.number().int().describe('References an account object (custom/article positions)'),
    tax_id: z
      .number()
      .int()
      .describe(
        'References a tax object (custom/article positions). Only active sales taxes are valid ' +
          '(GET /3.0/taxes?types=sales_tax&scope=active)',
      ),
    text: z.string().describe('Position text (custom/article/text/subtotal/discount/subposition positions)'),
    unit_price: z.string().describe('Price of one unit, max. 6 decimals (custom/article positions)'),
    discount_in_percent: z
      .string()
      .nullable()
      .describe('Discount in percent, max. 6 decimals (custom/article positions)'),
    is_optional: z
      .boolean()
      .describe(
        'Mark the position as optional — custom/article positions only, and only honored on quotes and orders ' +
          '(read-only for all other kinds)',
      ),
    article_id: z.number().int().describe('References an item object (article positions only)'),
    show_pos_nr: z.boolean().describe('Show the position number (text/subposition positions)'),
    is_percentual: z
      .boolean()
      .describe('Whether "value" is a percentage (true) or an absolute amount (false) — discount positions'),
    value: z.string().describe('Discount value, percentage or absolute amount (discount positions)'),
    pagebreak: z.boolean().describe('Whether the pagebreak is active (pagebreak positions)'),
  })
  .partial()
  .describe(
    'Position fields (all optional; only the fields of the selected position_type apply). ' +
      'custom: amount, unit_id, account_id, tax_id, text, unit_price, discount_in_percent, is_optional. ' +
      'article: same as custom plus article_id. text: text, show_pos_nr. ' +
      'subtotal: text. discount: text, is_percentual, value. ' +
      'pagebreak: pagebreak. subposition: text, show_pos_nr.',
  );

const commentPayloadSchema = z
  .object({
    text: z.string().describe('Comment text'),
    user_id: z.number().int().nullable().describe('References a user object; may be null'),
    user_name: z.string().nullable().describe('Display name of the comment author; may be null'),
    user_email: z.string().nullable().describe('E-mail address of the comment author'),
    is_public: z.boolean().describe('Whether the comment is visible to the document recipient'),
  })
  .partial()
  .describe('Comment fields. Required on create: text, user_id, user_name.');

export const salesDocsTools = [
  defineTool({
    name: 'bexio_document_positions',
    title: 'bexio Document Positions',
    description:
      'Manage line-item positions on sales documents (quotes/kb_offer, orders/kb_order, invoices/kb_invoice). ' +
      'position_type selects the kind of position: "custom" (free position: amount, unit_id, account_id, tax_id, text, ' +
      'unit_price, discount_in_percent), "article" (item position: same fields plus article_id referencing an item), ' +
      '"text" (text block: text, show_pos_nr), "subtotal" (text), "discount" (text, is_percentual, value), ' +
      '"pagebreak" (pagebreak flag) and "subposition" (grouping position: text, show_pos_nr). ' +
      'Actions: "list" (all positions of that kind on the document; optional limit/offset), ' +
      '"get" (single position, requires position_id), ' +
      '"create" (payload with the fields of the chosen position_type), ' +
      '"update" (requires position_id + payload; partial updates allowed), ' +
      '"delete" (requires position_id — permanently removes the position, cannot be undone). ' +
      'All actions require document_type, document_id and position_type. ' +
      'is_optional is writable only on custom/article positions and only honored on quotes and orders. ' +
      'Amounts/prices are strings with max. 6 decimals.',
    group: 'sales',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'get', 'create', 'update', 'delete']).describe('Operation to perform'),
      document_type: documentTypeSchema,
      document_id: z.number().int().describe('Id of the parent document (quote, order or invoice)'),
      position_type: z
        .enum(['custom', 'article', 'text', 'subtotal', 'discount', 'pagebreak', 'subposition'])
        .describe(
          'Kind of position; maps to the kb_position_custom/kb_position_article/kb_position_text/' +
            'kb_position_subtotal/kb_position_discount/kb_position_pagebreak/kb_position_subposition endpoints',
        ),
      position_id: z.number().int().optional().describe('Position id (required for get/update/delete)'),
      payload: positionPayloadSchema.optional(),
      limit: z.number().int().min(1).max(2000).optional().describe('Max results for "list" (max 2000)'),
      offset: z.number().int().min(0).optional().describe('Results to skip for "list"'),
    },
    handler: async (client, args) => {
      const documentType = args.document_type;
      const documentId = args.document_id;
      const kind = args.position_type;
      switch (args.action) {
        case 'list':
          return salesDocs(client).documentPositions.list(documentType, documentId, kind, {
            limit: args.limit,
            offset: args.offset,
          });
        case 'get':
          return salesDocs(client).documentPositions.get(
            documentType,
            documentId,
            kind,
            requireArg(args.position_id, 'position_id', 'get'),
          );
        case 'create':
          return salesDocs(client).documentPositions.create(
            documentType,
            documentId,
            kind,
            requireArg(args.payload, 'payload', 'create') as DocumentPositionPayload,
          );
        case 'update':
          return salesDocs(client).documentPositions.update(
            documentType,
            documentId,
            kind,
            requireArg(args.position_id, 'position_id', 'update'),
            requireArg(args.payload, 'payload', 'update') as DocumentPositionPayload,
          );
        case 'delete':
          return salesDocs(client).documentPositions.delete(
            documentType,
            documentId,
            kind,
            requireArg(args.position_id, 'position_id', 'delete'),
          );
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_document_comments',
    title: 'bexio Document Comments',
    description:
      'Comments on sales documents (quotes/kb_offer, orders/kb_order, invoices/kb_invoice). ' +
      'Actions: "list" (all comments of a document; optional limit/offset), ' +
      '"get" (single comment, requires comment_id), ' +
      '"create" (payload required: text, user_id, user_name; optional user_email, is_public — ' +
      'is_public makes the comment visible to the document recipient). ' +
      'All actions require document_type and document_id. Comments cannot be edited or deleted via the API.',
    group: 'sales',
    writeActions: ['create'],
    inputSchema: {
      action: z.enum(['list', 'get', 'create']).describe('Operation to perform'),
      document_type: documentTypeSchema,
      document_id: z.number().int().describe('Id of the parent document (quote, order or invoice)'),
      comment_id: z.number().int().optional().describe('Comment id (required for "get")'),
      payload: commentPayloadSchema.optional(),
      limit: z.number().int().min(1).max(2000).optional().describe('Max results for "list" (max 2000)'),
      offset: z.number().int().min(0).optional().describe('Results to skip for "list"'),
    },
    handler: async (client, args) => {
      switch (args.action) {
        case 'list':
          return salesDocs(client).documentComments.list(args.document_type, args.document_id, {
            limit: args.limit,
            offset: args.offset,
          });
        case 'get':
          return salesDocs(client).documentComments.get(
            args.document_type,
            args.document_id,
            requireArg(args.comment_id, 'comment_id', 'get'),
          );
        case 'create':
          return salesDocs(client).documentComments.create(
            args.document_type,
            args.document_id,
            requireArg(args.payload, 'payload', 'create') as DocumentCommentCreate,
          );
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_document_settings',
    title: 'bexio Document Settings',
    description:
      'Read sales-document configuration. Actions: ' +
      '"list_settings" (per-document-class settings: numbering format, next number, default title, ' +
      'default currency/language/payment type, decimal precision; optional order_by "id" or "text", ' +
      'append "_desc" for descending), ' +
      '"list_templates" (document print templates with slug, name and the document types they are the default for). ' +
      'Read-only.',
    group: 'sales',
    inputSchema: {
      action: z.enum(['list_settings', 'list_templates']).describe('Operation to perform'),
      order_by: z
        .enum(['id', 'text', 'id_desc', 'text_desc'])
        .optional()
        .describe('Sort order for "list_settings": "id" or "text", ascending by default; append "_desc" to sort descending'),
    },
    handler: async (client, args) => {
      switch (args.action) {
        case 'list_settings':
          return salesDocs(client).documentSettings.listSettings({ order_by: args.order_by });
        case 'list_templates':
          return salesDocs(client).documentSettings.listTemplates();
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the sales-docs tools (used by coverage tests). */
export const salesDocsToolOperations = [
  'v2ShowComment',
  'v2ListComments',
  'v2CreateComment',
  'v2DeleteDefaultPosition',
  'v2ShowDefaultPosition',
  'v2EditDefaultPosition',
  'v2ListDefaultPositions',
  'v2CreateDefaultPosition',
  'v2DeleteDiscountPosition',
  'v2ShowDiscountPosition',
  'v2EditDiscountPosition',
  'v2ListDiscountPositions',
  'v2CreateDiscountPosition',
  'v2ListDocumentSettings',
  'v3ListDocumentTemplate',
  'v2DeleteItemPosition',
  'v2ShowItemPosition',
  'v2EditItemPosition',
  'v2ListItemPositions',
  'v2CreateItemPosition',
  'v2DeletePagebreakPosition',
  'v2ShowPagebreakPosition',
  'v2EditPagebreakPosition',
  'v2ListPagebreakPositions',
  'v2CreatePagebreakPosition',
  'v2DeleteSubpositionPosition',
  'v2ShowSubpositionPosition',
  'v2EditSubpositionPosition',
  'v2ListSubpositionPositions',
  'v2CreateSubpositionPosition',
  'v2DeleteSubtotalPosition',
  'v2ShowSubtotalPosition',
  'v2EditSubtotalPosition',
  'v2ListSubtotalPositions',
  'v2CreateSubtotalPosition',
  'v2DeleteTextPosition',
  'v2ShowTextPosition',
  'v2EditTextPosition',
  'v2ListTextPositions',
  'v2CreateTextPosition',
] as const;
