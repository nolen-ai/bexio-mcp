/**
 * Aggregates the MCP tool definitions of every bexio domain.
 */
import type { AnyBexioToolDefinition } from '../registry.js';
import { accountingEntriesTools, accountingEntriesToolOperations } from './accounting-entries.js';
import { accountingCoreTools, accountingCoreToolOperations } from './accounting-core.js';
import { bankingTools, bankingToolOperations } from './banking.js';
import { contactsTools, contactsToolOperations } from './contacts.js';
import { filesTools, filesToolOperations } from './files.js';
import { invoicesTools, invoicesToolOperations } from './invoices.js';
import { itemsTools, itemsToolOperations } from './items.js';
import { masterDataTools, masterDataToolOperations } from './master-data.js';
import { ordersTools, ordersToolOperations } from './orders.js';
import { orgTools, orgToolOperations } from './org.js';
import { payrollTools, payrollToolOperations } from './payroll.js';
import { projectsTools, projectsToolOperations } from './projects.js';
import { purchaseTools, purchaseToolOperations } from './purchase.js';
import { quotesTools, quotesToolOperations } from './quotes.js';
import { salesDocsTools, salesDocsToolOperations } from './sales-docs.js';
import { timesheetsTools, timesheetsToolOperations } from './timesheets.js';

/** Every bexio tool definition, in registration order (mirrors the docs' tag groups). */
export const allBexioTools: readonly AnyBexioToolDefinition[] = [
  ...contactsTools,
  ...quotesTools,
  ...ordersTools,
  ...invoicesTools,
  ...salesDocsTools,
  ...purchaseTools,
  ...accountingCoreTools,
  ...accountingEntriesTools,
  ...bankingTools,
  ...itemsTools,
  ...projectsTools,
  ...timesheetsTools,
  ...filesTools,
  ...payrollTools,
  ...masterDataTools,
  ...orgTools,
];

/** bexio operation ids reachable through the registered tools (coverage-tested). */
export const coveredOperationIds: readonly string[] = [
  ...contactsToolOperations,
  ...quotesToolOperations,
  ...ordersToolOperations,
  ...invoicesToolOperations,
  ...salesDocsToolOperations,
  ...purchaseToolOperations,
  ...accountingCoreToolOperations,
  ...accountingEntriesToolOperations,
  ...bankingToolOperations,
  ...itemsToolOperations,
  ...projectsToolOperations,
  ...timesheetsToolOperations,
  ...filesToolOperations,
  ...payrollToolOperations,
  ...masterDataToolOperations,
  ...orgToolOperations,
];

export {
  contactsTools,
  quotesTools,
  ordersTools,
  invoicesTools,
  salesDocsTools,
  purchaseTools,
  accountingCoreTools,
  accountingEntriesTools,
  bankingTools,
  itemsTools,
  projectsTools,
  timesheetsTools,
  filesTools,
  payrollTools,
  masterDataTools,
  orgTools,
};
