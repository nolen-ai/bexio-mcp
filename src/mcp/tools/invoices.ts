/**
 * MCP tools for the invoices domain: invoices, invoice payments and invoice reminders.
 */
import { z } from 'zod';
import { defineTool, requireArg, searchCriteriaSchema, listParamsShape, unknownAction } from '../registry.js';
import { documentResult } from '../binary.js';
import type { BexioClient } from '../../client/index.js';
import {
  InvoicesApi,
  type InvoiceCopy,
  type InvoiceCreate,
  type InvoicePaymentCreate,
  type InvoiceUpdate,
} from '../../client/resources/invoices.js';

/**
 * Returns the InvoicesApi. The integrator mounts it at `client.invoices`;
 * until then (and as a safety net) an instance is created on the shared transport.
 */
function invoicesApi(client: BexioClient): InvoicesApi {
  const mounted = (client as BexioClient & { invoices?: InvoicesApi }).invoices;
  return mounted ?? new InvoicesApi(client.http);
}

/** Converts the boolean letterhead argument to the API's 0/1 flag. */
function letterheadFlag(logopaper: boolean | undefined): 0 | 1 | undefined {
  return logopaper === undefined ? undefined : logopaper ? 1 : 0;
}

// Note: the v2CreateInvoice positions anyOf defines exactly these six variants
// (custom, article, text, subtotal, pagebreak, discount) — unlike quotes/orders,
// there is no Subposition variant for inline invoice creation, so
// 'KbPositionSubposition' is deliberately absent; use bexio_document_positions
// to add subpositions to an existing invoice.
const positionSchema = z
  .object({
    type: z
      .enum([
        'KbPositionCustom',
        'KbPositionArticle',
        'KbPositionText',
        'KbPositionSubtotal',
        'KbPositionPagebreak',
        'KbPositionDiscount',
      ])
      .describe('Position type; different types can be mixed in one positions array'),
    amount: z.string().describe('Quantity (custom/article positions), e.g. "1"'),
    unit_id: z.number().int().nullable().describe('Unit id (custom/article positions)'),
    account_id: z.number().int().describe('Accounting account id (custom/article positions)'),
    tax_id: z.number().int().describe('Tax id (custom/article positions)'),
    text: z.string().describe('Position text/description (custom/article/text positions)'),
    unit_price: z.string().describe('Price per unit (custom/article positions), max 6 decimals'),
    discount_in_percent: z.string().describe('Per-position discount in percent (custom/article positions)'),
    article_id: z.number().int().describe('Item id (article positions)'),
    value: z.string().describe('Discount value (discount positions)'),
    is_percentual: z.boolean().describe('Whether the discount value is a percentage (discount positions)'),
    show_pos_nr: z.boolean().describe('Print the position number on the document'),
  })
  .partial()
  .passthrough()
  .describe(
    'Polymorphic document position; extra fields of the concrete type are passed through. ' +
      'bexio recommends at most 150 positions per create call.',
  );

const invoicePayloadSchema = z
  .object({
    document_nr: z
      .string()
      .describe('Document number; only allowed (and then required) when automatic numbering is deactivated'),
    title: z.string().nullable().describe('Invoice title'),
    contact_id: z.number().int().nullable().describe('Contact id the invoice is addressed to'),
    contact_sub_id: z.number().int().nullable().describe('Sub-contact id'),
    user_id: z.number().int().describe('bexio user id owning the document'),
    pr_project_id: z.number().int().nullable().describe('Project id to link the invoice to'),
    logopaper_id: z.number().int().describe('(deprecated) Logopaper id'),
    language_id: z.number().int().describe('Language id'),
    bank_account_id: z.number().int().describe('Bank account id shown on the invoice'),
    currency_id: z.number().int().describe('Currency id'),
    payment_type_id: z.number().int().describe('Payment type id'),
    header: z.string().describe('Header text above the positions'),
    footer: z.string().describe('Footer text below the positions'),
    mwst_type: z
      .union([z.literal(0), z.literal(1), z.literal(2)])
      .describe('Tax mode: 0 = including taxes, 1 = excluding taxes, 2 = exempt from taxes'),
    mwst_is_net: z
      .boolean()
      .describe('With mwst_type 0: false = taxes included in total, true = taxes added to total'),
    show_position_taxes: z.boolean().describe('Show taxes per position on the document'),
    is_valid_from: z.string().describe('Invoice date (ISO 8601)'),
    is_valid_to: z.string().describe('Due date (ISO 8601)'),
    contact_address_manual: z
      .string()
      .nullable()
      .describe('Manual contact address; when omitted/null the invoice address of the contact is used'),
    reference: z.string().nullable().describe('Reference text'),
    api_reference: z.string().nullable().describe('API-only reference to external systems'),
    template_slug: z.string().nullable().describe('Document template slug'),
    positions: z.array(positionSchema).describe('Document positions (create only; mixable position types)'),
  })
  .partial()
  .describe(
    'Invoice fields. The API marks no field as strictly required, but create typically needs ' +
      'user_id plus contact_id (or contact_address_manual). "positions" is only used by "create".',
  );

const invoiceCopySchema = z
  .object({
    contact_id: z.number().int().nullable().describe('Contact id for the new invoice (required)'),
    contact_sub_id: z.number().int().nullable().optional().describe('Sub-contact id'),
    is_valid_from: z.string().optional().describe('Invoice date of the copy (ISO 8601)'),
    title: z.string().nullable().optional().describe('Title of the copy'),
  })
  .describe('Copy parameters. Required: contact_id.');

const invoiceEmailSchema = z
  .object({
    recipient_email: z
      .string()
      .describe('Recipient email address (during the bexio trial period limited to the account owner address)'),
    subject: z.string().describe('Email subject'),
    message: z.string().describe('Email body; must contain the placeholder "[Network Link]"'),
    mark_as_open: z.boolean().optional().describe('Mark the invoice as open (pending) after sending'),
    attach_pdf: z.boolean().optional().describe('Attach the invoice PDF directly to the email'),
  })
  .describe('Email to send. Required: recipient_email, subject, message.');

const reminderEmailSchema = z
  .object({
    recipient_email: z
      .string()
      .describe('Recipient email address (during the bexio trial period limited to the account owner address)'),
    subject: z.string().describe('Email subject'),
    message: z.string().describe('Email body; must contain the placeholder "[Network Link]"'),
  })
  .describe('Email to send. Required: recipient_email, subject, message.');

const paymentPayloadSchema = z
  .object({
    date: z.string().describe('Payment date (ISO 8601)'),
    value: z.string().describe('Payment amount, e.g. "150.00" (max 6 decimals)'),
    bank_account_id: z
      .number()
      .int()
      .nullable()
      .describe('Bank account id the payment was received on (alternative to payment_service_id)'),
    payment_service_id: z
      .number()
      .int()
      .nullable()
      .describe('Payment service: 1 = PayPal, 2 = Stripe, 3 = SIX Payments (alternative to bank_account_id)'),
    title: z.number().int().nullable().describe('Payment title'),
    is_client_account_redemption: z.boolean().describe('Whether the payment redeems the client account'),
    is_cash_discount: z.boolean().describe('Whether the payment is a cash discount (skonto)'),
    kb_credit_voucher_id: z.number().int().nullable().describe('Linked credit voucher id'),
    kb_bill_id: z.number().int().nullable().describe('Linked bill id'),
    kb_credit_voucher_text: z.string().nullable().describe('Credit voucher text'),
  })
  .partial()
  .describe('Payment fields. Required on create: value. Set either bank_account_id or payment_service_id.');

export const invoicesTools = [
  defineTool({
    name: 'bexio_invoices',
    title: 'bexio Invoices',
    description:
      'Manage bexio invoices (kb_invoice). Status ids: 7 Draft, 8 Pending, 9 Paid, 16 Partial, 19 Canceled, 31 Unpaid. Actions: ' +
      '"list" (all invoices; optional limit/offset/order_by — orderable by id, total, total_net, total_gross, updated_at), ' +
      '"search" (search_criteria required; searchable fields: id, document_nr, title, contact_id, contact_sub_id, user_id, ' +
      'kb_item_status_id, currency_id, total, total_gross, total_net, is_valid_from, is_valid_to, api_reference, updated_at; ' +
      'optional limit/offset/order_by), ' +
      '"get" (id; returns the invoice including positions), ' +
      '"create" (payload; polymorphic positions array supported — custom, article, text, subtotal, pagebreak, discount), ' +
      '"update" (id + payload of fields to change; positions cannot be updated here), ' +
      '"delete" (id; permanently deletes the invoice — cannot be undone), ' +
      '"issue" (id; draft -> pending), ' +
      '"revert_issue" (id; sets an issued invoice back to draft), ' +
      '"cancel" (id; cancels the invoice — there is no API to un-cancel), ' +
      '"mark_as_sent" (id), ' +
      '"send" (id + email with recipient_email/subject/message, optional mark_as_open/attach_pdf; message must contain "[Network Link]"), ' +
      '"copy" (id + copy with contact_id required; creates a new invoice as a copy), ' +
      '"pdf" (id; optional logopaper for letterhead and save_path to write the PDF to disk instead of returning base64).',
    group: 'sales',
    writeActions: ['create', 'update', 'delete', 'issue', 'revert_issue', 'cancel', 'mark_as_sent', 'send', 'copy'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum([
          'list',
          'search',
          'get',
          'create',
          'update',
          'delete',
          'issue',
          'revert_issue',
          'cancel',
          'mark_as_sent',
          'send',
          'copy',
          'pdf',
        ])
        .describe('Operation to perform'),
      id: z
        .number()
        .int()
        .optional()
        .describe('Invoice id (required for every action except list, search and create)'),
      payload: invoicePayloadSchema.optional().describe('Invoice fields for "create"/"update"'),
      copy: invoiceCopySchema.optional().describe('Copy parameters for "copy"'),
      email: invoiceEmailSchema.optional().describe('Email parameters for "send"'),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
      logopaper: z.boolean().optional().describe('For "pdf": render the PDF on the letterhead paper'),
      save_path: z.string().optional().describe('For "pdf": write the PDF to this file path instead of returning base64'),
    },
    handler: async (client, args) => {
      const api = invoicesApi(client);
      const listParams = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return api.listInvoices(listParams);
        case 'search':
          return api.searchInvoices(requireArg(args.search_criteria, 'search_criteria', 'search'), listParams);
        case 'get':
          return api.getInvoice(requireArg(args.id, 'id', 'get'));
        case 'create':
          return api.createInvoice(requireArg(args.payload, 'payload', 'create') as InvoiceCreate);
        case 'update':
          return api.updateInvoice(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as InvoiceUpdate,
          );
        case 'delete':
          return api.deleteInvoice(requireArg(args.id, 'id', 'delete'));
        case 'issue':
          return api.issueInvoice(requireArg(args.id, 'id', 'issue'));
        case 'revert_issue':
          return api.revertIssueInvoice(requireArg(args.id, 'id', 'revert_issue'));
        case 'cancel':
          return api.cancelInvoice(requireArg(args.id, 'id', 'cancel'));
        case 'mark_as_sent':
          return api.markInvoiceAsSent(requireArg(args.id, 'id', 'mark_as_sent'));
        case 'send':
          return api.sendInvoice(requireArg(args.id, 'id', 'send'), requireArg(args.email, 'email', 'send'));
        case 'copy':
          return api.copyInvoice(requireArg(args.id, 'id', 'copy'), requireArg(args.copy, 'copy', 'copy') as InvoiceCopy);
        case 'pdf': {
          const file = await api.getInvoicePdf(requireArg(args.id, 'id', 'pdf'), letterheadFlag(args.logopaper));
          return documentResult({ name: file.name, mime: file.mime, base64: file.content }, args.save_path);
        }
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_invoice_payments',
    title: 'bexio Invoice Payments',
    description:
      'Manage payments recorded on a bexio invoice. All actions require invoice_id. Actions: ' +
      '"list" (payments of the invoice; optional limit/offset), ' +
      '"get" (payment_id), ' +
      '"create" (payload; required: value — the amount; set either bank_account_id or payment_service_id ' +
      '(1 = PayPal, 2 = Stripe, 3 = SIX Payments); optional date, is_cash_discount, is_client_account_redemption), ' +
      '"delete" (payment_id; permanently deletes the payment — cannot be undone).',
    group: 'sales',
    writeActions: ['create', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'get', 'create', 'delete']).describe('Operation to perform'),
      invoice_id: z.number().int().describe('Invoice id the payments belong to (always required)'),
      payment_id: z.number().int().optional().describe('Payment id (required for "get" and "delete")'),
      payload: paymentPayloadSchema.optional().describe('Payment fields for "create"'),
      limit: z.number().int().min(1).max(2000).optional().describe('Max results for "list"'),
      offset: z.number().int().min(0).optional().describe('Results to skip for "list"'),
    },
    handler: async (client, args) => {
      const api = invoicesApi(client);
      switch (args.action) {
        case 'list':
          return api.listPayments(args.invoice_id, { limit: args.limit, offset: args.offset });
        case 'get':
          return api.getPayment(args.invoice_id, requireArg(args.payment_id, 'payment_id', 'get'));
        case 'create':
          return api.createPayment(
            args.invoice_id,
            requireArg(args.payload, 'payload', 'create') as InvoicePaymentCreate,
          );
        case 'delete':
          return api.deletePayment(args.invoice_id, requireArg(args.payment_id, 'payment_id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_invoice_reminders',
    title: 'bexio Invoice Reminders',
    description:
      'Manage payment reminders of a bexio invoice. All actions require invoice_id. Actions: ' +
      '"list" (all reminders of the invoice), ' +
      '"search" (search_criteria required; searchable fields: title, reminder_level, is_sent, is_valid_from, is_valid_to), ' +
      '"get" (reminder_id), ' +
      '"create" (no payload; bexio creates the next reminder level for the overdue invoice), ' +
      '"delete" (reminder_id; permanently deletes the reminder — cannot be undone), ' +
      '"send" (reminder_id + email with recipient_email/subject/message; message must contain "[Network Link]"), ' +
      '"mark_as_sent" (reminder_id), ' +
      '"mark_as_unsent" (reminder_id), ' +
      '"pdf" (reminder_id; optional logopaper for letterhead and save_path to write the PDF to disk instead of returning base64).',
    group: 'sales',
    writeActions: ['create', 'delete', 'send', 'mark_as_sent', 'mark_as_unsent'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum(['list', 'search', 'get', 'create', 'delete', 'send', 'mark_as_sent', 'mark_as_unsent', 'pdf'])
        .describe('Operation to perform'),
      invoice_id: z.number().int().describe('Invoice id the reminders belong to (always required)'),
      reminder_id: z
        .number()
        .int()
        .optional()
        .describe('Reminder id (required for get/delete/send/mark_as_sent/mark_as_unsent/pdf)'),
      email: reminderEmailSchema.optional().describe('Email parameters for "send"'),
      search_criteria: searchCriteriaSchema.optional(),
      logopaper: z.boolean().optional().describe('For "pdf": render the PDF on the letterhead paper'),
      save_path: z.string().optional().describe('For "pdf": write the PDF to this file path instead of returning base64'),
    },
    handler: async (client, args) => {
      const api = invoicesApi(client);
      switch (args.action) {
        case 'list':
          return api.listReminders(args.invoice_id);
        case 'search':
          return api.searchReminders(args.invoice_id, requireArg(args.search_criteria, 'search_criteria', 'search'));
        case 'get':
          return api.getReminder(args.invoice_id, requireArg(args.reminder_id, 'reminder_id', 'get'));
        case 'create':
          return api.createReminder(args.invoice_id);
        case 'delete':
          return api.deleteReminder(args.invoice_id, requireArg(args.reminder_id, 'reminder_id', 'delete'));
        case 'send':
          return api.sendReminder(
            args.invoice_id,
            requireArg(args.reminder_id, 'reminder_id', 'send'),
            requireArg(args.email, 'email', 'send'),
          );
        case 'mark_as_sent':
          return api.markReminderAsSent(
            args.invoice_id,
            requireArg(args.reminder_id, 'reminder_id', 'mark_as_sent'),
          );
        case 'mark_as_unsent':
          return api.markReminderAsUnsent(
            args.invoice_id,
            requireArg(args.reminder_id, 'reminder_id', 'mark_as_unsent'),
          );
        case 'pdf': {
          const file = await api.getReminderPdf(
            args.invoice_id,
            requireArg(args.reminder_id, 'reminder_id', 'pdf'),
            letterheadFlag(args.logopaper),
          );
          return documentResult({ name: file.name, mime: file.mime, base64: file.content }, args.save_path);
        }
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the invoices tools (used by coverage tests). */
export const invoicesToolOperations = [
  'v2ListInvoices',
  'v2SearchInvoices',
  'v2ShowInvoice',
  'v2CreateInvoice',
  'v2EditInvoice',
  'DeleteInvoice',
  'v2IssueInvoice',
  'v2RevertIssueInvoice',
  'v2CancelInvoice',
  'v2RMarkAsSentInvoice',
  'v2SendInvoice',
  'v2CopyInvoice',
  'v2ShowInvoicePDF',
  'v2ListInvoicePayments',
  'v2ShowInvoicePayment',
  'v2CreateInvoicePayment',
  'DeleteInvoicePayment',
  'v2ListInvoiceReminders',
  'v2SearchReminders',
  'v2ShowInvoiceReminder',
  'v2CreateInvoiceReminder',
  'v2DeleteInvoiceReminder',
  'v2SendInvoiceReminder',
  'v2RMarkAsSentInvoiceReminder',
  'v2RMarkAsUnsentInvoiceReminder',
  'v2ShowInvoiceReminderPDF',
] as const;
