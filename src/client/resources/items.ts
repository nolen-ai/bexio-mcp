/**
 * Items resources: items/articles (2.0), stock locations and stock areas (2.0).
 *
 * Covers operations tagged "Items", "Stock locations" and "Stock Areas" in the
 * bexio API docs (https://docs.bexio.com/#tag/Items).
 */
import type { BexioHttp } from '../http.js';
import type { ListParams, SearchCriteria, SuccessResponse } from '../types.js';

/** An item (called "article" in the bexio API paths). */
export interface Item {
  id: number;
  /** References a user object (currently has no impact, regardless of which user_id is sent). */
  user_id: number;
  /** Use the value `1` for physical products or `2` for services. */
  article_type_id: number;
  /** References a contact object. */
  contact_id: number | null;
  deliverer_code: string | null;
  deliverer_name: string | null;
  deliverer_description: string | null;
  intern_code: string;
  intern_name: string;
  intern_description: string | null;
  purchase_price: string | null;
  sale_price: string | null;
  purchase_total: number | null;
  sale_total: number | null;
  /** References a currency object. */
  currency_id: number | null;
  /** References a tax object. */
  tax_income_id: number | null;
  /** References a tax object. Read-only. */
  tax_id: number | null;
  /** References a tax object. */
  tax_expense_id: number | null;
  /** References a unit object. */
  unit_id: number | null;
  /** Requires `stock_edit` scope to work. */
  is_stock: boolean;
  /** References a stock location object. */
  stock_id: number | null;
  /** References a stock area object. */
  stock_place_id: number | null;
  /** The stock number can only be set if no bookings for this product have been made yet. */
  stock_nr: number;
  stock_min_nr: number;
  /** Read-only. */
  stock_reserved_nr: number;
  /** Read-only. */
  stock_available_nr: number;
  /** Read-only. */
  stock_picked_nr: number;
  /** Read-only. */
  stock_disposed_nr: number;
  /** Read-only. */
  stock_ordered_nr: number;
  width: number | null;
  height: number | null;
  weight: number | null;
  volume: number | null;
  html_text: string | null;
  remarks: string | null;
  delivery_price: number | null;
  article_group_id: number | null;
  /** References an account object. */
  account_id: number | null;
  /** References an account object. */
  expense_account_id: number | null;
}

/**
 * Payload for creating an item. Read-only fields (`id`, `tax_id`, the computed
 * `stock_*_nr` counters) are excluded. The API requires at least `intern_name`.
 */
export type ItemCreate = Partial<
  Omit<
    Item,
    | 'id'
    | 'tax_id'
    | 'stock_reserved_nr'
    | 'stock_available_nr'
    | 'stock_picked_nr'
    | 'stock_disposed_nr'
    | 'stock_ordered_nr'
  >
>;

/** Payload for editing an item; any subset of the writable fields. */
export type ItemUpdate = ItemCreate;

/** A stock location. */
export interface StockLocation {
  id: number;
  name: string;
}

/** A stock area (called "stock_place" in the bexio API paths). */
export interface StockArea {
  id: number;
  name: string;
}

export class ItemsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of items.
   * @see v2ListItems — scope `article_show`
   */
  listItems(params?: ListParams): Promise<Item[]> {
    return this.http.get('/2.0/article', { query: { ...params } });
  }

  /**
   * Search items.
   * @see v2SearchItems — scope `article_show`
   */
  searchItems(criteria: SearchCriteria[], params?: ListParams): Promise<Item[]> {
    return this.http.post('/2.0/article/search', { query: { ...params }, body: criteria });
  }

  /**
   * Fetch an item.
   * @see v2ShowItem — scope `article_show`
   */
  getItem(articleId: number): Promise<Item> {
    return this.http.get(`/2.0/article/${articleId}`);
  }

  /**
   * Create item.
   * @see v2CreateItem — scope `article_edit`
   */
  createItem(item: ItemCreate): Promise<Item> {
    return this.http.post('/2.0/article', { body: item });
  }

  /**
   * Edit an item.
   * @see v2EditItem — scope `article_edit`
   */
  updateItem(articleId: number, item: ItemUpdate): Promise<Item> {
    return this.http.post(`/2.0/article/${articleId}`, { body: item });
  }

  /**
   * Delete an item.
   * @see DeleteItem — scope `article_edit`
   */
  deleteItem(articleId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/article/${articleId}`);
  }
}

export class StockApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of stock locations.
   * @see v2ListStockLocations — scope `stock_edit`
   */
  listStockLocations(params?: ListParams): Promise<StockLocation[]> {
    return this.http.get('/2.0/stock', { query: { ...params } });
  }

  /**
   * Search stock locations.
   * @see v2SearchStockLocations — scope `stock_edit`
   */
  searchStockLocations(criteria: SearchCriteria[], params?: ListParams): Promise<StockLocation[]> {
    return this.http.post('/2.0/stock/search', { query: { ...params }, body: criteria });
  }

  /**
   * Fetch a list of stock areas.
   * @see v2ListStockAreas — scope `stock_edit`
   */
  listStockAreas(params?: ListParams): Promise<StockArea[]> {
    return this.http.get('/2.0/stock_place', { query: { ...params } });
  }

  /**
   * Search stock areas.
   * @see v2SearchStockAreas — scope `stock_edit`
   */
  searchStockAreas(criteria: SearchCriteria[], params?: ListParams): Promise<StockArea[]> {
    return this.http.post('/2.0/stock_place/search', { query: { ...params }, body: criteria });
  }
}

/** Operation IDs of the bexio API covered by {@link ItemsApi} and {@link StockApi} (used by coverage tests). */
export const itemsOperations = [
  'v2ListItems',
  'v2SearchItems',
  'v2ShowItem',
  'v2CreateItem',
  'v2EditItem',
  'DeleteItem',
  'v2ListStockLocations',
  'v2SearchStockLocations',
  'v2ListStockAreas',
  'v2SearchStockAreas',
] as const;
