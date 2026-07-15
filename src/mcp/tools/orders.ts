/**
 * MCP tools for the orders domain: sales orders (incl. recurring-order
 * repetitions and derived documents) and delivery notes.
 */
import { z } from 'zod';
import { defineTool, listParamsShape, requireArg, searchCriteriaSchema, unknownAction } from '../registry.js';
import { documentResult } from '../binary.js';
import type {
  CreateFromDocumentPayload,
  DeliveriesApi,
  OrderCreate,
  OrderRepetition,
  OrdersApi,
  OrderUpdate,
} from '../../client/resources/orders.js';

/**
 * Mount points of this domain on BexioClient (`client.orders`, `client.deliveries`),
 * wired in `src/client/index.ts`. Typed locally until the integrator adds the
 * properties to the BexioClient class.
 */
interface OrdersDomainClient {
  orders: OrdersApi;
  deliveries: DeliveriesApi;
}

/** Converts the boolean letterhead argument to the API's 0/1 flag. */
function letterheadFlag(logopaper: boolean | undefined): 0 | 1 | undefined {
  return logopaper === undefined ? undefined : logopaper ? 1 : 0;
}

const positionTypes = [
  'KbPositionArticle',
  'KbPositionCustom',
  'KbPositionText',
  'KbPositionSubposition',
  'KbPositionSubtotal',
  'KbPositionPagebreak',
  'KbPositionDiscount',
] as const;

const orderPayloadSchema = z
  .object({
    document_nr: z
      .string()
      .describe(
        'Document number. Cannot be used if "automatic numbering" is active in the frontend settings; required if it is deactivated',
      ),
    title: z.string().nullable().describe('Document title'),
    contact_id: z
      .number()
      .int()
      .nullable()
      .describe('Id of the contact the order is addressed to (null is only accepted on "update")'),
    contact_sub_id: z.number().int().nullable().describe('Id of the sub-contact (contact person)'),
    user_id: z.number().int().describe('Id of the responsible bexio user'),
    pr_project_id: z.number().int().nullable().describe('Id of the linked project'),
    logopaper_id: z.number().int().describe('(deprecated) Letterhead paper id'),
    language_id: z.number().int().describe('Document language id'),
    bank_account_id: z.number().int().describe('Bank account id shown on the document'),
    currency_id: z.number().int().describe('Currency id'),
    payment_type_id: z.number().int().describe('Payment type id'),
    header: z.string().describe('Header text above the positions'),
    footer: z.string().describe('Footer text below the positions'),
    mwst_type: z
      .union([z.literal(0), z.literal(1), z.literal(2)])
      .describe('Tax mode: 0 = including taxes, 1 = excluding taxes, 2 = exempt from taxes'),
    mwst_is_net: z
      .boolean()
      .describe('Only relevant with mwst_type 0: false = taxes included in total, true = taxes added to total'),
    show_position_taxes: z.boolean().describe('Show tax rate per position on the document'),
    is_valid_from: z.string().describe('Order date (ISO 8601, e.g. "2019-06-24")'),
    contact_address_manual: z
      .string()
      .nullable()
      .describe('Manual contact address; null/absent = use the contact\'s invoice address'),
    delivery_address_type: z
      .union([z.literal(0), z.literal(1)])
      .describe('Delivery address: 0 = use invoice address, 1 = use custom address (delivery_address_manual)'),
    delivery_address_manual: z
      .string()
      .nullable()
      .describe('Manual delivery address, used when delivery_address_type is 1'),
    api_reference: z.string().nullable().describe('Free reference field, only visible via the API'),
    template_slug: z.string().nullable().describe('Document template slug'),
    positions: z
      .array(z.record(z.unknown()))
      .describe(
        'Document positions (create only, max 150 recommended). Each object needs a "type" of ' +
          positionTypes.join('/') +
          ' plus the type-specific fields (e.g. KbPositionCustom: amount, unit_id, account_id, unit_price, tax_id, text)',
      ),
  })
  .partial()
  .describe(
    'Order fields. The API marks no field as strictly required on create, but at least contact_id and user_id are typically needed. ' +
      'Updates cannot change positions (use the document-positions tool).',
  );

const repetitionRuleSchema = z
  .object({
    type: z.enum(['daily', 'weekly', 'monthly', 'yearly']).describe('Repetition format'),
    interval: z.number().int().describe('Repeat every <interval> days/weeks/months/years'),
    weekdays: z
      .array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']))
      .optional()
      .describe('Weekdays on which to repeat (required for type "weekly")'),
    schedule: z
      .enum(['fixed_day', 'week_day', 'first_day', 'last_day'])
      .optional()
      .describe('Monthly schedule mode (required for type "monthly")'),
  })
  .describe('Repetition rule: one of the four formats daily, weekly, monthly or yearly');

const repetitionPayloadSchema = z
  .object({
    start: z.string().describe('Start date of the repetition (ISO 8601)'),
    end: z
      .string()
      .nullable()
      .describe('Date until the repetition runs; null/empty = indefinite repetition'),
    repetition: repetitionRuleSchema,
  })
  .describe('Recurring-order configuration. Required: start, repetition (end may be null for indefinite runs).');

const fromDocumentPositionsSchema = z
  .array(
    z.object({
      id: z.number().int().optional().describe('Id of the source position'),
      type: z.enum(positionTypes).optional().describe('Type of the source position'),
      amount: z.number().optional().describe('Amount to carry over'),
    }),
  )
  .describe('Positions to copy into the new document; omit to copy ALL positions from the order');

export const ordersTools = [
  defineTool({
    name: 'bexio_orders',
    title: 'bexio Orders',
    description:
      'Manage sales orders (kb_order) including recurring-order repetitions and documents derived from an order. Actions: ' +
      '"list" (all orders, optional limit/offset/order_by: id, total, total_net, total_gross, updated_at), ' +
      '"search" (search_criteria required; supported fields: id, kb_item_status_id (5 Pending, 6 Done, 15 Partial, 21 Canceled), document_nr, title, contact_id, contact_sub_id, user_id, currency_id, total_gross, total_net, total, is_valid_from, is_valid_to, updated_at), ' +
      '"get" (order by id, includes positions), ' +
      '"create" (payload; no field is formally required but usually at least contact_id and user_id; positions may be included), ' +
      '"update" (id + payload of fields to change; positions cannot be updated here), ' +
      '"delete" (permanently delete the order by id — cannot be undone), ' +
      '"pdf" (render the order as PDF; optional logopaper for letterhead, optional save_path to write to disk), ' +
      '"get_repetition" (show the recurring-order configuration), ' +
      '"edit_repetition" (id + repetition payload: start, optional end, repetition rule of type daily/weekly/monthly/yearly), ' +
      '"delete_repetition" (stop the recurring order — cannot be undone), ' +
      '"create_delivery" (create a delivery note from the order; optional positions array, omit to copy all positions), ' +
      '"create_invoice" (create an invoice from the order; optional positions array, omit to copy all positions).',
    group: 'sales',
    writeActions: [
      'create',
      'update',
      'delete',
      'edit_repetition',
      'delete_repetition',
      'create_delivery',
      'create_invoice',
    ],
    destructiveActions: ['delete', 'delete_repetition'],
    inputSchema: {
      action: z
        .enum([
          'list',
          'search',
          'get',
          'create',
          'update',
          'delete',
          'pdf',
          'get_repetition',
          'edit_repetition',
          'delete_repetition',
          'create_delivery',
          'create_invoice',
        ])
        .describe('Operation to perform'),
      id: z
        .number()
        .int()
        .optional()
        .describe('Order id (required for every action except "list", "search" and "create")'),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
      payload: orderPayloadSchema.optional(),
      repetition: repetitionPayloadSchema.optional(),
      positions: fromDocumentPositionsSchema.optional(),
      logopaper: z.boolean().optional().describe('For "pdf": render the PDF on the letterhead paper'),
      save_path: z
        .string()
        .optional()
        .describe('For "pdf": write the PDF to this file path instead of returning base64 inline'),
    },
    handler: async (client, args) => {
      const { orders } = client as unknown as OrdersDomainClient;
      const listParams = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return orders.list(listParams);
        case 'search':
          return orders.search(requireArg(args.search_criteria, 'search_criteria', 'search'), listParams);
        case 'get':
          return orders.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return orders.create(requireArg(args.payload, 'payload', 'create') as OrderCreate);
        case 'update':
          return orders.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as OrderUpdate,
          );
        case 'delete':
          return orders.delete(requireArg(args.id, 'id', 'delete'));
        case 'pdf': {
          const file = await orders.pdf(requireArg(args.id, 'id', 'pdf'), letterheadFlag(args.logopaper));
          return documentResult({ name: file.name, mime: file.mime, base64: file.content }, args.save_path);
        }
        case 'get_repetition':
          return orders.getRepetition(requireArg(args.id, 'id', 'get_repetition'));
        case 'edit_repetition':
          return orders.editRepetition(
            requireArg(args.id, 'id', 'edit_repetition'),
            requireArg(args.repetition, 'repetition', 'edit_repetition') as OrderRepetition,
          );
        case 'delete_repetition':
          return orders.deleteRepetition(requireArg(args.id, 'id', 'delete_repetition'));
        case 'create_delivery':
          return orders.createDelivery(
            requireArg(args.id, 'id', 'create_delivery'),
            { positions: args.positions } as CreateFromDocumentPayload,
          );
        case 'create_invoice':
          return orders.createInvoice(
            requireArg(args.id, 'id', 'create_invoice'),
            { positions: args.positions } as CreateFromDocumentPayload,
          );
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_deliveries',
    title: 'bexio Deliveries',
    description:
      'Read and issue delivery notes (kb_delivery). Deliveries are created from orders (use bexio_orders action "create_delivery"). Actions: ' +
      '"list" (all deliveries, optional limit/offset/order_by: id, total, total_net, total_gross, updated_at), ' +
      '"get" (delivery by id, includes positions), ' +
      '"issue" (issue a draft delivery by id — moves it from Draft (status 10) to Done (18); this finalizes the delivery note and adjusts stock when stock management is active).',
    group: 'sales',
    writeActions: ['issue'],
    inputSchema: {
      action: z.enum(['list', 'get', 'issue']).describe('Operation to perform'),
      id: z.number().int().optional().describe('Delivery id (required for "get" and "issue")'),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const { deliveries } = client as unknown as OrdersDomainClient;
      switch (args.action) {
        case 'list':
          return deliveries.list({ limit: args.limit, offset: args.offset, order_by: args.order_by });
        case 'get':
          return deliveries.get(requireArg(args.id, 'id', 'get'));
        case 'issue':
          return deliveries.issue(requireArg(args.id, 'id', 'issue'));
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the orders tools (used by coverage tests). */
export const ordersToolOperations = [
  'v2ListOrders',
  'v2SearchOrders',
  'v2ShowOrder',
  'v2CreateOrder',
  'v2EditOrder',
  'DeleteOrder',
  'v2ShowOrderPDF',
  'v2ShowOrderRepetition',
  'v2EditOrderRepetition',
  'DeleteOrderRepetition',
  'v2CreateDeliveryFromOrder',
  'v2CreateInvoiceFromOrder',
  'v2ListDeliveries',
  'v2ShowDelivery',
  'v2IssueDelivery',
] as const;
