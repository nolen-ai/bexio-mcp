/**
 * Payroll resources (4.0 API): employees, absences and paystub documents.
 *
 * Covers operations tagged "Employees", "Absences" and "Documents" in the bexio
 * payroll API docs (https://docs.bexio.com/#tag/Employees,
 * https://docs.bexio.com/#tag/Absences, https://docs.bexio.com/#tag/Documents).
 */
import type { BexioHttp } from '../http.js';

export type PayrollGender = 'male' | 'female';
export type PayrollLanguage = 'de' | 'it' | 'fr' | 'en';
export type PayrollMaritalStatus =
  | 'unknown'
  | 'single'
  | 'married'
  | 'separated'
  | 'registered_partnership'
  | 'partnership_dissolved_by_law'
  | 'partnership_dissolved_by_death'
  | 'partnership_dissolved_by_declaration_of_lost'
  | 'widowed'
  | 'divorced';

/** Postal address of a payroll employee. */
export interface PayrollEmployeeAddress {
  complementary_line?: string;
  /** @deprecated Use `street_name` + `house_number` instead. */
  street?: string;
  /** Requires `house_number` if the value is not NULL. */
  street_name?: string;
  /** Requires `street_name` if the value is not NULL. */
  house_number?: string;
  postbox?: string;
  locality?: string;
  zip_code?: string;
  city?: string;
  /** Country should be in ISO Alpha-2 format, e.g. "CH". */
  country?: string;
  canton?: string;
  municipality_id?: string;
}

/** A payroll employee (4.0 payroll API; ids are UUID strings). */
export interface PayrollEmployee {
  id: string;
  first_name?: string;
  last_name?: string;
  /** ISO 8601 date, e.g. "2024-01-31". */
  date_of_birth?: string;
  ahv_number?: string;
  gender?: PayrollGender;
  /** Nation in ISO Alpha-2 format. Special values: '11' means 'unknown', '22' means 'stateless'. */
  nationality: string;
  stay_permit_category?: string;
  language: PayrollLanguage;
  marital_status: PayrollMaritalStatus;
  email?: string;
  phone_number?: string;
  hours_per_week?: number;
  employment_level?: number;
  annual_vacation_days_total?: number;
  address?: PayrollEmployeeAddress;
  personal_number?: string;
  iban?: string;
}

/** Employee state on a specific date, including vacation counters. */
export interface PayrollEmployeeDetail extends PayrollEmployee {
  annual_vacation_days_used?: number;
  annual_vacation_days_left?: number;
  effective_working_hours_per_week?: number;
}

/** Payload for creating an employee. The API requires the AHV number. */
export interface PayrollEmployeeCreate {
  email?: string;
  first_name?: string;
  last_name?: string;
  personal_number?: string;
  /** Nation in ISO Alpha-2 format. Special values: '11' means 'unknown', '22' means 'stateless'. */
  nationality?: string;
  iban?: string;
  /** Swiss AHV social security number. Required on create. */
  ahv_number: string;
  marital_status?: PayrollMaritalStatus;
  gender?: PayrollGender;
  /** ISO 8601 date, e.g. "2024-01-31". */
  date_of_birth?: string;
  address?: PayrollEmployeeAddress;
  language?: PayrollLanguage;
  phone_number?: string;
  annual_vacation_days?: number;
}

/**
 * Payload for updating an employee (PATCH; send only the fields to change).
 *
 * Note: the OpenAPI spec puts a stray `required: ["ahvNumber"]` marker on the
 * PATCH body too — camelCase, matching no declared property (all properties are
 * snake_case, e.g. `ahv_number`) — almost certainly a typo copied from the
 * create schema. It is deliberately treated as such: PATCH semantics take
 * precedence and `ahv_number` stays optional here.
 */
export type PayrollEmployeeUpdate = Partial<PayrollEmployeeCreate>;

/** An employee absence (4.0 payroll API; ids are UUID strings). */
export interface PayrollAbsence {
  id: string;
  /**
   * Currently supported reasons: Injury, Sickness, MaternityLeave, MilitaryLeave,
   * Vacation, InterruptionOfWork. New reasons might be added in the future.
   */
  reason: string;
  /** ISO 8601 date, e.g. "2024-01-31". */
  start_date: string;
  /** ISO 8601 date, e.g. "2024-01-31". */
  end_date?: string;
  half_day?: boolean;
  continued_pay?: number;
  disability?: number;
  paid_hours?: number;
}

/** Payload for creating an absence. Required: reason, start_date. */
export interface PayrollAbsenceCreate {
  /**
   * Currently supported reasons: Injury, Sickness, MaternityLeave, MilitaryLeave,
   * Vacation, InterruptionOfWork. New reasons might be added in the future.
   */
  reason: string;
  /** ISO 8601 date, e.g. "2024-01-31". */
  start_date: string;
  /** ISO 8601 date, e.g. "2024-01-31". */
  end_date?: string;
  half_day?: boolean;
  continued_pay?: number;
  disability?: number;
  paid_hours?: number;
}

/** Payload for updating an absence. PUT semantics: the API requires ALL fields. */
export interface PayrollAbsenceUpdate {
  /**
   * Currently supported reasons: Injury, Sickness, MaternityLeave, MilitaryLeave,
   * Vacation, InterruptionOfWork. New reasons might be added in the future.
   */
  reason: string;
  /** ISO 8601 date, e.g. "2024-01-31". */
  start_date: string;
  /** ISO 8601 date, e.g. "2024-01-31". */
  end_date: string;
  half_day: boolean;
  continued_pay: number;
  disability: number;
  paid_hours: number;
}

/** Response of the deprecated paystub PDF endpoint: URI of the generated PDF. */
export interface PaystubPdfLocation {
  location?: string;
}

export class PayrollApi {
  constructor(private readonly http: BexioHttp) {}

  // -------------------------------------------------------------------------
  // Employees
  // -------------------------------------------------------------------------

  /**
   * Retrieves all active employees.
   * @see getEmployees — scope `payroll_employee_show`
   */
  async listEmployees(): Promise<PayrollEmployee[]> {
    const response = await this.http.get<{ data?: PayrollEmployee[] }>('/4.0/payroll/employees');
    return response.data ?? [];
  }

  /**
   * Retrieve a single employee on a specific date.
   * @see getEmployeeOnDate — scope `payroll_employee_show`
   * @param date Date of the employee's state (ISO 8601, e.g. "2024-01-31").
   */
  getEmployeeOnDate(employeeId: string, date: string): Promise<PayrollEmployeeDetail> {
    return this.http.get(`/4.0/payroll/employees/${encodeURIComponent(employeeId)}`, { query: { date } });
  }

  /**
   * Create employee.
   * @see createEmployee — scope `payroll_employee_edit`
   */
  createEmployee(employee: PayrollEmployeeCreate): Promise<PayrollEmployeeDetail> {
    return this.http.post('/4.0/payroll/employees', { body: employee });
  }

  /**
   * Update employee (PATCH; send only the fields to change).
   * @see updateEmployee — scope `payroll_employee_edit`
   */
  updateEmployee(employeeId: string, employee: PayrollEmployeeUpdate): Promise<void> {
    return this.http.patch(`/4.0/payroll/employees/${encodeURIComponent(employeeId)}`, { body: employee });
  }

  // -------------------------------------------------------------------------
  // Absences
  // -------------------------------------------------------------------------

  /**
   * Retrieving absences of employee for given year.
   * @see getEmployeeAbsenceInYear — scope `payroll_absence_show`
   * @param businessYear Year of absence, e.g. 2024.
   */
  async listAbsences(employeeId: string, businessYear: number): Promise<PayrollAbsence[]> {
    const response = await this.http.get<{ data?: PayrollAbsence[] }>(
      `/4.0/payroll/employees/${encodeURIComponent(employeeId)}/absences`,
      { query: { businessYear } },
    );
    return response.data ?? [];
  }

  /**
   * Retrieving absence for employee with given absence id.
   * @see getAbsence — scope `payroll_absence_show`
   */
  getAbsence(employeeId: string, absenceId: string): Promise<PayrollAbsence> {
    return this.http.get(
      `/4.0/payroll/employees/${encodeURIComponent(employeeId)}/absences/${encodeURIComponent(absenceId)}`,
    );
  }

  /**
   * Create absence for employee.
   * @see createAbsenceForEmployee — scope `payroll_absence_edit`
   */
  createAbsence(employeeId: string, absence: PayrollAbsenceCreate): Promise<PayrollAbsence> {
    return this.http.post(`/4.0/payroll/employees/${encodeURIComponent(employeeId)}/absences`, {
      body: absence,
    });
  }

  /**
   * Updating existing absence (PUT; the API requires the full absence object).
   * @see updateAbsence — scope `payroll_absence_edit`
   */
  updateAbsence(employeeId: string, absenceId: string, absence: PayrollAbsenceUpdate): Promise<void> {
    return this.http.put(
      `/4.0/payroll/employees/${encodeURIComponent(employeeId)}/absences/${encodeURIComponent(absenceId)}`,
      { body: absence },
    );
  }

  /**
   * Deleting employee absence with given id.
   * @see deleteAbsence — scope `payroll_absence_edit`
   */
  deleteAbsence(employeeId: string, absenceId: string): Promise<void> {
    return this.http.delete(
      `/4.0/payroll/employees/${encodeURIComponent(employeeId)}/absences/${encodeURIComponent(absenceId)}`,
    );
  }

  // -------------------------------------------------------------------------
  // Documents (paystubs)
  // -------------------------------------------------------------------------

  /**
   * Download paystub pdf for employee for given month. Returns the raw PDF bytes.
   * @see downloadPaystubPdf — scope `payroll_paystub_show`
   */
  downloadPaystubPdf(employeeId: string, year: number, month: number): Promise<Uint8Array> {
    return this.http.get(
      `/4.0/payroll/employees/${encodeURIComponent(employeeId)}/paystub-pdf-download/${year}/${month}`,
      { responseType: 'binary' },
    );
  }

  /**
   * Retrieving pdf for employee for given month. Returns the URI of the generated PDF.
   * @deprecated Use {@link downloadPaystubPdf} instead.
   * @see getPdfForEmployeeInMonth — scope `payroll_paystub_show`
   */
  getPaystubPdfLocation(employeeId: string, year: number, month: number): Promise<PaystubPdfLocation> {
    return this.http.get(
      `/4.0/payroll/employees/${encodeURIComponent(employeeId)}/paystub-pdf/${year}/${month}`,
    );
  }
}

/** Operation IDs of the bexio API covered by {@link PayrollApi} (used by coverage tests). */
export const payrollOperations = [
  'getEmployees',
  'getEmployeeOnDate',
  'createEmployee',
  'updateEmployee',
  'getEmployeeAbsenceInYear',
  'getAbsence',
  'createAbsenceForEmployee',
  'updateAbsence',
  'deleteAbsence',
  'downloadPaystubPdf',
  'getPdfForEmployeeInMonth',
] as const;
