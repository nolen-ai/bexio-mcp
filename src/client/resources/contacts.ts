/**
 * Contact resources: contacts, contact relations, contact groups, contact
 * sectors and additional addresses (all 2.0 API).
 *
 * Covers operations tagged "Contacts", "Contact Relations", "Contact Groups",
 * "Contact Sectors" and "Additional Addresses" in the bexio API docs
 * (https://docs.bexio.com/#tag/Contacts).
 */
import type { BexioHttp } from '../http.js';
import type { ListParams, SearchCriteria, SuccessResponse } from '../types.js';

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/** A contact (company or person). */
export interface Contact {
  id: number;
  /**
   * If set to null, the number will be assigned automatically. Must be a number,
   * can also be used as integer.
   */
  nr?: string | null;
  /** Please use the value `1` for companies or `2` for persons. */
  contact_type_id: number;
  /**
   * This field is used as the company name if the field `contact_type_id` is set
   * to `1`. Otherwise, the field is used as the last name of the person.
   */
  name_1: string;
  /**
   * This field is used as the company addition if the field `contact_type_id` is
   * set to `1`. Otherwise, the field is used as the first name of the person.
   */
  name_2?: string | null;
  /** References a salutation object. */
  salutation_id?: number | null;
  salutation_form?: number | null;
  /** References a title object (read-only in responses). */
  title_id?: number | null;
  /** References a title object (write-only alias of `title_id`). */
  titel_id?: number | null;
  /** ISO 8601 date. */
  birthday?: string | null;
  /** Legacy combined address line (deprecated — read-only; use `street_name`/`house_number`/`address_addition`). */
  address?: string | null;
  street_name?: string | null;
  house_number?: string | null;
  address_addition?: string | null;
  postcode?: string | null;
  city?: string | null;
  /** References a country object. */
  country_id?: number | null;
  mail?: string | null;
  mail_second?: string | null;
  phone_fixed?: string | null;
  phone_fixed_second?: string | null;
  phone_mobile?: string | null;
  fax?: string | null;
  url?: string | null;
  skype_name?: string | null;
  remarks?: string | null;
  /** References a language object. */
  language_id?: number | null;
  /** Deprecated, read-only. */
  is_lead?: boolean;
  /** References one or multiple contact group objects, e.g. `"1,2"`. */
  contact_group_ids?: string | null;
  /** References one or multiple contact sector objects. */
  contact_branch_ids?: string | null;
  /** References a user object. */
  user_id: number;
  owner_id: number;
  updated_at?: string;
}

/** A contact including details only returned by single-fetch endpoints. */
export interface ContactWithDetails extends Contact {
  /** base64-encoded image content. */
  profile_image?: string;
}

/**
 * Payload for creating a contact.
 * Required: `contact_type_id`, `name_1`, `user_id`, `owner_id`.
 */
export interface ContactCreate {
  /**
   * If set to null, the number will be assigned automatically. Must be a number,
   * can also be used as integer.
   */
  nr?: string | null;
  /** Please use the value `1` for companies or `2` for persons. */
  contact_type_id: number;
  /**
   * This field is used as the company name if the field `contact_type_id` is set
   * to `1`. Otherwise, the field is used as the last name of the person.
   */
  name_1: string;
  /**
   * This field is used as the company addition if the field `contact_type_id` is
   * set to `1`. Otherwise, the field is used as the first name of the person.
   */
  name_2?: string | null;
  /** References a salutation object. */
  salutation_id?: number | null;
  salutation_form?: number | null;
  /** References a title object. */
  title_id?: number | null;
  /** ISO 8601 date. */
  birthday?: string | null;
  /** Is required if `house_number` or `address_addition` are not NULL. */
  street_name?: string | null;
  /** Requires `street_name` if the value is not NULL. */
  house_number?: string | null;
  /** Requires `street_name` if the value is not NULL. */
  address_addition?: string | null;
  postcode?: string | null;
  city?: string | null;
  /** References a country object. */
  country_id?: number | null;
  mail?: string | null;
  mail_second?: string | null;
  phone_fixed?: string | null;
  phone_fixed_second?: string | null;
  phone_mobile?: string | null;
  fax?: string | null;
  url?: string | null;
  skype_name?: string | null;
  remarks?: string | null;
  /** References a language object. */
  language_id?: number | null;
  /** References one or multiple contact group objects, e.g. `"1,2"`. */
  contact_group_ids?: string | null;
  /** References one or multiple contact sector objects. */
  contact_branch_ids?: string | null;
  /** References a user object. */
  user_id: number;
  owner_id: number;
}

/** Payload for editing a contact (subset of the create payload). */
export type ContactUpdate = Partial<ContactCreate>;

/** Fields the contact list/search endpoints can be ordered by. */
export type ContactOrderBy = 'id' | 'nr' | 'name_1' | 'updated_at';

/** List parameters of the contact endpoints (adds `show_archived`). */
export interface ContactListParams extends ListParams {
  /** Show archived elements only. */
  show_archived?: boolean;
}

export class ContactsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of contacts.
   * @see v2ListContacts — scope `contact_show`
   */
  list(params?: ContactListParams): Promise<Contact[]> {
    return this.http.get('/2.0/contact', { query: { ...params } });
  }

  /**
   * Search contacts (legacy POST search; conditions are AND-combined).
   * @see v2SearchContact — scope `contact_show`
   */
  search(criteria: SearchCriteria[], params?: ContactListParams): Promise<Contact[]> {
    return this.http.post('/2.0/contact/search', { query: { ...params }, body: criteria });
  }

  /**
   * Fetch a contact.
   * @see v2ShowContact — scope `contact_show`
   */
  get(contactId: number, params?: { show_archived?: boolean }): Promise<ContactWithDetails> {
    return this.http.get(`/2.0/contact/${contactId}`, { query: { ...params } });
  }

  /**
   * Create contact.
   * @see v2CreateContact — scope `contact_edit`
   */
  create(contact: ContactCreate): Promise<ContactWithDetails> {
    return this.http.post('/2.0/contact', { body: contact });
  }

  /**
   * Edit a contact (the 2.0 API uses POST for edits).
   * @see v2EditContact — scope `contact_edit`
   */
  update(contactId: number, contact: ContactUpdate): Promise<ContactWithDetails> {
    return this.http.post(`/2.0/contact/${contactId}`, { body: contact });
  }

  /**
   * Delete a contact.
   * @see v2DeleteContact — scope `contact_edit`
   */
  delete(contactId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/contact/${contactId}`);
  }

  /**
   * Bulk create contacts (array of contact payloads).
   * @see v2BulkCreateContacts — scope `contact_edit`
   */
  bulkCreate(contacts: ContactCreate[]): Promise<Contact[]> {
    return this.http.post('/2.0/contact/_bulk_create', { body: contacts });
  }

  /**
   * Restore a (deleted/archived) contact.
   * @see v2RestoreContact — scope `contact_edit`
   */
  restore(contactId: number): Promise<SuccessResponse> {
    return this.http.patch(`/2.0/contact/${contactId}/restore`);
  }
}

// ---------------------------------------------------------------------------
// Contact relations
// ---------------------------------------------------------------------------

/** A relation between two contacts (e.g. person belonging to a company). */
export interface ContactRelation {
  id: number;
  /** References a contact object. */
  contact_id: number | null;
  /** References a contact object (the sub-contact of the relation). */
  contact_sub_id: number | null;
  description?: string | null;
  updated_at?: string;
}

/**
 * Payload for creating a contact relation.
 * Required: `contact_id`, `contact_sub_id`.
 */
export interface ContactRelationCreate {
  /** References a contact object. */
  contact_id: number | null;
  /** References a contact object (the sub-contact of the relation). */
  contact_sub_id: number | null;
  description?: string | null;
}

/** Payload for editing a contact relation (subset of the create payload). */
export type ContactRelationUpdate = Partial<ContactRelationCreate>;

/** Fields the contact relation list/search endpoints can be ordered by. */
export type ContactRelationOrderBy = 'id' | 'contact_id' | 'contact_sub_id' | 'updated_at';

export class ContactRelationsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of contact relations.
   * @see v2ListContactRelations — scope `contact_show`
   */
  list(params?: ListParams): Promise<ContactRelation[]> {
    return this.http.get('/2.0/contact_relation', { query: { ...params } });
  }

  /**
   * Search contact relations (legacy POST search; conditions are AND-combined).
   * @see v2SearchContactRelations — scope `contact_show`
   */
  search(criteria: SearchCriteria[], params?: ListParams): Promise<ContactRelation[]> {
    return this.http.post('/2.0/contact_relation/search', { query: { ...params }, body: criteria });
  }

  /**
   * Fetch a contact relation.
   * @see v2ShowContactRelation — scope `contact_show`
   */
  get(contactRelationId: number): Promise<ContactRelation> {
    return this.http.get(`/2.0/contact_relation/${contactRelationId}`);
  }

  /**
   * Create contact relation.
   * @see v2CreateContactRelation — scope `contact_edit`
   */
  create(relation: ContactRelationCreate): Promise<ContactRelation> {
    return this.http.post('/2.0/contact_relation', { body: relation });
  }

  /**
   * Edit a contact relation (the 2.0 API uses POST for edits).
   * @see v2EditContactRelation — scope `contact_edit`
   */
  update(contactRelationId: number, relation: ContactRelationUpdate): Promise<ContactRelation> {
    return this.http.post(`/2.0/contact_relation/${contactRelationId}`, { body: relation });
  }

  /**
   * Delete a contact relation.
   * @see v2DeleteContactRelation — scope `contact_edit`
   */
  delete(contactRelationId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/contact_relation/${contactRelationId}`);
  }
}

// ---------------------------------------------------------------------------
// Contact groups
// ---------------------------------------------------------------------------

/** A contact group used to categorize contacts. */
export interface ContactGroup {
  id: number;
  name: string;
}

/**
 * Payload for creating a contact group.
 * Required: `name`.
 */
export interface ContactGroupCreate {
  name: string;
}

/** Payload for editing a contact group. */
export type ContactGroupUpdate = Partial<ContactGroupCreate>;

/** Fields the contact group list/search endpoints can be ordered by. */
export type ContactGroupOrderBy = 'id' | 'name';

export class ContactGroupsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of contact groups.
   * @see v2ListContactGroups — scope `general`
   */
  list(params?: ListParams): Promise<ContactGroup[]> {
    return this.http.get('/2.0/contact_group', { query: { ...params } });
  }

  /**
   * Search contact groups (legacy POST search; conditions are AND-combined).
   * @see v2SearchContactGroups — scope `general`
   */
  search(criteria: SearchCriteria[], params?: ListParams): Promise<ContactGroup[]> {
    return this.http.post('/2.0/contact_group/search', { query: { ...params }, body: criteria });
  }

  /**
   * Fetch a contact group.
   * @see v2ShowContactGroup — scope `general`
   */
  get(contactGroupId: number): Promise<ContactGroup> {
    return this.http.get(`/2.0/contact_group/${contactGroupId}`);
  }

  /**
   * Create contact group.
   * @see v2CreateContactGroup — scope `general`
   */
  create(group: ContactGroupCreate): Promise<ContactGroup> {
    return this.http.post('/2.0/contact_group', { body: group });
  }

  /**
   * Edit a contact group (the 2.0 API uses POST for edits).
   * @see v2EditContactGroup — scope `general`
   */
  update(contactGroupId: number, group: ContactGroupUpdate): Promise<ContactGroup> {
    return this.http.post(`/2.0/contact_group/${contactGroupId}`, { body: group });
  }

  /**
   * Delete a contact group.
   * @see v2DeleteContactGroup — scope `general`
   */
  delete(contactGroupId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/contact_group/${contactGroupId}`);
  }
}

// ---------------------------------------------------------------------------
// Contact sectors
// ---------------------------------------------------------------------------

/** A contact sector ("Branche"). Read-only via the API. */
export interface ContactSector {
  id: number;
  name: string;
}

/** Fields the contact sector list/search endpoints can be ordered by. */
export type ContactSectorOrderBy = 'id' | 'name';

export class ContactSectorsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of contact sectors.
   * @see v2ListContactSectors — scope `general`
   */
  list(params?: ListParams): Promise<ContactSector[]> {
    return this.http.get('/2.0/contact_branch', { query: { ...params } });
  }

  /**
   * Search contact sectors (legacy POST search; conditions are AND-combined).
   * @see v2SearchContactSectors — scope `general`
   */
  search(criteria: SearchCriteria[], params?: ListParams): Promise<ContactSector[]> {
    return this.http.post('/2.0/contact_branch/search', { query: { ...params }, body: criteria });
  }
}

// ---------------------------------------------------------------------------
// Additional addresses
// ---------------------------------------------------------------------------

/** An additional address of a contact (e.g. a delivery address). */
export interface AdditionalAddress {
  id: number;
  name?: string;
  name_addition?: string | null;
  /** Legacy combined address line (deprecated — read-only; use `street_name`/`house_number`/`address_addition`). */
  address?: string | null;
  street_name?: string | null;
  house_number?: string | null;
  address_addition?: string | null;
  postcode?: string | null;
  city?: string | null;
  /** References a country object. */
  country_id?: number | null;
  subject?: string;
  description?: string;
}

/** Payload for creating an additional address (bexio expects at least `name`). */
export interface AdditionalAddressCreate {
  name?: string;
  name_addition?: string | null;
  /** Is required if `house_number` or `address_addition` are not NULL. */
  street_name?: string | null;
  /** Requires `street_name` if the value is not NULL. */
  house_number?: string | null;
  /** Requires `street_name` if the value is not NULL. */
  address_addition?: string | null;
  postcode?: string | null;
  city?: string | null;
  /** References a country object. */
  country_id?: number | null;
  subject?: string;
  description?: string;
}

/** Payload for editing an additional address. */
export type AdditionalAddressUpdate = Partial<AdditionalAddressCreate>;

/** Fields the additional address list/search endpoints can be ordered by. */
export type AdditionalAddressOrderBy = 'id' | 'name' | 'postcode' | 'country_id';

export class AdditionalAddressesApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of additional addresses of a contact.
   * @see v2ListAdditionalAddresses — scope `contact_show`
   */
  list(contactId: number, params?: ListParams): Promise<AdditionalAddress[]> {
    return this.http.get(`/2.0/contact/${contactId}/additional_address`, { query: { ...params } });
  }

  /**
   * Search additional addresses of a contact (legacy POST search; conditions are AND-combined).
   * @see v2SearchAdditionalAddresses — scope `contact_show`
   */
  search(contactId: number, criteria: SearchCriteria[], params?: ListParams): Promise<AdditionalAddress[]> {
    return this.http.post(`/2.0/contact/${contactId}/additional_address/search`, {
      query: { ...params },
      body: criteria,
    });
  }

  /**
   * Fetch an additional address.
   * @see v2ShowAdditionalAddress — scope `contact_show`
   */
  get(contactId: number, additionalAddressId: number): Promise<AdditionalAddress> {
    return this.http.get(`/2.0/contact/${contactId}/additional_address/${additionalAddressId}`);
  }

  /**
   * Create additional address.
   * @see v2CreateAdditionalAddress — scope `contact_edit`
   */
  create(contactId: number, address: AdditionalAddressCreate): Promise<AdditionalAddress> {
    return this.http.post(`/2.0/contact/${contactId}/additional_address`, { body: address });
  }

  /**
   * Edit an additional address (the 2.0 API uses POST for edits).
   * @see v2EditAdditionalAddress — scope `contact_edit`
   */
  update(
    contactId: number,
    additionalAddressId: number,
    address: AdditionalAddressUpdate,
  ): Promise<AdditionalAddress> {
    return this.http.post(`/2.0/contact/${contactId}/additional_address/${additionalAddressId}`, {
      body: address,
    });
  }

  /**
   * Delete an additional address.
   * @see v2DeleteAdditionalAddress — scope `contact_edit`
   */
  delete(contactId: number, additionalAddressId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/contact/${contactId}/additional_address/${additionalAddressId}`);
  }
}

/**
 * Operation IDs of the bexio API covered by the contact resource classes
 * (used by coverage tests).
 */
export const contactsOperations = [
  'v2ListContacts',
  'v2SearchContact',
  'v2ShowContact',
  'v2CreateContact',
  'v2EditContact',
  'v2DeleteContact',
  'v2BulkCreateContacts',
  'v2RestoreContact',
  'v2ListContactRelations',
  'v2SearchContactRelations',
  'v2ShowContactRelation',
  'v2CreateContactRelation',
  'v2EditContactRelation',
  'v2DeleteContactRelation',
  'v2ListContactGroups',
  'v2SearchContactGroups',
  'v2ShowContactGroup',
  'v2CreateContactGroup',
  'v2EditContactGroup',
  'v2DeleteContactGroup',
  'v2ListContactSectors',
  'v2SearchContactSectors',
  'v2ListAdditionalAddresses',
  'v2SearchAdditionalAddresses',
  'v2ShowAdditionalAddress',
  'v2CreateAdditionalAddress',
  'v2EditAdditionalAddress',
  'v2DeleteAdditionalAddress',
] as const;
