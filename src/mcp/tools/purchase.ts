/**
 * MCP tools for the purchase domain: bills, expenses, purchase orders and
 * outgoing payments.
 */
import { z } from 'zod';
import { defineTool, listParamsShape, requireArg, unknownAction } from '../registry.js';
import type { BexioClient } from '../../client/index.js';
import type {
  BillCreate,
  BillUpdate,
  ExpenseCreate,
  ExpenseUpdate,
  OutgoingPaymentCreate,
  OutgoingPaymentUpdate,
  PurchaseOrderCreate,
  PurchaseOrderUpdate,
} from '../../client/resources/purchase.js';

// ---------------------------------------------------------------------------
// Shared schema fragments
// ---------------------------------------------------------------------------

const purchaseAddressSchema = z
  .object({
    title: z.string().optional().describe('Address title'),
    salutation: z.string().optional().describe('Salutation'),
    firstname_suffix: z.string().optional().describe('First name (or company name suffix)'),
    lastname_company: z.string().describe('Last name or company name (required)'),
    address_line: z.string().optional().describe('Street address line'),
    postcode: z.string().optional().describe('Postcode'),
    city: z.string().optional().describe('City'),
    country_code: z.string().optional().describe('ISO country code'),
    main_contact_id: z.number().int().optional().describe('Id of the main contact this address belongs to'),
    contact_address_id: z.number().int().optional().describe('Id of an additional contact address'),
    type: z.enum(['PRIVATE', 'COMPANY']).describe('Address type (required)'),
  })
  .describe('Supplier address');

const purchase40PagingShape = {
  limit: z.number().int().min(1).max(500).optional().describe('Results per page for "list" (max 500)'),
  page: z.number().int().min(1).optional().describe('Page number for "list"'),
  order: z.enum(['asc', 'desc']).optional().describe('Sorting order for "list"'),
  sort: z.string().optional().describe('Field to sort by for "list"'),
};

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

const billLineItemSchema = z.object({
  id: z
    .string()
    .optional()
    .describe('Line item id; on update it must already exist on the bill, omit it for new items'),
  position: z.number().int().describe('Position of the line item on the bill'),
  title: z.string().optional().describe('Line item title'),
  tax_id: z.number().int().optional().describe('Tax id applied to this line item'),
  amount: z.number().describe('Line item amount (max 17 digits, 2 decimals; net or gross per item_net)'),
  booking_account_id: z.number().int().optional().describe('Accounting account id the line item is booked on'),
});

const billDiscountSchema = z.object({
  id: z
    .string()
    .optional()
    .describe('Discount id; on update it must already exist on the bill, omit it for new discounts'),
  position: z.number().int().describe('Position of the discount on the bill'),
  amount: z.number().describe('Discount amount (max 17 digits, 2 decimals)'),
});

const billPaymentSchema = z
  .object({
    type: z
      .enum(['IBAN', 'MANUAL', 'QR'])
      .describe('Payment type; QR is allowed only when the bill currency is CHF or EUR'),
    bank_account_id: z.number().int().optional().describe('Sender bank account id'),
    fee: z.enum(['BY_SENDER', 'BY_RECEIVER', 'BREAKDOWN', 'NO_FEE']).optional().describe('Fee handling'),
    execution_date: z.string().describe('ISO date on which the payment should be executed'),
    exchange_rate: z.number().optional().describe('Exchange rate (max 5 digits, 10 decimals)'),
    amount: z.number().describe('Payment amount (max 17 digits, 2 decimals)'),
    account_no: z.string().optional().describe('Receiver account number'),
    iban: z.string().optional().describe('Receiver IBAN'),
    name: z.string().optional().describe('Receiver name'),
    address: z.string().optional().describe('Receiver address'),
    street: z.string().optional().describe('Receiver street'),
    house_no: z.string().optional().describe('Receiver house number'),
    postcode: z.string().optional().describe('Receiver postcode'),
    city: z.string().optional().describe('Receiver city'),
    country_code: z.string().optional().describe('Receiver country code'),
    message: z.string().optional().describe('Payment message'),
    booking_text: z.string().optional().describe('Booking text'),
    salary_payment: z.boolean().describe('Whether this is a salary payment'),
    reference_no: z.string().optional().describe('Payment reference number'),
    note: z.string().optional().describe('Payment note'),
  })
  .describe('Payment details attached to the bill');

const billPayloadSchema = z
  .object({
    supplier_id: z.number().int().describe('Contact id of the supplier'),
    vendor_ref: z.string().describe('Vendor reference (e.g. supplier invoice number)'),
    title: z.string().describe('Bill title'),
    contact_partner_id: z.number().int().describe('Contact id of the contact partner'),
    bill_date: z.string().describe('Bill date (ISO 8601)'),
    due_date: z.string().describe('Due date (ISO 8601)'),
    amount_man: z.number().describe('Manual bill amount; required when manual_amount is true (max 2 decimals)'),
    amount_calc: z
      .number()
      .describe('Calculated bill amount; required when manual_amount is false (max 2 decimals)'),
    manual_amount: z
      .boolean()
      .describe('Whether amount_man (true) or amount_calc (false) is considered the bill amount'),
    currency_code: z.string().describe('ISO 4217 currency code, e.g. "CHF"'),
    exchange_rate: z
      .number()
      .describe('Exchange rate; required when currency_code differs from the base currency'),
    base_currency_amount: z
      .number()
      .describe('Amount in base currency; required when currency_code differs from the base currency'),
    item_net: z.boolean().describe('Whether line item amounts are net (true) or gross (false)'),
    purchase_order_id: z.number().int().describe('Linked purchase order id (create only)'),
    qr_bill_information: z.string().describe('Swiss QR bill information (create only)'),
    document_no: z.string().describe('Bill document number (update only; auto-generated on create)'),
    split_into_line_items: z
      .boolean()
      .describe('Whether the bill has multiple line items (true) or a single item (false); required on update'),
    attachment_ids: z.array(z.string()).describe('File ids attached to the bill (may be empty)'),
    address: purchaseAddressSchema,
    line_items: z.array(billLineItemSchema).describe('Bill line items'),
    discounts: z.array(billDiscountSchema).describe('Bill discounts (may be empty)'),
    payment: billPaymentSchema.optional(),
  })
  .partial()
  .describe(
    'Bill fields. Required on create: supplier_id, contact_partner_id, bill_date, due_date, manual_amount, ' +
      'currency_code, item_net, attachment_ids, address, line_items, discounts. ' +
      'Update sends the full bill and additionally requires split_into_line_items.',
  );

const billFiltersSchema = z
  .object({
    status: z
      .enum(['DRAFTS', 'TODO', 'PAID', 'OVERDUE'])
      .describe('Status filter (DRAFTS: draft bills; TODO: booked/created/sent/…; PAID; OVERDUE)'),
    bill_date_start: z.string().describe('Earliest accepted bill_date'),
    bill_date_end: z.string().describe('Latest accepted bill_date'),
    due_date_start: z.string().describe('Earliest accepted due_date'),
    due_date_end: z.string().describe('Latest accepted due_date'),
    vendor_ref: z.string().describe('Text contained in vendor_ref'),
    title: z.string().describe('Text contained in title'),
    currency_code: z.string().describe('Text contained in currency_code'),
    pending_amount_min: z.number().describe('Lowest accepted pending_amount'),
    pending_amount_max: z.number().describe('Greatest accepted pending_amount'),
    vendor: z.string().describe('Text contained in the vendor name (lastname_company/firstname_suffix)'),
    gross_min: z.number().describe('Lowest accepted gross value'),
    gross_max: z.number().describe('Greatest accepted gross value'),
    net_min: z.number().describe('Lowest accepted net value'),
    net_max: z.number().describe('Greatest accepted net value'),
    document_no: z.string().describe('Text contained in document_no'),
    supplier_id: z.number().int().describe('Filter for supplier_id'),
    average_exchange_rate_enabled: z.boolean().describe('Whether average exchange rate is enabled'),
  })
  .partial()
  .describe('Optional filters for "list"');

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

const expensePayloadSchema = z
  .object({
    paid_on: z.string().describe('Date the expense was paid (ISO 8601)'),
    currency_code: z.string().describe('ISO 4217 currency code, e.g. "CHF"'),
    supplier_id: z.number().int().describe('Contact id of the supplier'),
    document_no: z.string().describe('Expense document number (update only; auto-generated on create)'),
    title: z.string().describe('Expense title'),
    bank_account_id: z.number().int().describe('Bank account id the expense was paid from'),
    booking_account_id: z.number().int().describe('Accounting account id the expense is booked on'),
    amount: z.number().describe('Expense amount (max 17 digits, 2 decimals)'),
    tax_id: z.number().int().describe('Tax id applied to the expense'),
    exchange_rate: z
      .number()
      .describe('Exchange rate; required when currency_code differs from the base currency'),
    base_currency_amount: z
      .number()
      .describe('Amount in base currency; required when currency_code differs from the base currency'),
    attachment_ids: z.array(z.string()).describe('File ids attached to the expense (no duplicates; may be empty)'),
    address: purchaseAddressSchema.optional(),
  })
  .partial()
  .describe(
    'Expense fields. Required on create and update: paid_on, currency_code, amount, attachment_ids. ' +
      'Update sends the full expense (fields left out are cleared).',
  );

const expenseFiltersSchema = z
  .object({
    vendor: z.string().describe('Text contained in the vendor name (lastname_company/firstname_suffix)'),
    gross_min: z.number().describe('Lowest accepted gross value'),
    gross_max: z.number().describe('Greatest accepted gross value'),
    net_min: z.number().describe('Lowest accepted net value'),
    net_max: z.number().describe('Greatest accepted net value'),
    paid_on_start: z.string().describe('Earliest accepted paid_on date'),
    paid_on_end: z.string().describe('Latest accepted paid_on date'),
    created_at_start: z.string().describe('Earliest accepted created_at date'),
    created_at_end: z.string().describe('Latest accepted created_at date'),
    title: z.string().describe('Text contained in title'),
    currency_code: z.string().describe('Text contained in currency_code'),
    document_no: z.string().describe('Text contained in document_no'),
    supplier_id: z.number().int().describe('Filter for supplier_id'),
    project_id: z.string().describe('Filter for project_id'),
  })
  .partial()
  .describe('Optional filters for "list"');

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

const purchaseOrderPositionsSchema = z
  .object({
    required: z
      .array(z.record(z.unknown()))
      .optional()
      .describe('Required positions (article/custom/text/subtotal position objects)'),
    optional: z
      .array(z.record(z.unknown()))
      .optional()
      .describe('Optional positions (article/custom/text/subtotal position objects)'),
    discount: z.array(z.record(z.unknown())).optional().describe('Discount positions'),
  })
  .describe('Line items grouped by required, optional and discount positions');

const purchaseOrderPayloadSchema = z
  .object({
    document_nr: z.string().describe('Document number, e.g. "RE-00001" (auto-generated when omitted)'),
    kb_payment_template_id: z.number().int().nullable().describe('Payment template id'),
    payment_type_id: z.number().int().describe('References a payment type'),
    title: z.string().nullable().describe('Purchase order title'),
    contact_id: z.number().int().describe('References the supplier contact'),
    contact_sub_id: z.number().int().nullable().describe('References a sub-contact'),
    template_slug: z.string().nullable().describe('Document template slug'),
    user_id: z.number().int().describe('References a user'),
    project_id: z.number().int().nullable().describe('References a project'),
    logopaper_id: z.number().int().describe('Logo/stationery paper id'),
    language_id: z.number().int().describe('References a language'),
    bank_account_id: z.number().int().describe('References a bank account'),
    currency_id: z.number().int().describe('References a currency'),
    header: z.string().nullable().describe('Header text of the document'),
    footer: z.string().nullable().describe('Footer text of the document'),
    mwst_type: z
      .enum(['included', 'excluded', 'exempt'])
      .describe('Tax handling: included in totals, excluded (added on top) or exempt (no tax)'),
    mwst_is_net: z
      .boolean()
      .describe('false = taxes are included in the total, true = taxes are added to the total'),
    is_compact_view: z.boolean().describe('Whether the document uses the compact view'),
    show_position_taxes: z.boolean().describe('Whether taxes are shown per position'),
    salesman_user_id: z.number().int().nullable().describe('References the salesman user'),
    is_valid_from: z.string().describe('Order date (ISO date)'),
    is_valid_to: z.string().describe('Delivery/validity end date (ISO date)'),
    is_valid_until: z.string().describe('Validity date (ISO date)'),
    delivery_address_type: z.enum(['contact_address', 'manual']).describe('How the delivery address is provided'),
    contact_address_manual: z.string().describe('Manual contact address; newlines as \\n (max 1000 chars)'),
    delivery_address_manual: z.string().describe('Manual delivery address; newlines as \\n (max 1000 chars)'),
    nb_decimals_amount: z.number().int().describe('Decimal digits displayed for amounts (default 2)'),
    nb_decimals_price: z.number().int().describe('Decimal digits displayed for prices (default 2)'),
    terms_of_payment_text: z
      .string()
      .nullable()
      .describe('Additional text displayed below the terms of payment (max 255 chars)'),
    reference: z.string().nullable().describe('Client-defined reference (max 1000 chars)'),
    api_reference: z.string().nullable().describe('API-only reference field for external system ids'),
    mail: z.string().nullable().describe('Mail address of the company'),
    positions: purchaseOrderPositionsSchema
      .optional()
      .describe(
        'Line items grouped by required, optional and discount positions (create only; the update endpoint does not accept positions)',
      ),
  })
  .partial()
  .describe(
    'Purchase order fields (bexio 3.0 API; all fields optional — bexio applies defaults). ' +
      'Typically set at least contact_id, user_id and positions on create.',
  );

// ---------------------------------------------------------------------------
// Outgoing payments
// ---------------------------------------------------------------------------

const outgoingPaymentPayloadSchema = z
  .object({
    payment_id: z.string().describe('Id of the payment to edit (update only; alternatively pass the "id" argument)'),
    bill_id: z.string().describe('Id of the bill to pay; the bill must not be in status DRAFT (create only)'),
    payment_type: z
      .enum(['IBAN', 'MANUAL', 'CASH_DISCOUNT', 'QR'])
      .describe('Payment type; a bill cannot be covered by CASH_DISCOUNT payments alone (create only)'),
    execution_date: z
      .string()
      .describe('Execution date; on/after the bill date and not in a closed/locked business year'),
    amount: z.number().describe("Amount; must be <= the bill's pending_amount (max 2 decimals)"),
    currency_code: z.string().describe("Must equal the bill's currency_code; only CHF/EUR allowed for QR (create only)"),
    exchange_rate: z.number().describe('Exchange rate (max 5 digits, 10 decimals; create only)'),
    note: z.string().describe('Note (not allowed for IBAN, QR; create only)'),
    sender_bank_account_id: z
      .number()
      .int()
      .describe('Sender bank account id; required for IBAN/MANUAL/QR, not allowed for CASH_DISCOUNT (create only)'),
    sender_iban: z.string().describe('Required for IBAN/QR, not allowed for CASH_DISCOUNT (create only)'),
    sender_name: z.string().describe('Required for IBAN/QR, not allowed for CASH_DISCOUNT (create only)'),
    sender_street: z.string().describe('Required for IBAN/QR, not allowed for CASH_DISCOUNT (create only)'),
    sender_house_no: z.string().describe('Not allowed for CASH_DISCOUNT (create only)'),
    sender_city: z.string().describe('Required for IBAN/QR, not allowed for CASH_DISCOUNT (create only)'),
    sender_postcode: z.string().describe('Required for IBAN/QR, not allowed for CASH_DISCOUNT (create only)'),
    sender_country_code: z.string().describe('Not allowed for CASH_DISCOUNT (create only)'),
    sender_bc_no: z.string().describe('Not allowed for CASH_DISCOUNT (create only)'),
    sender_bank_no: z.string().describe('Not allowed for CASH_DISCOUNT (create only)'),
    sender_bank_name: z.string().describe('Not allowed for CASH_DISCOUNT (create only)'),
    receiver_account_no: z
      .string()
      .describe('Receiver account number (not allowed for IBAN/QR/MANUAL/CASH_DISCOUNT; create only)'),
    receiver_iban: z.string().describe('Required for IBAN/QR (valid IBAN), not allowed for MANUAL/CASH_DISCOUNT'),
    receiver_name: z.string().describe('Required for IBAN/QR, not allowed for MANUAL/CASH_DISCOUNT'),
    receiver_street: z.string().describe('Required for IBAN/QR, not allowed for MANUAL/CASH_DISCOUNT'),
    receiver_house_no: z.string().describe('Required for IBAN/QR, not allowed for MANUAL/CASH_DISCOUNT'),
    receiver_city: z.string().describe('Required for IBAN/QR, not allowed for MANUAL/CASH_DISCOUNT'),
    receiver_postcode: z.string().describe('Required for IBAN/QR, not allowed for MANUAL/CASH_DISCOUNT'),
    receiver_country_code: z.string().describe('Receiver country code'),
    receiver_bc_no: z.string().describe('Not allowed for MANUAL/CASH_DISCOUNT (create only)'),
    receiver_bank_no: z.string().describe('Not allowed for MANUAL/CASH_DISCOUNT (create only)'),
    receiver_bank_name: z.string().describe('Not allowed for MANUAL/CASH_DISCOUNT (create only)'),
    fee_type: z
      .enum(['BY_SENDER', 'BY_RECEIVER', 'BREAKDOWN', 'NO_FEE'])
      .describe('Fee handling; required for IBAN, not allowed for QR/MANUAL/CASH_DISCOUNT'),
    is_salary_payment: z.boolean().describe('May only be true for IBAN payments'),
    reference_no: z
      .string()
      .describe('Reference number (QR reference for QR payments; not allowed for IBAN/MANUAL/CASH_DISCOUNT)'),
    message: z.string().describe('Payment message (not allowed for QR/MANUAL/CASH_DISCOUNT)'),
    booking_text: z.string().describe('Booking text (not allowed for MANUAL/CASH_DISCOUNT; create only)'),
  })
  .partial()
  .describe(
    'Outgoing payment fields. Required on create: bill_id, payment_type, execution_date, amount, currency_code, ' +
      'exchange_rate, is_salary_payment (plus sender_bank_account_id for IBAN/MANUAL/QR and sender/receiver details ' +
      'for IBAN/QR). Required on update: payment_id (or "id" argument), execution_date, amount, is_salary_payment.',
  );

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const purchaseTools = [
  defineTool({
    name: 'bexio_bills',
    title: 'bexio Bills',
    description:
      'Manage purchase bills / supplier invoices (accounts payable, bexio purchase 4.0 API). Bill ids are UUID strings. Actions: ' +
      '"list" (paginated via limit/page/order/sort; optional full-text search_term of 3-255 chars with search_fields, ' +
      'and filters: status DRAFTS|TODO|PAID|OVERDUE, bill_date_start/end, due_date_start/end, vendor_ref, title, ' +
      'currency_code, pending_amount_min/max, vendor, gross_min/max, net_min/max, document_no, supplier_id, ' +
      'average_exchange_rate_enabled), ' +
      '"get" (bill by id), ' +
      '"create" (payload required: supplier_id, contact_partner_id, bill_date, due_date, manual_amount, currency_code, ' +
      'item_net, attachment_ids, address, line_items, discounts; provide amount_man when manual_amount=true, ' +
      'amount_calc otherwise), ' +
      '"update" (id + full payload; additionally requires split_into_line_items; line item/discount ids must already ' +
      'exist on the bill or be omitted for new ones), ' +
      '"delete" (id; permanently deletes the bill — cannot be undone), ' +
      '"execute_action" (id + bill_action "DUPLICATE": copies the bill into a new draft), ' +
      '"update_status" (id + status: "BOOKED" books the bill, "DRAFT" reverts it to draft), ' +
      '"validate_document_number" (document_no; reports whether it is available and the next free number).',
    group: 'purchase',
    writeActions: ['create', 'update', 'delete', 'execute_action', 'update_status'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum(['list', 'get', 'create', 'update', 'delete', 'execute_action', 'update_status', 'validate_document_number'])
        .describe('Operation to perform'),
      id: z.string().optional().describe('Bill id (UUID; required for get/update/delete/execute_action/update_status)'),
      payload: billPayloadSchema.optional(),
      bill_action: z.enum(['DUPLICATE']).optional().describe('Action to execute for "execute_action"'),
      status: z.enum(['DRAFT', 'BOOKED']).optional().describe('Target status for "update_status"'),
      document_no: z.string().optional().describe('Document number to check for "validate_document_number"'),
      search_term: z.string().optional().describe('Full-text search term for "list" (3-255 characters)'),
      search_fields: z
        .array(z.enum(['firstname_suffix', 'lastname_company', 'vendor_ref', 'currency_code', 'document_no', 'title']))
        .optional()
        .describe('Fields the search term is applied to (all searchable fields when omitted)'),
      filters: billFiltersSchema.optional(),
      ...purchase40PagingShape,
    },
    handler: async (client, args) => {
      const bills = client.bills;
      switch (args.action) {
        case 'list':
          return bills.list({
            limit: args.limit,
            page: args.page,
            order: args.order,
            sort: args.sort,
            search_term: args.search_term,
            'fields[]': args.search_fields,
            ...args.filters,
          });
        case 'get':
          return bills.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return bills.create(requireArg(args.payload, 'payload', 'create') as BillCreate);
        case 'update':
          return bills.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as BillUpdate,
          );
        case 'delete':
          return bills.delete(requireArg(args.id, 'id', 'delete'));
        case 'execute_action':
          return bills.executeAction(
            requireArg(args.id, 'id', 'execute_action'),
            requireArg(args.bill_action, 'bill_action', 'execute_action'),
          );
        case 'update_status':
          return bills.updateStatus(
            requireArg(args.id, 'id', 'update_status'),
            requireArg(args.status, 'status', 'update_status'),
          );
        case 'validate_document_number':
          return bills.validateDocumentNumber(requireArg(args.document_no, 'document_no', 'validate_document_number'));
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_expenses',
    title: 'bexio Expenses',
    description:
      'Manage expenses (bexio 4.0 API). Expense ids are UUID strings. Actions: ' +
      '"list" (paginated via limit/page/order/sort; filters: vendor, gross_min/max, net_min/max, paid_on_start/end, ' +
      'created_at_start/end, title, currency_code, document_no, supplier_id, project_id), ' +
      '"get" (expense by id), ' +
      '"create" (payload required: paid_on, currency_code, amount, attachment_ids; optional supplier, bank/booking ' +
      'account, tax and address fields), ' +
      '"update" (id + full payload; same required fields as create), ' +
      '"delete" (id; permanently deletes the expense — cannot be undone), ' +
      '"execute_action" (id + expense_action "DUPLICATE": copies the expense into a new draft), ' +
      '"update_status" (id + status: "DONE" completes the expense, "DRAFT" reverts it to draft), ' +
      '"validate_document_number" (document_no; reports whether it is available and the next free number).',
    group: 'purchase',
    writeActions: ['create', 'update', 'delete', 'execute_action', 'update_status'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum(['list', 'get', 'create', 'update', 'delete', 'execute_action', 'update_status', 'validate_document_number'])
        .describe('Operation to perform'),
      id: z
        .string()
        .optional()
        .describe('Expense id (UUID; required for get/update/delete/execute_action/update_status)'),
      payload: expensePayloadSchema.optional(),
      expense_action: z.enum(['DUPLICATE']).optional().describe('Action to execute for "execute_action"'),
      status: z.enum(['DRAFT', 'DONE']).optional().describe('Target status for "update_status"'),
      document_no: z.string().optional().describe('Document number to check for "validate_document_number"'),
      filters: expenseFiltersSchema.optional(),
      ...purchase40PagingShape,
    },
    handler: async (client, args) => {
      const expenses = client.expenses;
      switch (args.action) {
        case 'list':
          return expenses.list({
            limit: args.limit,
            page: args.page,
            order: args.order,
            sort: args.sort,
            ...args.filters,
          });
        case 'get':
          return expenses.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return expenses.create(requireArg(args.payload, 'payload', 'create') as ExpenseCreate);
        case 'update':
          return expenses.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as ExpenseUpdate,
          );
        case 'delete':
          return expenses.delete(requireArg(args.id, 'id', 'delete'));
        case 'execute_action':
          return expenses.executeAction(
            requireArg(args.id, 'id', 'execute_action'),
            requireArg(args.expense_action, 'expense_action', 'execute_action'),
          );
        case 'update_status':
          return expenses.updateStatus(
            requireArg(args.id, 'id', 'update_status'),
            requireArg(args.status, 'status', 'update_status'),
          );
        case 'validate_document_number':
          return expenses.validateDocumentNumber(
            requireArg(args.document_no, 'document_no', 'validate_document_number'),
          );
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_purchase_orders',
    title: 'bexio Purchase Orders',
    description:
      'Manage purchase orders (bexio 3.0 API; numeric ids). Status (kb_item_status_id) is read-only: ' +
      '22 Draft, 23 Open, 24 Partly, 25 Done, 26 Canceled. Actions: ' +
      '"list" (optional limit/offset and order_by: id, total, total_net, total_gross or updated_at; append "_desc" ' +
      'for descending), ' +
      '"get" (purchase order by numeric id), ' +
      '"create" (payload; all fields optional but typically contact_id, user_id and positions grouped as ' +
      'required/optional/discount arrays), ' +
      '"update" (id + payload of fields to change; positions are create-only — the update endpoint does not accept ' +
      'them and they are not sent), ' +
      '"delete" (id; permanently deletes the purchase order — cannot be undone).',
    group: 'purchase',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'get', 'create', 'update', 'delete']).describe('Operation to perform'),
      id: z.number().int().optional().describe('Purchase order id (required for get/update/delete)'),
      payload: purchaseOrderPayloadSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const purchaseOrders = client.purchaseOrders;
      switch (args.action) {
        case 'list':
          return purchaseOrders.list({ limit: args.limit, offset: args.offset, order_by: args.order_by });
        case 'get':
          return purchaseOrders.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return purchaseOrders.create(requireArg(args.payload, 'payload', 'create') as PurchaseOrderCreate);
        case 'update': {
          // The v3PurchaseOrderUpdate body has no positions (create-only field).
          const { positions: _createOnly, ...payload } = requireArg(args.payload, 'payload', 'update');
          return purchaseOrders.update(requireArg(args.id, 'id', 'update'), payload as PurchaseOrderUpdate);
        }
        case 'delete':
          return purchaseOrders.delete(requireArg(args.id, 'id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_outgoing_payments',
    title: 'bexio Outgoing Payments',
    description:
      'Manage outgoing payments for purchase bills (bexio purchase 4.0 API). Payment ids are UUID strings. Actions: ' +
      '"list" (bill_id required — lists the payments of one bill; optional limit/page/order asc|desc/sort), ' +
      '"get" (payment by id), ' +
      '"create" (payload required: bill_id, payment_type IBAN|MANUAL|CASH_DISCOUNT|QR, execution_date, amount, ' +
      'currency_code, exchange_rate, is_salary_payment; IBAN/MANUAL/QR also need sender_bank_account_id and IBAN/QR ' +
      'need sender/receiver bank details; the bill must not be a draft and amount must not exceed its pending_amount), ' +
      '"update" (id or payload.payment_id + payload; note the API takes the payment id in the request body, not the ' +
      'URL; editable fields: execution_date, amount, is_salary_payment, fee_type, reference_no, message and receiver ' +
      'address fields), ' +
      '"delete" (id; permanently deletes the payment — cannot be undone).',
    group: 'purchase',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'get', 'create', 'update', 'delete']).describe('Operation to perform'),
      id: z.string().optional().describe('Outgoing payment id (UUID; required for get/update/delete)'),
      bill_id: z.string().optional().describe('Bill id whose payments to list (required for "list")'),
      payload: outgoingPaymentPayloadSchema.optional(),
      limit: z.number().int().min(1).optional().describe('Results per page for "list"'),
      page: z.number().int().min(1).optional().describe('Page number for "list"'),
      order: z.enum(['asc', 'desc']).optional().describe('Sorting order for "list"'),
      sort: z.string().optional().describe('Field to sort by for "list"'),
    },
    handler: async (client, args) => {
      const outgoingPayments = client.outgoingPayments;
      switch (args.action) {
        case 'list':
          return outgoingPayments.list(requireArg(args.bill_id, 'bill_id', 'list'), {
            limit: args.limit,
            page: args.page,
            order: args.order,
            sort: args.sort,
          });
        case 'get':
          return outgoingPayments.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return outgoingPayments.create(requireArg(args.payload, 'payload', 'create') as OutgoingPaymentCreate);
        case 'update': {
          const payload = requireArg(args.payload, 'payload', 'update');
          const paymentId = payload.payment_id ?? args.id;
          return outgoingPayments.update({
            ...payload,
            payment_id: requireArg(paymentId, 'payment_id (or id)', 'update'),
          } as OutgoingPaymentUpdate);
        }
        case 'delete':
          return outgoingPayments.delete(requireArg(args.id, 'id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the purchase tools (used by coverage tests). */
export const purchaseToolOperations = [
  'ApiBillActions_POST',
  'ApiBillBookings_PUT',
  'ApiBills_DELETE',
  'ApiBills_GET',
  'ApiBills_PUT',
  'ApiBillsList_GET',
  'ApiBills_POST',
  'ApiPurchaseDocumentNumbers_GET',
  'ApiExpenseActions_POST',
  'ApiExpenseBookings_PUT',
  'ApiExpenses_DELETE',
  'ApiExpenses_GET',
  'ApiExpenses_PUT',
  'ApiExpenseDocumentNumbers_GET',
  'ApiExpensesList_GET',
  'ApiExpenses_POST',
  'ApiOutgoingPayment_DELETE',
  'ApiOutgoingPayment_GET',
  'ApiOutgoingPaymentList_GET',
  'ApiOutgoingPayment_POST',
  'ApiOutgoingPayment_PUT',
  'v3PurchaseOrderDelete',
  'v3PurchaseOrderShow',
  'v3PurchaseOrderUpdate',
  'v3PurchaseOrderList',
  'v3PurchaseOrderCreate',
] as const;
