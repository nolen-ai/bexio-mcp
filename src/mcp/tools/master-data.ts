/**
 * MCP tools for the master-data domain: small lookup resources (salutations,
 * titles, countries, languages, units, payment types, business activities,
 * communication types) and the company profile.
 */
import { z } from 'zod';
import {
  defineTool,
  requireArg,
  unknownAction,
  searchCriteriaSchema,
  listParamsShape,
  InvalidToolArgumentsError,
} from '../registry.js';
import type {
  BusinessActivityCreate,
  CompanyProfileApi,
  CountryCreate,
  MasterDataApi,
  SalutationCreate,
  TitleCreate,
  UnitCreate,
} from '../../client/resources/master-data.js';
import type { BexioClient } from '../../client/index.js';

/**
 * BexioClient with the master-data mount points. The cast below becomes a no-op
 * once `client/index.ts` wires `masterData`/`companyProfile` onto BexioClient.
 */
type MasterDataClient = BexioClient & {
  masterData: MasterDataApi;
  companyProfile: CompanyProfileApi;
};

const masterDataPayloadSchema = z
  .object({
    name: z.string().describe('Name of the entry (required on create for every resource)'),
    name_short: z.string().describe('Countries only: short name of the country, e.g. "CH" (required on create)'),
    iso3166_alpha2: z
      .string()
      .describe('Countries only: ISO 3166-1 alpha-2 country code (required on create)'),
    default_is_billable: z
      .boolean()
      .nullable()
      .describe('Business activities only: whether work of this type is billable by default'),
    default_price_per_hour: z
      .number()
      .nullable()
      .describe('Business activities only: default hourly rate'),
    account_id: z
      .number()
      .int()
      .nullable()
      .describe('Business activities only: id of the linked accounting account'),
  })
  .partial()
  .describe(
    'Entry fields. Required on create: name (all resources); countries additionally require name_short and iso3166_alpha2. ' +
      'Business activities may also set default_is_billable, default_price_per_hour, account_id.',
  );

/** Rejects a resource/action combination the API does not offer. */
function unsupported(resource: string, action: string): never {
  throw new InvalidToolArgumentsError(
    `Action "${action}" is not supported for resource "${resource}". See the tool description for valid combinations.`,
  );
}

export const masterDataTools = [
  defineTool({
    name: 'bexio_master_data',
    title: 'bexio Master Data',
    description:
      'Manage small bexio master-data lookup resources. Choose a "resource" and an "action". ' +
      'Resources and their supported actions: ' +
      'salutations, titles, units — list, search, get, create, update, delete (payload: {name}); ' +
      'countries — list, search, get, create, update, delete (payload: {name, name_short, iso3166_alpha2}); ' +
      'languages, payment_types, communication_types — list, search only (read-only); ' +
      'business_activities — list, search, create (payload: {name, default_is_billable?, default_price_per_hour?, account_id?}). ' +
      'Actions: "list" (optional limit/offset; order_by fields "id"/"name" for titles, countries, languages, payment_types, business_activities and communication_types — countries and payment_types also "name_short"; salutations and units do not support order_by), ' +
      '"search" (search_criteria required; searchable fields: "name" everywhere, countries also "name_short"/"iso3166_alpha2", languages also "iso_639_1"), ' +
      '"get" (id required), ' +
      '"create" (payload required; see per-resource shapes above), ' +
      '"update" (id + payload of fields to change), ' +
      '"delete" (id required — permanently deletes the entry, cannot be undone).',
    group: 'misc',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      resource: z
        .enum([
          'salutations',
          'titles',
          'countries',
          'languages',
          'units',
          'payment_types',
          'business_activities',
          'communication_types',
        ])
        .describe('Master-data resource to operate on'),
      action: z
        .enum(['list', 'search', 'get', 'create', 'update', 'delete'])
        .describe('Operation to perform (not every resource supports every action; see description)'),
      id: z.number().int().optional().describe('Entry id (required for get/update/delete)'),
      payload: masterDataPayloadSchema.optional(),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const { resource, action } = args;
      const md = (client as MasterDataClient).masterData;
      const params = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      const criteria = () => requireArg(args.search_criteria, 'search_criteria', 'search');
      const id = () => requireArg(args.id, 'id', action);
      const payload = () => requireArg(args.payload, 'payload', action);

      switch (resource) {
        case 'salutations':
          switch (action) {
            case 'list':
              return md.listSalutations(params);
            case 'search':
              return md.searchSalutations(criteria(), params);
            case 'get':
              return md.getSalutation(id());
            case 'create':
              return md.createSalutation(payload() as SalutationCreate);
            case 'update':
              return md.updateSalutation(id(), payload());
            case 'delete':
              return md.deleteSalutation(id());
            default:
              return unknownAction(action);
          }
        case 'titles':
          switch (action) {
            case 'list':
              return md.listTitles(params);
            case 'search':
              return md.searchTitles(criteria(), params);
            case 'get':
              return md.getTitle(id());
            case 'create':
              return md.createTitle(payload() as TitleCreate);
            case 'update':
              return md.updateTitle(id(), payload());
            case 'delete':
              return md.deleteTitle(id());
            default:
              return unknownAction(action);
          }
        case 'countries':
          switch (action) {
            case 'list':
              return md.listCountries(params);
            case 'search':
              return md.searchCountries(criteria(), params);
            case 'get':
              return md.getCountry(id());
            case 'create':
              return md.createCountry(payload() as CountryCreate);
            case 'update':
              return md.updateCountry(id(), payload());
            case 'delete':
              return md.deleteCountry(id());
            default:
              return unknownAction(action);
          }
        case 'units':
          switch (action) {
            case 'list':
              return md.listUnits(params);
            case 'search':
              return md.searchUnits(criteria(), params);
            case 'get':
              return md.getUnit(id());
            case 'create':
              return md.createUnit(payload() as UnitCreate);
            case 'update':
              return md.updateUnit(id(), payload());
            case 'delete':
              return md.deleteUnit(id());
            default:
              return unknownAction(action);
          }
        case 'languages':
          switch (action) {
            case 'list':
              return md.listLanguages(params);
            case 'search':
              return md.searchLanguages(criteria(), params);
            default:
              return unsupported(resource, action);
          }
        case 'payment_types':
          switch (action) {
            case 'list':
              return md.listPaymentTypes(params);
            case 'search':
              return md.searchPaymentTypes(criteria(), params);
            default:
              return unsupported(resource, action);
          }
        case 'communication_types':
          switch (action) {
            case 'list':
              return md.listCommunicationTypes(params);
            case 'search':
              return md.searchCommunicationTypes(criteria(), params);
            default:
              return unsupported(resource, action);
          }
        case 'business_activities':
          switch (action) {
            case 'list':
              return md.listBusinessActivities(params);
            case 'search':
              return md.searchBusinessActivities(criteria(), params);
            case 'create':
              return md.createBusinessActivity(payload() as BusinessActivityCreate);
            default:
              return unsupported(resource, action);
          }
        default:
          return unknownAction(resource);
      }
    },
  }),

  defineTool({
    name: 'bexio_company_profile',
    title: 'bexio Company Profile',
    description:
      'Read the company profile of the bexio company (name, legal form, address, contact details, VAT/trade-register ' +
      'numbers, public-profile flags, base64 logo). Actions: "list" (all company profiles), ' +
      '"get" (single profile by numeric id). Read-only.',
    group: 'misc',
    inputSchema: {
      action: z.enum(['list', 'get']).describe('Operation to perform'),
      id: z.number().int().optional().describe('Company profile id (required for "get")'),
    },
    handler: async (client, args) => {
      const profiles = (client as MasterDataClient).companyProfile;
      switch (args.action) {
        case 'list':
          return profiles.list();
        case 'get':
          return profiles.get(requireArg(args.id, 'id', 'get'));
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the master-data tools (used by coverage tests). */
export const masterDataToolOperations = [
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
