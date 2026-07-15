/**
 * Quotes resource (2.0 API, `/2.0/kb_offer`).
 *
 * Covers operations tagged "Quotes" in the bexio API docs
 * (https://docs.bexio.com/#tag/Quotes).
 */
import type { BexioHttp } from '../http.js';
import type { FetchedFile, ListParams, SearchCriteria, SuccessResponse } from '../types.js';

/** Discriminator values of the polymorphic document position types. */
export type QuotePositionType =
  | 'KbPositionCustom'
  | 'KbPositionArticle'
  | 'KbPositionText'
  | 'KbPositionSubposition'
  | 'KbPositionSubtotal'
  | 'KbPositionPagebreak'
  | 'KbPositionDiscount';

/**
 * One position of a quote. Positions are polymorphic (custom, article, text,
 * subtotal, pagebreak, discount, …) and discriminated by `type`; all other
 * fields depend on the variant and are passed through as-is.
 */
export interface QuotePosition {
  /** Position variant, e.g. `KbPositionCustom` or `KbPositionArticle`. */
  type?: QuotePositionType;
  /** Variant-specific fields (amount, unit_price, article_id, text, …). */
  [key: string]: unknown;
}

/** Tax subtotal of a quote. */
export interface QuoteTax {
  percentage: string;
  value: string;
}

/** A quote (offer) document. */
export interface Quote {
  id: number;
  /**
   * Can not be used if “automatic numbering” is activated in frontend-settings.
   * Required if “automatic numbering” is deactivated.
   */
  document_nr: string;
  title: string | null;
  /** References a contact object. */
  contact_id: number | null;
  /** References a contact object (sub contact). */
  contact_sub_id: number | null;
  /** References a user object. */
  user_id: number;
  /** References a project object (read-only). */
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
  total: string;
  total_rounding_difference: number;
  /** 0 = including taxes, 1 = excluding taxes, 2 = exempt from taxes. */
  mwst_type: 0 | 1 | 2;
  /**
   * Affects the total if `mwst_type` is 0: `false` = taxes included in the
   * total, `true` = taxes added to the total.
   */
  mwst_is_net: boolean;
  show_position_taxes: boolean;
  /** ISO 8601 date the quote is valid from. */
  is_valid_from: string;
  /** ISO 8601 date the quote is valid until. */
  is_valid_until: string;
  contact_address: string;
  /** Manually set contact address; when `null` the contact's invoice address is used. */
  contact_address_manual?: string | null;
  /** 0 = use invoice address, 1 = use custom address. */
  delivery_address_type: 0 | 1;
  delivery_address: string;
  /** Manual delivery address, used when `delivery_address_type` is 1. */
  delivery_address_manual?: string | null;
  /** 1 = Draft, 2 = Pending, 3 = Confirmed, 4 = Declined. */
  kb_item_status_id: 1 | 2 | 3 | 4;
  /** Only readable/editable via the API; stores references to other systems. */
  api_reference: string | null;
  viewed_by_client_at: string | null;
  kb_terms_of_payment_template_id: number | null;
  show_total: boolean;
  updated_at: string;
  /** References a document template slug. */
  template_slug: string | null;
  taxs: QuoteTax[];
  network_link: string | null;
  /** Positions; only present on detail responses (`QuoteWithDetails`). */
  positions?: QuotePosition[];
}

/** Writable quote fields shared by create and edit payloads. */
export interface QuoteUpdate {
  /**
   * Can not be used if “automatic numbering” is activated in frontend-settings.
   * Required if “automatic numbering” is deactivated.
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
  /**
   * Affects the total if `mwst_type` is 0: `false` = taxes included in the
   * total, `true` = taxes added to the total.
   */
  mwst_is_net?: boolean;
  show_position_taxes?: boolean;
  /** ISO 8601 date the quote is valid from. */
  is_valid_from?: string;
  /** ISO 8601 date the quote is valid until. */
  is_valid_until?: string;
  /** Manually set contact address; when `null` the contact's invoice address is used. */
  contact_address_manual?: string | null;
  /** 0 = use invoice address, 1 = use custom address. */
  delivery_address_type?: 0 | 1;
  /** Manual delivery address, used when `delivery_address_type` is 1. */
  delivery_address_manual?: string | null;
  /** Only readable/editable via the API; stores references to other systems. */
  api_reference?: string | null;
  /**
   * Date-time the customer viewed the quote (ISO 8601). Writable per the API
   * spec (v2EditQuote does not mark it readOnly), but normally set by bexio
   * when the client opens the network link.
   */
  viewed_by_client_at?: string | null;
  kb_terms_of_payment_template_id?: number | null;
  /** References a document template slug. */
  template_slug?: string | null;
}

/** Payload for creating a quote (writable fields plus positions). */
export interface QuoteCreate extends QuoteUpdate {
  /**
   * Positions of the new quote. Variants can be mixed freely; bexio recommends
   * at most 150 positions per document (add more via the position endpoints).
   */
  positions?: QuotePosition[];
}

/** Payload for copying a quote. `contact_id` is required. */
export interface QuoteCopy {
  /** References a contact object. */
  contact_id: number | null;
  /** References a contact object (sub contact). */
  contact_sub_id?: number | null;
  /** ISO 8601 date the copy is valid from. */
  is_valid_from?: string;
  /** References a project object. */
  pr_project_id?: number | null;
  title?: string | null;
}

/** Payload for sending a quote by mail/network link. */
export interface QuoteSendRequest {
  /**
   * Recipient email address. During the trial period this is limited to the
   * email address associated with the access token.
   */
  recipient_email: string;
  subject: string;
  /** Email text; the placeholder "[Network Link]" must be part of the text. */
  message: string;
  mark_as_open?: boolean;
  /** Attach the PDF directly to the email. */
  attach_pdf?: boolean;
}

/** Position selection when creating an invoice/order from a quote. */
export interface QuotePositionReference {
  id?: number;
  type?: QuotePositionType;
  amount?: number;
}

/**
 * Payload for creating an invoice or order from a quote. Omit `positions`
 * to take over all positions of the source quote.
 */
export interface QuoteToDocumentRequest {
  positions?: QuotePositionReference[];
}

export class QuotesApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of quotes.
   * @see v2ListQuotes — scope `kb_offer_show`
   */
  list(params?: ListParams): Promise<Quote[]> {
    return this.http.get('/2.0/kb_offer', { query: { ...params } });
  }

  /**
   * Search quotes (legacy 2.0 search, conditions AND-combined).
   * @see v2SearchQuotes — scope `kb_offer_show`
   */
  search(criteria: SearchCriteria[], params?: ListParams): Promise<Quote[]> {
    return this.http.post('/2.0/kb_offer/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch a quote.
   * @see v2ShowQuote — scope `kb_offer_show`
   */
  get(quoteId: number): Promise<Quote> {
    return this.http.get(`/2.0/kb_offer/${quoteId}`);
  }

  /**
   * Create quote.
   * @see v2CreateQuote — scope `kb_offer_edit`
   */
  create(quote: QuoteCreate): Promise<Quote> {
    return this.http.post('/2.0/kb_offer', { body: quote });
  }

  /**
   * Edit a quote (the 2.0 API uses POST for edits).
   * @see v2EditQuote — scope `kb_offer_edit`
   */
  update(quoteId: number, quote: QuoteUpdate): Promise<Quote> {
    return this.http.post(`/2.0/kb_offer/${quoteId}`, { body: quote });
  }

  /**
   * Delete a quote.
   * @see DeleteQuote — scope `kb_offer_edit`
   */
  delete(quoteId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/kb_offer/${quoteId}`);
  }

  /**
   * Issue a quote (changes status from draft to pending).
   * @see v2IssueQuote — scope `kb_offer_edit`
   */
  issue(quoteId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/issue`);
  }

  /**
   * Revert issue a quote (back to draft).
   * @see v2RevertIssueQuote — scope `kb_offer_edit`
   */
  revertIssue(quoteId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/revertIssue`);
  }

  /**
   * Accept a quote.
   * @see v2AcceptQuote — scope `kb_offer_edit`
   */
  accept(quoteId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/accept`);
  }

  /**
   * Decline a quote.
   * @see v2DeclineQuote — scope `kb_offer_edit`
   */
  decline(quoteId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/reject`);
  }

  /**
   * Reissue a quote.
   * @see v2ReissueQuote — scope `kb_offer_edit`
   */
  reissue(quoteId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/reissue`);
  }

  /**
   * Mark quote as sent.
   * @see v2RMarkAsSentQuote — scope `kb_offer_edit`
   */
  markAsSent(quoteId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/mark_as_sent`);
  }

  /**
   * Send a quote by email (with network link and optional PDF attachment).
   * @see v2SendQuote — scope `kb_offer_edit`
   */
  send(quoteId: number, request: QuoteSendRequest): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/send`, { body: request });
  }

  /**
   * Copy a quote to a new quote.
   * @see v2CopyQuote — scope `kb_offer_edit`
   */
  copy(quoteId: number, payload: QuoteCopy): Promise<Quote> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/copy`, { body: payload });
  }

  /**
   * Show PDF of a quote.
   * @see v2ShowQuotePDF — scope `kb_offer_show`
   * @param logopaper Whether the PDF should be generated using the letterhead (1) or not (0).
   */
  showPdf(quoteId: number, logopaper?: 0 | 1): Promise<FetchedFile> {
    // Spec quirk: the OpenAPI spec declares `logopaper` as `in: path`, but the
    // path template has no {logopaper} placeholder, so it cannot be
    // interpolated; sending it as a query parameter is the deliberate reading.
    return this.http.get(`/2.0/kb_offer/${quoteId}/pdf`, { query: { logopaper } });
  }

  /**
   * Create invoice from quote. Returns the created invoice.
   * @see v2CreateInvoiceFromQuote — scope `kb_offer_edit,kb_invoice_edit`
   */
  createInvoice(quoteId: number, payload?: QuoteToDocumentRequest): Promise<Record<string, unknown>> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/invoice`, { body: { ...payload } });
  }

  /**
   * Create order from quote. Returns the created order.
   * @see v2CreateOrderFromQuote — scope `kb_offer_edit,kb_order_edit`
   */
  createOrder(quoteId: number, payload?: QuoteToDocumentRequest): Promise<Record<string, unknown>> {
    return this.http.post(`/2.0/kb_offer/${quoteId}/order`, { body: { ...payload } });
  }
}

/** Operation IDs of the bexio API covered by {@link QuotesApi} (used by coverage tests). */
export const quotesOperations = [
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
