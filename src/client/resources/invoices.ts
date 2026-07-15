/**
 * Invoices resource (2.0 API): invoice CRUD, status transitions (issue, revert,
 * cancel, mark as sent), sending by email, PDF rendering, plus the nested
 * payment and reminder sub-resources.
 *
 * Covers operations tagged "Invoices" in the bexio API docs
 * (https://docs.bexio.com/#tag/Invoices).
 */
import type { BexioHttp } from '../http.js';
import type { FetchedFile, ListParams, SearchCriteria, SuccessResponse } from '../types.js';

/** Tax subtotal of an invoice (read-only). */
export interface InvoiceTax {
  percentage: string;
  value: string;
}

/**
 * One document position of an invoice. Positions are polymorphic: the `type`
 * discriminator selects between custom, article, text, subtotal, pagebreak and
 * discount positions, each using a subset of the fields below (the OpenAPI
 * position schemas are only depth-limited in the spec digest, so this type is
 * intentionally permissive).
 */
export interface InvoicePosition {
  /** Position type discriminator. */
  type?:
    | 'KbPositionCustom'
    | 'KbPositionArticle'
    | 'KbPositionText'
    | 'KbPositionSubtotal'
    | 'KbPositionPagebreak'
    | 'KbPositionDiscount';
  id?: number;
  /** Quantity (custom/article positions). */
  amount?: string;
  /** References a unit object (custom/article positions). */
  unit_id?: number | null;
  /** References an account object (custom/article positions). */
  account_id?: number;
  /** References a tax object (custom/article positions). */
  tax_id?: number;
  /** Position text / description. */
  text?: string;
  /** Price per unit (custom/article positions). */
  unit_price?: string;
  /** Discount on this position in percent (custom/article positions). */
  discount_in_percent?: string;
  /** References an item object (article positions). */
  article_id?: number;
  /** Discount value (discount positions); subtotal value on subtotal positions. */
  value?: string;
  /** Whether the discount value is a percentage (discount positions). */
  is_percentual?: boolean;
  /** Whether the position number is printed on the document. */
  show_pos_nr?: boolean;
  /** Additional fields of the concrete position type. */
  [key: string]: unknown;
}

/**
 * An invoice (kb_invoice, 2.0 API).
 * Status (`kb_item_status_id`): 7 Draft, 8 Pending, 9 Paid, 16 Partial, 19 Canceled, 31 Unpaid.
 */
export interface Invoice {
  id: number;
  /**
   * Can not be used if "automatic numbering" is activated in frontend-settings.
   * Required if "automatic numbering" is deactivated.
   */
  document_nr: string;
  title: string | null;
  /** References a contact object. */
  contact_id: number | null;
  /** References a contact object (sub contact). */
  contact_sub_id: number | null;
  /** References a user object. */
  user_id: number;
  /** References a project object (read-only; use `pr_project_id` to set it). */
  project_id: number | null;
  /** References a project object (write-only counterpart of `project_id`). */
  pr_project_id?: number | null;
  /** @deprecated */
  logopaper_id: number;
  /** References a language object. */
  language_id: number;
  /** References a bank account object. */
  bank_account_id: number;
  /** References a currency object. */
  currency_id: number;
  /** References a payment type object. */
  payment_type_id: number;
  header: string;
  footer: string;
  total_gross: string;
  total_net: string;
  total_taxes: string;
  total_received_payments: string;
  total_credit_vouchers: string;
  total_remaining_payments: string;
  total: string;
  total_rounding_difference: number;
  /** 0 = including taxes, 1 = excluding taxes, 2 = exempt from taxes. */
  mwst_type: 0 | 1 | 2;
  /** Only relevant with `mwst_type` 0: `false` = taxes included in total, `true` = taxes added to total. */
  mwst_is_net: boolean;
  show_position_taxes: boolean;
  is_valid_from: string;
  is_valid_to: string;
  contact_address: string;
  /** Manually set contact address; when `null` the invoice address of the contact is used (write-only). */
  contact_address_manual?: string | null;
  /** 7 Draft, 8 Pending, 9 Paid, 16 Partial, 19 Canceled, 31 Unpaid. */
  kb_item_status_id: 7 | 8 | 9 | 16 | 19 | 31;
  reference: string | null;
  /** Only readable/editable through the API; use it to store references to other systems. */
  api_reference: string | null;
  viewed_by_client_at: string | null;
  updated_at: string;
  esr_id: number;
  qr_invoice_id: number;
  /** References a document template slug. */
  template_slug: string | null;
  taxs: InvoiceTax[];
  network_link: string | null;
}

/** An invoice including its document positions. */
export interface InvoiceWithDetails extends Invoice {
  positions?: InvoicePosition[];
}

/**
 * Writable invoice fields (used for create and edit). The spec marks no field
 * as strictly required; in practice bexio expects at least `user_id` and a
 * contact or manual address.
 */
export interface InvoiceUpdate {
  /**
   * Can not be used if "automatic numbering" is activated in frontend-settings.
   * Required if "automatic numbering" is deactivated.
   */
  document_nr?: string;
  title?: string | null;
  /** References a contact object. */
  contact_id?: number | null;
  /** References a contact object (sub contact). */
  contact_sub_id?: number | null;
  /** References a user object. */
  user_id?: number;
  /** References a project object. */
  pr_project_id?: number | null;
  /** @deprecated */
  logopaper_id?: number;
  /** References a language object. */
  language_id?: number;
  /** References a bank account object. */
  bank_account_id?: number;
  /** References a currency object. */
  currency_id?: number;
  /** References a payment type object. */
  payment_type_id?: number;
  header?: string;
  footer?: string;
  /** 0 = including taxes, 1 = excluding taxes, 2 = exempt from taxes. */
  mwst_type?: 0 | 1 | 2;
  /** Only relevant with `mwst_type` 0: `false` = taxes included in total, `true` = taxes added to total. */
  mwst_is_net?: boolean;
  show_position_taxes?: boolean;
  is_valid_from?: string;
  is_valid_to?: string;
  /** Manually set contact address; when omitted or `null` the invoice address of the contact is used. */
  contact_address_manual?: string | null;
  reference?: string | null;
  /** Only readable/editable through the API; use it to store references to other systems. */
  api_reference?: string | null;
  /** References a document template slug. */
  template_slug?: string | null;
}

/**
 * Payload for creating an invoice. Multiple position types can be combined;
 * bexio recommends at most 150 positions per create call.
 */
export interface InvoiceCreate extends InvoiceUpdate {
  positions?: InvoicePosition[];
}

/** Payload of the invoice copy operation. */
export interface InvoiceCopy {
  /** References a contact object (required). */
  contact_id: number | null;
  /** References a contact object (sub contact). */
  contact_sub_id?: number | null;
  is_valid_from?: string;
  title?: string | null;
}

/** Payload for sending an invoice by email. */
export interface InvoiceSend {
  /** During the trial period, the recipient is limited to the email address of the account. */
  recipient_email: string;
  subject: string;
  /** The placeholder "[Network Link]" must be part of the text. */
  message: string;
  mark_as_open?: boolean;
  /** Attach the PDF directly to the email. */
  attach_pdf?: boolean;
}

/** Payload for sending an invoice reminder by email. */
export interface InvoiceReminderSend {
  /** During the trial period, the recipient is limited to the email address of the account. */
  recipient_email: string;
  subject: string;
  /** The placeholder "[Network Link]" must be part of the text. */
  message: string;
}

/** A payment recorded on an invoice. */
export interface InvoicePayment {
  id: number;
  date: string;
  value: string;
  /** References a bank account object. */
  bank_account_id: number | null;
  title: number | null;
  /** 1 = PayPal, 2 = Stripe, 3 = SIX Payments. */
  payment_service_id: number | null;
  is_client_account_redemption: boolean;
  is_cash_discount: boolean;
  /** References an invoice object. */
  kb_invoice_id: number | null;
  kb_credit_voucher_id: number | null;
  kb_bill_id: number | null;
  kb_credit_voucher_text: string | null;
}

/** Payload for creating an invoice payment. Only `value` is required. */
export interface InvoicePaymentCreate {
  date?: string;
  /** Amount of the payment (required). */
  value: string;
  /** References a bank account object. */
  bank_account_id?: number | null;
  title?: number | null;
  /** 1 = PayPal, 2 = Stripe, 3 = SIX Payments. */
  payment_service_id?: number | null;
  is_client_account_redemption?: boolean;
  is_cash_discount?: boolean;
  kb_credit_voucher_id?: number | null;
  kb_bill_id?: number | null;
  kb_credit_voucher_text?: string | null;
}

/** A payment reminder of an invoice. */
export interface InvoiceReminder {
  id: number;
  /** References an invoice object. */
  kb_invoice_id: number;
  title: string | null;
  is_valid_from: string;
  is_valid_to: string;
  reminder_period_in_days: number;
  reminder_level: number;
  show_positions: boolean;
  remaining_price: string;
  received_total: string;
  is_sent: boolean;
  header: string | null;
  footer: string | null;
}

export class InvoicesApi {
  constructor(private readonly http: BexioHttp) {}

  // -------------------------------------------------------------------------
  // Invoices
  // -------------------------------------------------------------------------

  /**
   * Fetch a list of invoices.
   * @see v2ListInvoices — scope `kb_invoice_show`
   */
  listInvoices(params?: ListParams): Promise<Invoice[]> {
    return this.http.get('/2.0/kb_invoice', { query: { ...params } });
  }

  /**
   * Search invoices (legacy 2.0 search).
   * @see v2SearchInvoices — scope `kb_invoice_show`
   */
  searchInvoices(criteria: SearchCriteria[], params?: ListParams): Promise<Invoice[]> {
    return this.http.post('/2.0/kb_invoice/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch an invoice including its positions.
   * @see v2ShowInvoice — scope `kb_invoice_show`
   */
  getInvoice(invoiceId: number): Promise<InvoiceWithDetails> {
    return this.http.get(`/2.0/kb_invoice/${invoiceId}`);
  }

  /**
   * Create an invoice (optionally with polymorphic positions).
   * @see v2CreateInvoice — scope `kb_invoice_edit`
   */
  createInvoice(invoice: InvoiceCreate): Promise<InvoiceWithDetails> {
    return this.http.post('/2.0/kb_invoice', { body: invoice });
  }

  /**
   * Edit an invoice (the 2.0 API uses POST for edits).
   * @see v2EditInvoice — scope `kb_invoice_edit`
   */
  updateInvoice(invoiceId: number, invoice: InvoiceUpdate): Promise<InvoiceWithDetails> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}`, { body: invoice });
  }

  /**
   * Delete an invoice.
   * @see DeleteInvoice — scope `kb_invoice_edit`
   */
  deleteInvoice(invoiceId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/kb_invoice/${invoiceId}`);
  }

  /**
   * Issue an invoice (draft → pending).
   * @see v2IssueInvoice — scope `kb_invoice_edit`
   */
  issueInvoice(invoiceId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/issue`);
  }

  /**
   * Set an issued invoice back to draft.
   * @see v2RevertIssueInvoice — scope `kb_invoice_edit`
   */
  revertIssueInvoice(invoiceId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/revert_issue`);
  }

  /**
   * Cancel an invoice.
   * @see v2CancelInvoice — scope `kb_invoice_edit`
   */
  cancelInvoice(invoiceId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/cancel`);
  }

  /**
   * Mark an invoice as sent.
   * @see v2RMarkAsSentInvoice — scope `kb_invoice_edit`
   */
  markInvoiceAsSent(invoiceId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/mark_as_sent`);
  }

  /**
   * Send an invoice by email.
   * @see v2SendInvoice — scope `kb_invoice_edit`
   */
  sendInvoice(invoiceId: number, message: InvoiceSend): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/send`, { body: message });
  }

  /**
   * Copy an invoice to a new one.
   * @see v2CopyInvoice — scope `kb_invoice_edit`
   */
  copyInvoice(invoiceId: number, payload: InvoiceCopy): Promise<InvoiceWithDetails> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/copy`, { body: payload });
  }

  /**
   * Show the invoice PDF.
   *
   * Spec quirk: the OpenAPI spec declares `logopaper` as an `in: path` parameter,
   * but the path template contains no `{logopaper}` placeholder, so it cannot be
   * interpolated; it is deliberately sent as a query parameter instead.
   * @param logopaper Whether the PDF should be generated using the letterhead (1) or not (0).
   * @see v2ShowInvoicePDF — scope `kb_invoice_show`
   */
  getInvoicePdf(invoiceId: number, logopaper?: 0 | 1): Promise<FetchedFile> {
    return this.http.get(`/2.0/kb_invoice/${invoiceId}/pdf`, { query: { logopaper } });
  }

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  /**
   * Fetch a list of payments of an invoice.
   * @see v2ListInvoicePayments — scope `kb_invoice_show`
   */
  listPayments(invoiceId: number, params?: { limit?: number; offset?: number }): Promise<InvoicePayment[]> {
    return this.http.get(`/2.0/kb_invoice/${invoiceId}/payment`, { query: { ...params } });
  }

  /**
   * Fetch a payment of an invoice.
   * @see v2ShowInvoicePayment — scope `kb_invoice_show`
   */
  getPayment(invoiceId: number, paymentId: number): Promise<InvoicePayment> {
    return this.http.get(`/2.0/kb_invoice/${invoiceId}/payment/${paymentId}`);
  }

  /**
   * Create a payment on an invoice.
   * @see v2CreateInvoicePayment — scope `kb_invoice_edit`
   */
  createPayment(invoiceId: number, payment: InvoicePaymentCreate): Promise<InvoicePayment> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/payment`, { body: payment });
  }

  /**
   * Delete a payment of an invoice.
   * @see DeleteInvoicePayment — scope `kb_invoice_edit`
   */
  deletePayment(invoiceId: number, paymentId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/kb_invoice/${invoiceId}/payment/${paymentId}`);
  }

  // -------------------------------------------------------------------------
  // Reminders
  // -------------------------------------------------------------------------

  /**
   * Fetch a list of reminders of an invoice.
   * @see v2ListInvoiceReminders — scope `kb_invoice_show`
   */
  listReminders(invoiceId: number): Promise<InvoiceReminder[]> {
    return this.http.get(`/2.0/kb_invoice/${invoiceId}/kb_reminder`);
  }

  /**
   * Search invoice reminders (legacy 2.0 search). Unlike the other 2.0 search
   * endpoints, the spec defines no query parameters (no limit/offset/order_by)
   * for this operation, so none are exposed here.
   * @see v2SearchReminders — scope `kb_invoice_show`
   */
  searchReminders(invoiceId: number, criteria: SearchCriteria[]): Promise<InvoiceReminder[]> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/kb_reminder/search`, { body: criteria });
  }

  /**
   * Fetch a reminder of an invoice.
   * @see v2ShowInvoiceReminder — scope `kb_invoice_show`
   */
  getReminder(invoiceId: number, reminderId: number): Promise<InvoiceReminder> {
    return this.http.get(`/2.0/kb_invoice/${invoiceId}/kb_reminder/${reminderId}`);
  }

  /**
   * Create the next reminder for an invoice (no payload; bexio derives level and period).
   * @see v2CreateInvoiceReminder — scope `kb_invoice_edit`
   */
  createReminder(invoiceId: number): Promise<InvoiceReminder> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/kb_reminder`);
  }

  /**
   * Delete a reminder of an invoice.
   * @see v2DeleteInvoiceReminder — scope `kb_invoice_edit`
   */
  deleteReminder(invoiceId: number, reminderId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/kb_invoice/${invoiceId}/kb_reminder/${reminderId}`);
  }

  /**
   * Send a reminder by email.
   * @see v2SendInvoiceReminder — scope `kb_invoice_edit`
   */
  sendReminder(invoiceId: number, reminderId: number, message: InvoiceReminderSend): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/kb_reminder/${reminderId}/send`, { body: message });
  }

  /**
   * Mark a reminder as sent.
   * @see v2RMarkAsSentInvoiceReminder — scope `kb_invoice_edit`
   */
  markReminderAsSent(invoiceId: number, reminderId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/kb_reminder/${reminderId}/mark_as_sent`);
  }

  /**
   * Mark a reminder as unsent.
   * @see v2RMarkAsUnsentInvoiceReminder — scope `kb_invoice_edit`
   */
  markReminderAsUnsent(invoiceId: number, reminderId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_invoice/${invoiceId}/kb_reminder/${reminderId}/mark_as_unsent`);
  }

  /**
   * Show a reminder PDF.
   *
   * Spec quirk: the OpenAPI spec declares `logopaper` as an `in: path` parameter,
   * but the path template contains no `{logopaper}` placeholder, so it cannot be
   * interpolated; it is deliberately sent as a query parameter instead.
   * @param logopaper Whether the PDF should be generated using the letterhead (1) or not (0).
   * @see v2ShowInvoiceReminderPDF — scope `kb_invoice_show`
   */
  getReminderPdf(invoiceId: number, reminderId: number, logopaper?: 0 | 1): Promise<FetchedFile> {
    return this.http.get(`/2.0/kb_invoice/${invoiceId}/kb_reminder/${reminderId}/pdf`, {
      query: { logopaper },
    });
  }
}

/** Operation IDs of the bexio API covered by {@link InvoicesApi} (used by coverage tests). */
export const invoicesOperations = [
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
