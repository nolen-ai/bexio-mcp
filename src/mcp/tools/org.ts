/**
 * MCP tools for the org domain: notes, tasks and user management.
 */
import { z } from 'zod';
import { defineTool, listParamsShape, requireArg, searchCriteriaSchema, unknownAction } from '../registry.js';
import type { BexioClient } from '../../client/index.js';
import type {
  FictionalUserCreate,
  FictionalUserUpdate,
  NoteCreate,
  NotesApi,
  NoteUpdate,
  TaskCreate,
  TasksApi,
  TaskUpdate,
  UsersApi,
} from '../../client/resources/org.js';

/**
 * Typed view of {@link BexioClient} with the org APIs mounted
 * (`client.notes`, `client.tasks`, `client.users` — wired in client/index.ts).
 */
type OrgClient = BexioClient & { notes: NotesApi; tasks: TasksApi; users: UsersApi };
const org = (client: BexioClient): OrgClient => client as OrgClient;

const notePayloadSchema = z
  .object({
    user_id: z.number().int().describe('Id of the user the note belongs to'),
    event_start: z.string().describe('Date/time of the note (ISO 8601, e.g. "2026-07-15 10:00:00")'),
    subject: z.string().describe('Subject of the note'),
    info: z.string().describe('Additional information / body text'),
    contact_id: z.number().int().nullable().describe('Id of a linked contact'),
    project_id: z.number().int().nullable().describe('Id of a linked project'),
    pr_project_id: z.number().int().nullable().describe('Id of a linked project (pr_project reference)'),
    entry_id: z.number().int().nullable().describe('Id of the linked module entry'),
    module_id: z.number().int().nullable().describe('Id of the module the note is attached to'),
  })
  .partial()
  .describe('Note fields. Required on create: user_id, event_start, subject.');

const taskPayloadSchema = z
  .object({
    user_id: z.number().int().describe('Id of the user the task is assigned to'),
    finish_date: z.string().nullable().describe('Due date of the task (ISO 8601)'),
    subject: z.string().describe('Subject of the task'),
    place: z.number().int().nullable().describe('Place of the task'),
    info: z.string().describe('Additional information / body text'),
    contact_id: z.number().int().describe('Id of a linked contact'),
    sub_contact_id: z.number().int().nullable().describe('Id of a linked sub-contact (contact person)'),
    project_id: z.number().int().nullable().describe('Id of a linked project'),
    pr_project_id: z.number().int().nullable().describe('Id of a linked project (pr_project reference)'),
    entry_id: z.number().int().nullable().describe('Id of the linked module entry'),
    module_id: z.number().int().nullable().describe('Id of the module the task is attached to'),
    todo_status_id: z.number().int().describe('Task status id (see "list_statuses")'),
    todo_priority_id: z.number().int().nullable().describe('Task priority id (see "list_priorities")'),
    has_reminder: z.boolean().describe('Whether the task has a reminder'),
    have_remember: z.boolean().describe('Whether a reminder is configured; if true, remember_type_id and remember_time_id are required'),
    remember_type_id: z.number().int().describe('Reminder type id; required if have_remember is true'),
    remember_time_id: z.number().int().nullable().describe('Reminder time id; required if have_remember is true'),
    communication_kind_id: z.number().int().nullable().describe('Communication kind id'),
  })
  .partial()
  .describe('Task fields. Required on create: user_id, subject.');

const fictionalUserPayloadSchema = z
  .object({
    salutation_type: z.enum(['male', 'female']).describe('Salutation of the fictional user'),
    firstname: z.string().describe('First name of the fictional user'),
    lastname: z.string().describe('Last name of the fictional user'),
    email: z.string().describe('Email address (an email address can only be used once per company)'),
    title_id: z.number().int().describe('Reference to a title'),
  })
  .partial()
  .describe('Fictional user fields. Required on create: salutation_type, firstname, lastname, email.');

export const orgTools = [
  defineTool({
    name: 'bexio_notes',
    title: 'bexio Notes',
    description:
      'Manage notes in bexio (short annotations linked to a user and optionally a contact, project or module entry). ' +
      'Actions: ' +
      '"list" (all notes, optional limit/offset), ' +
      '"search" (search_criteria required; searchable fields: event_start, contact_id, user_id, subject, module_id, entry_id), ' +
      '"get" (note by id), ' +
      '"create" (payload required: user_id, event_start, subject; optional info, contact_id, project_id, pr_project_id, entry_id, module_id), ' +
      '"update" (id + payload of fields to change), ' +
      '"delete" (permanently delete a note by id — cannot be undone).',
    group: 'misc',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z.enum(['list', 'search', 'get', 'create', 'update', 'delete']).describe('Operation to perform'),
      id: z.number().int().optional().describe('Note id (required for get/update/delete)'),
      payload: notePayloadSchema.optional(),
      search_criteria: searchCriteriaSchema.optional(),
      limit: listParamsShape.limit,
      offset: listParamsShape.offset,
    },
    handler: async (client, args) => {
      const { notes } = org(client);
      switch (args.action) {
        case 'list':
          return notes.list({ limit: args.limit, offset: args.offset });
        case 'search':
          return notes.search(requireArg(args.search_criteria, 'search_criteria', 'search'), {
            limit: args.limit,
            offset: args.offset,
          });
        case 'get':
          return notes.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return notes.create(requireArg(args.payload, 'payload', 'create') as NoteCreate);
        case 'update':
          return notes.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as NoteUpdate,
          );
        case 'delete':
          return notes.delete(requireArg(args.id, 'id', 'delete'));
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_tasks',
    title: 'bexio Tasks',
    description:
      'Manage tasks/todos in bexio (assigned to a user, with status, priority, due date and optional contact/project links). ' +
      'Actions: ' +
      '"list" (all tasks, optional limit/offset/order_by with order_by "id" or "finish_date"), ' +
      '"search" (search_criteria required; searchable fields: subject, updated_at, user_id, contact_id, todo_status_id, module_id, entry_id), ' +
      '"get" (task by id), ' +
      '"create" (payload required: user_id, subject; use todo_status_id/todo_priority_id from list_statuses/list_priorities), ' +
      '"update" (id + payload of fields to change), ' +
      '"delete" (permanently delete a task by id — cannot be undone), ' +
      '"list_priorities" (all task priorities, order_by "id" or "name"), ' +
      '"list_statuses" (all task statuses, order_by "id" or "name").',
    group: 'misc',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum(['list', 'search', 'get', 'create', 'update', 'delete', 'list_priorities', 'list_statuses'])
        .describe('Operation to perform'),
      id: z.number().int().optional().describe('Task id (required for get/update/delete)'),
      payload: taskPayloadSchema.optional(),
      search_criteria: searchCriteriaSchema.optional(),
      limit: listParamsShape.limit,
      offset: listParamsShape.offset,
      order_by: z
        .string()
        .optional()
        .describe(
          'Sort field: "id" or "finish_date" for list/search, "id" or "name" for list_priorities/list_statuses; append "_desc" for descending',
        ),
    },
    handler: async (client, args) => {
      const { tasks } = org(client);
      const params = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return tasks.list(params);
        case 'search':
          return tasks.search(requireArg(args.search_criteria, 'search_criteria', 'search'), params);
        case 'get':
          return tasks.get(requireArg(args.id, 'id', 'get'));
        case 'create':
          return tasks.create(requireArg(args.payload, 'payload', 'create') as TaskCreate);
        case 'update':
          return tasks.update(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as TaskUpdate,
          );
        case 'delete':
          return tasks.delete(requireArg(args.id, 'id', 'delete'));
        case 'list_priorities':
          return tasks.listPriorities(params);
        case 'list_statuses':
          return tasks.listStatuses(params);
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_users',
    title: 'bexio Users',
    description:
      'Read bexio users and manage fictional users (fictional users appear in dropdowns but cannot log in). ' +
      'Actions: ' +
      '"list" (all users, optional limit/offset), ' +
      '"get" (user by id), ' +
      '"me" (the user authenticated by the current token), ' +
      '"list_fictional" (all fictional users, optional limit/offset), ' +
      '"get_fictional" (fictional user by id), ' +
      '"create_fictional" (payload required: salutation_type, firstname, lastname, email; optional title_id), ' +
      '"update_fictional" (id + payload of fields to change), ' +
      '"delete_fictional" (permanently delete a fictional user by id — cannot be undone), ' +
      '"permissions" (activated components and the full permission map of the logged-in user). ' +
      'Regular users are read-only via the API; only fictional users can be created, updated or deleted. ' +
      'is_superadmin/is_accountant are only included when the authenticated user is a superadmin.',
    group: 'misc',
    writeActions: ['create_fictional', 'update_fictional', 'delete_fictional'],
    destructiveActions: ['delete_fictional'],
    inputSchema: {
      action: z
        .enum([
          'list',
          'get',
          'me',
          'list_fictional',
          'get_fictional',
          'create_fictional',
          'update_fictional',
          'delete_fictional',
          'permissions',
        ])
        .describe('Operation to perform'),
      id: z
        .number()
        .int()
        .optional()
        .describe('User id (required for "get") or fictional user id (required for get/update/delete_fictional)'),
      payload: fictionalUserPayloadSchema.optional(),
      limit: listParamsShape.limit,
      offset: listParamsShape.offset,
    },
    handler: async (client, args) => {
      const { users } = org(client);
      switch (args.action) {
        case 'list':
          return users.list({ limit: args.limit, offset: args.offset });
        case 'get':
          return users.get(requireArg(args.id, 'id', 'get'));
        case 'me':
          return users.me();
        case 'list_fictional':
          return users.listFictional({ limit: args.limit, offset: args.offset });
        case 'get_fictional':
          return users.getFictional(requireArg(args.id, 'id', 'get_fictional'));
        case 'create_fictional':
          return users.createFictional(
            requireArg(args.payload, 'payload', 'create_fictional') as FictionalUserCreate,
          );
        case 'update_fictional':
          return users.updateFictional(
            requireArg(args.id, 'id', 'update_fictional'),
            requireArg(args.payload, 'payload', 'update_fictional') as FictionalUserUpdate,
          );
        case 'delete_fictional':
          return users.deleteFictional(requireArg(args.id, 'id', 'delete_fictional'));
        case 'permissions':
          return users.permissions();
        default:
          return unknownAction(args.action);
      }
    },
  }),
];

/** Operation IDs covered by the org tools (used by coverage tests). */
export const orgToolOperations = [
  'v2ListNotes',
  'v2SearchNotes',
  'v2ShowNote',
  'v2CreateNote',
  'v2EditNote',
  'DeleteNote',
  'v2ListTasks',
  'v2SearchTasks',
  'v2ShowTask',
  'v2CreateTask',
  'v2EditTask',
  'DeleteTask',
  'v2ListTaskPriorities',
  'v2ListTaskStatus',
  'v3ListUsers',
  'v3ShowUser',
  'v3ShowMe',
  'v3ListFictionalUsers',
  'v3ShowFictionalUser',
  'v3CreateFictionalUser',
  'v3UpdateFictionalUser',
  'v3DeleteFictionalUser',
  'Permissions',
] as const;
