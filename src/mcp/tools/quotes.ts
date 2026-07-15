/**
 * MCP tools for the quotes domain (sales documents, `/2.0/kb_offer`).
 */
import { z } from 'zod';
import { defineTool, listParamsShape, requireArg, searchCriteriaSchema, unknownAction } from '../registry.js';
import { documentResult } from '../binary.js';
import type { QuoteCopy, QuoteCreate, QuoteUpdate } from '../../client/resources/quotes.js';

/** Converts the LLM-friendly boolean letterhead flag to the API's 0/1 wire format. */
function letterheadFlag(logopaper: boolean | undefined): 0 | 1 | undefined {
  return logopaper === undefined ? undefined : logopaper ? 1 : 0;
}

/**
 * Position types accepted by v2CreateQuote's inline positions (the spec lists
 * six variants; KbPositionSubposition is not among them).
 */
const createPositionTypes = [
  'KbPositionCustom',
  'KbPositionArticle',
  'KbPositionText',
  'KbPositionSubtotal',
  'KbPositionPagebreak',
  'KbPositionDiscount',
] as const;

/**
 * Position types referencable when creating an invoice/order from a quote
 * (includes KbPositionSubposition, unlike the create-quote variants).
 */
const positionTypes = [
  'KbPositionCustom',
  'KbPositionArticle',
  'KbPositionText',
  'KbPositionSubposition',
  'KbPositionSubtotal',
  'KbPositionPagebreak',
  'KbPositionDiscount',
] as const;

const positionSchema = z
  .object({
    type: z
      .enum(createPositionTypes)
      .describe('Position variant discriminator, e.g. "KbPositionCustom" or "KbPositionArticle"'),
  })
  .passthrough()
  .describe(
    'Polymorphic document position. Besides "type", pass the variant-specific fields, e.g. for ' +
      'KbPositionCustom: amount, unit_id, account_id, tax_id, text, unit_price, discount_in_percent; ' +
      'for KbPositionArticle additionally article_id; for KbPositionText: text, show_pos_nr; ' +
      'for KbPositionDiscount: text, is_percentual, value.',
  );

const quotePayloadSchema = z
  .object({
    document_nr: z
      .string()
      .describe(
        'Document number. Cannot be used if automatic numbering is active; required if automatic numbering is deactivated',
      ),
    title: z.string().nullable().describe('Quote title'),
    contact_id: z.number().int().nullable().describe('Id of the contact the quote is addressed to'),
    contact_sub_id: z.number().int().nullable().describe('Id of the sub contact (contact person)'),
    user_id: z.number().int().describe('Id of the responsible bexio user'),
    pr_project_id: z.number().int().nullable().describe('Id of the linked project'),
    logopaper_id: z.number().int().describe('(deprecated) Logopaper id'),
    language_id: z.number().int().describe('Id of the document language'),
    bank_account_id: z.number().int().describe('Id of the bank account shown on the document'),
    currency_id: z.number().int().describe('Id of the document currency'),
    payment_type_id: z.number().int().describe('Id of the payment type'),
    header: z.string().describe('Header text above the positions'),
    footer: z.string().describe('Footer text below the positions'),
    mwst_type: z
      .union([z.literal(0), z.literal(1), z.literal(2)])
      .describe('Tax mode: 0 = including taxes, 1 = excluding taxes, 2 = exempt from taxes'),
    mwst_is_net: z
      .boolean()
      .describe('Only relevant when mwst_type is 0: false = taxes included in total, true = taxes added to total'),
    show_position_taxes: z.boolean().describe('Show tax rate per position'),
    is_valid_from: z.string().describe('ISO 8601 date the quote is valid from'),
    is_valid_until: z.string().describe('ISO 8601 date the quote is valid until'),
    contact_address_manual: z
      .string()
      .nullable()
      .describe('Manual contact address; when null the invoice address of the contact is used'),
    delivery_address_type: z
      .union([z.literal(0), z.literal(1)])
      .describe('0 = use invoice address, 1 = use custom delivery address'),
    delivery_address_manual: z
      .string()
      .nullable()
      .describe('Manual delivery address, used when delivery_address_type is 1'),
    api_reference: z
      .string()
      .nullable()
      .describe('Free reference field only visible to the API (link to external systems)'),
    viewed_by_client_at: z
      .string()
      .nullable()
      .describe(
        'Date-time the customer viewed the quote (ISO 8601); writable per the API spec but normally set by bexio when the client opens the network link',
      ),
    kb_terms_of_payment_template_id: z.number().int().nullable().describe('Id of the terms-of-payment template'),
    template_slug: z.string().nullable().describe('Slug of the document template to use'),
    positions: z
      .array(positionSchema)
      .describe(
        'Positions (create and copy targets only; ignored on update). Variants can be mixed; use at most 150 positions per document',
      ),
  })
  .partial()
  .describe(
    'Quote fields. All fields are optional per the API schema; typically set contact_id, user_id and positions ' +
      'on create (document_nr only when automatic numbering is deactivated).',
  );

const quoteCopySchema = z
  .object({
    contact_id: z.number().int().nullable().describe('Contact id for the new quote (required)'),
    contact_sub_id: z.number().int().nullable().optional().describe('Sub-contact id'),
    is_valid_from: z.string().optional().describe('Date the copy is valid from (ISO 8601)'),
    pr_project_id: z.number().int().nullable().optional().describe('Id of the linked project'),
    title: z.string().nullable().optional().describe('Title of the copy'),
  })
  .describe('Copy parameters. Required: contact_id.');

const quoteEmailSchema = z
  .object({
    recipient_email: z
      .string()
      .describe('Recipient email address (during the bexio trial period limited to the account owner address)'),
    subject: z.string().describe('Email subject'),
    message: z.string().describe('Email body; must contain the placeholder "[Network Link]"'),
    mark_as_open: z.boolean().optional().describe('Mark the quote as open (pending) after sending'),
    attach_pdf: z.boolean().optional().describe('Attach the quote PDF directly to the email'),
  })
  .describe('Email to send. Required: recipient_email, subject, message.');

const positionRefSchema = z
  .object({
    id: z.number().int().describe('Id of the source quote position'),
    type: z.enum(positionTypes).describe('Type of the source quote position'),
    amount: z.number().describe('Amount to take over'),
  })
  .partial()
  .describe('Reference to a position of the source quote');

export const quotesTools = [
  defineTool({
    name: 'bexio_quotes',
    title: 'bexio Quotes',
    description:
      'Manage quotes/offers (bexio 2.0 kb_offer API). Status flow: 1 Draft -> 2 Pending (issued) -> 3 Confirmed / 4 Declined. ' +
      'Actions: ' +
      '"list" (all quotes; optional limit/offset/order_by — order_by one of id, total, total_net, total_gross, updated_at), ' +
      '"search" (search_criteria required, AND-combined; useful fields: id, kb_item_status_id, document_nr, title, contact_id, user_id, currency_id, total, is_valid_from, is_valid_until, updated_at), ' +
      '"get" (id), ' +
      '"create" (payload; typically contact_id, user_id, positions; document_nr only if automatic numbering is off), ' +
      '"update" (id + payload with fields to change), ' +
      '"delete" (id — permanently deletes the quote, cannot be undone), ' +
      '"issue" (id — moves a draft to pending and makes it visible to workflows), ' +
      '"revert_issue" (id — back to draft), ' +
      '"accept" (id), "decline" (id), "reissue" (id), ' +
      '"mark_as_sent" (id — flags as sent without emailing), ' +
      '"send" (id + email with recipient_email/subject/message, optional mark_as_open/attach_pdf; message must contain "[Network Link]"; emails the quote to the customer), ' +
      '"copy" (id + copy with contact_id required, optional contact_sub_id, is_valid_from, pr_project_id, title — returns the new quote), ' +
      '"pdf" (id; optional logopaper for letterhead and save_path to write the PDF to disk), ' +
      '"create_invoice" (id; optional positions to take over a subset — omit for all; returns the new invoice), ' +
      '"create_order" (id; optional positions — omit for all; returns the new order).',
    group: 'sales',
    writeActions: [
      'create',
      'update',
      'delete',
      'issue',
      'revert_issue',
      'accept',
      'decline',
      'reissue',
      'mark_as_sent',
      'send',
      'copy',
      'create_invoice',
      'create_order',
    ],
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
          'accept',
          'decline',
          'reissue',
          'mark_as_sent',
          'send',
          'copy',
          'pdf',
          'create_invoice',
          'create_order',
        ])
        .describe('Operation to perform'),
      id: z.number().int().optional().describe('Quote id (required for every action except "list", "search" and "create")'),
      payload: quotePayloadSchema.optional().describe('Quote fields for "create"/"update"'),
      copy: quoteCopySchema.optional().describe('Copy parameters for "copy"'),
      email: quoteEmailSchema.optional().describe('Email parameters for "send"'),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
      positions: z
        .array(positionRefSchema)
        .optional()
        .describe('For "create_invoice"/"create_order": source positions to take over; omit to take all'),
      logopaper: z.boolean().optional().describe('For "pdf": render the PDF on the letterhead paper'),
      save_path: z
        .string()
        .optional()
        .describe('For "pdf": write the PDF to this file path instead of returning base64 inline'),
    },
    handler: async (client, args) => {
      const api = client.quotes;
      const listParams = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return api.list(listParams);
        case 'search':
          return api.search(requireArg(args.search_criteria, 'search_criteria', 'search'), listParams);
        case 'get':
          return api.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return api.create(requireArg(args.payload, 'payload', 'create') as QuoteCreate);
        case 'update':
          return api.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as QuoteUpdate,
          );
        case 'delete':
          return api.delete(requireArg(args.id, 'id', 'delete'));
        case 'issue':
          return api.issue(requireArg(args.id, 'id', 'issue'));
        case 'revert_issue':
          return api.revertIssue(requireArg(args.id, 'id', 'revert_issue'));
        case 'accept':
          return api.accept(requireArg(args.id, 'id', 'accept'));
        case 'decline':
          return api.decline(requireArg(args.id, 'id', 'decline'));
        case 'reissue':
          return api.reissue(requireArg(args.id, 'id', 'reissue'));
        case 'mark_as_sent':
          return api.markAsSent(requireArg(args.id, 'id', 'mark_as_sent'));
        case 'send':
          return api.send(requireArg(args.id, 'id', 'send'), requireArg(args.email, 'email', 'send'));
        case 'copy':
          return api.copy(requireArg(args.id, 'id', 'copy'), requireArg(args.copy, 'copy', 'copy') as QuoteCopy);
        case 'pdf': {
          const file = await api.showPdf(requireArg(args.id, 'id', 'pdf'), letterheadFlag(args.logopaper));
          return documentResult({ name: file.name, mime: file.mime, base64: file.content }, args.save_path);
        }
        case 'create_invoice':
          return api.createInvoice(requireArg(args.id, 'id', 'create_invoice'), { positions: args.positions });
        case 'create_order':
          return api.createOrder(requireArg(args.id, 'id', 'create_order'), { positions: args.positions });
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the quotes tools (used by coverage tests). */
export const quotesToolOperations = [
  'v2ListQuotes',
  'v2SearchQuotes',
  'v2ShowQuote',
  'v2CreateQuote',
  'v2EditQuote',
  'DeleteQuote',
  'v2IssueQuote',
  'v2RevertIssueQuote',
  'v2AcceptQuote',
  'v2DeclineQuote',
  'v2ReissueQuote',
  'v2RMarkAsSentQuote',
  'v2SendQuote',
  'v2CopyQuote',
  'v2ShowQuotePDF',
  'v2CreateInvoiceFromQuote',
  'v2CreateOrderFromQuote',
] as const;
