/**
 * MCP tools for the items domain: items (articles), stock locations and stock areas.
 */
import { z } from 'zod';
import { defineTool, listParamsShape, requireArg, searchCriteriaSchema, unknownAction } from '../registry.js';
import { ItemsApi, StockApi, type ItemCreate, type ItemUpdate } from '../../client/resources/items.js';
import type { BexioClient } from '../../client/index.js';

/** Resolves the mounted resource APIs (falls back to fresh instances until BexioClient wiring lands). */
function itemsApi(client: BexioClient): ItemsApi {
  return (client as BexioClient & { items?: ItemsApi }).items ?? new ItemsApi(client.http);
}

function stockApi(client: BexioClient): StockApi {
  return (client as BexioClient & { stock?: StockApi }).stock ?? new StockApi(client.http);
}

const itemPayloadSchema = z
  .object({
    user_id: z.number().int().describe('References a user object (currently has no impact)'),
    article_type_id: z.number().int().describe('1 for physical products, 2 for services'),
    contact_id: z.number().int().nullable().describe('References a contact object (e.g. the supplier)'),
    deliverer_code: z.string().nullable().describe('Article code used by the deliverer/supplier'),
    deliverer_name: z.string().nullable().describe('Article name used by the deliverer/supplier'),
    deliverer_description: z.string().nullable().describe('Article description used by the deliverer/supplier'),
    intern_code: z.string().describe('Internal article code/number'),
    intern_name: z.string().describe('Internal article name (required on create)'),
    intern_description: z.string().nullable().describe('Internal article description'),
    purchase_price: z.string().nullable().describe('Purchase price as decimal string, e.g. "10.50"'),
    sale_price: z.string().nullable().describe('Sale price as decimal string, e.g. "25.00"'),
    purchase_total: z.number().nullable().describe('Total purchase value'),
    sale_total: z.number().nullable().describe('Total sale value'),
    currency_id: z.number().int().nullable().describe('References a currency object'),
    tax_income_id: z.number().int().nullable().describe('References a tax object for income'),
    tax_expense_id: z.number().int().nullable().describe('References a tax object for expenses'),
    unit_id: z.number().int().nullable().describe('References a unit object'),
    is_stock: z.boolean().describe('Whether stock is managed for this item (requires stock_edit scope)'),
    stock_id: z.number().int().nullable().describe('References a stock location object'),
    stock_place_id: z.number().int().nullable().describe('References a stock area object'),
    stock_nr: z
      .number()
      .int()
      .describe('Stock quantity; can only be set if no bookings for this product exist yet'),
    stock_min_nr: z.number().int().describe('Minimum stock quantity'),
    width: z.number().int().nullable().describe('Width'),
    height: z.number().int().nullable().describe('Height'),
    weight: z.number().int().nullable().describe('Weight'),
    volume: z.number().int().nullable().describe('Volume'),
    html_text: z.string().nullable().describe('HTML description text'),
    remarks: z.string().nullable().describe('Internal remarks'),
    delivery_price: z.number().nullable().describe('Delivery price'),
    article_group_id: z.number().int().nullable().describe('References an article group'),
    account_id: z.number().int().nullable().describe('References an (income) account object'),
    expense_account_id: z.number().int().nullable().describe('References an expense account object'),
  })
  .partial()
  .describe(
    'Item (article) fields. Required on create: intern_name. Read-only fields (id, tax_id, stock counters) cannot be sent.',
  );

export const itemsTools = [
  defineTool({
    name: 'bexio_items',
    title: 'bexio Items',
    description:
      'Manage items/products (called "articles" in the bexio API): physical products and services with internal ' +
      'code/name, purchase & sale prices, taxes, units and stock information. Actions: ' +
      '"list" (all items, optional limit/offset/order_by; order by "id" or "intern_name"), ' +
      '"search" (search_criteria required; searchable fields include intern_name, intern_code, id — ' +
      'conditions are AND-combined, default operator "like"), ' +
      '"get" (single item by numeric id), ' +
      '"create" (payload required; intern_name is mandatory, set article_type_id 1 for products / 2 for services), ' +
      '"update" (id + payload with the fields to change), ' +
      '"delete" (permanently delete an item by id — cannot be undone).',
    group: 'items',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'search', 'get', 'create', 'update', 'delete']).describe('Operation to perform'),
      id: z.number().int().optional().describe('Item id (required for get/update/delete)'),
      payload: itemPayloadSchema.optional().describe('Item fields (required for create/update)'),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const api = itemsApi(client);
      const params = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return api.listItems(params);
        case 'search':
          return api.searchItems(requireArg(args.search_criteria, 'search_criteria', 'search'), params);
        case 'get':
          return api.getItem(requireArg(args.id, 'id', 'get'));
        case 'create':
          return api.createItem(requireArg(args.payload, 'payload', 'create') as ItemCreate);
        case 'update':
          return api.updateItem(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as ItemUpdate,
          );
        case 'delete':
          return api.deleteItem(requireArg(args.id, 'id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_stock',
    title: 'bexio Stock Locations & Areas',
    description:
      'Read stock locations and stock areas (both are simple id/name records; items reference them via stock_id ' +
      'and stock_place_id). All actions require the stock_edit scope. Actions: ' +
      '"list_locations" (all stock locations, optional limit/offset/order_by; order by "id" or "name"), ' +
      '"search_locations" (search_criteria required; searchable fields: name, id), ' +
      '"list_areas" (all stock areas, optional limit/offset/order_by; order by "id" or "name"), ' +
      '"search_areas" (search_criteria required; searchable fields: name, id). Read-only.',
    group: 'items',
    inputSchema: {
      action: z
        .enum(['list_locations', 'search_locations', 'list_areas', 'search_areas'])
        .describe('Operation to perform'),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const api = stockApi(client);
      const params = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list_locations':
          return api.listStockLocations(params);
        case 'search_locations':
          return api.searchStockLocations(
            requireArg(args.search_criteria, 'search_criteria', 'search_locations'),
            params,
          );
        case 'list_areas':
          return api.listStockAreas(params);
        case 'search_areas':
          return api.searchStockAreas(
            requireArg(args.search_criteria, 'search_criteria', 'search_areas'),
            params,
          );
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the items tools (used by coverage tests). */
export const itemsToolOperations = [
  'v2ListItems',
  'v2SearchItems',
  'v2ShowItem',
  'v2CreateItem',
  'v2EditItem',
  'DeleteItem',
  'v2ListStockLocations',
  'v2SearchStockLocations',
  'v2ListStockAreas',
  'v2SearchStockAreas',
] as const;
