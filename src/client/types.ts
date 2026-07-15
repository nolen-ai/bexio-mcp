/**
 * Shared types used across all bexio API resources.
 */

/** Comparison operators accepted by the legacy (2.0) POST `/…/search` endpoints. */
export type SearchCriteriaOperator =
  | '='
  | 'equal'
  | '!='
  | 'not_equal'
  | '>'
  | 'greater_than'
  | '<'
  | 'less_than'
  | '>='
  | 'greater_equal'
  | '<='
  | 'less_equal'
  | 'like'
  | 'not_like'
  | 'is_null'
  | 'not_null'
  | 'in'
  | 'not_in';

/**
 * One condition of a legacy search request. Conditions in the same request are combined
 * with logical AND. `criteria` defaults to `like` when omitted.
 */
export interface SearchCriteria {
  field: string;
  value: string | number | boolean | null | Array<string | number>;
  criteria?: SearchCriteriaOperator;
}

/** Pagination/sorting query parameters shared by most list endpoints. */
export interface ListParams {
  /** Maximum number of results (API default 500, max 2000 for most endpoints). */
  limit?: number;
  /** Number of elements to skip. */
  offset?: number;
  /** Field to order by; append `_desc` for descending order (e.g. `"id_desc"`). */
  order_by?: string;
}

/** Common response of DELETE and similar operations: `{ "success": true }`. */
export interface SuccessResponse {
  success: boolean;
}

/** Paystub/document/PDF payloads returned by several endpoints. */
export interface FetchedFile {
  name: string;
  size: number;
  mime: string;
  /** Base64-encoded file content. */
  content: string;
}

/** Scalar value accepted in query strings. `undefined` entries are omitted. */
export type QueryValue = string | number | boolean | undefined;

/** Query-string parameters. Array values are serialized as comma-separated lists. */
export type QueryParams = Record<string, QueryValue | QueryValue[]>;
