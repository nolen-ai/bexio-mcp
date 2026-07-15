/**
 * MCP tools for the payroll domain: employees, absences and paystub PDFs.
 */
import { z } from 'zod';
import { defineTool, requireArg, unknownAction, InvalidToolArgumentsError } from '../registry.js';
import { documentResult } from '../binary.js';
import type {
  PayrollAbsenceCreate,
  PayrollAbsenceUpdate,
  PayrollEmployeeCreate,
  PayrollEmployeeUpdate,
} from '../../client/resources/payroll.js';

const addressSchema = z
  .object({
    complementary_line: z.string().describe('Additional address line'),
    street: z.string().describe('DEPRECATED: use street_name + house_number instead'),
    street_name: z.string().describe('Street name; requires house_number if not null'),
    house_number: z.string().describe('House number; requires street_name if not null'),
    postbox: z.string().describe('P.O. box'),
    locality: z.string().describe('Locality'),
    zip_code: z.string().describe('ZIP / postal code'),
    city: z.string().describe('City'),
    country: z.string().describe('Country in ISO Alpha-2 format, e.g. "CH"'),
    canton: z.string().describe('Canton, e.g. "ZH"'),
    municipality_id: z.string().describe('Swiss municipality id (BFS number)'),
  })
  .partial()
  .describe('Employees only: postal address of the employee');

// Single merged payload schema for both resources. Do NOT model this as
// z.union([absence, employee]): both shapes are fully partial, so a zod v3
// union would match the FIRST branch for any object and silently strip the
// other resource's fields (an employee payload would parse to {}). The
// "resource" argument already disambiguates which fields apply.
const payrollPayloadSchema = z
  .object({
    // -- Employee fields (resource "employees") -----------------------------
    email: z.string().describe('Employees only: email address'),
    first_name: z.string().describe('Employees only: first name'),
    last_name: z.string().describe('Employees only: last name'),
    personal_number: z.string().describe('Employees only: internal personnel number'),
    nationality: z
      .string()
      .describe(
        'Employees only: nation in ISO Alpha-2 format; special values: "11" = unknown, "22" = stateless',
      ),
    iban: z.string().describe('Employees only: IBAN of the employee\'s salary account'),
    ahv_number: z
      .string()
      .describe('Employees only: Swiss AHV social security number (required on create)'),
    marital_status: z
      .enum([
        'unknown',
        'single',
        'married',
        'separated',
        'registered_partnership',
        'partnership_dissolved_by_law',
        'partnership_dissolved_by_death',
        'partnership_dissolved_by_declaration_of_lost',
        'widowed',
        'divorced',
      ])
      .describe('Employees only: marital status'),
    gender: z.enum(['male', 'female']).describe('Employees only: gender'),
    date_of_birth: z.string().describe('Employees only: date of birth (ISO 8601, e.g. "2024-01-31")'),
    address: addressSchema,
    language: z.enum(['de', 'it', 'fr', 'en']).describe('Employees only: correspondence language'),
    phone_number: z.string().describe('Employees only: phone number'),
    annual_vacation_days: z.number().int().describe('Employees only: annual vacation days'),
    // -- Absence fields (resource "absences") --------------------------------
    reason: z
      .string()
      .describe(
        'Absences only: absence reason. Currently supported: Injury, Sickness, MaternityLeave, MilitaryLeave, Vacation, InterruptionOfWork (new reasons may be added)',
      ),
    start_date: z.string().describe('Absences only: start date (ISO 8601, e.g. "2024-01-31")'),
    end_date: z.string().describe('Absences only: end date (ISO 8601, e.g. "2024-01-31")'),
    half_day: z.boolean().describe('Absences only: whether the absence is a half day (default false)'),
    continued_pay: z.number().describe('Absences only: continued pay (decimal)'),
    disability: z.number().describe('Absences only: degree of disability (decimal)'),
    paid_hours: z.number().describe('Absences only: paid hours (decimal)'),
  })
  .partial()
  .describe(
    'Entity fields for create/update; use the fields matching the selected resource. ' +
      'Employees — required on create: ahv_number (the API spec also marks ahv_number required on the update PATCH, ' +
      'though updates normally send only the fields to change). ' +
      'Absences — required on create: reason, start_date; ' +
      'absence "update" uses PUT — the API requires the FULL object (reason, start_date, end_date, half_day, continued_pay, disability, paid_hours).',
  );

export const payrollTools = [
  defineTool({
    name: 'bexio_payroll',
    title: 'bexio Payroll',
    description:
      'Manage bexio payroll (4.0 API): employees, their absences and paystub PDFs. ' +
      'Employee and absence ids are UUID strings. Select a "resource" and an "action". ' +
      'Resource "employees": "list" (all active employees, no arguments), ' +
      '"get" (employee_id + date — the employee\'s state on that ISO date, includes vacation days used/left), ' +
      '"create" (payload; required: ahv_number; useful fields: first_name, last_name, email, nationality, marital_status, gender, date_of_birth, address, language, iban, annual_vacation_days), ' +
      '"update" (employee_id + payload; PATCH — send only the fields to change; the API spec also marks ahv_number required here, so include it if a partial update is rejected). ' +
      'Resource "absences": "list" (employee_id + year — absences of the employee in that business year), ' +
      '"get" (employee_id + absence_id), ' +
      '"create" (employee_id + payload; required: reason, start_date; reasons: Injury, Sickness, MaternityLeave, MilitaryLeave, Vacation, InterruptionOfWork), ' +
      '"update" (employee_id + absence_id + payload; PUT — the API requires the full absence object), ' +
      '"delete" (employee_id + absence_id — permanently deletes the absence, cannot be undone). ' +
      'Resource "paystubs": "download_pdf" (employee_id + year + month — downloads the paystub PDF; use save_path to write it to disk), ' +
      '"get" (employee_id + year + month — DEPRECATED endpoint returning the URI of the generated PDF; prefer "download_pdf").',
    group: 'payroll',
    writeActions: ['create', 'update', 'delete'],
    destructiveActions: ['delete'],
    inputSchema: {
      resource: z.enum(['employees', 'absences', 'paystubs']).describe('Payroll resource to operate on'),
      action: z
        .enum(['list', 'get', 'create', 'update', 'delete', 'download_pdf'])
        .describe(
          'Operation to perform. employees: list/get/create/update; absences: list/get/create/update/delete; paystubs: download_pdf/get (deprecated)',
        ),
      employee_id: z
        .string()
        .optional()
        .describe('Employee UUID (required for all actions except employees list/create)'),
      absence_id: z.string().optional().describe('Absence UUID (required for absences get/update/delete)'),
      date: z
        .string()
        .optional()
        .describe('ISO 8601 date of the employee\'s state (required by the API for employees "get")'),
      year: z
        .number()
        .int()
        .optional()
        .describe('Business year for absences "list"; calendar year for paystub actions'),
      month: z.number().int().min(1).max(12).optional().describe('Month (1-12) for paystub actions'),
      payload: payrollPayloadSchema.optional(),
      save_path: z
        .string()
        .optional()
        .describe('For "download_pdf": write the PDF to this file path instead of returning base64 inline'),
    },
    handler: async (client, args) => {
      const invalid = () =>
        new InvalidToolArgumentsError(
          `Action "${args.action}" is not available for resource "${args.resource}".`,
        );
      switch (args.resource) {
        case 'employees':
          switch (args.action) {
            case 'list':
              return client.payroll.listEmployees();
            case 'get':
              return client.payroll.getEmployeeOnDate(
                requireArg(args.employee_id, 'employee_id', 'get'),
                requireArg(args.date, 'date', 'get'),
              );
            case 'create':
              return client.payroll.createEmployee(
                requireArg(args.payload, 'payload', 'create') as PayrollEmployeeCreate,
              );
            case 'update':
              return client.payroll.updateEmployee(
                requireArg(args.employee_id, 'employee_id', 'update'),
                requireArg(args.payload, 'payload', 'update') as PayrollEmployeeUpdate,
              );
            default:
              throw invalid();
          }
        case 'absences':
          switch (args.action) {
            case 'list':
              return client.payroll.listAbsences(
                requireArg(args.employee_id, 'employee_id', 'list'),
                requireArg(args.year, 'year', 'list'),
              );
            case 'get':
              return client.payroll.getAbsence(
                requireArg(args.employee_id, 'employee_id', 'get'),
                requireArg(args.absence_id, 'absence_id', 'get'),
              );
            case 'create':
              return client.payroll.createAbsence(
                requireArg(args.employee_id, 'employee_id', 'create'),
                requireArg(args.payload, 'payload', 'create') as PayrollAbsenceCreate,
              );
            case 'update':
              return client.payroll.updateAbsence(
                requireArg(args.employee_id, 'employee_id', 'update'),
                requireArg(args.absence_id, 'absence_id', 'update'),
                requireArg(args.payload, 'payload', 'update') as PayrollAbsenceUpdate,
              );
            case 'delete':
              return client.payroll.deleteAbsence(
                requireArg(args.employee_id, 'employee_id', 'delete'),
                requireArg(args.absence_id, 'absence_id', 'delete'),
              );
            default:
              throw invalid();
          }
        case 'paystubs':
          switch (args.action) {
            case 'download_pdf': {
              const employeeId = requireArg(args.employee_id, 'employee_id', 'download_pdf');
              const year = requireArg(args.year, 'year', 'download_pdf');
              const month = requireArg(args.month, 'month', 'download_pdf');
              const bytes = await client.payroll.downloadPaystubPdf(employeeId, year, month);
              return documentResult(
                { name: `paystub_${employeeId}_${year}_${month}.pdf`, mime: 'application/pdf', bytes },
                args.save_path,
              );
            }
            case 'get':
              // Deprecated endpoint: returns { location } of the generated PDF.
              return client.payroll.getPaystubPdfLocation(
                requireArg(args.employee_id, 'employee_id', 'get'),
                requireArg(args.year, 'year', 'get'),
                requireArg(args.month, 'month', 'get'),
              );
            default:
              throw invalid();
          }
        default:
          return unknownAction(args.resource);
      }
    },
  }),
];

/** Operation IDs covered by the payroll tools (used by coverage tests). */
export const payrollToolOperations = [
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
