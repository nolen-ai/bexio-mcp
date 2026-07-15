/**
 * MCP tools for the timesheets domain: timesheets and timesheet statuses.
 */
import { z } from 'zod';
import { defineTool, listParamsShape, requireArg, searchCriteriaSchema, unknownAction } from '../registry.js';
import type { BexioClient } from '../../client/index.js';
import type { TimesheetsApi, TimesheetCreate, TimesheetUpdate } from '../../client/resources/timesheets.js';

/** Accessor for `client.timesheets` (mounted on {@link BexioClient} by the client index). */
const timesheets = (client: BexioClient): TimesheetsApi =>
  (client as BexioClient & { timesheets: TimesheetsApi }).timesheets;

const trackingSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('duration').describe('Submit the tracked time as a total duration on a date'),
      date: z.string().describe('ISO 8601 date of the tracked time, e.g. "2019-05-20"'),
      duration: z.string().describe('Duration in "HH:MM" format, e.g. "01:40"'),
    }),
    z.object({
      type: z.literal('range').describe('Submit the tracked time as a start/end range'),
      start: z.string().describe('Start date-time, e.g. "2019-05-20 14:22:48"'),
      end: z.string().describe('End date-time, e.g. "2019-05-20 16:13:25"'),
    }),
  ])
  .describe(
    'Tracked time. Either { type: "duration", date, duration } or { type: "range", start, end }.',
  );

const timesheetPayloadSchema = z
  .object({
    user_id: z.number().int().describe('Id of the user who tracked the time (references a user object)'),
    client_service_id: z
      .number()
      .int()
      .describe('Id of the business activity (references a business activity object)'),
    allowable_bill: z.boolean().describe('Whether the tracked time is billable'),
    tracking: trackingSchema,
    status_id: z.number().int().optional().describe('Timesheet status id (see action "list_statuses")'),
    text: z.string().optional().describe('Description of the tracked work'),
    charge: z.string().nullable().optional().describe('Hourly charge as a decimal string'),
    contact_id: z.number().int().nullable().optional().describe('Linked contact id'),
    sub_contact_id: z.number().int().nullable().optional().describe('Linked sub-contact id'),
    pr_project_id: z.number().int().nullable().optional().describe('Linked project id'),
    pr_package_id: z.number().int().nullable().optional().describe('Linked project work package id'),
    pr_milestone_id: z.number().int().nullable().optional().describe('Linked project milestone id'),
    estimated_time: z.string().nullable().optional().describe('Estimated time in "HH:MM" format, e.g. "02:30"'),
  })
  .partial()
  .describe(
    'Timesheet fields. Required on create: user_id, client_service_id, allowable_bill, tracking.',
  );

export const timesheetsTools = [
  defineTool({
    name: 'bexio_timesheets',
    title: 'bexio Timesheets',
    description:
      'Manage timesheets (time tracking entries) in bexio. Actions: ' +
      '"list" (all timesheets, optional limit/offset/order_by; order_by supports id, date), ' +
      '"search" (search_criteria required; searchable fields: id, client_service_id, contact_id, user_id, pr_project_id, status_id), ' +
      '"get" (timesheet by numeric id), ' +
      '"create" (payload required: user_id, client_service_id, allowable_bill, tracking; ' +
      'tracking is either { type: "duration", date, duration } or { type: "range", start, end }), ' +
      '"update" (id + payload of fields to change), ' +
      '"delete" (permanently delete a timesheet by id — cannot be undone), ' +
      '"list_statuses" (all timesheet statuses, e.g. "In Progress"; optional limit/offset/order_by with id, name). ' +
      'Read timesheets may also contain a tracking of type "stopwatch" (created via the bexio UI).',
    group: 'projects',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum(['list', 'search', 'get', 'create', 'update', 'delete', 'list_statuses'])
        .describe('Operation to perform'),
      id: z.number().int().optional().describe('Timesheet id (required for get/update/delete)'),
      payload: timesheetPayloadSchema.optional(),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const api = timesheets(client);
      const listParams = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return api.list(listParams);
        case 'search':
          return api.search(requireArg(args.search_criteria, 'search_criteria', 'search'), listParams);
        case 'get':
          return api.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return api.create(requireArg(args.payload, 'payload', 'create') as TimesheetCreate);
        case 'update':
          return api.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as TimesheetUpdate,
          );
        case 'delete':
          return api.delete(requireArg(args.id, 'id', 'delete'));
        case 'list_statuses':
          return api.listStatuses(listParams);
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the timesheets tools (used by coverage tests). */
export const timesheetsToolOperations = [
  'v2ListTimesheets',
  'v2SearchTimesheets',
  'v2ShowTimesheet',
  'v2CreateTimesheet',
  'v2EditTimesheet',
  'DeleteTimesheet',
  'v2ListTimeSheetStatus',
] as const;
