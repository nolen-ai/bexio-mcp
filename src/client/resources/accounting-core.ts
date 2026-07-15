/**
 * Core accounting resources: accounts and account groups (2.0), calendar years,
 * business years, vat periods, taxes and the accounting journal (3.0).
 *
 * Covers operations tagged "Accounts", "Account Groups", "Calendar Years",
 * "Business Years", "Vat Periods", "Taxes" and the journal report in the bexio
 * API docs (https://docs.bexio.com/#tag/Accounts, https://docs.bexio.com/#tag/Taxes, …).
 */
import type { BexioHttp } from '../http.js';
import type { ListParams, SearchCriteria, SuccessResponse } from '../types.js';

/**
 * Type of an account:
 * 1 = earnings, 2 = expenditures, 3 = active account, 4 = passive account, 5 = complete account.
 */
export type AccountType = 1 | 2 | 3 | 4 | 5;

/** A ledger account of the chart of accounts (2.0 API). Read-only via this API. */
export interface Account {
  /** The id of the account. */
  id: number;
  /** The uuid of the account. */
  uuid: string;
  /** The account number. */
  account_no: string;
  /** The name of the account (as shown in the balance sheet or in the P/L statement). */
  name: string;
  /** 1 = earnings, 2 = expenditures, 3 = active account, 4 = passive account, 5 = complete account. */
  account_type: AccountType;
  /** References a tax object. */
  tax_id: number;
  /** The id of the associated account group. References an account group object. */
  fibu_account_group_id: number;
  /** Whether the account is active. Inactive accounts can not be used for new bookings. */
  is_active: boolean;
  /** Determines if the account is locked. Locked accounts can not be edited or deleted. */
  is_locked: boolean;
}

/** A group of the chart of accounts (2.0 API). Read-only via this API. */
export interface AccountGroup {
  /** The id of the account group. */
  id: number;
  /** The uuid of the account group. */
  uuid: string;
  /** The number of the account group. */
  account_no: string;
  /** The name of the account group. */
  name: string;
  /** The id of the parent account group. */
  parent_fibu_account_group_id: number;
  /** Whether the account group is active. */
  is_active: boolean;
  /** Determines if the account group is locked. Locked groups can not be edited or deleted. */
  is_locked: boolean;
}

export type VatAccountingMethod = 'effective' | 'net_tax';
export type VatAccountingType = 'agreed' | 'collected';

/** An accounting calendar year (3.0 API). */
export interface CalendarYear {
  /** The id of the calendar year. */
  id: number;
  /** Start date of the calendar year. */
  start: string;
  /** End date of the calendar year. */
  end: string;
  /** Determines if the calendar year is vat subjected or not. */
  is_vat_subject: boolean;
  /** Determines if the calendar year has annual reporting enabled. */
  is_annual_reporting: boolean;
  /** Creation date of the calendar year. */
  created_at: string;
  /** Last time when the calendar year was updated. */
  updated_at: string;
  vat_accounting_method: VatAccountingMethod;
  vat_accounting_type: VatAccountingType;
}

/** Payload for creating a calendar year. */
export interface CalendarYearCreate {
  /**
   * The year for which to create an entry (e.g. "2018"). Years can be created up
   * to 10 years ahead and must be higher than 2016. If it is a future year, all
   * years in between are generated with the chosen settings.
   */
  year?: string;
  /** Determines if the calendar year is vat subjected or not. */
  is_vat_subject?: boolean;
  /** Determines if the calendar year has annual reporting enabled. */
  is_annual_reporting?: boolean;
  /** Vat accounting method. */
  vat_accounting_method?: VatAccountingMethod;
  /** Vat accounting type. */
  vat_accounting_type?: VatAccountingType;
  /** Default tax id for income. References a tax object. */
  default_tax_income_id?: number;
  /**
   * Default tax id for expense. Not required on the bexio mini plan (the year is
   * then created with the tax id of the previous year). References a tax object.
   */
  default_tax_expense_id?: number;
}

/** An accounting business year (3.0 API). Read-only via the API. */
export interface BusinessYear {
  /** The id of the business year. */
  id: number;
  /** Start date of the business year. */
  start: string;
  /** End date of the business year. */
  end: string;
  status: 'open' | 'locked' | 'closed';
  /** Closed date of the business year. */
  closed_at: string | null;
}

/** A VAT period (3.0 API). Read-only via the API. */
export interface VatPeriod {
  /** The id of the vat period. */
  id: number;
  /** Start date of the vat period. */
  start: string;
  /** End date of the vat period. */
  end: string;
  type: 'quarter' | 'semester' | 'annual';
  status: 'open' | 'closed' | 'closed_with_message';
  /** Closed date of the vat period. */
  closed_at: string | null;
}

/** VAT digit (Ziffer) of a tax. */
export type TaxDigit =
  | '200'
  | '205'
  | '205.301'
  | '205.302'
  | '205.303'
  | '205.311'
  | '205.312'
  | '205.313'
  | '205.341'
  | '205.342'
  | '205.343'
  | '220';

export type TaxType =
  | 'net_tax'
  | 'non_consideration_sales_tax'
  | 'pre_customs_tax_investment'
  | 'pre_customs_tax_material'
  | 'pre_regards_tax_investment'
  | 'pre_regards_tax_material'
  | 'pre_tax_investment'
  | 'pre_tax_material'
  | 'sales_tax'
  | 'not_taxable_turnover'
  | 'opted_net_tax'
  | 'opted_sales_tax';

/** A VAT tax rate (3.0 API). */
export interface Tax {
  /** The id of the tax. */
  id: number;
  /** The uuid of the tax. */
  uuid: string;
  /** An internal name (please use display_name as the representation value). */
  name: string;
  /** The tax code. Also used within the value display_name. */
  code: string;
  /** The VAT digit (Ziffer) of the tax. */
  digit: TaxDigit;
  type: TaxType;
  /** The id of the associated account, references an account object. */
  account_id: number;
  tax_settlement_type: string;
  /** The tax percentage. */
  value: number;
  /** The net tax percentage (only used if the tax has the type `net_tax`). */
  net_tax_value: string;
  /** The start year from which on the tax is valid. If null, every year before end_year is valid. */
  start_year: number | null;
  /** The end year until the tax is valid. If null, every year starting from start_year is valid. */
  end_year: number | null;
  /** Whether the tax is active. Inactive taxes can not be used for new bookings. */
  is_active: boolean;
  /** A human readable description of the tax. Includes the code. */
  display_name: string;
  start_month: number | null;
  end_month: number | null;
}

/** Query parameters of {@link AccountingApi.listTaxes}. */
export interface ListTaxesParams {
  /** Filter for active or inactive taxes. */
  scope?: 'active' | 'inactive';
  /** Displays all taxes which are active at the given date (ISO 8601). */
  date?: string;
  /** Filter the types of the tax. */
  types?: 'sales_tax' | 'pre_tax';
  /** Limit the number of results (max is 2000). */
  limit?: number;
  /** Skip over a number of elements by specifying an offset value for the query. */
  offset?: number;
}

/** An entry of the accounting journal report (3.0 API). Read-only. */
export interface JournalEntry {
  /** The id of the journal entry. */
  id: number;
  /** Referenced id of the entry. */
  ref_id: number;
  /** Referenced uuid of the entry. */
  ref_uuid: string;
  /** Referenced class of the entry. */
  ref_class: string;
  /** Entry date for the entry. */
  date: string;
  /** The id of the debit account, references an account object. */
  debit_account_id: number;
  /** The id of the credit account, references an account object. */
  credit_account_id: number;
  /** A description for the entry. */
  description: string;
  /** The total amount of the entry. */
  amount: number;
  /** The id of the referenced currency, references a currency object. */
  currency_id: number;
  /** The exchange factor between currency_id and base_currency_id (1 if they are equal). */
  currency_factor: number;
  /** The id of the currency used in the general ledger, references a currency object. */
  base_currency_id: number;
  /** The total amount of the entry in the currency of the general ledger. */
  base_currency_amount: number;
}

/** Query parameters of {@link AccountingApi.listJournalEntries}. */
export interface ListJournalEntriesParams {
  /** Filter for entries after this date (ISO 8601). */
  from?: string;
  /** Filter for entries until this date (ISO 8601). */
  to?: string;
  /** Filter for entries of the account with this uuid. */
  account_uuid?: string;
  /** Limit the number of results (max is 2000). */
  limit?: number;
  /** Skip over a number of elements by specifying an offset value for the query. */
  offset?: number;
}

export class AccountingApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of accounts.
   * @see v2ListAccounts
   */
  listAccounts(params?: { limit?: number; offset?: number }): Promise<Account[]> {
    return this.http.get('/2.0/accounts', { query: { ...params } });
  }

  /**
   * Search accounts. Searchable fields include account_no, fibu_account_group_id, name, account_type.
   * @see v2SearchAccounts
   */
  searchAccounts(criteria: SearchCriteria[], params?: ListParams): Promise<Account[]> {
    return this.http.post('/2.0/accounts/search', { query: { ...params }, body: criteria });
  }

  /**
   * Fetch a list of account groups.
   * @see v2ListAccountGroups
   */
  listAccountGroups(params?: { limit?: number; offset?: number }): Promise<AccountGroup[]> {
    return this.http.get('/2.0/account_groups', { query: { ...params } });
  }

  /**
   * Fetch a list of calendar years.
   * @see ListCalendarYears
   */
  listCalendarYears(params?: { limit?: number; offset?: number }): Promise<CalendarYear[]> {
    return this.http.get('/3.0/accounting/calendar_years', { query: { ...params } });
  }

  /**
   * Fetch a calendar year.
   * @see ShowCalendarYear
   */
  getCalendarYear(calendarYearId: number): Promise<CalendarYear> {
    return this.http.get(`/3.0/accounting/calendar_years/${calendarYearId}`);
  }

  /**
   * Create a calendar year. Creating a future year also generates all years in between;
   * the response therefore is an array of the created calendar years.
   * @see CreateCalendarYear
   */
  createCalendarYear(calendarYear: CalendarYearCreate): Promise<CalendarYear[]> {
    return this.http.post('/3.0/accounting/calendar_years', { body: calendarYear });
  }

  /**
   * Search calendar years.
   * @see SearchCalendarYears
   */
  searchCalendarYears(criteria: SearchCriteria[], params?: ListParams): Promise<CalendarYear[]> {
    return this.http.post('/3.0/accounting/calendar_years/search', { query: { ...params }, body: criteria });
  }

  /**
   * Fetch a list of business years.
   * @see ListBusinessYears
   */
  listBusinessYears(params?: { limit?: number; offset?: number }): Promise<BusinessYear[]> {
    return this.http.get('/3.0/accounting/business_years', { query: { ...params } });
  }

  /**
   * Fetch a business year.
   * @see ShowBusinessYear
   */
  getBusinessYear(businessYearId: number): Promise<BusinessYear> {
    return this.http.get(`/3.0/accounting/business_years/${businessYearId}`);
  }

  /**
   * Fetch a list of vat periods.
   * @see ListVatPeriods
   */
  listVatPeriods(params?: { limit?: number; offset?: number }): Promise<VatPeriod[]> {
    return this.http.get('/3.0/accounting/vat_periods', { query: { ...params } });
  }

  /**
   * Fetch a vat period.
   * @see ShowVatPeriod
   */
  getVatPeriod(vatPeriodId: number): Promise<VatPeriod> {
    return this.http.get(`/3.0/accounting/vat_periods/${vatPeriodId}`);
  }

  /**
   * Fetch a list of taxes, optionally filtered by scope (active/inactive), validity date and type.
   * @see ListTaxes
   */
  listTaxes(params?: ListTaxesParams): Promise<Tax[]> {
    return this.http.get('/3.0/taxes', { query: { ...params } });
  }

  /**
   * Fetch a tax.
   * @see ShowTax
   */
  getTax(taxId: number): Promise<Tax> {
    return this.http.get(`/3.0/taxes/${taxId}`);
  }

  /**
   * Delete a tax.
   * @see DeleteTax
   */
  deleteTax(taxId: number): Promise<SuccessResponse> {
    return this.http.delete(`/3.0/taxes/${taxId}`);
  }

  /**
   * Fetch the accounting journal, optionally restricted to a date range or account.
   * @see ListJournalEntries — scope `accounting`
   */
  listJournalEntries(params?: ListJournalEntriesParams): Promise<JournalEntry[]> {
    return this.http.get('/3.0/accounting/journal', { query: { ...params } });
  }
}

/** Operation IDs of the bexio API covered by {@link AccountingApi} (used by coverage tests). */
export const accountingCoreOperations = [
  'v2ListAccounts',
  'v2SearchAccounts',
  'v2ListAccountGroups',
  'ListCalendarYears',
  'ShowCalendarYear',
  'CreateCalendarYear',
  'SearchCalendarYears',
  'ListBusinessYears',
  'ShowBusinessYear',
  'ListVatPeriods',
  'ShowVatPeriod',
  'ListTaxes',
  'ShowTax',
  'DeleteTax',
  'ListJournalEntries',
] as const;
