/**
 * Projects resources: projects (2.0) plus milestones and work packages (3.0).
 *
 * Covers operations tagged "Projects" in the bexio API docs
 * (https://docs.bexio.com/#tag/Projects).
 */
import type { BexioHttp } from '../http.js';
import type { ListParams, SearchCriteria, SuccessResponse } from '../types.js';

/** A project (2.0 API). */
export interface Project {
  id?: number;
  /** The uuid of the project. */
  uuid?: string;
  /** Project number, e.g. "000002". */
  nr?: string;
  /**
   * Can not be used if “automatic numbering” is activated in frontend-settings.
   * Required if “automatic numbering” deactivated. https://help.bexio.com/s/article/000001721
   */
  document_nr?: string;
  name: string;
  /** ISO 8601 start date, e.g. "2019-07-12 00:00:00". */
  start_date?: string | null;
  /** ISO 8601 end date. */
  end_date?: string | null;
  comment?: string;
  /** References a project status object (see v2ListProjectStatus). */
  pr_state_id: number;
  /** References a project type object (see v2ListProjectType). */
  pr_project_type_id: number;
  /** References a contact object (see v2ListContacts). */
  contact_id: number;
  /** References a contact object (see v2ListContacts). */
  contact_sub_id?: number | null;
  /**
   * Invoice type: 1 type_hourly_rate_service (hourly rate for client services),
   * 2 type_hourly_rate_employee (hourly rate for employee),
   * 3 type_hourly_rate_project (hourly rate for project), 4 type_fix (fix price for project).
   */
  pr_invoice_type_id?: number | null;
  /**
   * Can only be edited if `pr_invoice_type` is set. (Only supported for invoice
   * types `type_hourly_rate_project` and `type_fix`.)
   */
  pr_invoice_type_amount?: string;
  /**
   * Budget type: 1 type_budgeted_costs (total budget costs), 2 type_budgeted_hours
   * (total budget hours), 3 type_service_budget (budget for each client services),
   * 4 type_service_employees (budget for each employee).
   */
  pr_budget_type_id?: number | null;
  /**
   * Can only be edited if `pr_budget_type` is set. (Only supported for budget
   * types `type_budgeted_costs` and `type_budgeted_hours`.)
   */
  pr_budget_type_amount?: string;
  /** References a user object (see v3ListUsers). */
  user_id: number;
}

/** Payload to create a project. Read-only fields (id, uuid, nr) are omitted. */
export type ProjectCreate = Omit<Project, 'id' | 'uuid' | 'nr'>;

/** Payload to edit a project; any subset of the create fields. */
export type ProjectUpdate = Partial<ProjectCreate>;

/** A project status (e.g. open, closed). */
export interface ProjectStatus {
  id?: number;
  name: string;
}

/** A project type. */
export interface ProjectType {
  id?: number;
  name: string;
}

/** A project milestone (3.0 API). */
export interface Milestone {
  /** The id of the main resource. */
  id?: number;
  /** The name of the milestone. */
  name: string;
  /** The end date for the milestone. */
  end_date?: string;
  /** Description for milestone. */
  comment?: string;
  /** Higher level milestone. */
  pr_parent_milestone_id?: number;
}

/** Payload to create a milestone. Only `name` is required. */
export type MilestoneCreate = Omit<Milestone, 'id'>;

/** Payload to edit a milestone; any subset of the create fields. */
export type MilestoneUpdate = Partial<MilestoneCreate>;

/** A project work package (3.0 API). */
export interface WorkPackage {
  /** The id of the main resource. */
  id?: number;
  /** The name of the work package. */
  name: string;
  /** Time spent on work package, in hours. */
  spent_time_in_hours?: number;
  /** Estimated time on work package, in hours. */
  estimated_time_in_hours?: number;
  /** Description for work package. */
  comment?: string;
  /** References a milestone object (see ListMilestones). */
  pr_milestone_id?: number;
}

/** Payload to create a work package. Only `name` is required. */
export type WorkPackageCreate = Omit<WorkPackage, 'id'>;

/** Payload to edit a work package; any subset of the create fields. */
export type WorkPackageUpdate = Partial<WorkPackageCreate>;

export class ProjectsApi {
  constructor(private readonly http: BexioHttp) {}

  // -------------------------------------------------------------------------
  // Projects (2.0)
  // -------------------------------------------------------------------------

  /**
   * Fetch a list of projects.
   * @see v2ListProjects — scope `project_show`
   */
  listProjects(params?: ListParams): Promise<Project[]> {
    return this.http.get('/2.0/pr_project', { query: { ...params } });
  }

  /**
   * Search projects (legacy 2.0 search; criteria are AND-combined).
   * @see v2SearchProjects — scope `project_show`
   */
  searchProjects(criteria: SearchCriteria[], params?: ListParams): Promise<Project[]> {
    return this.http.post('/2.0/pr_project/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch a project.
   * @see v2ShowProject — scope `project_show`
   */
  getProject(projectId: number): Promise<Project> {
    return this.http.get(`/2.0/pr_project/${projectId}`);
  }

  /**
   * Create project.
   * @see v2CreateProject — scope `project_edit`
   */
  createProject(project: ProjectCreate): Promise<Project> {
    return this.http.post('/2.0/pr_project', { body: project });
  }

  /**
   * Edit a project (2.0 API uses POST for edits).
   * @see v2EditProject — scope `project_edit`
   */
  updateProject(projectId: number, project: ProjectUpdate): Promise<Project> {
    return this.http.post(`/2.0/pr_project/${projectId}`, { body: project });
  }

  /**
   * Delete a project.
   * @see DeleteProject — scope `project_edit`
   */
  deleteProject(projectId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/pr_project/${projectId}`);
  }

  /**
   * Archive a project.
   * @see v2ArchiveProject — scope `project_edit`
   */
  archiveProject(projectId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/pr_project/${projectId}/archive`);
  }

  /**
   * Unarchive a project.
   * @see v2UnarchiveProject — scope `project_edit`
   */
  unarchiveProject(projectId: number): Promise<SuccessResponse> {
    return this.http.post(`/2.0/pr_project/${projectId}/reactivate`);
  }

  /**
   * Fetch a list of project statuses.
   * @see v2ListProjectStatus — scope `general`
   */
  listProjectStatuses(): Promise<ProjectStatus[]> {
    return this.http.get('/2.0/pr_project_state');
  }

  /**
   * Fetch a list of project types.
   * @see v2ListProjectType — scope `general`
   */
  listProjectTypes(params?: { order_by?: string }): Promise<ProjectType[]> {
    return this.http.get('/2.0/pr_project_type', { query: { ...params } });
  }

  // -------------------------------------------------------------------------
  // Milestones (3.0)
  // -------------------------------------------------------------------------

  /**
   * Fetch a list of milestones of a project.
   * @see ListMilestones — scope `project_show`
   */
  listMilestones(projectId: number, params?: { limit?: number; offset?: number }): Promise<Milestone[]> {
    return this.http.get(`/3.0/projects/${projectId}/milestones`, { query: { ...params } });
  }

  /**
   * Fetch a milestone.
   * @see ShowMilestone — scope `project_show`
   */
  getMilestone(projectId: number, milestoneId: number): Promise<Milestone> {
    return this.http.get(`/3.0/projects/${projectId}/milestones/${milestoneId}`);
  }

  /**
   * Create milestone.
   * @see CreateMilestone — scope `project_edit`
   */
  createMilestone(projectId: number, milestone: MilestoneCreate): Promise<Milestone> {
    return this.http.post(`/3.0/projects/${projectId}/milestones`, { body: milestone });
  }

  /**
   * Edit a milestone (POST, per the API spec).
   * @see EditMilestone — scope `project_edit`
   */
  updateMilestone(projectId: number, milestoneId: number, milestone: MilestoneUpdate): Promise<Milestone> {
    return this.http.post(`/3.0/projects/${projectId}/milestones/${milestoneId}`, { body: milestone });
  }

  /**
   * Delete a milestone.
   * @see DeleteMilestone — scope `project_edit`
   */
  deleteMilestone(projectId: number, milestoneId: number): Promise<SuccessResponse> {
    return this.http.delete(`/3.0/projects/${projectId}/milestones/${milestoneId}`);
  }

  // -------------------------------------------------------------------------
  // Work packages (3.0)
  // -------------------------------------------------------------------------

  /**
   * Fetch a list of work packages of a project.
   * @see ListWorkPackages — scope `project_show`
   */
  listWorkPackages(projectId: number, params?: { limit?: number; offset?: number }): Promise<WorkPackage[]> {
    return this.http.get(`/3.0/projects/${projectId}/packages`, { query: { ...params } });
  }

  /**
   * Fetch a work package.
   * @see ShowWorkPackage — scope `project_show`
   */
  getWorkPackage(projectId: number, packageId: number): Promise<WorkPackage> {
    return this.http.get(`/3.0/projects/${projectId}/packages/${packageId}`);
  }

  /**
   * Create work package.
   * @see CreateWorkPackage — scope `project_edit`
   */
  createWorkPackage(projectId: number, workPackage: WorkPackageCreate): Promise<WorkPackage> {
    return this.http.post(`/3.0/projects/${projectId}/packages`, { body: workPackage });
  }

  /**
   * Edit a work package (PATCH).
   * @see EditWorkPackage — scope `project_edit`
   */
  updateWorkPackage(projectId: number, packageId: number, workPackage: WorkPackageUpdate): Promise<WorkPackage> {
    return this.http.patch(`/3.0/projects/${projectId}/packages/${packageId}`, { body: workPackage });
  }

  /**
   * Delete a work package.
   * @see DeleteWorkPackage — scope `project_edit`
   */
  deleteWorkPackage(projectId: number, packageId: number): Promise<SuccessResponse> {
    return this.http.delete(`/3.0/projects/${projectId}/packages/${packageId}`);
  }
}

/** Operation IDs of the bexio API covered by {@link ProjectsApi} (used by coverage tests). */
export const projectsOperations = [
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
