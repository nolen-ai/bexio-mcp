/**
 * MCP tools for the contacts domain: contacts, contact relations, contact
 * groups, contact sectors and additional addresses.
 */
import { z } from 'zod';
import { defineTool, listParamsShape, requireArg, searchCriteriaSchema, unknownAction } from '../registry.js';
import {
  AdditionalAddressesApi,
  ContactGroupsApi,
  ContactRelationsApi,
  ContactSectorsApi,
  ContactsApi,
  type AdditionalAddressCreate,
  type AdditionalAddressUpdate,
  type ContactCreate,
  type ContactGroupCreate,
  type ContactGroupUpdate,
  type ContactRelationCreate,
  type ContactRelationUpdate,
  type ContactUpdate,
} from '../../client/resources/contacts.js';
import type { BexioClient } from '../../client/index.js';

// The BexioClient mount points (client.contacts, …) are wired by the aggregator;
// the handlers construct the resource APIs from the shared transport directly so
// this module is self-contained.
const contactsApi = (client: BexioClient) => new ContactsApi(client.http);
const contactRelationsApi = (client: BexioClient) => new ContactRelationsApi(client.http);
const contactGroupsApi = (client: BexioClient) => new ContactGroupsApi(client.http);
const contactSectorsApi = (client: BexioClient) => new ContactSectorsApi(client.http);
const additionalAddressesApi = (client: BexioClient) => new AdditionalAddressesApi(client.http);

const contactPayloadSchema = z
  .object({
    nr: z
      .string()
      .nullable()
      .describe('Contact number. If set to null the number is assigned automatically; must be numeric'),
    contact_type_id: z.number().int().describe('Contact type: 1 for companies, 2 for persons'),
    name_1: z
      .string()
      .describe('Company name (contact_type_id 1) or last name of the person (contact_type_id 2)'),
    name_2: z
      .string()
      .nullable()
      .describe('Company addition (contact_type_id 1) or first name of the person (contact_type_id 2)'),
    salutation_id: z.number().int().nullable().describe('References a salutation object'),
    salutation_form: z.number().int().nullable().describe('Salutation form'),
    title_id: z.number().int().nullable().describe('References a title object'),
    birthday: z.string().nullable().describe('Birthday as ISO 8601 date'),
    street_name: z
      .string()
      .nullable()
      .describe(
        'Street name; required if house_number or address_addition are set. ' +
          'Note: the legacy combined "address" field is deprecated — use street_name/house_number/address_addition instead',
      ),
    house_number: z.string().nullable().describe('House number; requires street_name when not null'),
    address_addition: z.string().nullable().describe('Address addition; requires street_name when not null'),
    postcode: z.string().nullable().describe('Postcode'),
    city: z.string().nullable().describe('City'),
    country_id: z.number().int().nullable().describe('References a country object'),
    mail: z.string().nullable().describe('Primary e-mail address'),
    mail_second: z.string().nullable().describe('Secondary e-mail address'),
    phone_fixed: z.string().nullable().describe('Fixed phone number'),
    phone_fixed_second: z.string().nullable().describe('Second fixed phone number'),
    phone_mobile: z.string().nullable().describe('Mobile phone number'),
    fax: z.string().nullable().describe('Fax number'),
    url: z.string().nullable().describe('Website URL'),
    skype_name: z.string().nullable().describe('Skype name'),
    remarks: z.string().nullable().describe('Free-text remarks'),
    language_id: z.number().int().nullable().describe('References a language object'),
    contact_group_ids: z
      .string()
      .nullable()
      .describe('Comma-separated contact group ids, e.g. "1,2" (references contact group objects)'),
    contact_branch_ids: z
      .string()
      .nullable()
      .describe('Comma-separated contact sector ids (references contact sector objects)'),
    user_id: z.number().int().describe('References a user object (responsible user)'),
    owner_id: z.number().int().describe('Owner user id'),
  })
  .partial()
  .describe(
    'Contact fields. Required on create/bulk_create: contact_type_id, name_1, user_id, owner_id. ' +
      'Note: the API spec also marks these four fields as required on update (v2EditContact), though partial edits generally work. ' +
      'The legacy combined "address" field is deprecated (read-only); use street_name/house_number/address_addition.',
  );

const contactRelationPayloadSchema = z
  .object({
    contact_id: z.number().int().nullable().describe('References the parent contact object'),
    contact_sub_id: z.number().int().nullable().describe('References the sub-contact object'),
    description: z.string().nullable().describe('Description of the relation'),
  })
  .partial()
  .describe('Contact relation fields. Required on create: contact_id, contact_sub_id.');

const contactGroupPayloadSchema = z
  .object({
    name: z.string().describe('Name of the contact group'),
  })
  .partial()
  .describe(
    'Contact group fields. Required on create: name. ' +
      'Note: the API spec also marks name as required on update (v2EditContactGroup), though partial edits generally work.',
  );

const additionalAddressPayloadSchema = z
  .object({
    name: z.string().describe('Name of the additional address, e.g. "Delivery address"'),
    name_addition: z.string().nullable().describe('Name addition'),
    street_name: z
      .string()
      .nullable()
      .describe(
        'Street name; required if house_number or address_addition are set. ' +
          'Note: the legacy combined "address" field is deprecated — use street_name/house_number/address_addition instead',
      ),
    house_number: z.string().nullable().describe('House number; requires street_name when not null'),
    address_addition: z.string().nullable().describe('Address addition; requires street_name when not null'),
    postcode: z.string().nullable().describe('Postcode'),
    city: z.string().nullable().describe('City'),
    country_id: z.number().int().nullable().describe('References a country object'),
    subject: z.string().describe('Subject of the address'),
    description: z.string().describe('Internal description'),
  })
  .partial()
  .describe(
    'Additional address fields. Provide at least name on create. The legacy combined "address" field is ' +
      'deprecated (read-only); use street_name/house_number/address_addition.',
  );

export const contactsTools = [
  defineTool({
    name: 'bexio_contacts',
    title: 'bexio Contacts',
    description:
      'Manage bexio contacts (companies and persons; the central address book referenced by quotes, orders, invoices, projects). Actions: ' +
      '"list" (all contacts; optional limit/offset/order_by [id|nr|name_1|updated_at, append "_desc"], show_archived), ' +
      '"search" (search_criteria required; useful searchable fields: id, nr, name_1, name_2, mail, postcode, city, country_id, contact_type_id, contact_group_ids, user_id, updated_at; optional list params and show_archived), ' +
      '"get" (contact by id; optional show_archived; includes base64 profile_image), ' +
      '"create" (payload required: contact_type_id [1=company, 2=person], name_1, user_id, owner_id), ' +
      '"update" (id + payload of fields to change), ' +
      '"delete" (permanently deletes the contact — cannot be undone; a deleted contact can only be restored shortly afterwards via the restore action), ' +
      '"bulk_create" (contacts array of contact payloads, same required fields as create), ' +
      '"restore" (restore a deleted contact by id).',
    group: 'contacts',
    writeActions: ['create', 'update', 'delete', 'bulk_create', 'restore'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum(['list', 'search', 'get', 'create', 'update', 'delete', 'bulk_create', 'restore'])
        .describe('Operation to perform'),
      id: z.number().int().optional().describe('Contact id (required for get/update/delete/restore)'),
      payload: contactPayloadSchema.optional(),
      contacts: z.array(contactPayloadSchema).optional().describe('Contact payloads for "bulk_create"'),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
      show_archived: z.boolean().optional().describe('Show archived elements only (list/search/get)'),
    },
    handler: async (client, args) => {
      const api = contactsApi(client);
      const listParams = {
        limit: args.limit,
        offset: args.offset,
        order_by: args.order_by,
        show_archived: args.show_archived,
      };
      switch (args.action) {
        case 'list':
          return api.list(listParams);
        case 'search':
          return api.search(requireArg(args.search_criteria, 'search_criteria', 'search'), listParams);
        case 'get':
          return api.get(requireArg(args.id, 'id', 'get'), { show_archived: args.show_archived });
        case 'create':
          return api.create(requireArg(args.payload, 'payload', 'create') as ContactCreate);
        case 'update':
          return api.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as ContactUpdate,
          );
        case 'delete':
          return api.delete(requireArg(args.id, 'id', 'delete'));
        case 'bulk_create':
          return api.bulkCreate(requireArg(args.contacts, 'contacts', 'bulk_create') as ContactCreate[]);
        case 'restore':
          return api.restore(requireArg(args.id, 'id', 'restore'));
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_contact_relations',
    title: 'bexio Contact Relations',
    description:
      'Manage relations between two contacts (e.g. link a person to their company: contact_id = company, contact_sub_id = person). Actions: ' +
      '"list" (optional limit/offset/order_by [id|contact_id|contact_sub_id|updated_at, append "_desc"]), ' +
      '"search" (search_criteria required; useful searchable fields: contact_id, contact_sub_id, updated_at), ' +
      '"get" (relation by id), ' +
      '"create" (payload required: contact_id, contact_sub_id; optional description), ' +
      '"update" (id + payload of fields to change), ' +
      '"delete" (delete the relation by id — destructive, cannot be undone).',
    group: 'contacts',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'search', 'get', 'create', 'update', 'delete']).describe('Operation to perform'),
      id: z.number().int().optional().describe('Contact relation id (required for get/update/delete)'),
      payload: contactRelationPayloadSchema.optional(),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const api = contactRelationsApi(client);
      const listParams = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return api.list(listParams);
        case 'search':
          return api.search(requireArg(args.search_criteria, 'search_criteria', 'search'), listParams);
        case 'get':
          return api.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return api.create(requireArg(args.payload, 'payload', 'create') as ContactRelationCreate);
        case 'update':
          return api.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as ContactRelationUpdate,
          );
        case 'delete':
          return api.delete(requireArg(args.id, 'id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_contact_groups',
    title: 'bexio Contact Groups',
    description:
      'Manage contact groups (categories assigned to contacts via their contact_group_ids field). Actions: ' +
      '"list" (optional limit/offset/order_by [id|name, append "_desc"]), ' +
      '"search" (search_criteria required; searchable fields: name), ' +
      '"get" (group by id), ' +
      '"create" (payload required: name), ' +
      '"update" (id + payload), ' +
      '"delete" (delete the group by id — destructive, cannot be undone).',
    group: 'contacts',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'search', 'get', 'create', 'update', 'delete']).describe('Operation to perform'),
      id: z.number().int().optional().describe('Contact group id (required for get/update/delete)'),
      payload: contactGroupPayloadSchema.optional(),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const api = contactGroupsApi(client);
      const listParams = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return api.list(listParams);
        case 'search':
          return api.search(requireArg(args.search_criteria, 'search_criteria', 'search'), listParams);
        case 'get':
          return api.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return api.create(requireArg(args.payload, 'payload', 'create') as ContactGroupCreate);
        case 'update':
          return api.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as ContactGroupUpdate,
          );
        case 'delete':
          return api.delete(requireArg(args.id, 'id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_contact_sectors',
    title: 'bexio Contact Sectors',
    description:
      'Read contact sectors ("Branchen"; referenced by contacts via their contact_branch_ids field). Read-only. Actions: ' +
      '"list" (optional limit/offset/order_by [id|name, append "_desc"]), ' +
      '"search" (search_criteria required; searchable fields: name).',
    group: 'contacts',
    inputSchema: {
      action: z.enum(['list', 'search']).describe('Operation to perform'),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const api = contactSectorsApi(client);
      const listParams = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return api.list(listParams);
        case 'search':
          return api.search(requireArg(args.search_criteria, 'search_criteria', 'search'), listParams);
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_additional_addresses',
    title: 'bexio Additional Addresses',
    description:
      'Manage additional addresses of a contact (e.g. delivery addresses). Every action requires contact_id (the parent contact). Actions: ' +
      '"list" (contact_id; optional limit/offset/order_by [id|name|postcode|country_id, append "_desc"]), ' +
      '"search" (contact_id + search_criteria; useful searchable fields: name, postcode, city, country_id), ' +
      '"get" (contact_id + id), ' +
      '"create" (contact_id + payload; provide at least name), ' +
      '"update" (contact_id + id + payload of fields to change), ' +
      '"delete" (contact_id + id — destructive, cannot be undone).',
    group: 'contacts',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'search', 'get', 'create', 'update', 'delete']).describe('Operation to perform'),
      contact_id: z.number().int().describe('Id of the parent contact (required for every action)'),
      id: z.number().int().optional().describe('Additional address id (required for get/update/delete)'),
      payload: additionalAddressPayloadSchema.optional(),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const api = additionalAddressesApi(client);
      const listParams = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return api.list(args.contact_id, listParams);
        case 'search':
          return api.search(
            args.contact_id,
            requireArg(args.search_criteria, 'search_criteria', 'search'),
            listParams,
          );
        case 'get':
          return api.get(args.contact_id, requireArg(args.id, 'id', 'get'));
        case 'create':
          return api.create(
            args.contact_id,
            requireArg(args.payload, 'payload', 'create') as AdditionalAddressCreate,
          );
        case 'update':
          return api.update(
            args.contact_id,
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as AdditionalAddressUpdate,
          );
        case 'delete':
          return api.delete(args.contact_id, requireArg(args.id, 'id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the contacts tools (used by coverage tests). */
export const contactsToolOperations = [
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
