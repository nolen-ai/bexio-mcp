/**
 * Sales orders and deliveries (2.0 API).
 *
 * Covers operations tagged "Orders" and "Deliveries" in the bexio API docs
 * (https://docs.bexio.com/#tag/Orders, https://docs.bexio.com/#tag/Deliveries).
 */
import type { BexioHttp } from '../http.js';
import type { FetchedFile, ListParams, SearchCriteria, SuccessResponse } from '../types.js';

/** Position type discriminator used across kb documents. */
export type KbPositionType =
  | 'KbPositionArticle'
  | 'KbPositionCustom'
  | 'KbPositionText'
  | 'KbPositionSubposition'
  | 'KbPositionSubtotal'
  | 'KbPositionPagebreak'
  | 'KbPositionDiscount';

/**
 * A document position sent when creating an order. bexio accepts several
 * position shapes (custom, article, text, subtotal, pagebreak, discount);
 * the exact fields depend on the position `type`.
 */
export type OrderPositionInput = Record<string, unknown>;

/** Tax summary entry on kb documents. */
export interface KbTax {
  percentage?: string;
  value?: string;
}

/** A sales order (kb_order). */
export interface Order {
  id: number;
  /**
   * Can not be used if "automatic numbering" is activated in frontend-settings.
   * Required if "automatic numbering" is deactivated.
   */
  document_nr: string;
  title: string | null;
  /** References a contact object. */
  contact_id: number;
  /** References a contact object. */
  contact_sub_id: number | null;
  /** References a user object. */
  user_id: number;
  /** References a project object. */
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
   * Affects the total if `mwst_type` is 0. `false` = taxes are included in the
   * total, `true` = taxes will be added to the total.
   */
  mwst_is_net: boolean;
  show_position_taxes: boolean;
  is_valid_from: string;
  contact_address: string;
  /** Manually set contact address; when `null` the contact's invoice address is used. */
  contact_address_manual?: string | null;
  /** 0 = use invoice address, 1 = use custom address. */
  delivery_address_type: 0 | 1;
  delivery_address: string;
  /** Manual delivery address, used when `delivery_address_type` is 1. */
  delivery_address_manual?: string | null;
  /** 5 = Pending, 6 = Done, 15 = Partial, 21 = Canceled. */
  kb_item_status_id: 5 | 6 | 15 | 21;
  is_recurring: boolean;
  /** Only readable/editable via the API; stores references to other systems. */
  api_reference: string | null;
  viewed_by_client_at: string | null;
  updated_at: string;
  /** References a document template slug. */
  template_slug: string | null;
  taxs: KbTax[];
  network_link: string | null;
  /** Document positions (returned by the detail endpoint). */
  positions?: OrderPositionInput[];
}

/**
 * Payload for creating an order. The spec marks no field as strictly required,
 * but at least `contact_id` and `user_id` are typically needed.
 */
export interface OrderCreate {
  /**
   * Can not be used if "automatic numbering" is activated in frontend-settings.
   * Required if "automatic numbering" is deactivated.
   */
  document_nr?: string;
  title?: string | null;
  /** References a contact object. */
  contact_id?: number;
  /** References a contact object. */
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
   * Affects the total if `mwst_type` is 0. `false` = taxes are included in the
   * total, `true` = taxes will be added to the total.
   */
  mwst_is_net?: boolean;
  show_position_taxes?: boolean;
  is_valid_from?: string;
  /** Manually set contact address; when `null` the contact's invoice address is used. */
  contact_address_manual?: string | null;
  /** 0 = use invoice address, 1 = use custom address. */
  delivery_address_type?: 0 | 1;
  /** Manual delivery address, used when `delivery_address_type` is 1. */
  delivery_address_manual?: string | null;
  /** Only readable/editable via the API; stores references to other systems. */
  api_reference?: string | null;
  /** References a document template slug. */
  template_slug?: string | null;
  /**
   * Document positions. Multiple position types can be combined; bexio
   * recommends at most 150 positions per document.
   */
  positions?: OrderPositionInput[];
}

/** Payload for editing an order (positions cannot be edited here; `contact_id` may be null). */
export type OrderUpdate = Omit<OrderCreate, 'positions' | 'contact_id'> & { contact_id?: number | null };

export type OrderRepetitionWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/** Repetition rule: one of four formats (`daily`, `weekly`, `monthly`, `yearly`). */
export type OrderRepetitionRule =
  | { type: 'daily'; /** Each `interval` days. */ interval: number }
  | { type: 'weekly'; /** Each `interval` weeks. */ interval: number; weekdays: OrderRepetitionWeekday[] }
  | {
      type: 'monthly';
      /** Each `interval` months. */ interval: number;
      schedule: 'fixed_day' | 'week_day' | 'first_day' | 'last_day';
    }
  | { type: 'yearly'; /** Each `interval` years. */ interval: number };

/** Recurring-order configuration of an order. */
export interface OrderRepetition {
  /** Start date (ISO 8601). */
  start: string;
  /** Date until the repetition is supposed to run. If empty, indefinite repetition is assumed. */
  end: string | null;
  /** Four different formats can be used: type `daily`, `weekly`, `monthly` or `yearly`. */
  repetition: OrderRepetitionRule;
}

/** Position reference when deriving a document (delivery/invoice) from an order. */
export interface CreateFromDocumentPosition {
  id?: number;
  type?: KbPositionType;
  amount?: number;
}

/**
 * Body for creating a delivery/invoice from an order. The `positions` array can
 * be omitted to create a document with all positions from the source document.
 */
export interface CreateFromDocumentPayload {
  positions?: CreateFromDocumentPosition[];
}

/** A delivery note (kb_delivery). Deliveries are created from orders. */
export interface Delivery {
  id: number;
  document_nr: string;
  title: string | null;
  /** References a contact object. */
  contact_id: number | null;
  /** References a contact object. */
  contact_sub_id: number | null;
  /** References a user object. */
  user_id: number;
  logopaper_id: number;
  /** References a language object. */
  language_id: number;
  /** References a bank account object. */
  bank_account_id: number;
  /** References a currency object. */
  currency_id: number;
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
   * Affects the total if `mwst_type` is 0. `false` = taxes are included in the
   * total, `true` = taxes will be added to the total.
   */
  mwst_is_net: boolean;
  is_valid_from: string;
  contact_address: string;
  delivery_address_type: number;
  delivery_address: string;
  /** 10 = Draft, 18 = Done, 20 = Canceled. */
  kb_item_status_id: 10 | 18 | 20;
  /** Only readable/editable via the API; stores references to other systems. */
  api_reference: string | null;
  viewed_by_client_at: string | null;
  updated_at: string;
  taxs: KbTax[];
  /** Document positions (returned by the detail endpoint). */
  positions?: OrderPositionInput[];
}

export class OrdersApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of orders.
   * @see v2ListOrders — scope `kb_order_show`
   */
  list(params?: ListParams): Promise<Order[]> {
    return this.http.get('/2.0/kb_order', { query: { ...params } });
  }

  /**
   * Search orders.
   * @see v2SearchOrders — scope `kb_order_show`
   */
  search(criteria: SearchCriteria[], params?: ListParams): Promise<Order[]> {
    return this.http.post('/2.0/kb_order/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch an order.
   * @see v2ShowOrder — scope `kb_order_show`
   */
  get(orderId: number): Promise<Order> {
    return this.http.get(`/2.0/kb_order/${orderId}`);
  }

  /**
   * Create order.
   * @see v2CreateOrder — scope `kb_order_edit`
   */
  create(order: OrderCreate): Promise<Order> {
    return this.http.post('/2.0/kb_order', { body: order });
  }

  /**
   * Edit an order.
   * @see v2EditOrder — scope `kb_order_edit`
   */
  update(orderId: number, order: OrderUpdate): Promise<Order> {
    return this.http.post(`/2.0/kb_order/${orderId}`, { body: order });
  }

  /**
   * Delete an order.
   * @see DeleteOrder — scope `kb_order_edit`
   */
  delete(orderId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/kb_order/${orderId}`);
  }

  /**
   * Show PDF of an order.
   *
   * Spec quirk: the OpenAPI spec declares `logopaper` as an `in: path` parameter,
   * but the path template `/2.0/kb_order/{order_id}/pdf` has no placeholder for it,
   * so it is deliberately sent as a query parameter instead.
   * @param logopaper Whether the PDF should be generated using the letterhead (1) or not (0).
   * @see v2ShowOrderPDF — scope `kb_order_show`
   */
  pdf(orderId: number, logopaper?: 0 | 1): Promise<FetchedFile> {
    return this.http.get(`/2.0/kb_order/${orderId}/pdf`, { query: { logopaper } });
  }

  /**
   * Show repetition (recurring-order configuration) of an order.
   * @see v2ShowOrderRepetition — scope `kb_order_show`
   */
  getRepetition(orderId: number): Promise<OrderRepetition> {
    return this.http.get(`/2.0/kb_order/${orderId}/repetition`);
  }

  /**
   * Edit a repetition (recurring-order configuration).
   * @see v2EditOrderRepetition — scope `kb_order_edit`
   */
  editRepetition(orderId: number, repetition: OrderRepetition): Promise<OrderRepetition> {
    return this.http.post(`/2.0/kb_order/${orderId}/repetition`, { body: repetition });
  }

  /**
   * Delete a repetition (stops the recurring order).
   * @see DeleteOrderRepetition — scope `kb_order_edit`
   */
  deleteRepetition(orderId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/kb_order/${orderId}/repetition`);
  }

  /**
   * Create delivery from order. Omit `positions` to copy all positions of the order.
   * @see v2CreateDeliveryFromOrder — scope `kb_order_edit,kb_delivery_edit`
   */
  createDelivery(orderId: number, payload?: CreateFromDocumentPayload): Promise<Delivery> {
    return this.http.post(`/2.0/kb_order/${orderId}/delivery`, { body: payload ?? {} });
  }

  /**
   * Create invoice from order. Omit `positions` to copy all positions of the order.
   * Returns the created invoice (see the invoices module for its shape).
   * @see v2CreateInvoiceFromOrder — scope `kb_order_edit,kb_invoice_edit`
   */
  createInvoice(orderId: number, payload?: CreateFromDocumentPayload): Promise<unknown> {
    return this.http.post(`/2.0/kb_order/${orderId}/invoice`, { body: payload ?? {} });
  }
}

export class DeliveriesApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of deliveries.
   * @see v2ListDeliveries — scope `kb_delivery_show`
   */
  list(params?: ListParams): Promise<Delivery[]> {
    return this.http.get('/2.0/kb_delivery', { query: { ...params } });
  }

  /**
   * Fetch a delivery.
   * @see v2ShowDelivery — scope `kb_delivery_show`
   */
  get(deliveryId: number): Promise<Delivery> {
    return this.http.get(`/2.0/kb_delivery/${deliveryId}`);
  }

  /**
   * Issue a delivery (moves it from draft to issued/done).
   * @see v2IssueDelivery — scope `kb_delivery_edit`
   */
  issue(deliveryId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/kb_delivery/${deliveryId}/issue`);
  }
}

/** Operation IDs of the bexio API covered by {@link OrdersApi} and {@link DeliveriesApi} (used by coverage tests). */
export const ordersOperations = [
  'v2ListOrders',
  'v2SearchOrders',
  'v2ShowOrder',
  'v2CreateOrder',
  'v2EditOrder',
  'DeleteOrder',
  'v2ShowOrderPDF',
  'v2ShowOrderRepetition',
  'v2EditOrderRepetition',
  'DeleteOrderRepetition',
  'v2CreateDeliveryFromOrder',
  'v2CreateInvoiceFromOrder',
  'v2ListDeliveries',
  'v2ShowDelivery',
  'v2IssueDelivery',
] as const;
