/**
 * Organisational resources: notes, tasks (2.0) and user management (3.0).
 *
 * Covers operations tagged "Notes", "Tasks", "User Management" and "Permissions"
 * in the bexio API docs (https://docs.bexio.com/#tag/Notes,
 * https://docs.bexio.com/#tag/Tasks, https://docs.bexio.com/#tag/User-Management).
 */
import type { BexioHttp } from '../http.js';
import type { ListParams, SearchCriteria, SuccessResponse } from '../types.js';

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** A note (2.0 API). */
export interface Note {
  id: number;
  /** References a user object. */
  user_id: number;
  /** Date/time the note is scheduled for (ISO 8601). */
  event_start: string;
  subject: string;
  info?: string;
  /** References a contact object. */
  contact_id?: number | null;
  /** References a project object. */
  project_id?: number | null;
  /** References a project object. */
  pr_project_id?: number | null;
  entry_id?: number | null;
  module_id?: number | null;
}

export interface NoteCreate {
  /** References a user object. */
  user_id: number;
  /** Date/time the note is scheduled for (ISO 8601). */
  event_start: string;
  subject: string;
  info?: string;
  /** References a contact object. */
  contact_id?: number | null;
  /** References a project object. */
  project_id?: number | null;
  /** References a project object. */
  pr_project_id?: number | null;
  entry_id?: number | null;
  module_id?: number | null;
}

export type NoteUpdate = Partial<NoteCreate>;

export class NotesApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of notes. The endpoint supports only limit/offset (no `order_by`).
   * @see v2ListNotes — scope `note_show`
   */
  list(params?: { limit?: number; offset?: number }): Promise<Note[]> {
    return this.http.get('/2.0/note', { query: { ...params } });
  }

  /**
   * Search notes. Supported search fields: event_start, contact_id, user_id, subject, module_id, entry_id.
   * The endpoint supports only limit/offset (no `order_by`).
   * @see v2SearchNotes — scope `note_show`
   */
  search(criteria: SearchCriteria[], params?: { limit?: number; offset?: number }): Promise<Note[]> {
    return this.http.post('/2.0/note/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch a note.
   * @see v2ShowNote — scope `note_show`
   */
  get(noteId: number): Promise<Note> {
    return this.http.get(`/2.0/note/${noteId}`);
  }

  /**
   * Create note.
   * @see v2CreateNote — scope `note_edit`
   */
  create(note: NoteCreate): Promise<Note> {
    return this.http.post('/2.0/note', { body: note });
  }

  /**
   * Edit a note.
   * @see v2EditNote — scope `note_edit`
   */
  update(noteId: number, note: NoteUpdate): Promise<Note> {
    return this.http.post(`/2.0/note/${noteId}`, { body: note });
  }

  /**
   * Delete a note. This action permanently deletes a note; it cannot be undone.
   * @see DeleteNote — scope `note_edit`
   */
  delete(noteId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/note/${noteId}`);
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** A task/todo (2.0 API). */
export interface Task {
  id: number;
  /** References a user object. */
  user_id: number;
  /** Due date of the task (ISO 8601). */
  finish_date?: string | null;
  subject: string;
  place?: number | null;
  info?: string;
  /** References a contact object. */
  contact_id?: number;
  /** References a contact object. */
  sub_contact_id?: number | null;
  /** References a project object. */
  project_id?: number | null;
  /** References a project object. */
  pr_project_id?: number | null;
  entry_id?: number | null;
  module_id?: number | null;
  /** References a task status object (see task statuses list). */
  todo_status_id?: number;
  /** References a task priority object (see task priorities list). */
  todo_priority_id?: number | null;
  has_reminder?: boolean;
  have_remember?: boolean;
  /** Is required if `have_remember` is set to true. */
  remember_type_id?: number;
  /** Is required if `have_remember` is set to true. */
  remember_time_id?: number | null;
  communication_kind_id?: number | null;
}

export interface TaskCreate {
  /** References a user object. */
  user_id: number;
  /** Due date of the task (ISO 8601). */
  finish_date?: string | null;
  subject: string;
  place?: number | null;
  info?: string;
  /** References a contact object. */
  contact_id?: number;
  /** References a contact object. */
  sub_contact_id?: number | null;
  /** References a project object. */
  project_id?: number | null;
  /** References a project object. */
  pr_project_id?: number | null;
  entry_id?: number | null;
  module_id?: number | null;
  /** References a task status object (see task statuses list). */
  todo_status_id?: number;
  /** References a task priority object (see task priorities list). */
  todo_priority_id?: number | null;
  has_reminder?: boolean;
  have_remember?: boolean;
  /** Is required if `have_remember` is set to true. */
  remember_type_id?: number;
  /** Is required if `have_remember` is set to true. */
  remember_time_id?: number | null;
  communication_kind_id?: number | null;
}

export type TaskUpdate = Partial<TaskCreate>;

/** A task priority (id/name pair). */
export interface TaskPriority {
  id: number;
  name: string;
}

/** A task status (id/name pair). */
export interface TaskStatus {
  id: number;
  name: string;
}

export class TasksApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of tasks. `order_by` accepts `id` or `finish_date`.
   * @see v2ListTasks — scope `task_show`
   */
  list(params?: ListParams): Promise<Task[]> {
    return this.http.get('/2.0/task', { query: { ...params } });
  }

  /**
   * Search tasks. Supported search fields: subject, updated_at, user_id, contact_id,
   * todo_status_id, module_id, entry_id. `order_by` accepts `id` or `finish_date`.
   * @see v2SearchTasks — scope `task_show`
   */
  search(criteria: SearchCriteria[], params?: ListParams): Promise<Task[]> {
    return this.http.post('/2.0/task/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch a task.
   * @see v2ShowTask — scope `task_show`
   */
  get(taskId: number): Promise<Task> {
    return this.http.get(`/2.0/task/${taskId}`);
  }

  /**
   * Create task.
   * @see v2CreateTask — scope `task_edit`
   */
  create(task: TaskCreate): Promise<Task> {
    return this.http.post('/2.0/task', { body: task });
  }

  /**
   * Edit a task.
   * @see v2EditTask — scope `task_show`
   */
  update(taskId: number, task: TaskUpdate): Promise<Task> {
    return this.http.post(`/2.0/task/${taskId}`, { body: task });
  }

  /**
   * Delete a task. This action permanently deletes a task; it cannot be undone.
   * @see DeleteTask — scope `task_edit`
   */
  delete(taskId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/task/${taskId}`);
  }

  /**
   * Fetch a list of all task priorities. `order_by` accepts `id` or `name`.
   * @see v2ListTaskPriorities — scope `task_show`
   */
  listPriorities(params?: ListParams): Promise<TaskPriority[]> {
    return this.http.get('/2.0/todo_priority', { query: { ...params } });
  }

  /**
   * Fetch a list of all task statuses. `order_by` accepts `id` or `name`.
   * @see v2ListTaskStatus — scope `task_show`
   */
  listStatuses(params?: ListParams): Promise<TaskStatus[]> {
    return this.http.get('/2.0/todo_status', { query: { ...params } });
  }
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

/** A regular (login-capable) user (3.0 API). Read-only via the API. */
export interface User {
  /** The id of the main resource. */
  id: number;
  salutation_type?: 'male' | 'female';
  /** The first name of the user. */
  firstname?: string | null;
  /** The last name of the user. */
  lastname?: string | null;
  /** The email address of the user. An email address can only be used once per company. */
  email: string;
  /** Whether the user is a superadmin. Only included if the authenticated user is a superadmin. */
  is_superadmin?: boolean;
  /** Whether the user is an accountant. Only included if the authenticated user is a superadmin. */
  is_accountant?: boolean;
}

/** A fictional user: usable in dropdowns but cannot log in to the application. */
export interface FictionalUser {
  /** The id of the main resource. */
  id: number;
  salutation_type: 'male' | 'female';
  /** The first name of the fictional user. */
  firstname: string;
  /** The last name of the fictional user. */
  lastname: string;
  /** The email address of the fictional user. An email address can only be used once per company. */
  email: string;
  /** A reference to a title. */
  title_id?: number;
}

export interface FictionalUserCreate {
  salutation_type: 'male' | 'female';
  /** The first name of the fictional user. */
  firstname: string;
  /** The last name of the fictional user. */
  lastname: string;
  /** The email address of the fictional user. An email address can only be used once per company. */
  email: string;
  /** A reference to a title. */
  title_id?: number;
}

export type FictionalUserUpdate = Partial<FictionalUserCreate>;

/** Access information of the logged-in user (activated components + permission map). */
export interface PermissionsResponse {
  /** All activated modules/components for the signed-in user. */
  components: string[];
  /** All user permissions of the logged-in user, keyed by permission name. */
  permissions: Record<string, Record<string, unknown>>;
}

export class UsersApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of users.
   * @see v3ListUsers — scope `general`
   */
  list(params?: { limit?: number; offset?: number }): Promise<User[]> {
    return this.http.get('/3.0/users', { query: { ...params } });
  }

  /**
   * Fetch a user.
   * @see v3ShowUser — scope `general`
   */
  get(userId: number): Promise<User> {
    return this.http.get(`/3.0/users/${userId}`);
  }

  /**
   * Fetch the authenticated user (the user behind the bearer token).
   * @see v3ShowMe — scope `general`
   */
  me(): Promise<User> {
    return this.http.get('/3.0/users/me');
  }

  /**
   * Fetch a list of fictional users (usable in dropdowns, cannot log in).
   * @see v3ListFictionalUsers — scope `general`
   */
  listFictional(params?: { limit?: number; offset?: number }): Promise<FictionalUser[]> {
    return this.http.get('/3.0/fictional_users', { query: { ...params } });
  }

  /**
   * Fetch a fictional user.
   * @see v3ShowFictionalUser — scope `general`
   */
  getFictional(fictionalUserId: number): Promise<FictionalUser> {
    return this.http.get(`/3.0/fictional_users/${fictionalUserId}`);
  }

  /**
   * Create a fictional user.
   * @see v3CreateFictionalUser — scope `general`
   */
  createFictional(user: FictionalUserCreate): Promise<FictionalUser> {
    return this.http.post('/3.0/fictional_users', { body: user });
  }

  /**
   * Update a fictional user.
   * @see v3UpdateFictionalUser — scope `general`
   */
  updateFictional(fictionalUserId: number, user: FictionalUserUpdate): Promise<FictionalUser> {
    return this.http.patch(`/3.0/fictional_users/${fictionalUserId}`, { body: user });
  }

  /**
   * Delete a fictional user. This action permanently deletes the user; it cannot be undone.
   * @see v3DeleteFictionalUser — scope `general`
   */
  deleteFictional(fictionalUserId: number): Promise<SuccessResponse> {
    return this.http.delete(`/3.0/fictional_users/${fictionalUserId}`);
  }

  /**
   * Get access information (activated components and permissions) of the logged-in user.
   * @see Permissions — scope `general`
   */
  permissions(): Promise<PermissionsResponse> {
    return this.http.get('/3.0/permissions');
  }
}

/** Operation IDs of the bexio API covered by {@link NotesApi}, {@link TasksApi} and {@link UsersApi} (used by coverage tests). */
export const orgOperations = [
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
