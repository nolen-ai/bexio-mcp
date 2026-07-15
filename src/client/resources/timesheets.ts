/**
 * Timesheets resources: timesheets and timesheet statuses (2.0).
 *
 * Covers operations tagged "Timesheets" in the bexio API docs
 * (https://docs.bexio.com/#tag/Timesheets).
 */
import type { BexioHttp } from '../http.js';
import type { ListParams, SearchCriteria, SuccessResponse } from '../types.js';

/** A timesheet status (e.g. "In Progress"). Read-only via the API. */
export interface TimesheetStatus {
  id: number;
  name: string;
}

/** Tracked time submitted as a total duration on a given day. */
export interface TimesheetTrackingDuration {
  type: 'duration';
  /** ISO 8601 date of the tracked time, e.g. "2019-05-20". */
  date: string;
  /** Duration in "HH:MM" format, e.g. "01:40". */
  duration: string;
}

/** Tracked time submitted as a start/end range. */
export interface TimesheetTrackingRange {
  type: 'range';
  /** Start date-time, e.g. "2019-05-20 14:22:48". */
  start: string;
  /** End date-time, e.g. "2019-05-20 16:13:25". */
  end: string;
}

/** Tracked time recorded via the bexio stopwatch (returned on reads only). */
export interface TimesheetTrackingStopwatch {
  type: 'stopwatch';
  [key: string]: unknown;
}

/**
 * Tracking payload accepted when creating/editing a timesheet.
 * Two different formats can be used to submit the tracked time:
 * either type `duration` or type `range`.
 */
export type TimesheetTracking = TimesheetTrackingDuration | TimesheetTrackingRange;

/** A timesheet (monitoring/time tracking entry). */
export interface Timesheet {
  id: number;
  /** References a user object. */
  user_id: number;
  /** References a timesheet status object. */
  status_id?: number;
  /** References a business activity object. */
  client_service_id: number;
  text?: string;
  allowable_bill: boolean;
  charge?: string | null;
  /** References a contact object. */
  contact_id?: number | null;
  /** References a contact object. */
  sub_contact_id?: number | null;
  /** References a project object. */
  pr_project_id?: number | null;
  pr_package_id?: number | null;
  pr_milestone_id?: number | null;
  /** Read-only. */
  travel_time?: string | null;
  /** Read-only. */
  travel_charge?: string | null;
  /** Read-only. */
  travel_distance?: number;
  /** Estimated time in "HH:MM" format, e.g. "02:30". */
  estimated_time?: string | null;
  /** ISO 8601 date of the tracked time. Read-only (derived from tracking). */
  date?: string;
  /** Tracked duration in "HH:MM" format. Read-only (derived from tracking). */
  duration?: string | null;
  /** Whether a stopwatch is currently running. Read-only. */
  running?: boolean;
  /** Tracked time; responses may also contain type `stopwatch`. */
  tracking?: TimesheetTracking | TimesheetTrackingStopwatch;
}

/** Payload to create a timesheet. */
export interface TimesheetCreate {
  /** References a user object. */
  user_id: number;
  /** References a business activity object. */
  client_service_id: number;
  allowable_bill: boolean;
  /** Tracked time: `{ type: "duration", date, duration }` or `{ type: "range", start, end }`. */
  tracking: TimesheetTracking;
  /** References a timesheet status object. */
  status_id?: number;
  text?: string;
  charge?: string | null;
  /** References a contact object. */
  contact_id?: number | null;
  /** References a contact object. */
  sub_contact_id?: number | null;
  /** References a project object. */
  pr_project_id?: number | null;
  pr_package_id?: number | null;
  pr_milestone_id?: number | null;
  /** Estimated time in "HH:MM" format, e.g. "02:30". */
  estimated_time?: string | null;
}

/** Payload to edit a timesheet (subset of the create payload). */
export type TimesheetUpdate = Partial<TimesheetCreate>;

export class TimesheetsApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of timesheets.
   * @see v2ListTimesheets — scope `monitoring_show`
   */
  list(params?: ListParams): Promise<Timesheet[]> {
    return this.http.get('/2.0/timesheet', { query: { ...params } });
  }

  /**
   * Search timesheets. Searchable fields: id, client_service_id, contact_id,
   * user_id, pr_project_id, status_id.
   * @see v2SearchTimesheets — scope `monitoring_show`
   */
  search(criteria: SearchCriteria[], params?: ListParams): Promise<Timesheet[]> {
    return this.http.post('/2.0/timesheet/search', { body: criteria, query: { ...params } });
  }

  /**
   * Fetch a timesheet.
   * @see v2ShowTimesheet — scope `monitoring_show`
   */
  get(timesheetId: number): Promise<Timesheet> {
    return this.http.get(`/2.0/timesheet/${timesheetId}`);
  }

  /**
   * Create timesheet.
   * @see v2CreateTimesheet — scope `monitoring_edit`
   */
  create(timesheet: TimesheetCreate): Promise<Timesheet> {
    return this.http.post('/2.0/timesheet', { body: timesheet });
  }

  /**
   * Edit a timesheet.
   * @see v2EditTimesheet — scope `monitoring_edit`
   */
  update(timesheetId: number, timesheet: TimesheetUpdate): Promise<Timesheet> {
    return this.http.post(`/2.0/timesheet/${timesheetId}`, { body: timesheet });
  }

  /**
   * Delete a timesheet. This permanently deletes the timesheet; it cannot be undone.
   * @see DeleteTimesheet — scope `monitoring_edit`
   */
  delete(timesheetId: number): Promise<SuccessResponse> {
    return this.http.delete(`/2.0/timesheet/${timesheetId}`);
  }

  /**
   * Timesheet status: fetch a list of all timesheet statuses.
   * @see v2ListTimeSheetStatus — scope `general`
   */
  listStatuses(params?: ListParams): Promise<TimesheetStatus[]> {
    return this.http.get('/2.0/timesheet_status', { query: { ...params } });
  }
}

/** Operation IDs of the bexio API covered by {@link TimesheetsApi} (used by coverage tests). */
export const timesheetsOperations = [
  'v2ListTimesheets',
  'v2SearchTimesheets',
  'v2ShowTimesheet',
  'v2CreateTimesheet',
  'v2EditTimesheet',
  'DeleteTimesheet',
  'v2ListTimeSheetStatus',
] as const;
