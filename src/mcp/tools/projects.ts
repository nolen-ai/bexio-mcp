/**
 * MCP tools for the projects domain: projects, milestones and work packages.
 */
import { z } from 'zod';
import { defineTool, listParamsShape, requireArg, searchCriteriaSchema, unknownAction } from '../registry.js';
import type {
  MilestoneCreate,
  MilestoneUpdate,
  ProjectCreate,
  ProjectUpdate,
  ProjectsApi,
  WorkPackageCreate,
  WorkPackageUpdate,
} from '../../client/resources/projects.js';

// The ProjectsApi is mounted as `client.projects` by src/client/index.ts. This
// augmentation lets the tools typecheck before the integrator adds the property.
declare module '../../client/index.js' {
  interface BexioClient {
    readonly projects: ProjectsApi;
  }
}

const projectPayloadSchema = z
  .object({
    name: z.string().describe('Project name'),
    document_nr: z
      .string()
      .describe(
        'Project document number. Cannot be used if "automatic numbering" is activated in the frontend settings; required if it is deactivated.',
      ),
    start_date: z.string().nullable().describe('ISO 8601 start date, e.g. "2019-07-12 00:00:00"'),
    end_date: z.string().nullable().describe('ISO 8601 end date'),
    comment: z.string().describe('Free-text comment/description'),
    pr_state_id: z.number().int().describe('Project status id (use action "list_statuses" for the available values)'),
    pr_project_type_id: z.number().int().describe('Project type id (use action "list_types" for the available values)'),
    contact_id: z.number().int().describe('Id of the contact (customer) the project belongs to'),
    contact_sub_id: z.number().int().nullable().describe('Id of the sub-contact (contact person)'),
    pr_invoice_type_id: z
      .number()
      .int()
      .nullable()
      .describe(
        'Invoice type: 1 = hourly rate for client services, 2 = hourly rate for employee, 3 = hourly rate for project, 4 = fix price for project',
      ),
    pr_invoice_type_amount: z
      .string()
      .describe(
        'Invoice amount, e.g. "230.00". Only editable if pr_invoice_type_id is set (supported for types 3 and 4)',
      ),
    pr_budget_type_id: z
      .number()
      .nullable()
      .describe(
        'Budget type: 1 = total budget costs, 2 = total budget hours, 3 = budget for each client service, 4 = budget for each employee',
      ),
    pr_budget_type_amount: z
      .string()
      .describe('Budget amount, e.g. "200.00". Only editable if pr_budget_type_id is set (supported for types 1 and 2)'),
    user_id: z.number().int().describe('Id of the responsible user'),
  })
  .partial()
  .describe('Project fields. Required on create: name, pr_state_id, pr_project_type_id, contact_id, user_id.');

const planningPayloadSchema = z
  .object({
    name: z.string().describe('Name of the milestone or work package (required on create for both resources)'),
    comment: z.string().describe('Description of the milestone or work package'),
    end_date: z.string().describe('Milestones only: end date of the milestone (ISO 8601)'),
    pr_parent_milestone_id: z.number().int().describe('Milestones only: id of the higher-level (parent) milestone'),
    spent_time_in_hours: z.number().describe('Work packages only: time spent on the work package, in hours'),
    estimated_time_in_hours: z.number().describe('Work packages only: estimated time for the work package, in hours'),
    pr_milestone_id: z.number().int().describe('Work packages only: id of the milestone the work package belongs to'),
  })
  .partial()
  .describe(
    'Milestone or work package fields (depending on "resource"). Required on create: name. ' +
      'end_date/pr_parent_milestone_id apply to milestones; spent_time_in_hours/estimated_time_in_hours/pr_milestone_id apply to work packages.',
  );

export const projectsTools = [
  defineTool({
    name: 'bexio_projects',
    title: 'bexio Projects',
    description:
      'Manage projects (bexio 2.0 API). A project has a name, status, type, customer contact, responsible user, ' +
      'optional dates, and optional invoice/budget settings. Actions: ' +
      '"list" (all projects; optional limit/offset/order_by, order_by supports "id"/"name" plus "_desc"), ' +
      '"search" (search_criteria required, AND-combined; searchable fields include name, contact_id, pr_state_id, ' +
      'pr_project_type_id, start_date, end_date, user_id; optional limit/offset/order_by), ' +
      '"get" (id required), ' +
      '"create" (payload required with name, pr_state_id, pr_project_type_id, contact_id, user_id), ' +
      '"update" (id + payload of fields to change), ' +
      '"delete" (id required — permanently deletes the project, cannot be undone), ' +
      '"archive" / "unarchive" (id required; archiving hides the project without deleting it), ' +
      '"list_statuses" (all project statuses, for pr_state_id), ' +
      '"list_types" (all project types, for pr_project_type_id; optional order_by).',
    group: 'projects',
    writeActions: ['create', 'update', 'delete', 'archive', 'unarchive'],
    destructiveActions: ['delete'],
    inputSchema: {
      action: z
        .enum(['list', 'search', 'get', 'create', 'update', 'delete', 'archive', 'unarchive', 'list_statuses', 'list_types'])
        .describe('Operation to perform'),
      id: z.number().int().optional().describe('Project id (required for get/update/delete/archive/unarchive)'),
      payload: projectPayloadSchema.optional(),
      search_criteria: searchCriteriaSchema.optional(),
      ...listParamsShape,
    },
    handler: async (client, args) => {
      const listParams = { limit: args.limit, offset: args.offset, order_by: args.order_by };
      switch (args.action) {
        case 'list':
          return client.projects.listProjects(listParams);
        case 'search':
          return client.projects.searchProjects(requireArg(args.search_criteria, 'search_criteria', 'search'), listParams);
        case 'get':
          return client.projects.getProject(requireArg(args.id, 'id', 'get'));
        case 'create':
          return client.projects.createProject(requireArg(args.payload, 'payload', 'create') as ProjectCreate);
        case 'update':
          return client.projects.updateProject(
            requireArg(args.id, 'id', 'update'),
            requireArg(args.payload, 'payload', 'update') as ProjectUpdate,
          );
        case 'delete':
          return client.projects.deleteProject(requireArg(args.id, 'id', 'delete'));
        case 'archive':
          return client.projects.archiveProject(requireArg(args.id, 'id', 'archive'));
        case 'unarchive':
          return client.projects.unarchiveProject(requireArg(args.id, 'id', 'unarchive'));
        case 'list_statuses':
          return client.projects.listProjectStatuses();
        case 'list_types':
          return client.projects.listProjectTypes({ order_by: args.order_by });
        default:
          return unknownAction(args.action);
      }
    },
  }),

  defineTool({
    name: 'bexio_project_planning',
    title: 'bexio Project Planning',
    description:
      'Manage milestones and work packages of a project (bexio 3.0 API). Set "resource" to "milestones" or ' +
      '"work_packages"; project_id is always required. A milestone has a name, end date, comment and optional parent ' +
      'milestone; a work package has a name, spent/estimated time in hours, comment and optional milestone link. Actions: ' +
      '"list" (all milestones/work packages of the project; optional limit/offset), ' +
      '"get" (id required), ' +
      '"create" (payload required; name is the only required field), ' +
      '"update" (id + payload of fields to change; work package updates are partial PATCHes, milestone updates are POSTs), ' +
      '"delete" (id required — permanently deletes the milestone/work package, cannot be undone).',
    group: 'projects',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      resource: z.enum(['milestones', 'work_packages']).describe('Sub-resource of the project to operate on'),
      action: z.enum(['list', 'get', 'create', 'update', 'delete']).describe('Operation to perform'),
      project_id: z.number().int().describe('Id of the project the milestones/work packages belong to (always required)'),
      id: z.number().int().optional().describe('Milestone or work package id (required for get/update/delete)'),
      payload: planningPayloadSchema.optional(),
      limit: z.number().int().min(1).max(2000).optional().describe('Max results for "list" (max 2000)'),
      offset: z.number().int().min(0).optional().describe('Results to skip for "list" (pagination)'),
    },
    handler: async (client, args) => {
      const projectId = args.project_id;
      switch (args.resource) {
        case 'milestones':
          switch (args.action) {
            case 'list':
              return client.projects.listMilestones(projectId, { limit: args.limit, offset: args.offset });
            case 'get':
              return client.projects.getMilestone(projectId, requireArg(args.id, 'id', 'get'));
            case 'create':
              return client.projects.createMilestone(
                projectId,
                requireArg(args.payload, 'payload', 'create') as MilestoneCreate,
              );
            case 'update':
              return client.projects.updateMilestone(
                projectId,
                requireArg(args.id, 'id', 'update'),
                requireArg(args.payload, 'payload', 'update') as MilestoneUpdate,
              );
            case 'delete':
              return client.projects.deleteMilestone(projectId, requireArg(args.id, 'id', 'delete'));
            default:
              return unknownAction(args.action);
          }
        case 'work_packages':
          switch (args.action) {
            case 'list':
              return client.projects.listWorkPackages(projectId, { limit: args.limit, offset: args.offset });
            case 'get':
              return client.projects.getWorkPackage(projectId, requireArg(args.id, 'id', 'get'));
            case 'create':
              return client.projects.createWorkPackage(
                projectId,
                requireArg(args.payload, 'payload', 'create') as WorkPackageCreate,
              );
            case 'update':
              return client.projects.updateWorkPackage(
                projectId,
                requireArg(args.id, 'id', 'update'),
                requireArg(args.payload, 'payload', 'update') as WorkPackageUpdate,
              );
            case 'delete':
              return client.projects.deleteWorkPackage(projectId, requireArg(args.id, 'id', 'delete'));
            default:
              return unknownAction(args.action);
          }
        default:
          return unknownAction(args.resource);
      }
    },
  }),
];

/** Operation IDs covered by the projects tools (used by coverage tests). */
export const projectsToolOperations = [
  'v2ListProjectStatus',
  'v2ListProjectType',
  'v2ArchiveProject',
  'v2UnarchiveProject',
  'DeleteProject',
  'v2ShowProject',
  'v2EditProject',
  'v2SearchProjects',
  'v2ListProjects',
  'v2CreateProject',
  'DeleteMilestone',
  'ShowMilestone',
  'EditMilestone',
  'ListMilestones',
  'CreateMilestone',
  'DeleteWorkPackage',
  'ShowWorkPackage',
  'EditWorkPackage',
  'ListWorkPackages',
  'CreateWorkPackage',
] as const;
