/**
 * MCP tools for the banking domain: bank accounts and bank payments.
 */
import { z } from 'zod';
import { defineTool, requireArg, unknownAction } from '../registry.js';
import type { PaymentCreate, PaymentUpdate } from '../../client/resources/banking.js';

const recipientSchema = z
  .object({
    name: z.string().describe('Name of the account owner (individual or legal entity)'),
    iban: z.string().describe('IBAN according to ISO 13616'),
    address: z.object({
      street_name: z.string(),
      house_number: z.string().nullable(),
      zip: z.string(),
      city: z.string(),
      country_code: z.string().describe('ISO 3166-1 alpha-2 country code'),
    }),
  })
  .describe('Payment recipient');

const paymentPayloadSchema = z
  .object({
    account_id: z.string().describe('UUID of the sender bank account'),
    amount: z.number().describe('Amount in the chosen currency (max 6 decimals)'),
    currency: z.string().describe('ISO 4217 currency code, e.g. "CHF"'),
    execution_date: z.string().describe('ISO 8601 date on which the payment should be executed'),
    is_salary: z.boolean().nullable().describe('Whether this is a salary payment'),
    recipient: recipientSchema,
    type: z.enum(['iban', 'qr']).describe('Payment type; QR payments additionally need qr_reference_nr'),
    allowance: z
      .enum(['fee_paid_by_payer', 'fee_paid_by_payee', 'fee_split', 'no_fee'])
      .optional()
      .describe('Fee handling for cross-border/foreign-currency payments'),
    qr_reference_nr: z.string().optional().describe('QR or creditor (SCOR, "RF…") reference number'),
    additional_information: z.string().optional().describe('Additional information on the payment slip'),
    purchase_reference: z
      .object({ bill_id: z.string().optional(), bill_payment_id: z.string().optional() })
      .optional()
      .describe('Link to a purchase bill/bill payment'),
    is_editing_restricted: z.boolean().optional().describe('Restrict editing to the creating API client'),
    message: z.string().nullable().optional().describe('Multiline payment description'),
  })
  .partial()
  .describe(
    'Payment fields. Required on create: account_id, amount, currency, execution_date, is_salary, recipient, type. ' +
      'account_id, type and purchase_reference are create-only: the update endpoint does not accept them, so they cannot be changed and are ignored on "update".',
  );

/**
 * Payload accepted by the "update" action: the NewUpdatePayment body (spec
 * `UpdatePaymentsRequest`) omits account_id, type and purchase_reference.
 */
const paymentUpdatePayloadSchema = paymentPayloadSchema.omit({
  account_id: true,
  type: true,
  purchase_reference: true,
});

export const bankingTools = [
  defineTool({
    name: 'bexio_bank_accounts',
    title: 'bexio Bank Accounts',
    description:
      'Read bank accounts configured in bexio (name, owner, IBAN, QR-IBAN, currency, linked accounting account). ' +
      'Actions: "list" (all bank accounts, optional limit/offset), "get" (single account by numeric id). Read-only.',
    group: 'banking',
    inputSchema: {
      action: z.enum(['list', 'get']).describe('Operation to perform'),
      id: z.number().int().optional().describe('Bank account id (required for "get")'),
      limit: z.number().int().min(1).max(2000).optional().describe('Max results for "list"'),
      offset: z.number().int().min(0).optional().describe('Results to skip for "list"'),
    },
    handler: async (client, args) => {
      switch (args.action) {
        case 'list':
          return client.banking.listBankAccounts({ limit: args.limit, offset: args.offset });
        case 'get':
          return client.banking.getBankAccount(requireArg(args.id, 'id', 'get'));
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_banking_payments',
    title: 'bexio Bank Payments',
    description:
      'Manage outgoing bank payments (bexio banking 4.0 API). Actions: ' +
      '"list" (optional filter_by expression, page/per_page), ' +
      '"get" (payment by id/uuid), ' +
      '"create" (payload required: account_id, amount, currency, execution_date, is_salary, recipient, type), ' +
      '"update" (id + payload of fields to change; only open payments; account_id, type and purchase_reference cannot be changed), ' +
      '"cancel" (cancel a transmitted/downloaded payment by id — cannot be undone), ' +
      '"delete" (permanently delete a payment by id — cannot be undone). ' +
      'Payment ids are strings (uuid or numeric id).',
    group: 'banking',
    writeActions: ['create', 'update', 'cancel', 'delete'],
    // "cancel" is irreversible but does not destroy data, so per project policy
    // (destructiveActions = irreversible deletions only) it is not destructive.
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'get', 'create', 'update', 'cancel', 'delete']).describe('Operation to perform'),
      id: z.string().optional().describe('Payment id or uuid (required for get/update/cancel/delete)'),
      payload: paymentPayloadSchema.optional(),
      filter_by: z
        .string()
        .optional()
        .describe('Filter expression for "list", e.g. "status_open"; ranges use "_", multiple filters use ";"'),
      page: z.number().int().min(0).optional().describe('Page number for "list"; the first page is 0 (API default)'),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe('Results per page for "list" (default 500, max 2000)'),
    },
    handler: async (client, args) => {
      switch (args.action) {
        case 'list':
          return client.banking.listPayments({
            'filter-by': args.filter_by,
            page: args.page,
            'per-page': args.per_page,
          });
        case 'get':
          return client.banking.getPayment(requireArg(args.id, 'id', 'get'));
        case 'create':
          return client.banking.createPayment(requireArg(args.payload, 'payload', 'create') as PaymentCreate);
        case 'update':
          return client.banking.updatePayment(
            requireArg(args.id, 'id', 'update'),
            // Re-parse through the update schema so create-only fields
            // (account_id, type, purchase_reference) are stripped and never
            // sent to NewUpdatePayment, which does not accept them.
            paymentUpdatePayloadSchema.parse(requireArg(args.payload, 'payload', 'update')) as PaymentUpdate,
          );
        case 'cancel':
          return client.banking.cancelPayment(requireArg(args.id, 'id', 'cancel'));
        case 'delete':
          return client.banking.deletePayment(requireArg(args.id, 'id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the banking tools (used by coverage tests). */
export const bankingToolOperations = [
  'ListBankAccounts',
  'ShowBankAccount',
  'NewFetchAllPayments',
  'NewGetPayment',
  'NewCreatePayment',
  'NewUpdatePayment',
  'NewCancelPayment',
  'NewDeletePayment',
] as const;
