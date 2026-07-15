/**
 * Master data resources (2.0 API): salutations, titles, countries, languages,
 * units, payment types, business activities, communication types and the
 * company profile.
 *
 * Covers the operations tagged "Salutations", "Titles", "Countries",
 * "Languages", "Units", "Payment Types", "Business Activities",
 * "Communication Types" and "Company Profile" in the bexio API docs
 * (https://docs.bexio.com/).
 */
import type { BexioHttp } from '../http.js';
import type { ListParams, SearchCriteria, SuccessResponse } from '../types.js';

// ---------------------------------------------------------------------------
// Entities and payloads
// ---------------------------------------------------------------------------

/** A salutation (e.g. "Herr", "Frau"). */
export interface Salutation {
  id: number;
  name: string;
}

export interface SalutationCreate {
  name: string;
}

export type SalutationUpdate = Partial<SalutationCreate>;

/** A title (e.g. "Dr.", "Prof."). */
export interface Title {
  id: number;
  name: string;
}

export interface TitleCreate {
  name: string;
}

export type TitleUpdate = Partial<TitleCreate>;

/** A country. */
export interface Country {
  id: number;
  name: string;
  /** Short name of the country, e.g. "CH". */
  name_short: string;
  /** Country code according to ISO 3166-1 alpha-2. */
  iso3166_alpha2: string;
}

export interface CountryCreate {
  name: string;
  /** Short name of the country, e.g. "CH". */
  name_short: string;
  /** Country code according to ISO 3166-1 alpha-2. */
  iso3166_alpha2: string;
}

export type CountryUpdate = Partial<CountryCreate>;

/** A language configured in bexio. Read-only via the API. */
export interface Language {
  id: number;
  name: string;
  decimal_point?: string;
  thousands_separator?: string;
  /** 1 -> `DD.MM.YYYY`, 2 -> `MM/DD/YYYY`. */
  date_format_id?: number;
  date_format?: string;
  /** Language code according to ISO 639-1. */
  iso_639_1: string;
}

/** A measurement unit (e.g. "h", "kg"). */
export interface Unit {
  id: number;
  name: string;
}

export interface UnitCreate {
  name: string;
}

export type UnitUpdate = Partial<UnitCreate>;

/** A payment type. Read-only via the API. */
export interface PaymentTypeEntry {
  id: number;
  name: string;
}

/** A business activity used in time tracking. */
export interface BusinessActivity {
  id: number;
  name: string;
  default_is_billable?: boolean | null;
  default_price_per_hour?: number | null;
  /** References an account object. */
  account_id?: number | null;
}

export interface BusinessActivityCreate {
  name: string;
  default_is_billable?: boolean | null;
  default_price_per_hour?: number | null;
  /** References an account object. */
  account_id?: number | null;
}

/** A communication type (communication kind). Read-only via the API. */
export interface CommunicationType {
  id: number;
  name: string;
}

/** The company profile of the bexio company. Read-only via the API. */
export interface CompanyProfile {
  id: number;
  name: string;
  address?: string;
  /**
   * Note: the official field description is misleading — this field should not
   * be used for the house number.
   */
  address_nr?: string;
  postcode?: string;
  city?: string;
  /** References a country object. */
  country_id?: number;
  legal_form?:
    | 'sole_proprietorship'
    | 'joint_partnership'
    | 'foundation'
    | 'corporation'
    | 'limited_liability_company'
    | 'association';
  country_name?: string;
  mail?: string;
  phone_fixed?: string;
  phone_mobile?: string;
  fax?: string;
  url?: string;
  skype_name?: string;
  facebook_name?: string;
  twitter_name?: string;
  description?: string;
  ust_id_nr?: string;
  mwst_nr?: string;
  trade_register_nr?: string;
  has_own_logo?: boolean;
  is_public_profile?: boolean;
  is_logo_public?: boolean;
  is_address_public?: boolean;
  is_phone_public?: boolean;
  is_mobile_public?: boolean;
  is_fax_public?: boolean;
  is_mail_public?: boolean;
  is_url_public?: boolean;
  is_skype_public?: boolean;
  /** Base64-encoded image content of the company logo. */
  logo_base64?: string;
}

// ---------------------------------------------------------------------------
// API classes
// ---------------------------------------------------------------------------

/**
 * Small master-data lookup resources of the 2.0 API: salutations, titles,
 * countries, languages, units, payment types, business activities and
 * communication types.
 */
export class MasterDataApi {
  constructor(private readonly http: BexioHttp) {}

  // --- Salutations ---------------------------------------------------------

  /**
   * Fetch a list of salutations.
   * @see v2ListSalutations — scope `general`
   */
  listSalutations(params?: ListParams): Promise<Salutation[]> {
    return this.http.get('/2.0/salutation', { query: { ...params } });
  }

  /**
   * Search salutations.
   * @see v2SearchSalutations — scope `general`
   */
  searchSalutations(criteria: SearchCriteria[], params?: ListParams): Promise<Salutation[]> {
    return this.http.post('/2.0/salutation/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch a salutation.
   * @see v2ShowSalutation — scope `general`
   */
  getSalutation(salutationId: number): Promise<Salutation> {
    return this.http.get(`/2.0/salutation/${salutationId}`);
  }

  /**
   * Create salutation.
   * @see v2CreateSalutation — scope `general`
   */
  createSalutation(salutation: SalutationCreate): Promise<Salutation> {
    return this.http.post('/2.0/salutation', { body: salutation });
  }

  /**
   * Edit a salutation.
   * @see v2EditSalutation — scope `general`
   */
  updateSalutation(salutationId: number, salutation: SalutationUpdate): Promise<Salutation> {
    return this.http.post(`/2.0/salutation/${salutationId}`, { body: salutation });
  }

  /**
   * Delete a salutation.
   * @see v2DeleteSalutation — scope `general`
   */
  deleteSalutation(salutationId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/salutation/${salutationId}`);
  }

  // --- Titles ---------------------------------------------------------------

  /**
   * Fetch a list of titles.
   * @see v2ListTitles — scope `general`
   */
  listTitles(params?: ListParams): Promise<Title[]> {
    return this.http.get('/2.0/title', { query: { ...params } });
  }

  /**
   * Search titles.
   * @see v2SearchTitles — scope `general`
   */
  searchTitles(criteria: SearchCriteria[], params?: ListParams): Promise<Title[]> {
    return this.http.post('/2.0/title/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch a title.
   * @see v2ShowTitle — scope `general`
   */
  getTitle(titleId: number): Promise<Title> {
    return this.http.get(`/2.0/title/${titleId}`);
  }

  /**
   * Create title.
   * @see v2CreateTitle — scope `general`
   */
  createTitle(title: TitleCreate): Promise<Title> {
    return this.http.post('/2.0/title', { body: title });
  }

  /**
   * Edit a title.
   * @see v2EditTitle — scope `general`
   */
  updateTitle(titleId: number, title: TitleUpdate): Promise<Title> {
    return this.http.post(`/2.0/title/${titleId}`, { body: title });
  }

  /**
   * Delete a title.
   * @see v2DeleteTitle — scope `general`
   */
  deleteTitle(titleId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/title/${titleId}`);
  }

  // --- Countries -------------------------------------------------------------

  /**
   * Fetch a list of countries.
   * @see v2ListCountries — scope `general`
   */
  listCountries(params?: ListParams): Promise<Country[]> {
    return this.http.get('/2.0/country', { query: { ...params } });
  }

  /**
   * Search countries.
   * @see v2SearchCountries — scope `general`
   */
  searchCountries(criteria: SearchCriteria[], params?: ListParams): Promise<Country[]> {
    return this.http.post('/2.0/country/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch a country.
   * @see v2ShowCountry — scope `general`
   */
  getCountry(countryId: number): Promise<Country> {
    return this.http.get(`/2.0/country/${countryId}`);
  }

  /**
   * Create country.
   * @see v2CreateCountry — scope `general`
   */
  createCountry(country: CountryCreate): Promise<Country> {
    return this.http.post('/2.0/country', { body: country });
  }

  /**
   * Edit a country.
   * @see v2EditCountry — scope `general`
   */
  updateCountry(countryId: number, country: CountryUpdate): Promise<Country> {
    return this.http.post(`/2.0/country/${countryId}`, { body: country });
  }

  /**
   * Delete a country.
   * @see DeleteCountry — scope `general`
   */
  deleteCountry(countryId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/country/${countryId}`);
  }

  // --- Languages -------------------------------------------------------------

  /**
   * Fetch a list of languages.
   * @see v2ListLanguages — scope `general`
   */
  listLanguages(params?: ListParams): Promise<Language[]> {
    return this.http.get('/2.0/language', { query: { ...params } });
  }

  /**
   * Search languages.
   * @see v2SearchLanguages — scope `general`
   */
  searchLanguages(criteria: SearchCriteria[], params?: ListParams): Promise<Language[]> {
    return this.http.post('/2.0/language/search', { body: criteria, query: { ...params } });
  }

  // --- Units -------------------------------------------------------------------

  /**
   * Fetch a list of units.
   * @see v2ListUnits — scope `general`
   */
  listUnits(params?: ListParams): Promise<Unit[]> {
    return this.http.get('/2.0/unit', { query: { ...params } });
  }

  /**
   * Search units.
   * @see v2SearchUnits — scope `general`
   */
  searchUnits(criteria: SearchCriteria[], params?: ListParams): Promise<Unit[]> {
    return this.http.post('/2.0/unit/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch a unit.
   * @see v2ShowUnit — scope `general`
   */
  getUnit(unitId: number): Promise<Unit> {
    return this.http.get(`/2.0/unit/${unitId}`);
  }

  /**
   * Create unit.
   * @see v2CreateUnit — scope `general`
   */
  createUnit(unit: UnitCreate): Promise<Unit> {
    return this.http.post('/2.0/unit', { body: unit });
  }

  /**
   * Edit a unit.
   * @see v2EditUnit — scope `general`
   */
  updateUnit(unitId: number, unit: UnitUpdate): Promise<Unit> {
    return this.http.post(`/2.0/unit/${unitId}`, { body: unit });
  }

  /**
   * Delete a unit.
   * @see v2DeleteUnit — scope `general`
   */
  deleteUnit(unitId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/unit/${unitId}`);
  }

  // --- Payment types -----------------------------------------------------------

  /**
   * Fetch a list of payment types.
   * @see v2ListPaymentTypes — scope `general`
   */
  listPaymentTypes(params?: ListParams): Promise<PaymentTypeEntry[]> {
    return this.http.get('/2.0/payment_type', { query: { ...params } });
  }

  /**
   * Search payment types.
   * @see v2SearchPaymentTypes — scope `general`
   */
  searchPaymentTypes(criteria: SearchCriteria[], params?: ListParams): Promise<PaymentTypeEntry[]> {
    return this.http.post('/2.0/payment_type/search', { body: criteria, query: { ...params } });
  }

  // --- Business activities -------------------------------------------------------

  /**
   * Fetch a list of business activities.
   * @see v2ListBusinessActivities — scope `general`
   */
  listBusinessActivities(params?: ListParams): Promise<BusinessActivity[]> {
    return this.http.get('/2.0/client_service', { query: { ...params } });
  }

  /**
   * Search business activities.
   * @see v2SearchBusinessActivities — scope `general`
   */
  searchBusinessActivities(criteria: SearchCriteria[], params?: ListParams): Promise<BusinessActivity[]> {
    return this.http.post('/2.0/client_service/search', { body: criteria, query: { ...params } });
  }

  /**
   * Create business activity.
   * @see v2CreateBusinessActivity — scope `general`
   */
  createBusinessActivity(activity: BusinessActivityCreate): Promise<BusinessActivity> {
    return this.http.post('/2.0/client_service', { body: activity });
  }

  // --- Communication types --------------------------------------------------------

  /**
   * Fetch a list of communication types.
   * @see v2ListCommunicationTypes — scope `general`
   */
  listCommunicationTypes(params?: ListParams): Promise<CommunicationType[]> {
    return this.http.get('/2.0/communication_kind', { query: { ...params } });
  }

  /**
   * Search communication types.
   * @see v2SearchCommunicationTypes — scope `general`
   */
  searchCommunicationTypes(criteria: SearchCriteria[], params?: ListParams): Promise<CommunicationType[]> {
    return this.http.post('/2.0/communication_kind/search', { body: criteria, query: { ...params } });
  }
}

/** Company profile of the bexio company (2.0 API). Read-only. */
export class CompanyProfileApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of company profiles.
   * @see v2ListCompanyProfile — scope `general`
   */
  list(): Promise<CompanyProfile[]> {
    return this.http.get('/2.0/company_profile');
  }

  /**
   * Show company profile.
   * @see v2ShowCompanyProfile — scope `general`
   */
  get(profileId: number): Promise<CompanyProfile> {
    return this.http.get(`/2.0/company_profile/${profileId}`);
  }
}

/**
 * Operation IDs of the bexio API covered by {@link MasterDataApi} and
 * {@link CompanyProfileApi} (used by coverage tests).
 */
export const masterDataOperations = [
  'v2ListSalutations',
  'v2SearchSalutations',
  'v2ShowSalutation',
  'v2CreateSalutation',
  'v2EditSalutation',
  'v2DeleteSalutation',
  'v2ListTitles',
  'v2SearchTitles',
  'v2ShowTitle',
  'v2CreateTitle',
  'v2EditTitle',
  'v2DeleteTitle',
  'v2ListCountries',
  'v2SearchCountries',
  'v2ShowCountry',
  'v2CreateCountry',
  'v2EditCountry',
  'DeleteCountry',
  'v2ListLanguages',
  'v2SearchLanguages',
  'v2ListUnits',
  'v2SearchUnits',
  'v2ShowUnit',
  'v2CreateUnit',
  'v2EditUnit',
  'v2DeleteUnit',
  'v2ListPaymentTypes',
  'v2SearchPaymentTypes',
  'v2ListBusinessActivities',
  'v2SearchBusinessActivities',
  'v2CreateBusinessActivity',
  'v2ListCommunicationTypes',
  'v2SearchCommunicationTypes',
  'v2ListCompanyProfile',
  'v2ShowCompanyProfile',
] as const;
