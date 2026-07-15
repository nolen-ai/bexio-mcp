/**
 * Purchase resources: bills (4.0), expenses (4.0), purchase orders (3.0) and
 * outgoing payments (4.0).
 *
 * Covers operations tagged "Bills", "Expenses", "Purchase Orders" and
 * "Outgoing Payment" in the bexio API docs (https://docs.bexio.com/#tag/Bills,
 * https://docs.bexio.com/#tag/Expenses, https://docs.bexio.com/#tag/Purchase-Orders,
 * https://docs.bexio.com/#tag/Outgoing-Payment).
 */
import type { BexioHttp } from '../http.js';
import type { ListParams, SuccessResponse } from '../types.js';

// ---------------------------------------------------------------------------
// Shared 4.0 purchase types
// ---------------------------------------------------------------------------

/** Pagination metadata returned by the 4.0 purchase list endpoints. */
export interface PurchasePaging {
  page: number;
  page_size: number;
  page_count: number;
  item_count: number;
}

/** Standard page/data envelope of the 4.0 purchase list endpoints. */
export interface PurchasePage<T> {
  data: T[];
  paging: PurchasePaging;
}

/** Supplier address used on bills and expenses. */
export interface PurchaseAddress {
  title?: string;
  salutation?: string;
  firstname_suffix?: string;
  lastname_company: string;
  address_line?: string;
  postcode?: string;
  city?: string;
  country_code?: string;
  main_contact_id?: number;
  contact_address_id?: number;
  type: 'PRIVATE' | 'COMPANY';
}

/** Result of the document-number validation endpoints. */
export interface DocumentNumberValidation {
  /** Indicates whether the document number is unique (available). */
  valid?: boolean;
  /** Next available document number; null when `valid` is true. */
  next_available_no?: string | null;
}

// ---------------------------------------------------------------------------
// Bills (4.0)
// ---------------------------------------------------------------------------

export type BillStatus =
  | 'DRAFT'
  | 'BOOKED'
  | 'PARTIALLY_CREATED'
  | 'CREATED'
  | 'PARTIALLY_SENT'
  | 'SENT'
  | 'PARTIALLY_DOWNLOADED'
  | 'DOWNLOADED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'PARTIALLY_FAILED'
  | 'FAILED';

export interface BillLineItem {
  id?: string;
  position: number;
  title?: string;
  tax_id?: number;
  /** Calculated based on `amount` and `tax_id` (read-only). */
  tax_calc?: number;
  /** Maximum of 17 digits and maximum of 2 decimal digits. */
  amount: number;
  booking_account_id?: number;
}

export interface BillDiscount {
  id?: string;
  position: number;
  /** Maximum of 17 digits and maximum of 2 decimal digits. */
  amount: number;
}

/** Payment details attached to a bill. */
export interface BillPaymentDetails {
  /** QR is allowed only when the bill `currency_code` is CHF or EUR. */
  type: 'IBAN' | 'MANUAL' | 'QR';
  bank_account_id?: number;
  fee?: 'BY_SENDER' | 'BY_RECEIVER' | 'BREAKDOWN' | 'NO_FEE';
  execution_date: string;
  /** Maximum of 5 digits and maximum of 10 decimal digits. */
  exchange_rate?: number;
  /** Maximum of 17 digits and maximum of 2 decimal digits. */
  amount: number;
  account_no?: string;
  iban?: string;
  name?: string;
  address?: string;
  street?: string;
  house_no?: string;
  postcode?: string;
  city?: string;
  country_code?: string;
  message?: string;
  booking_text?: string;
  salary_payment: boolean;
  reference_no?: string;
  note?: string;
}

/** A purchase bill (accounts payable, 4.0 API). Ids are UUID strings. */
export interface Bill {
  id: string;
  /** Unique bill document number, automatically generated after creation. */
  document_no: string;
  title?: string;
  status: BillStatus;
  firstname_suffix?: string;
  lastname_company: string;
  created_at: string;
  supplier_id: number;
  vendor_ref?: string;
  /** Amount left to be paid (bill amount minus the total of all payments). */
  pending_amount?: number;
  amount_man?: number;
  amount_calc?: number;
  manual_amount: boolean;
  contact_partner_id: number;
  bill_date: string;
  due_date: string;
  currency_code?: string;
  exchange_rate?: number;
  /** Base currency code taken from settings. */
  base_currency_code: string;
  item_net: boolean;
  split_into_line_items: boolean;
  purchase_order_id?: number;
  base_currency_amount?: number;
  /** Whether `due_date` has passed. Not applicable to bills in status DRAFT. */
  overdue: boolean;
  qr_bill_information?: string;
  address: PurchaseAddress;
  line_items: BillLineItem[];
  discounts: BillDiscount[];
  payment?: BillPaymentDetails;
  attachment_ids: string[];
  average_exchange_rate_enabled?: boolean;
}

/** Compact bill representation returned by the list endpoint. */
export interface BillListItem {
  id: string;
  document_no: string;
  title?: string;
  status: BillStatus;
  firstname_suffix?: string;
  lastname_company: string;
  /** Joined `firstname_suffix` and `lastname_company` based on the supplier (contact) type. */
  vendor: string;
  created_at: string;
  vendor_ref?: string;
  pending_amount?: number;
  currency_code: string;
  /** Net value of the bill, calculated from `line_items` and `discounts`. */
  net?: number;
  /** Gross value of the bill, calculated from `line_items` and `discounts`. */
  gross?: number;
  bill_date: string;
  due_date: string;
  overdue: boolean;
  /** All `booking_account_id` values set on `line_items`. */
  booking_account_ids: number[];
  attachment_ids: string[];
}

export interface BillCreate {
  supplier_id: number;
  vendor_ref?: string;
  title?: string;
  contact_partner_id: number;
  bill_date: string;
  due_date: string;
  /** Required when `manual_amount` is true (max 17 digits, 2 decimals). */
  amount_man?: number;
  /** Required when `manual_amount` is false (max 17 digits, 2 decimals). */
  amount_calc?: number;
  /** Indicates whether `amount_man` or `amount_calc` is considered as bill amount. */
  manual_amount: boolean;
  currency_code: string;
  /** Required when `currency_code` differs from the base currency. */
  exchange_rate?: number;
  /** Required when `currency_code` differs from the base currency (max 17 digits, 2 decimals). */
  base_currency_amount?: number;
  /** Indicates whether `amount` in `line_items` is net or gross. */
  item_net: boolean;
  purchase_order_id?: number;
  qr_bill_information?: string;
  attachment_ids: string[];
  address: PurchaseAddress;
  line_items: BillLineItem[];
  discounts: BillDiscount[];
  payment?: BillPaymentDetails;
}

export interface BillUpdate {
  document_no?: string;
  title?: string;
  supplier_id: number;
  vendor_ref?: string;
  /** Required when `manual_amount` is true (max 17 digits, 2 decimals). */
  amount_man?: number;
  /** Required when `manual_amount` is false (max 17 digits, 2 decimals). */
  amount_calc?: number;
  manual_amount: boolean;
  contact_partner_id: number;
  bill_date: string;
  due_date: string;
  currency_code: string;
  exchange_rate?: number;
  item_net: boolean;
  /** Whether the bill has multiple line items (true) or a single one (false). */
  split_into_line_items: boolean;
  base_currency_amount?: number;
  attachment_ids: string[];
  /** Line item ids must be unique and already exist on the bill, or be omitted for new items. */
  line_items: BillLineItem[];
  /** Discount ids must be unique and already exist on the bill, or be omitted for new discounts. */
  discounts: BillDiscount[];
  address: PurchaseAddress;
  payment?: BillPaymentDetails;
}

/** Fields the bill full-text search may be restricted to (closed enum per the API spec). */
export type BillSearchField =
  | 'firstname_suffix'
  | 'lastname_company'
  | 'vendor_ref'
  | 'currency_code'
  | 'document_no'
  | 'title';

/** Query parameters of the bill list endpoint (4.0-style paging: page/limit). */
export interface ListBillsParams {
  /** Limit the number of results (max 500). */
  limit?: number;
  /** Current page. */
  page?: number;
  /** Sorting order. */
  order?: 'asc' | 'desc';
  /** Field to sort by. */
  sort?: string;
  /** Search term (3–255 characters). */
  search_term?: string;
  /**
   * Fields the search term is applied to; all searchable fields when omitted.
   * Serialized as repeated keys (`fields[]=a&fields[]=b`) by BexioHttp.
   */
  'fields[]'?: BillSearchField[];
  /** Status filter: DRAFTS, TODO (booked/created/sent/…), PAID or OVERDUE. */
  status?: 'DRAFTS' | 'TODO' | 'PAID' | 'OVERDUE';
  bill_date_start?: string;
  bill_date_end?: string;
  due_date_start?: string;
  due_date_end?: string;
  vendor_ref?: string;
  title?: string;
  currency_code?: string;
  pending_amount_min?: number;
  pending_amount_max?: number;
  /** Text contained in the vendor name (firstname_suffix/lastname_company). */
  vendor?: string;
  gross_min?: number;
  gross_max?: number;
  net_min?: number;
  net_max?: number;
  document_no?: string;
  supplier_id?: number;
  average_exchange_rate_enabled?: boolean;
}

export class BillsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Get Bills (paginated, filterable).
   * @see ApiBillsList_GET — scope `openid,contact_show`
   */
  list(params?: ListBillsParams): Promise<PurchasePage<BillListItem>> {
    return this.http.get('/4.0/purchase/bills', { query: { ...params } });
  }

  /**
   * Get Bill.
   * @see ApiBills_GET — scope `openid,contact_show`
   */
  get(billId: string): Promise<Bill> {
    return this.http.get(`/4.0/purchase/bills/${encodeURIComponent(billId)}`);
  }

  /**
   * Create new Bill.
   * @see ApiBills_POST — scope `openid,contact_show`
   */
  create(bill: BillCreate): Promise<Bill> {
    return this.http.post('/4.0/purchase/bills', { body: bill });
  }

  /**
   * Update Bill.
   * @see ApiBills_PUT — scope `openid,contact_show`
   */
  update(billId: string, bill: BillUpdate): Promise<Bill> {
    return this.http.put(`/4.0/purchase/bills/${encodeURIComponent(billId)}`, { body: bill });
  }

  /**
   * Delete Bill.
   * @see ApiBills_DELETE — scope `openid,contact_show`
   */
  delete(billId: string): Promise<void> {
    return this.http.delete(`/4.0/purchase/bills/${encodeURIComponent(billId)}`);
  }

  /**
   * Execute Bill action (currently only DUPLICATE).
   * @see ApiBillActions_POST — scope `openid,contact_show`
   */
  executeAction(billId: string, action: 'DUPLICATE'): Promise<Bill> {
    return this.http.post(`/4.0/purchase/bills/${encodeURIComponent(billId)}/actions`, { body: { action } });
  }

  /**
   * Update Bill status (book or revert to draft).
   * @see ApiBillBookings_PUT — scope `openid,contact_show`
   */
  updateStatus(billId: string, status: 'DRAFT' | 'BOOKED'): Promise<Bill> {
    return this.http.put(`/4.0/purchase/bills/${encodeURIComponent(billId)}/bookings/${status}`);
  }

  /**
   * Validate whether a bill document number is available or not.
   * @see ApiPurchaseDocumentNumbers_GET — scope `openid,contact_show`
   */
  validateDocumentNumber(documentNo: string): Promise<DocumentNumberValidation> {
    return this.http.get('/4.0/purchase/documentnumbers/bills', { query: { document_no: documentNo } });
  }
}

// ---------------------------------------------------------------------------
// Expenses (4.0)
// ---------------------------------------------------------------------------

export type ExpenseStatus = 'DRAFT' | 'DONE';

/** An expense (4.0 API). Ids are UUID strings. */
export interface Expense {
  id: string;
  /** Unique expense document number, automatically generated after creation. */
  document_no?: string;
  title?: string;
  status: ExpenseStatus;
  firstname_suffix?: string;
  lastname_company?: string;
  created_at: string;
  supplier_id?: number;
  paid_on: string;
  bank_account_id?: number;
  booking_account_id?: number;
  currency_code: string;
  /** Base currency code taken from settings. */
  base_currency_code: string;
  exchange_rate?: number;
  amount: number;
  tax_man?: number;
  /** Calculated based on `amount` and `tax_id`. */
  tax_calc?: number;
  tax_id?: number;
  base_currency_amount?: number;
  /** When the expense is RECONCILED this stores the reconciled transaction id. */
  transaction_id?: string;
  /** Id of an invoice this expense was linked to. */
  invoice_id?: string;
  /** Id of a project this expense was linked to. */
  project_id?: string;
  address?: PurchaseAddress;
  attachment_ids: string[];
}

/** Compact expense representation returned by the list endpoint. */
export interface ExpenseListItem {
  id: string;
  document_no: string;
  title?: string;
  status: ExpenseStatus;
  firstname_suffix?: string;
  lastname_company?: string;
  /** Joined `firstname_suffix` and `lastname_company` based on the supplier (contact) type. */
  vendor?: string;
  created_at: string;
  paid_on: string;
  booking_account_id?: number;
  currency_code: string;
  /** Net value of the expense, calculated from `amount` and `tax_id`. */
  net: number;
  /** Gross value of the expense, calculated from `amount` and `tax_id`. */
  gross: number;
  project_id?: string;
  chargeable_contact_id?: number;
  transaction_id?: string;
  invoice_id?: string;
  attachment_ids: string[];
}

export interface ExpenseCreate {
  paid_on: string;
  currency_code: string;
  supplier_id?: number;
  title?: string;
  bank_account_id?: number;
  booking_account_id?: number;
  /** Maximum of 17 digits and maximum of 2 decimal digits. */
  amount: number;
  tax_id?: number;
  /** Required when `currency_code` differs from the base currency. */
  exchange_rate?: number;
  /** Required when `currency_code` differs from the base currency. */
  base_currency_amount?: number;
  /** File ids to attach to this expense. Cannot have duplicates. */
  attachment_ids: string[];
  address?: PurchaseAddress;
}

export interface ExpenseUpdate {
  paid_on: string;
  currency_code: string;
  /** Required when `currency_code` differs from the base currency. */
  exchange_rate?: number;
  supplier_id?: number;
  document_no?: string;
  title?: string;
  bank_account_id?: number;
  booking_account_id?: number;
  /** Maximum of 17 digits and maximum of 2 decimal digits. */
  amount: number;
  tax_id?: number;
  base_currency_amount?: number;
  /** File ids to attach to this expense. Cannot have duplicates. */
  attachment_ids: string[];
  address?: PurchaseAddress;
}

/** Query parameters of the expense list endpoint (4.0-style paging: page/limit). */
export interface ListExpensesParams {
  /** Results per page. */
  limit?: number;
  /** Current page. */
  page?: number;
  /** Sorting order. */
  order?: 'asc' | 'desc';
  /** Field to sort by. */
  sort?: string;
  /** Text contained in the vendor name (firstname_suffix/lastname_company). */
  vendor?: string;
  gross_min?: number;
  gross_max?: number;
  net_min?: number;
  net_max?: number;
  paid_on_start?: string;
  paid_on_end?: string;
  created_at_start?: string;
  created_at_end?: string;
  title?: string;
  currency_code?: string;
  document_no?: string;
  supplier_id?: number;
  project_id?: string;
}

export class ExpensesApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Get Expenses (paginated, filterable).
   * @see ApiExpensesList_GET — scope `openid,contact_show`
   */
  list(params?: ListExpensesParams): Promise<PurchasePage<ExpenseListItem>> {
    return this.http.get('/4.0/expenses', { query: { ...params } });
  }

  /**
   * Get Expense.
   * @see ApiExpenses_GET — scope `openid,contact_show`
   */
  get(expenseId: string): Promise<Expense> {
    return this.http.get(`/4.0/expenses/${encodeURIComponent(expenseId)}`);
  }

  /**
   * Create new Expense.
   * @see ApiExpenses_POST — scope `openid,contact_show`
   */
  create(expense: ExpenseCreate): Promise<Expense> {
    return this.http.post('/4.0/expenses', { body: expense });
  }

  /**
   * Update Expense.
   * @see ApiExpenses_PUT — scope `openid,contact_show`
   */
  update(expenseId: string, expense: ExpenseUpdate): Promise<Expense> {
    return this.http.put(`/4.0/expenses/${encodeURIComponent(expenseId)}`, { body: expense });
  }

  /**
   * Delete Expense.
   * @see ApiExpenses_DELETE — scope `openid,contact_show`
   */
  delete(expenseId: string): Promise<void> {
    return this.http.delete(`/4.0/expenses/${encodeURIComponent(expenseId)}`);
  }

  /**
   * Execute Expense action (currently only DUPLICATE).
   * @see ApiExpenseActions_POST — scope `openid,contact_show`
   */
  executeAction(expenseId: string, action: 'DUPLICATE'): Promise<Expense> {
    return this.http.post(`/4.0/expenses/${encodeURIComponent(expenseId)}/actions`, { body: { action } });
  }

  /**
   * Update Expense status (mark done or revert to draft).
   * @see ApiExpenseBookings_PUT — scope `openid,contact_show`
   */
  updateStatus(expenseId: string, status: 'DRAFT' | 'DONE'): Promise<Expense> {
    return this.http.put(`/4.0/expenses/${encodeURIComponent(expenseId)}/bookings/${status}`);
  }

  /**
   * Validate whether an expense document number is available or not.
   * @see ApiExpenseDocumentNumbers_GET — scope `openid,contact_show`
   */
  validateDocumentNumber(documentNo: string): Promise<DocumentNumberValidation> {
    return this.http.get('/4.0/expenses/documentnumbers', { query: { document_no: documentNo } });
  }
}

// ---------------------------------------------------------------------------
// Purchase orders (3.0)
// ---------------------------------------------------------------------------

/**
 * Line items (positions) of a purchase order, grouped by required, optional
 * and discount positions.
 */
export interface PurchaseOrderPositions {
  /** Can contain multiple required positions. */
  required?: Array<Record<string, unknown>>;
  /** Can contain multiple optional positions. */
  optional?: Array<Record<string, unknown>>;
  /** Can contain multiple discount positions. */
  discount?: Array<Record<string, unknown>>;
}

/** A purchase order (3.0 API). Ids are numeric. */
export interface PurchaseOrder {
  id: number;
  document_nr: string;
  kb_payment_template_id: number | null;
  /** References a payment type object. */
  payment_type_id: number;
  title: string | null;
  /** References a contact object. */
  contact_id: number;
  /** References a contact object. */
  contact_sub_id: number | null;
  template_slug: string | null;
  /** References a user object. */
  user_id: number;
  /** References a project object. */
  project_id: number | null;
  logopaper_id: number;
  language?: {
    id: number;
    name: string;
    decimalpoint: string;
    thousandsseparator: string;
    iso_639_1: string;
    date_format: string;
  };
  /** References a language object. */
  language_id: number;
  /** References a bank account object. */
  bank_account_id: number;
  currency?: Record<string, unknown>;
  /** References a currency object. */
  currency_id: number;
  header: string | null;
  footer: string | null;
  total_rounding_difference: number;
  /** included: tax in the total price; excluded: tax on top; exempt: no tax. */
  mwst_type: 'included' | 'excluded' | 'exempt';
  /** false = taxes included in the total, true = taxes added to the total. */
  mwst_is_net: boolean;
  is_compact_view: boolean;
  show_position_taxes: boolean;
  /** References a user object. */
  salesman_user_id: number | null;
  is_valid_from: string;
  is_valid_to: string;
  delivery_address_type: 'contact_address' | 'manual';
  /** The contact address for the document. Newlines are `\n`. */
  contact_address_manual?: string;
  /** The delivery address for the order. Newlines are `\n`. */
  delivery_address_manual?: string;
  /** Maximum number of decimal digits displayed for amounts. */
  nb_decimals_amount: number;
  /** Maximum number of decimal digits displayed for prices. */
  nb_decimals_price: number;
  /** 22 = Draft, 23 = Open, 24 = Partly, 25 = Done, 26 = Canceled (read-only). */
  kb_item_status_id: 22 | 23 | 24 | 25 | 26;
  /** Additional text displayed below the terms of payment. */
  terms_of_payment_text: string | null;
  /** A reference which can be added to the document by the client. */
  reference: string | null;
  /** Readable/editable only by the API; for references to other systems. */
  api_reference: string | null;
  /** The mail address of the company. */
  mail: string | null;
  viewed_by_client_at: string | null;
  is_valid_until: string;
  created_at: string;
  updated_at: string;
  custom_translations?: Record<string, unknown>;
  date_format?: string;
  positions?: PurchaseOrderPositions;
}

/**
 * Writable purchase order fields shared by create and update.
 * Positions are create-only: the v3PurchaseOrderUpdate request body does not
 * contain `positions` (they appear only on create and in show responses).
 */
export interface PurchaseOrderPayload {
  document_nr?: string;
  kb_payment_template_id?: number | null;
  /** References a payment type object. */
  payment_type_id?: number;
  title?: string | null;
  /** References a contact object. */
  contact_id?: number;
  contact_sub_id?: number | null;
  template_slug?: string | null;
  /** References a user object. */
  user_id?: number;
  project_id?: number | null;
  logopaper_id?: number;
  language_id?: number;
  bank_account_id?: number;
  currency_id?: number;
  header?: string | null;
  footer?: string | null;
  /** included: tax in the total price; excluded: tax on top; exempt: no tax. */
  mwst_type?: 'included' | 'excluded' | 'exempt';
  /** false = taxes included in the total, true = taxes added to the total. */
  mwst_is_net?: boolean;
  is_compact_view?: boolean;
  show_position_taxes?: boolean;
  salesman_user_id?: number | null;
  is_valid_from?: string;
  is_valid_to?: string;
  is_valid_until?: string;
  delivery_address_type?: 'contact_address' | 'manual';
  /** The contact address for the document. Newlines are `\n`. */
  contact_address_manual?: string;
  /** The delivery address for the order. Newlines are `\n`. */
  delivery_address_manual?: string;
  nb_decimals_amount?: number;
  nb_decimals_price?: number;
  terms_of_payment_text?: string | null;
  reference?: string | null;
  api_reference?: string | null;
  mail?: string | null;
}

/** Create body (v3PurchaseOrderCreate): base payload plus positions. */
export interface PurchaseOrderCreate extends PurchaseOrderPayload {
  positions?: PurchaseOrderPositions;
}

/** Update body (v3PurchaseOrderUpdate): base payload only — no positions. */
export type PurchaseOrderUpdate = PurchaseOrderPayload;

export class PurchaseOrdersApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of purchase orders.
   * @see v3PurchaseOrderList — scope `kb_article_order_show`
   */
  list(params?: ListParams): Promise<PurchaseOrder[]> {
    return this.http.get('/3.0/purchase_orders', { query: { ...params } });
  }

  /**
   * Fetch a single purchase order.
   * @see v3PurchaseOrderShow — scope `kb_article_order_show`
   */
  get(purchaseOrderId: number): Promise<PurchaseOrder> {
    return this.http.get(`/3.0/purchase_orders/${purchaseOrderId}`);
  }

  /**
   * Create a purchase order.
   * @see v3PurchaseOrderCreate — scope `kb_article_order_edit`
   */
  create(purchaseOrder: PurchaseOrderCreate): Promise<PurchaseOrder> {
    return this.http.post('/3.0/purchase_orders', { body: purchaseOrder });
  }

  /**
   * Update a single purchase order.
   * @see v3PurchaseOrderUpdate — scope `kb_article_order_edit`
   */
  update(purchaseOrderId: number, purchaseOrder: PurchaseOrderUpdate): Promise<PurchaseOrder> {
    return this.http.put(`/3.0/purchase_orders/${purchaseOrderId}`, { body: purchaseOrder });
  }

  /**
   * Delete a purchase order.
   * @see v3PurchaseOrderDelete — scope `kb_article_order_edit`
   */
  delete(purchaseOrderId: number): Promise<SuccessResponse> {
    return this.http.delete(`/3.0/purchase_orders/${purchaseOrderId}`);
  }
}

// ---------------------------------------------------------------------------
// Outgoing payments (4.0)
// ---------------------------------------------------------------------------

export type OutgoingPaymentStatus = 'PENDING' | 'TRANSFERRED' | 'DOWNLOADED' | 'ERROR' | 'PAID' | 'DISCOUNTED';
/** RECONCILED payments cannot be created via the API. */
export type OutgoingPaymentType = 'IBAN' | 'MANUAL' | 'CASH_DISCOUNT' | 'RECONCILED' | 'QR';
export type OutgoingPaymentFeeType = 'BY_SENDER' | 'BY_RECEIVER' | 'BREAKDOWN' | 'NO_FEE';

/** An outgoing payment created for a purchase bill (4.0 API). Ids are UUID strings. */
export interface OutgoingPayment {
  id: string;
  status: OutgoingPaymentStatus;
  created_at: string;
  bill_id: string;
  payment_type: OutgoingPaymentType;
  execution_date: string;
  amount: number;
  currency_code: string;
  exchange_rate: number;
  note?: string;
  sender_bank_account_id: number;
  sender_iban?: string;
  sender_name?: string;
  sender_street?: string;
  sender_house_no?: string;
  sender_city?: string;
  sender_postcode?: string;
  sender_country_code?: string;
  sender_bc_no?: string;
  sender_bank_no?: string;
  sender_bank_name?: string;
  receiver_account_no?: string;
  receiver_iban?: string;
  receiver_name?: string;
  receiver_street?: string;
  receiver_house_no?: string;
  receiver_city?: string;
  receiver_postcode?: string;
  receiver_country_code?: string;
  receiver_bc_no?: string;
  receiver_bank_no?: string;
  receiver_bank_name?: string;
  fee_type?: OutgoingPaymentFeeType;
  is_salary_payment: boolean;
  reference_no?: string;
  message?: string;
  booking_text?: string;
  /** Reference to a banking payment order. Applicable only for IBAN and QR. */
  banking_payment_id?: string;
  /** Reference to a KbClientAccountEntry after the payment is reconciled. */
  banking_payment_entry_id?: string;
  /** When the payment is RECONCILED this stores the reconciled transaction id. */
  transaction_id?: string;
}

/** Compact outgoing payment representation returned by the list endpoint. */
export interface OutgoingPaymentListItem {
  id: string;
  bill_id: string;
  payment_type: OutgoingPaymentType;
  status: OutgoingPaymentStatus;
  execution_date: string;
  amount: number;
  sender_bank_account_id?: number;
  receiver_account_no?: string;
  receiver_iban?: string;
  /** Reference to a banking payment order. Applicable only for IBAN and QR. */
  banking_payment_id?: string;
  /** When the payment is RECONCILED this stores the reconciled transaction id. */
  transaction_id?: string;
}

export interface OutgoingPaymentCreate {
  /** Payments can only be created for bills that are not in status DRAFT. */
  bill_id: string;
  /** The bill amount cannot be covered by CASH_DISCOUNT payments alone. */
  payment_type: 'IBAN' | 'MANUAL' | 'CASH_DISCOUNT' | 'QR';
  /** Must be on/after the bill date; cannot fall in a closed or locked business year. */
  execution_date: string;
  /** Must be less or equal to the bill's `pending_amount` (max 17 digits, 2 decimals). */
  amount: number;
  /** Must equal the bill's `currency_code`. Only CHF and EUR are allowed for QR. */
  currency_code: string;
  /** Maximum of 5 digits and maximum of 10 decimal digits. */
  exchange_rate: number;
  /** Not allowed for IBAN, QR. */
  note?: string;
  /** Required for IBAN, MANUAL, QR. Not allowed for CASH_DISCOUNT. */
  sender_bank_account_id: number;
  /** Required for IBAN, QR. Not allowed for CASH_DISCOUNT. */
  sender_iban?: string;
  /** Required for IBAN, QR. Not allowed for CASH_DISCOUNT. */
  sender_name?: string;
  /** Required for IBAN, QR. Not allowed for CASH_DISCOUNT. */
  sender_street?: string;
  sender_house_no?: string;
  /** Required for IBAN, QR. Not allowed for CASH_DISCOUNT. */
  sender_city?: string;
  /** Required for IBAN, QR. Not allowed for CASH_DISCOUNT. */
  sender_postcode?: string;
  sender_country_code?: string;
  sender_bc_no?: string;
  sender_bank_no?: string;
  sender_bank_name?: string;
  /** Not allowed for IBAN, QR, MANUAL, CASH_DISCOUNT. */
  receiver_account_no?: string;
  /** Required for IBAN, QR (valid IBAN). Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_iban?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_name?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_street?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_house_no?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_city?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_postcode?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_country_code?: string;
  receiver_bc_no?: string;
  receiver_bank_no?: string;
  receiver_bank_name?: string;
  /** Required for IBAN. Not allowed for QR, MANUAL, CASH_DISCOUNT. */
  fee_type?: OutgoingPaymentFeeType;
  /** May only be true for IBAN payments. */
  is_salary_payment: boolean;
  /** Not allowed for IBAN, MANUAL, CASH_DISCOUNT (QR reference for QR payments). */
  reference_no?: string;
  /** Not allowed for QR, MANUAL, CASH_DISCOUNT. */
  message?: string;
  /** Not allowed for MANUAL, CASH_DISCOUNT. */
  booking_text?: string;
}

/** Payload of the outgoing payment edit endpoint; the payment id goes in the body. */
export interface OutgoingPaymentUpdate {
  payment_id: string;
  /** Must be on/after the bill date; cannot fall in a closed or locked business year. */
  execution_date: string;
  /** Must be less or equal to the bill's `pending_amount` (max 17 digits, 2 decimals). */
  amount: number;
  /** Required for IBAN. Not allowed for QR, MANUAL, CASH_DISCOUNT. */
  fee_type?: OutgoingPaymentFeeType;
  /** May only be true for IBAN payments. */
  is_salary_payment: boolean;
  /** Not allowed for IBAN, MANUAL, CASH_DISCOUNT (QR reference for QR payments). */
  reference_no?: string;
  /** Not allowed for QR, MANUAL, CASH_DISCOUNT. */
  message?: string;
  /** Required for IBAN, QR (valid IBAN). Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_iban?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_name?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_street?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_house_no?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_city?: string;
  /** Required for IBAN, QR. Not allowed for MANUAL, CASH_DISCOUNT. */
  receiver_postcode?: string;
  receiver_country_code?: string;
}

/** Query parameters of the outgoing payment list endpoint (4.0-style paging: page/limit). */
export interface ListOutgoingPaymentsParams {
  /** Results per page. */
  limit?: number;
  /** Current page. */
  page?: number;
  /** Sorting order. */
  order?: 'asc' | 'desc';
  /** Field to sort by. */
  sort?: string;
}

export class OutgoingPaymentsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Retrieve Outgoing Payments of a bill (`billId` is required by the API).
   * @see ApiOutgoingPaymentList_GET — scope `openid,contact_show`
   */
  list(billId: string, params?: ListOutgoingPaymentsParams): Promise<PurchasePage<OutgoingPaymentListItem>> {
    return this.http.get('/4.0/purchase/outgoing-payments', { query: { bill_id: billId, ...params } });
  }

  /**
   * Get Outgoing Payment.
   * @see ApiOutgoingPayment_GET — scope `openid,contact_show`
   */
  get(paymentId: string): Promise<OutgoingPayment> {
    return this.http.get(`/4.0/purchase/outgoing-payments/${encodeURIComponent(paymentId)}`);
  }

  /**
   * Create new Outgoing Payment.
   * @see ApiOutgoingPayment_POST — scope `openid,contact_show`
   */
  create(payment: OutgoingPaymentCreate): Promise<OutgoingPayment> {
    return this.http.post('/4.0/purchase/outgoing-payments', { body: payment });
  }

  /**
   * Edit Outgoing Payment. The payment id is sent in the body as `payment_id`
   * (the endpoint has no id in the path).
   * @see ApiOutgoingPayment_PUT — scope `openid,contact_show,bank_payment_edit`
   */
  update(payment: OutgoingPaymentUpdate): Promise<OutgoingPayment> {
    return this.http.put('/4.0/purchase/outgoing-payments', { body: payment });
  }

  /**
   * Delete Outgoing Payment.
   * @see ApiOutgoingPayment_DELETE — scope `openid,contact_show,kb_bill_show`
   */
  delete(paymentId: string): Promise<void> {
    return this.http.delete(`/4.0/purchase/outgoing-payments/${encodeURIComponent(paymentId)}`);
  }
}

/** Operation IDs of the bexio API covered by the purchase resource classes (used by coverage tests). */
export const purchaseOperations = [
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
