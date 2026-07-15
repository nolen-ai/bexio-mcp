/**
 * Sales document sub-resources shared by quotes, orders and invoices:
 * document positions (7 kinds), document comments, document settings and
 * document templates.
 *
 * Covers operations tagged "Default positions", "Item positions", "Text positions",
 * "Subtotal positions", "Discount positions", "Pagebreak positions", "Sub positions",
 * "Comments", "Document Settings" and "Document templates" in the bexio API docs
 * (https://docs.bexio.com/).
 */
import type { BexioHttp } from '../http.js';
import type { SuccessResponse } from '../types.js';

/** Document types that carry positions and comments (quotes, orders, invoices). */
export type KbDocumentType = 'kb_offer' | 'kb_order' | 'kb_invoice';

/**
 * Kind of a document position. Maps to the `kb_position_*` path segment of the
 * 2.0 API (`custom` → `kb_position_custom`, `article` → `kb_position_article`, …).
 */
export type DocumentPositionKind =
  | 'custom'
  | 'article'
  | 'text'
  | 'subtotal'
  | 'discount'
  | 'pagebreak'
  | 'subposition';

/** Maps a {@link DocumentPositionKind} to its `kb_position_*` path segment. */
const POSITION_KIND_SEGMENTS: Record<DocumentPositionKind, string> = {
  custom: 'kb_position_custom',
  article: 'kb_position_article',
  text: 'kb_position_text',
  subtotal: 'kb_position_subtotal',
  discount: 'kb_position_discount',
  pagebreak: 'kb_position_pagebreak',
  subposition: 'kb_position_subposition',
};

/** Pagination parameters of the 2.0 position/comment list endpoints. */
export interface PagePaginationParams {
  /** Limit the number of results (max is 2000). */
  limit?: number;
  /** Skip over a number of elements by specifying an offset value for the query. */
  offset?: number;
}

// ---------------------------------------------------------------------------
// Position entities
// ---------------------------------------------------------------------------

/** A default (free/custom) position — `kb_position_custom`. */
export interface PositionCustom {
  id: number;
  amount: string;
  amount_reserved: string;
  amount_open: string;
  amount_completed: string;
  /** References a unit object. */
  unit_id: number;
  /** References an account object. */
  account_id: number;
  /** Read-only unit name, e.g. "kg". */
  unit_name: string;
  /**
   * References a tax object. Only active sales taxes can be used on quotes,
   * orders and invoices (`/3.0/taxes?types=sales_tax&scope=active`).
   */
  tax_id: number;
  tax_value: string;
  text: string;
  /** The price of one unit (max. 6 decimals). */
  unit_price: string | null;
  /** The discount (max. 6 decimals). */
  discount_in_percent: string | null;
  position_total: string;
  pos: string;
  internal_pos: number;
  /** Only in the case of quotes or orders. */
  is_optional: boolean;
  /** Position type discriminator, e.g. "KbPositionCustom". */
  type?: string;
  /** Id of the surrounding sub position, if any. */
  parent_id?: number | null;
}

/** An item (article) position — `kb_position_article`. */
export interface PositionArticle extends Omit<PositionCustom, 'type'> {
  /** References an item object. */
  article_id: number;
  /** Position type discriminator, e.g. "KbPositionArticle". */
  type?: string;
}

/** A text position — `kb_position_text`. */
export interface PositionText {
  id: number;
  text: string;
  show_pos_nr: boolean;
  pos: string | null;
  internal_pos: number;
  is_optional: boolean;
  /** Position type discriminator, e.g. "KbPositionText". */
  type?: string;
  /** Id of the surrounding sub position, if any. */
  parent_id?: number | null;
}

/** A subtotal position — `kb_position_subtotal`. */
export interface PositionSubtotal {
  id: number;
  text: string;
  value: string;
  internal_pos: number;
  is_optional: boolean;
  /** Position type discriminator, e.g. "KbPositionSubtotal". */
  type?: string;
  /** Id of the surrounding sub position, if any. */
  parent_id?: number | null;
}

/** A discount position — `kb_position_discount`. */
export interface PositionDiscount {
  id: number;
  text: string;
  /** Whether `value` is a percentage (true) or an absolute amount (false). */
  is_percentual: boolean;
  value: string;
  discount_total: string;
  /** Position type discriminator, e.g. "KbPositionDiscount". */
  type?: string;
}

/** A pagebreak position — `kb_position_pagebreak`. */
export interface PositionPagebreak {
  id: number;
  internal_pos: number;
  is_optional: boolean;
  pagebreak: boolean;
  /** Position type discriminator, e.g. "KbPositionPagebreak". */
  type?: string;
  /** Id of the surrounding sub position, if any. */
  parent_id?: number | null;
}

/** A sub position (groups other positions) — `kb_position_subposition`. */
export interface PositionSubposition {
  id: number;
  text: string;
  pos: string | null;
  internal_pos: number;
  show_pos_nr: boolean;
  is_optional: boolean;
  total_sum: string;
  show_pos_prices: boolean;
  /** Position type discriminator, e.g. "KbPositionSubposition". */
  type?: string;
  /** Id of the surrounding sub position, if any. */
  parent_id?: number | null;
}

// ---------------------------------------------------------------------------
// Position payloads (create/edit) — the API declares no required fields
// ---------------------------------------------------------------------------

/**
 * Create/edit payload for default (custom) positions.
 *
 * Note: the spec does not mark `amount_reserved`, `amount_open` and
 * `amount_completed` as readOnly, but they are fulfillment counters managed by
 * the delivery workflow (reserved/open/completed quantities derived from
 * `amount`), so they are deliberately omitted from the writable payload.
 */
export interface PositionCustomPayload {
  amount?: string;
  /** References a unit object. */
  unit_id?: number;
  /** References an account object. */
  account_id?: number;
  /** References a tax object (only active sales taxes are valid). */
  tax_id?: number;
  text?: string;
  /** The price of one unit (max. 6 decimals). */
  unit_price?: string;
  /** The discount (max. 6 decimals). */
  discount_in_percent?: string | null;
  /** Only in the case of quotes or orders. */
  is_optional?: boolean;
}

/** Create/edit payload for item (article) positions. */
export interface PositionArticlePayload extends PositionCustomPayload {
  /** References an item object. */
  article_id?: number;
}

/** Create/edit payload for text positions (`is_optional` is read-only for this kind). */
export interface PositionTextPayload {
  text?: string;
  show_pos_nr?: boolean;
}

/** Create/edit payload for subtotal positions (`is_optional` is read-only for this kind). */
export interface PositionSubtotalPayload {
  text?: string;
}

/** Create/edit payload for discount positions. */
export interface PositionDiscountPayload {
  text?: string;
  /** Whether `value` is a percentage (true) or an absolute amount (false). */
  is_percentual?: boolean;
  value?: string;
}

/** Create/edit payload for pagebreak positions (`is_optional` is read-only for this kind). */
export interface PositionPagebreakPayload {
  pagebreak?: boolean;
}

/**
 * Create/edit payload for sub positions
 * (`is_optional` and `show_pos_prices` are read-only for this kind).
 */
export interface PositionSubpositionPayload {
  text?: string;
  show_pos_nr?: boolean;
}

/** Maps a position kind to its entity type. */
export interface DocumentPositionMap {
  custom: PositionCustom;
  article: PositionArticle;
  text: PositionText;
  subtotal: PositionSubtotal;
  discount: PositionDiscount;
  pagebreak: PositionPagebreak;
  subposition: PositionSubposition;
}

/** Maps a position kind to its create/edit payload type. */
export interface DocumentPositionPayloadMap {
  custom: PositionCustomPayload;
  article: PositionArticlePayload;
  text: PositionTextPayload;
  subtotal: PositionSubtotalPayload;
  discount: PositionDiscountPayload;
  pagebreak: PositionPagebreakPayload;
  subposition: PositionSubpositionPayload;
}

/** Any document position entity. */
export type DocumentPosition = DocumentPositionMap[DocumentPositionKind];

/** Any document position create/edit payload. */
export type DocumentPositionPayload = DocumentPositionPayloadMap[DocumentPositionKind];

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** A comment on a quote, order or invoice. */
export interface DocumentComment {
  id: number;
  text: string;
  /** References a user object. */
  user_id: number | null;
  user_email?: string | null;
  user_name: string | null;
  date?: string;
  is_public?: boolean;
  /** Base64 encoded image file content. */
  image?: string | null;
  image_path?: string | null;
}

/** Payload to create a comment. Required: text, user_id, user_name. */
export interface DocumentCommentCreate {
  text: string;
  /** References a user object. */
  user_id: number | null;
  user_name: string | null;
  user_email?: string | null;
  is_public?: boolean;
}

// ---------------------------------------------------------------------------
// Document settings & templates
// ---------------------------------------------------------------------------

/** Per-document-class settings (numbering, defaults) — `kb_item_setting`. */
export interface DocumentSetting {
  id: number;
  text: string;
  kb_item_class: string;
  enumeration_format: string;
  use_automatic_enumeration: boolean;
  use_yearly_enumeration: boolean;
  next_nr: number;
  nr_min_length: number;
  default_time_period_in_days: number;
  default_logopaper_id: number;
  /** References a language object. */
  default_language_id: number;
  /** References a bank account object. */
  default_client_bank_account_new_id: number;
  /** References a currency object. */
  default_currency_id: number;
  default_mwst_type: number;
  default_mwst_is_net: boolean;
  default_nb_decimals_amount: number;
  default_nb_decimals_price: number;
  default_show_position_taxes: boolean;
  default_title: string;
  default_show_esr_on_same_page: boolean;
  /** References a payment type object. */
  default_payment_type_id: number;
  kb_terms_of_payment_template_id: number | null;
  default_show_total: boolean;
}

/** A document template (3.0 API). */
export interface DocumentTemplate {
  /** Document template identifier also known as slug. */
  template_slug: string;
  /** Document template name. */
  name: string;
  /** Indicator whether template is the default for a given type of document. */
  is_default: boolean;
  /** Documents for which the template is the default. */
  default_for_document_types: string[];
}

// ---------------------------------------------------------------------------
// APIs
// ---------------------------------------------------------------------------

/**
 * Generic access to the seven position kinds of quotes, orders and invoices.
 * Each method is parameterized by document type and position kind and maps to
 * the corresponding `/2.0/{kb_document_type}/{document_id}/kb_position_*` endpoint.
 */
export class DocumentPositionsApi {
  constructor(private readonly http: BexioHttp) {}

  private path(documentType: KbDocumentType, documentId: number, kind: DocumentPositionKind): string {
    return `/2.0/${documentType}/${documentId}/${POSITION_KIND_SEGMENTS[kind]}`;
  }

  /**
   * Fetch a list of positions of one kind on a document.
   * @see v2ListDefaultPositions — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ListItemPositions — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ListTextPositions — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ListSubtotalPositions — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ListDiscountPositions — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ListPagebreakPositions — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ListSubpositionPositions — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   */
  list<K extends DocumentPositionKind>(
    documentType: KbDocumentType,
    documentId: number,
    kind: K,
    params?: PagePaginationParams,
  ): Promise<Array<DocumentPositionMap[K]>> {
    return this.http.get(this.path(documentType, documentId, kind), { query: { ...params } });
  }

  /**
   * Fetch a single position.
   * @see v2ShowDefaultPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ShowItemPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ShowTextPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ShowSubtotalPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ShowDiscountPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ShowPagebreakPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2ShowSubpositionPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   */
  get<K extends DocumentPositionKind>(
    documentType: KbDocumentType,
    documentId: number,
    kind: K,
    positionId: number,
  ): Promise<DocumentPositionMap[K]> {
    return this.http.get(`${this.path(documentType, documentId, kind)}/${positionId}`);
  }

  /**
   * Create a position on a document.
   * @see v2CreateDefaultPosition — scope `kb_offer_edit,kb_order_edit,kb_invoice_edit`
   * @see v2CreateItemPosition — scope `kb_offer_edit,kb_order_edit,kb_invoice_edit`
   * @see v2CreateTextPosition — scope `kb_offer_edit,kb_order_edit,kb_invoice_edit`
   * @see v2CreateSubtotalPosition — scope `kb_offer_edit,kb_order_edit,kb_invoice_edit`
   * @see v2CreateDiscountPosition — scope `kb_offer_edit,kb_order_edit,kb_invoice_edit`
   * @see v2CreatePagebreakPosition — scope `kb_offer_edit,kb_order_edit,kb_invoice_edit`
   * @see v2CreateSubpositionPosition — scope `kb_offer_edit,kb_order_edit,kb_invoice_edit`
   */
  create<K extends DocumentPositionKind>(
    documentType: KbDocumentType,
    documentId: number,
    kind: K,
    payload: DocumentPositionPayloadMap[K],
  ): Promise<DocumentPositionMap[K]> {
    return this.http.post(this.path(documentType, documentId, kind), { body: payload });
  }

  /**
   * Edit a position (2.0 API uses POST on the position resource).
   * @see v2EditDefaultPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2EditItemPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2EditTextPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2EditSubtotalPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2EditDiscountPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2EditPagebreakPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2EditSubpositionPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   */
  update<K extends DocumentPositionKind>(
    documentType: KbDocumentType,
    documentId: number,
    kind: K,
    positionId: number,
    payload: DocumentPositionPayloadMap[K],
  ): Promise<DocumentPositionMap[K]> {
    return this.http.post(`${this.path(documentType, documentId, kind)}/${positionId}`, { body: payload });
  }

  /**
   * Delete a position (cannot be undone).
   * @see v2DeleteDefaultPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2DeleteItemPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2DeleteTextPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2DeleteSubtotalPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2DeleteDiscountPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2DeletePagebreakPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   * @see v2DeleteSubpositionPosition — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   */
  delete(
    documentType: KbDocumentType,
    documentId: number,
    kind: DocumentPositionKind,
    positionId: number,
  ): Promise<SuccessResponse> {
    return this.http.delete(`${this.path(documentType, documentId, kind)}/${positionId}`);
  }
}

/** Comments on quotes, orders and invoices. */
export class DocumentCommentsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of comments.
   * @see v2ListComments — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   */
  list(
    documentType: KbDocumentType,
    documentId: number,
    params?: PagePaginationParams,
  ): Promise<DocumentComment[]> {
    return this.http.get(`/2.0/${documentType}/${documentId}/comment`, { query: { ...params } });
  }

  /**
   * Fetch a comment.
   * @see v2ShowComment — scope `kb_offer_show,kb_order_show,kb_invoice_show`
   */
  get(documentType: KbDocumentType, documentId: number, commentId: number): Promise<DocumentComment> {
    return this.http.get(`/2.0/${documentType}/${documentId}/comment/${commentId}`);
  }

  /**
   * Create a comment.
   * @see v2CreateComment — scope `kb_offer_edit,kb_order_edit,kb_invoice_edit`
   */
  create(documentType: KbDocumentType, documentId: number, comment: DocumentCommentCreate): Promise<DocumentComment> {
    return this.http.post(`/2.0/${documentType}/${documentId}/comment`, { body: comment });
  }
}

/** Document settings (numbering/defaults per document class) and document templates. */
export class DocumentSettingsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of document settings.
   *
   * The spec's `order_by` enum only lists `id` and `text`, but its own
   * description states `_asc`/`_desc` can be appended to any parameter
   * (the bexio 2.0 list convention), so the `_desc` variants are accepted too.
   * @see v2ListDocumentSettings — scope `general`
   */
  listSettings(params?: { order_by?: 'id' | 'text' | 'id_desc' | 'text_desc' }): Promise<DocumentSetting[]> {
    return this.http.get('/2.0/kb_item_setting', { query: { ...params } });
  }

  /**
   * List document templates.
   * @see v3ListDocumentTemplate
   */
  listTemplates(): Promise<DocumentTemplate[]> {
    return this.http.get('/3.0/document_templates');
  }
}

/** Operation IDs of the bexio API covered by this module (used by coverage tests). */
export const salesDocsOperations = [
  'v2ShowComment',
  'v2ListComments',
  'v2CreateComment',
  'v2DeleteDefaultPosition',
  'v2ShowDefaultPosition',
  'v2EditDefaultPosition',
  'v2ListDefaultPositions',
  'v2CreateDefaultPosition',
  'v2DeleteDiscountPosition',
  'v2ShowDiscountPosition',
  'v2EditDiscountPosition',
  'v2ListDiscountPositions',
  'v2CreateDiscountPosition',
  'v2ListDocumentSettings',
  'v3ListDocumentTemplate',
  'v2DeleteItemPosition',
  'v2ShowItemPosition',
  'v2EditItemPosition',
  'v2ListItemPositions',
  'v2CreateItemPosition',
  'v2DeletePagebreakPosition',
  'v2ShowPagebreakPosition',
  'v2EditPagebreakPosition',
  'v2ListPagebreakPositions',
  'v2CreatePagebreakPosition',
  'v2DeleteSubpositionPosition',
  'v2ShowSubpositionPosition',
  'v2EditSubpositionPosition',
  'v2ListSubpositionPositions',
  'v2CreateSubpositionPosition',
  'v2DeleteSubtotalPosition',
  'v2ShowSubtotalPosition',
  'v2EditSubtotalPosition',
  'v2ListSubtotalPositions',
  'v2CreateSubtotalPosition',
  'v2DeleteTextPosition',
  'v2ShowTextPosition',
  'v2EditTextPosition',
  'v2ListTextPositions',
  'v2CreateTextPosition',
] as const;
