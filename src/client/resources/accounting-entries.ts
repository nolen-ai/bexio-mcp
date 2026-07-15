/**
 * Accounting entry resources: currencies and manual entries (3.0).
 *
 * Covers operations tagged "Currencies" and "Manual Entries" in the bexio API docs
 * (https://docs.bexio.com/#tag/Currencies, https://docs.bexio.com/#tag/Manual-Entries).
 */
import type { BexioHttp } from '../http.js';
import type { SuccessResponse } from '../types.js';

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

/** Source an exchange rate was fetched from. */
export type ExchangeRateSource = 'custom' | 'monthly_average';

/** Reason why the source of an exchange rate was chosen. */
export type ExchangeRateSourceReason =
  | 'monthly_average_provided'
  | 'monthly_average_unavailable'
  | 'monthly_average_unreachable'
  | 'source_custom';

/** A currency configured in bexio. */
export interface Currency {
  id: number;
  /** Currency name in ISO 4217 format (e.g. "CHF"); unique per company. */
  name: string;
  /** Round factor, e.g. 0.05 to round CHF to 5 Rp. */
  round_factor: number;
  /** Exchange rate fields, present when listing with `embed=exchange_rate`. */
  exchange_rate?: number | null;
  exchange_rate_id?: number | null;
  /** The ratio representing how much of the base currency equals one unit of the quote currency. */
  ratio?: number;
  /** The exchange rate of the currency multiplied by the ratio. */
  exchange_rate_to_ratio?: number;
  source?: ExchangeRateSource;
  source_reason?: ExchangeRateSourceReason;
  /** Validity date of the exchange rate. */
  exchange_rate_date?: string;
}

export interface CurrencyCreate {
  /** Currency name in ISO 4217 format (e.g. "CHF"); must be unique. */
  name: string;
  /** Round factor, e.g. 0.05 to round CHF to 5 Rp. */
  round_factor: number;
}

/** PATCH payload for a currency; only the round factor can be changed. */
export interface CurrencyUpdate {
  /** Round factor, e.g. 0.05 to round CHF to 5 Rp. */
  round_factor?: number;
}

/** A configured exchange rate of a currency. */
export interface ExchangeRate {
  /** Exchange rate in comparison with the currency in `exchange_currency`. */
  factor_nr: number;
  exchange_currency: Currency;
  /** The ratio representing how much of the base currency equals one unit of the quote currency. */
  ratio?: number;
  /** The exchange rate of the currency multiplied by the ratio. */
  exchange_rate_to_ratio?: number;
  source?: ExchangeRateSource;
  source_reason?: ExchangeRateSourceReason;
  /**
   * Validity date of the exchange rate. For custom exchange rates the date is always today;
   * for monthly average rates it is the first of the month.
   */
  exchange_rate_date?: string;
}

export interface ListCurrenciesParams {
  /** Limit the number of results (max is 2000). */
  limit?: number;
  /** Skip over a number of elements by specifying an offset value for the query. */
  offset?: number;
  /** Embed related resources, e.g. `exchange_rate` to include exchange rate fields. */
  embed?: string;
  /** The validity date for the fetched exchange rate (ISO 8601). */
  date?: string;
}

export class CurrenciesApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of currencies.
   * @see ListCurrencies
   */
  list(params?: ListCurrenciesParams): Promise<Currency[]> {
    return this.http.get('/3.0/currencies', { query: { ...params } });
  }

  /**
   * Fetch a currency.
   * @see ShowCurrency
   */
  get(currencyId: number): Promise<Currency> {
    return this.http.get(`/3.0/currencies/${currencyId}`);
  }

  /**
   * Create a currency.
   * @see CreateCurrency
   */
  create(currency: CurrencyCreate): Promise<Currency> {
    return this.http.post('/3.0/currencies', { body: currency });
  }

  /**
   * Update a currency (PATCH; only the round factor can be changed).
   * @see UpdateCurrency
   */
  update(currencyId: number, currency: CurrencyUpdate): Promise<Currency> {
    return this.http.patch(`/3.0/currencies/${currencyId}`, { body: currency });
  }

  /**
   * Delete a currency.
   * @see DeleteCurrency
   */
  delete(currencyId: number): Promise<SuccessResponse> {
    return this.http.delete(`/3.0/currencies/${currencyId}`);
  }

  /**
   * Fetch all possible currency codes (in the format CHF, EUR, etc.).
   * @see ListCurrenciesCodes
   */
  listCodes(): Promise<string[][]> {
    return this.http.get('/3.0/currencies/codes');
  }

  /**
   * Fetch all configured exchange rates for a given currency.
   * @see ListExchangeRatesForCurrency
   */
  listExchangeRates(currencyId: number, params?: { date?: string }): Promise<ExchangeRate[]> {
    return this.http.get(`/3.0/currencies/${currencyId}/exchange_rates`, { query: { ...params } });
  }
}

// ---------------------------------------------------------------------------
// Manual entries
// ---------------------------------------------------------------------------

/**
 * Booking type of a manual entry:
 * - `manual_single_entry`: simple one-line booking (one debit, one credit account)
 * - `manual_compound_entry`: total amount distributed among multiple accounts
 * - `manual_group_entry`: group of independent single entries sharing one reference number
 */
export type ManualEntryType = 'manual_single_entry' | 'manual_compound_entry' | 'manual_group_entry';

/** Reason a manual entry is locked and can no longer be edited. */
export type ManualEntryLockedInfo =
  | 'closed_business_year'
  | 'closed_tax_period'
  | 'is_generated'
  | 'Banking_transaction'
  | 'locked_business_year';

/** One booking line of a manual entry as returned by the API. */
export interface ManualEntryLine {
  /** The id of the entry resource. */
  id?: number;
  date?: string;
  /** The id of the debit account, references an account object. */
  debit_account_id?: number;
  /** The id of the credit account, references an account object. */
  credit_account_id?: number;
  /** References a tax object. */
  tax_id?: number;
  /** The id of the debit account or credit account, references an account object. */
  tax_account_id?: number;
  /** A description for the entry. */
  description?: string;
  /** The total amount of the entry. */
  amount?: number;
  /** References a currency object. */
  currency_id?: number;
  /** The id of the currency used in the general ledger. */
  base_currency_id?: number;
  /**
   * The exchange factor of the currency_id and base_currency_id. Always 1 when
   * currency_id is identical to the base_currency_id.
   */
  currency_factor?: number;
  /** The total amount of the entry in the currency of the general ledger. */
  base_currency_amount?: number;
  /** The id of the user which originally created the entry. */
  created_by_user_id?: number;
  /** The id of the user which made the latest modification to the entry. */
  edited_by_user_id?: number;
}

/** A manual accounting entry (booking). */
export interface ManualEntry {
  /** The id of the main resource. */
  id?: number;
  type: ManualEntryType;
  /** The booking date. */
  date?: string;
  /** A reference number for the booking. */
  reference_nr?: string;
  /** The id of the user which originally created the entry. */
  created_by_user_id?: number;
  /** The id of the user which made the latest modification to the entry. */
  edited_by_user_id?: number;
  entries: ManualEntryLine[];
  /** Whether the booking is locked. Locked entries can no longer be edited. */
  is_locked?: boolean;
  locked_info?: ManualEntryLockedInfo;
}

/** One booking line sent when creating/updating a manual entry. */
export interface ManualEntryLinePayload {
  /** The id of the debit account, references an account object. */
  debit_account_id?: number;
  /** The id of the credit account, references an account object. */
  credit_account_id?: number;
  /** References a tax object. */
  tax_id?: number;
  /** The id of the debit account or credit account, references an account object. */
  tax_account_id?: number;
  /** A description for the entry. */
  description?: string;
  /** The total amount of the entry. */
  amount?: number;
  /** References a currency object. */
  currency_id?: number;
  /**
   * The exchange factor of the currency_id and base_currency_id. Always 1 when
   * currency_id is identical to the base_currency_id.
   */
  currency_factor?: number;
  /** The id of the entry resource (only for updates of existing lines). */
  id?: number;
}

export interface ManualEntryCreate {
  type: ManualEntryType;
  /** The booking date (ISO 8601). */
  date: string;
  /** A reference number for the booking. */
  reference_nr?: string;
  entries: ManualEntryLinePayload[];
}

export interface ManualEntryUpdate {
  type: ManualEntryType;
  /** The booking date (ISO 8601). */
  date: string;
  /** A reference number for the booking. */
  reference_nr?: string;
  entries: ManualEntryLinePayload[];
  /** The id of the main resource. */
  id?: number;
}

/** Metadata of a file attached to a manual entry (line). */
export interface ManualEntryFile {
  /** The id of the file. */
  id?: number;
  /** The uuid of the file. */
  uuid?: string;
  /** The name of the file. */
  name?: string;
  /** The size of the file in bytes. */
  size_in_bytes?: number;
  /** The extension of the file. */
  extension?: string;
  /** The mime type of the file. */
  mime_type?: string;
  /** Email of the sender if the file was added by email. */
  uploader_email?: string | null;
  /** The id of the user which originally uploaded the file. */
  user_id?: number;
  /** Is file archived? */
  is_archived?: boolean;
  /** ID of the source (web, mobile, etc.) this file has been uploaded from. @deprecated */
  source_id?: number;
  /** Type of the source (web, mobile, etc.) this file has been uploaded from. */
  source_type?: 'web' | 'email' | 'mobile' | null;
  /** Whether the file is referenced to a document or not. */
  is_referenced?: boolean;
  /** File upload date. */
  created_at?: string;
}

/** File metadata plus base64-encoded content. */
export interface ManualEntryFileDetail extends ManualEntryFile {
  /** Base64-encoded file content. */
  data?: string;
}

export class ManualEntriesApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of manual entries.
   * @see ListManualEntries — scope `accounting`
   */
  list(params?: { limit?: number; offset?: number }): Promise<ManualEntry[]> {
    return this.http.get('/3.0/accounting/manual_entries', { query: { ...params } });
  }

  /**
   * Create manual entry.
   * @see CreateManualEntry — scope `accounting`
   */
  create(entry: ManualEntryCreate): Promise<ManualEntry> {
    return this.http.post('/3.0/accounting/manual_entries', { body: entry });
  }

  /**
   * Update manual entry.
   * @see UpdateManualEntry — scope `accounting`
   */
  update(manualEntryId: number, entry: ManualEntryUpdate): Promise<ManualEntry> {
    return this.http.put(`/3.0/accounting/manual_entries/${manualEntryId}`, { body: entry });
  }

  /**
   * Delete manual entry.
   * @see DeleteManualEntry
   */
  delete(manualEntryId: number): Promise<SuccessResponse> {
    return this.http.delete(`/3.0/accounting/manual_entries/${manualEntryId}`);
  }

  /**
   * Get the reference number suggested for the next manual entry.
   * @see GetNextReferenceNumber — scope `accounting`
   */
  getNextReferenceNumber(): Promise<{ next_ref_nr: string }> {
    return this.http.get('/3.0/accounting/manual_entries/next_ref_nr');
  }

  /**
   * Fetch files of a manual entry line (entry types manual_single_entry and manual_group_entry only).
   * @see ListManualEntryFiles
   */
  listEntryFiles(
    manualEntryId: number,
    entryId: number,
    params?: { limit?: number; offset?: number },
  ): Promise<ManualEntryFile[]> {
    return this.http.get(`/3.0/accounting/manual_entries/${manualEntryId}/entries/${entryId}/files`, {
      query: { ...params },
    });
  }

  /**
   * Fetch a file of a manual entry line, including its base64 content.
   * @see ShowManualEntryFile
   */
  getEntryFile(manualEntryId: number, entryId: number, fileId: number): Promise<ManualEntryFileDetail> {
    return this.http.get(`/3.0/accounting/manual_entries/${manualEntryId}/entries/${entryId}/files/${fileId}`);
  }

  /**
   * Add file(s) to a manual entry line (multipart/form-data, field name e.g. `fileName`).
   * @see UploadManualEntryFile
   */
  uploadEntryFile(manualEntryId: number, entryId: number, form: FormData): Promise<ManualEntryFile[]> {
    return this.http.post(`/3.0/accounting/manual_entries/${manualEntryId}/entries/${entryId}/files`, { form });
  }

  /**
   * Delete the connection between a file and a manual entry line.
   * @see DeleteManualEntryFile
   */
  deleteEntryFile(manualEntryId: number, entryId: number, fileId: number): Promise<SuccessResponse> {
    return this.http.delete(`/3.0/accounting/manual_entries/${manualEntryId}/entries/${entryId}/files/${fileId}`);
  }

  /**
   * Fetch files of a manual compound entry.
   * @see ListManualCompoundEntryFiles
   */
  listCompoundEntryFiles(
    manualEntryId: number,
    params?: { limit?: number; offset?: number },
  ): Promise<ManualEntryFile[]> {
    return this.http.get(`/3.0/accounting/manual_entries/${manualEntryId}/files`, { query: { ...params } });
  }

  /**
   * Fetch a file of a manual compound entry, including its base64 content.
   * @see ShowManualCompoundEntryFile
   */
  getCompoundEntryFile(manualEntryId: number, fileId: number): Promise<ManualEntryFileDetail> {
    return this.http.get(`/3.0/accounting/manual_entries/${manualEntryId}/files/${fileId}`);
  }

  /**
   * Add file(s) to a manual compound entry (multipart/form-data, field name e.g. `fileName`).
   * @see UploadManualCompoundEntryFile
   */
  uploadCompoundEntryFile(manualEntryId: number, form: FormData): Promise<ManualEntryFile[]> {
    return this.http.post(`/3.0/accounting/manual_entries/${manualEntryId}/files`, { form });
  }

  /**
   * Delete the connection between a file and a manual compound entry.
   * @see DeleteManualCompoundEntryFile
   */
  deleteCompoundEntryFile(manualEntryId: number, fileId: number): Promise<SuccessResponse> {
    return this.http.delete(`/3.0/accounting/manual_entries/${manualEntryId}/files/${fileId}`);
  }
}

/**
 * Operation IDs of the bexio API covered by {@link CurrenciesApi} and
 * {@link ManualEntriesApi} (used by coverage tests).
 */
export const accountingEntriesOperations = [
  'ListCurrencies',
  'CreateCurrency',
  'ShowCurrency',
  'UpdateCurrency',
  'DeleteCurrency',
  'ListCurrenciesCodes',
  'ListExchangeRatesForCurrency',
  'ListManualEntries',
  'CreateManualEntry',
  'UpdateManualEntry',
  'DeleteManualEntry',
  'GetNextReferenceNumber',
  'ListManualEntryFiles',
  'ShowManualEntryFile',
  'UploadManualEntryFile',
  'DeleteManualEntryFile',
  'ListManualCompoundEntryFiles',
  'ShowManualCompoundEntryFile',
  'UploadManualCompoundEntryFile',
  'DeleteManualCompoundEntryFile',
] as const;
