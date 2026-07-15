/**
 * MCP tools for the core accounting domain: accounts, account groups, calendar
 * years, business years, vat periods, taxes and the accounting journal.
 */
import { z } from 'zod';
import {
  defineTool,
  InvalidToolArgumentsError,
  listParamsShape,
  requireArg,
  searchCriteriaSchema,
  unknownAction,
} from '../registry.js';
import type { BexioClient } from '../../client/index.js';
import type { AccountingApi, CalendarYearCreate } from '../../client/resources/accounting-core.js';

/**
 * Typed access to `client.accounting`. The mount point is added to
 * {@link BexioClient} by the integrator (client/index.ts); the cast keeps this
 * module compilable standalone until then.
 */
function accountingApi(client: BexioClient): AccountingApi {
  return (client as BexioClient & { accounting: AccountingApi }).accounting;
}

const calendarYearPayloadSchema = z
  .object({
    year: z
      .string()
      .describe(
        'The year to create, e.g. "2026". Up to 10 years ahead, must be higher than 2016; ' +
          'creating a future year also generates all years in between',
      ),
    is_vat_subject: z.boolean().describe('Whether the calendar year is VAT subjected'),
    is_annual_reporting: z.boolean().describe('Whether the calendar year has annual reporting enabled'),
    vat_accounting_method: z.enum(['effective', 'net_tax']).describe('VAT accounting method'),
    vat_accounting_type: z.enum(['agreed', 'collected']).describe('VAT accounting type'),
    default_tax_income_id: z.number().int().describe('Default tax id for income (references a tax)'),
    default_tax_expense_id: z
      .number()
      .int()
      .describe('Default tax id for expense (not required on the bexio mini plan; references a tax)'),
  })
  .partial()
  .describe('Calendar year fields for "create". All fields are optional per the API schema.');

function invalidCombination(resource: string, action: string): never {
  throw new InvalidToolArgumentsError(
    `Action "${action}" is not supported for resource "${resource}". See the tool description for valid combinations.`,
  );
}

export const accountingCoreTools = [
  defineTool({
    name: 'bexio_accounting',
    title: 'bexio Accounting',
    description:
      'Access the bexio accounting foundation: chart of accounts, account groups, calendar/business years, ' +
      'VAT periods, taxes and the accounting journal. Select a "resource" and an "action". ' +
      'Valid combinations: ' +
      'accounts: "list", "search" (search_criteria required; searchable fields: account_no, name, account_type, fibu_account_group_id); ' +
      'account_groups: "list"; ' +
      'calendar_years: "list", "search" (searchable fields: start, end, is_vat_subject, vat_accounting_method, vat_accounting_type), ' +
      '"get" (id), "create" (payload; useful fields: year, is_vat_subject, is_annual_reporting, vat_accounting_method, ' +
      'vat_accounting_type, default_tax_income_id, default_tax_expense_id — creating a future year generates all years in between and returns them as an array); ' +
      'business_years: "list", "get" (id); ' +
      'vat_periods: "list", "get" (id); ' +
      'taxes: "list" (optional filters scope=active|inactive, date=validity date, types=sales_tax|pre_tax), "get" (id), ' +
      '"delete" (id — permanently deletes the tax, cannot be undone); ' +
      'journal: "list" (optional from/to date range and account_uuid filters; requires the "accounting" API scope). ' +
      'All "list" and "search" actions accept limit/offset pagination.',
    group: 'accounting',
    writeActions: ['create', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      resource: z
        .enum(['accounts', 'account_groups', 'calendar_years', 'business_years', 'vat_periods', 'taxes', 'journal'])
        .describe('Accounting resource to operate on'),
      action: z
        .enum(['list', 'search', 'get', 'create', 'delete'])
        .describe('Operation to perform (see description for valid resource/action combinations)'),
      id: z.number().int().optional().describe('Resource id (required for "get" and "delete")'),
      search_criteria: searchCriteriaSchema.optional(),
      payload: calendarYearPayloadSchema.optional(),
      limit: listParamsShape.limit,
      offset: listParamsShape.offset,
      from: z.string().optional().describe('journal only: include entries on/after this ISO 8601 date'),
      to: z.string().optional().describe('journal only: include entries until this ISO 8601 date'),
      account_uuid: z.string().optional().describe('journal only: only entries of the account with this uuid'),
      scope: z.enum(['active', 'inactive']).optional().describe('taxes list only: filter active or inactive taxes'),
      date: z.string().optional().describe('taxes list only: show taxes active at this ISO 8601 date'),
      types: z.enum(['sales_tax', 'pre_tax']).optional().describe('taxes list only: filter by tax type'),
    },
    handler: async (client, args) => {
      const { resource, action } = args;
      const accounting = accountingApi(client);
      const pagination = { limit: args.limit, offset: args.offset };
      switch (resource) {
        case 'accounts':
          switch (action) {
            case 'list':
              return accounting.listAccounts(pagination);
            case 'search':
              return accounting.searchAccounts(
                requireArg(args.search_criteria, 'search_criteria', 'search'),
                pagination,
              );
            default:
              return invalidCombination(resource, action);
          }
        case 'account_groups':
          switch (action) {
            case 'list':
              return accounting.listAccountGroups(pagination);
            default:
              return invalidCombination(resource, action);
          }
        case 'calendar_years':
          switch (action) {
            case 'list':
              return accounting.listCalendarYears(pagination);
            case 'search':
              return accounting.searchCalendarYears(
                requireArg(args.search_criteria, 'search_criteria', 'search'),
                pagination,
              );
            case 'get':
              return accounting.getCalendarYear(requireArg(args.id, 'id', 'get'));
            case 'create':
              return accounting.createCalendarYear(
                requireArg(args.payload, 'payload', 'create') as CalendarYearCreate,
              );
            default:
              return invalidCombination(resource, action);
          }
        case 'business_years':
          switch (action) {
            case 'list':
              return accounting.listBusinessYears(pagination);
            case 'get':
              return accounting.getBusinessYear(requireArg(args.id, 'id', 'get'));
            default:
              return invalidCombination(resource, action);
          }
        case 'vat_periods':
          switch (action) {
            case 'list':
              return accounting.listVatPeriods(pagination);
            case 'get':
              return accounting.getVatPeriod(requireArg(args.id, 'id', 'get'));
            default:
              return invalidCombination(resource, action);
          }
        case 'taxes':
          switch (action) {
            case 'list':
              return accounting.listTaxes({
                scope: args.scope,
                date: args.date,
                types: args.types,
                ...pagination,
              });
            case 'get':
              return accounting.getTax(requireArg(args.id, 'id', 'get'));
            case 'delete':
              return accounting.deleteTax(requireArg(args.id, 'id', 'delete'));
            default:
              return invalidCombination(resource, action);
          }
        case 'journal':
          switch (action) {
            case 'list':
              return accounting.listJournalEntries({
                from: args.from,
                to: args.to,
                account_uuid: args.account_uuid,
                ...pagination,
              });
            default:
              return invalidCombination(resource, action);
          }
        default:
          return unknownAction(resource);
      }
    },
  }),
];

/** Operation IDs covered by the accounting-core tools (used by coverage tests). */
export const accountingCoreToolOperations = [
  'v2ListAccounts',
  'v2SearchAccounts',
  'v2ListAccountGroups',
  'ListCalendarYears',
  'ShowCalendarYear',
  'CreateCalendarYear',
  'SearchCalendarYears',
  'ListBusinessYears',
  'ShowBusinessYear',
  'ListVatPeriods',
  'ShowVatPeriod',
  'ListTaxes',
  'ShowTax',
  'DeleteTax',
  'ListJournalEntries',
] as const;
