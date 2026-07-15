/**
 * MCP tools for accounting entries: currencies and manual entries.
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { defineTool, requireArg, unknownAction, InvalidToolArgumentsError } from '../registry.js';
import { documentResult } from '../binary.js';
import type { BexioClient } from '../../client/index.js';
import {
  CurrenciesApi,
  ManualEntriesApi,
  type CurrencyCreate,
  type CurrencyUpdate,
  type ManualEntryCreate,
  type ManualEntryUpdate,
} from '../../client/resources/accounting-entries.js';

/**
 * Accessors for the domain APIs: use the instances mounted on {@link BexioClient}
 * (`client.currencies`, `client.manualEntries`) when present, falling back to
 * ad-hoc instances so this module also typechecks before the client index is wired.
 */
function currenciesApi(client: BexioClient): CurrenciesApi {
  const mounted = (client as BexioClient & { currencies?: CurrenciesApi }).currencies;
  return mounted ?? new CurrenciesApi(client.http);
}

function manualEntriesApi(client: BexioClient): ManualEntriesApi {
  const mounted = (client as BexioClient & { manualEntries?: ManualEntriesApi }).manualEntries;
  return mounted ?? new ManualEntriesApi(client.http);
}

const currencyPayloadSchema = z
  .object({
    name: z.string().max(80).describe('Currency name in ISO 4217 format (e.g. "CHF"); must be unique'),
    round_factor: z
      .number()
      .describe('Round factor of the currency, e.g. 0.05 to round CHF to 5 Rp.'),
  })
  .partial()
  .describe(
    'Currency fields. Required on create: name, round_factor. Update (PATCH) can only change round_factor.',
  );

const manualEntryLineSchema = z
  .object({
    debit_account_id: z.number().int().optional().describe('Id of the debit account (references an account object)'),
    credit_account_id: z.number().int().optional().describe('Id of the credit account (references an account object)'),
    tax_id: z.number().int().optional().describe('References a tax object'),
    tax_account_id: z
      .number()
      .int()
      .optional()
      .describe('Id of the debit or credit account the tax is applied to (references an account object)'),
    description: z.string().max(255).optional().describe('Description of the entry line'),
    amount: z.number().optional().describe('Total amount of the entry (max 6 decimals)'),
    currency_id: z.number().int().optional().describe('References a currency object'),
    currency_factor: z
      .number()
      .optional()
      .describe('Exchange factor between currency_id and the base currency; 1 when they are identical'),
    id: z.number().optional().describe('Id of an existing entry line (only when updating)'),
  })
  .describe('One booking line of the manual entry');

const manualEntryPayloadSchema = z
  .object({
    type: z
      .enum(['manual_single_entry', 'manual_compound_entry', 'manual_group_entry'])
      .describe(
        'Booking type: manual_single_entry (simple one-line booking), manual_compound_entry ' +
          '(total amount distributed among multiple accounts), manual_group_entry (group of ' +
          'independent single entries sharing one reference number)',
      ),
    date: z.string().describe('The booking date (ISO 8601, e.g. "2019-11-17")'),
    reference_nr: z.string().max(80).describe('A reference number for the booking'),
    entries: z.array(manualEntryLineSchema).describe('The booking lines'),
    id: z.number().optional().describe('Id of the manual entry (only when updating)'),
  })
  .partial()
  .describe('Manual entry fields. Required on create and update (PUT sends the full entry): type, date, entries.');

export const accountingEntriesTools = [
  defineTool({
    name: 'bexio_currencies',
    title: 'bexio Currencies',
    description:
      'Manage currencies and read their exchange rates (bexio 3.0 API). Actions: ' +
      '"list" (all currencies; optional limit/offset, embed — e.g. "exchange_rate" to include rate fields — and date for the rate validity date), ' +
      '"get" (currency by numeric id), ' +
      '"create" (payload required: name in ISO 4217 format like "CHF", round_factor), ' +
      '"update" (id + payload; PATCH — only round_factor can be changed), ' +
      '"delete" (permanently delete a currency by id — cannot be undone), ' +
      '"list_codes" (all available currency codes such as CHF, EUR), ' +
      '"list_exchange_rates" (configured exchange rates of a currency by id; optional date for the validity date).',
    group: 'accounting',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum(['list', 'get', 'create', 'update', 'delete', 'list_codes', 'list_exchange_rates'])
        .describe('Operation to perform'),
      id: z.number().int().optional().describe('Currency id (required for get/update/delete/list_exchange_rates)'),
      payload: currencyPayloadSchema.optional(),
      limit: z.number().int().min(1).max(2000).optional().describe('Max results for "list"'),
      offset: z.number().int().min(0).optional().describe('Results to skip for "list"'),
      embed: z
        .string()
        .optional()
        .describe('For "list": embed related resources, e.g. "exchange_rate" to include exchange rate fields'),
      date: z
        .string()
        .optional()
        .describe('Validity date (ISO 8601) for fetched exchange rates ("list" with embed, "list_exchange_rates")'),
    },
    handler: async (client, args) => {
      const currencies = currenciesApi(client);
      switch (args.action) {
        case 'list':
          return currencies.list({ limit: args.limit, offset: args.offset, embed: args.embed, date: args.date });
        case 'get':
          return currencies.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return currencies.create(requireArg(args.payload, 'payload', 'create') as CurrencyCreate);
        case 'update':
          return currencies.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as CurrencyUpdate,
          );
        case 'delete':
          return currencies.delete(requireArg(args.id, 'id', 'delete'));
        case 'list_codes':
          return currencies.listCodes();
        case 'list_exchange_rates':
          return currencies.listExchangeRates(requireArg(args.id, 'id', 'list_exchange_rates'), {
            date: args.date,
          });
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_manual_entries',
    title: 'bexio Manual Entries',
    description:
      'Manage manual accounting entries (bookings) and their attached files (bexio accounting 3.0 API). Actions: ' +
      '"list" (all manual entries; optional limit/offset), ' +
      '"create" (payload required: type — manual_single_entry/manual_compound_entry/manual_group_entry —, date, entries array with debit_account_id, credit_account_id, tax_id, tax_account_id, description, amount, currency_id, currency_factor), ' +
      '"update" (id + payload; PUT replaces the entry, so send type, date and the full entries array; locked entries — is_locked=true — cannot be edited), ' +
      '"delete" (permanently delete a manual entry by id — cannot be undone), ' +
      '"next_reference_number" (reference number suggested for the next manual entry). ' +
      'File actions cover BOTH scopes: with entry_id they target a single entry LINE (types manual_single_entry/manual_group_entry); ' +
      'without entry_id they target the COMPOUND entry itself (type manual_compound_entry). ' +
      '"list_files" (id, optional entry_id, optional limit/offset), ' +
      '"get_file" (id + file_id, optional entry_id; returns the file content — pass save_path to write it to disk instead of returning base64 inline), ' +
      '"add_file" (id, optional entry_id, plus file_path OR content_base64 + file_name; uploads multipart/form-data, max 12MB, formats PNG/JPG/JPEG/GIF/DOC/DOCX/XLS/XLSX/PPT/PPTX/PDF), ' +
      '"delete_file" (id + file_id, optional entry_id; removes the connection between file and entry — cannot be undone).',
    group: 'accounting',
    writeActions: ['create', 'update', 'delete', 'add_file', 'delete_file'],
    destructiveActions: ['delete', 'delete_file'],
    inputSchema: {
      action: z
        .enum([
          'list',
          'create',
          'update',
          'delete',
          'next_reference_number',
          'list_files',
          'get_file',
          'add_file',
          'delete_file',
        ])
        .describe('Operation to perform'),
      id: z
        .number()
        .int()
        .optional()
        .describe('Manual entry id (required for update/delete and all *_file actions)'),
      entry_id: z
        .number()
        .int()
        .optional()
        .describe(
          'Id of a single entry LINE within the manual entry. Provide it for *_file actions on entry lines ' +
            '(manual_single_entry/manual_group_entry); omit it to address files of a manual_compound_entry.',
        ),
      file_id: z.number().int().optional().describe('File id (required for get_file/delete_file)'),
      payload: manualEntryPayloadSchema.optional(),
      limit: z.number().int().min(1).max(2000).optional().describe('Max results for "list"/"list_files"'),
      offset: z.number().int().min(0).optional().describe('Results to skip for "list"/"list_files"'),
      file_path: z.string().optional().describe('For "add_file": path of a local file to upload'),
      content_base64: z
        .string()
        .optional()
        .describe('For "add_file": base64-encoded file content (alternative to file_path; requires file_name)'),
      file_name: z
        .string()
        .optional()
        .describe('For "add_file": file name to upload as (defaults to the basename of file_path)'),
      save_path: z
        .string()
        .optional()
        .describe('For "get_file": write the file to this path instead of returning base64 content inline'),
    },
    handler: async (client, args) => {
      const manualEntries = manualEntriesApi(client);
      switch (args.action) {
        case 'list':
          return manualEntries.list({ limit: args.limit, offset: args.offset });
        case 'create':
          return manualEntries.create(requireArg(args.payload, 'payload', 'create') as ManualEntryCreate);
        case 'update':
          return manualEntries.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as ManualEntryUpdate,
          );
        case 'delete':
          return manualEntries.delete(requireArg(args.id, 'id', 'delete'));
        case 'next_reference_number':
          return manualEntries.getNextReferenceNumber();
        case 'list_files': {
          const id = requireArg(args.id, 'id', 'list_files');
          const params = { limit: args.limit, offset: args.offset };
          return args.entry_id !== undefined
            ? manualEntries.listEntryFiles(id, args.entry_id, params)
            : manualEntries.listCompoundEntryFiles(id, params);
        }
        case 'get_file': {
          const id = requireArg(args.id, 'id', 'get_file');
          const fileId = requireArg(args.file_id, 'file_id', 'get_file');
          const file =
            args.entry_id !== undefined
              ? await manualEntries.getEntryFile(id, args.entry_id, fileId)
              : await manualEntries.getCompoundEntryFile(id, fileId);
          const name =
            file.name !== undefined && file.extension !== undefined && !file.name.endsWith(`.${file.extension}`)
              ? `${file.name}.${file.extension}`
              : file.name;
          return documentResult({ name, mime: file.mime_type, base64: file.data }, args.save_path);
        }
        case 'add_file': {
          const id = requireArg(args.id, 'id', 'add_file');
          const form = await buildUploadForm(args.file_path, args.content_base64, args.file_name);
          return args.entry_id !== undefined
            ? manualEntries.uploadEntryFile(id, args.entry_id, form)
            : manualEntries.uploadCompoundEntryFile(id, form);
        }
        case 'delete_file': {
          const id = requireArg(args.id, 'id', 'delete_file');
          const fileId = requireArg(args.file_id, 'file_id', 'delete_file');
          return args.entry_id !== undefined
            ? manualEntries.deleteEntryFile(id, args.entry_id, fileId)
            : manualEntries.deleteCompoundEntryFile(id, fileId);
        }
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Builds the multipart body for "add_file" from a local path or inline base64 content. */
async function buildUploadForm(
  filePath: string | undefined,
  contentBase64: string | undefined,
  fileName: string | undefined,
): Promise<FormData> {
  let bytes: Buffer;
  let name: string;
  if (filePath !== undefined) {
    bytes = await readFile(filePath);
    name = fileName ?? basename(filePath);
  } else if (contentBase64 !== undefined) {
    bytes = Buffer.from(contentBase64, 'base64');
    name = requireArg(fileName, 'file_name', 'add_file');
  } else {
    throw new InvalidToolArgumentsError('Action "add_file" requires either "file_path" or "content_base64".');
  }
  const form = new FormData();
  form.append('fileName', new Blob([new Uint8Array(bytes)]), name);
  return form;
}

/** Operation IDs covered by the accounting-entries tools (used by coverage tests). */
export const accountingEntriesToolOperations = [
  'ListCurrencies',
  'CreateCurrency',
  'ShowCurrency',
  'UpdateCurrency',
  'DeleteCurrency',
  'ListCurrenciesCodes',
  'ListExchangeRatesForCurrency',
  'ListManualEntries',
  'CreateManualEntry',
  'UpdateManualEntry',
  'DeleteManualEntry',
  'GetNextReferenceNumber',
  'ListManualEntryFiles',
  'ShowManualEntryFile',
  'UploadManualEntryFile',
  'DeleteManualEntryFile',
  'ListManualCompoundEntryFiles',
  'ShowManualCompoundEntryFile',
  'UploadManualCompoundEntryFile',
  'DeleteManualCompoundEntryFile',
] as const;
