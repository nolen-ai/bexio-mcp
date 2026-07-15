/**
 * Typed TypeScript client for the bexio API (https://docs.bexio.com/).
 *
 * Standalone and MCP-free: import from `bexio-mcp/client` to use it in any project.
 *
 * ```ts
 * const bexio = new BexioClient({ token: process.env.BEXIO_API_TOKEN! });
 * const contacts = await bexio.contacts.list({ limit: 10 });
 * ```
 */
import { BexioHttp, type BexioHttpOptions } from './http.js';
import { CurrenciesApi, ManualEntriesApi } from './resources/accounting-entries.js';
import { AccountingApi } from './resources/accounting-core.js';
import { BankingApi } from './resources/banking.js';
import {
  AdditionalAddressesApi,
  ContactGroupsApi,
  ContactRelationsApi,
  ContactSectorsApi,
  ContactsApi,
} from './resources/contacts.js';
import { FilesApi } from './resources/files.js';
import { InvoicesApi } from './resources/invoices.js';
import { ItemsApi, StockApi } from './resources/items.js';
import { CompanyProfileApi, MasterDataApi } from './resources/master-data.js';
import { DeliveriesApi, OrdersApi } from './resources/orders.js';
import { NotesApi, TasksApi, UsersApi } from './resources/org.js';
import { PayrollApi } from './resources/payroll.js';
import { ProjectsApi } from './resources/projects.js';
import { BillsApi, ExpensesApi, OutgoingPaymentsApi, PurchaseOrdersApi } from './resources/purchase.js';
import { QuotesApi } from './resources/quotes.js';
import { DocumentCommentsApi, DocumentPositionsApi, DocumentSettingsApi } from './resources/sales-docs.js';
import { TimesheetsApi } from './resources/timesheets.js';

export type BexioClientOptions = BexioHttpOptions;

/** Entry point aggregating one API class per bexio domain. */
export class BexioClient {
  /** Low-level transport; use for endpoints not covered by a resource class. */
  readonly http: BexioHttp;

  // Contacts
  readonly contacts: ContactsApi;
  readonly contactRelations: ContactRelationsApi;
  readonly contactGroups: ContactGroupsApi;
  readonly contactSectors: ContactSectorsApi;
  readonly additionalAddresses: AdditionalAddressesApi;
  // Sales order management
  readonly quotes: QuotesApi;
  readonly orders: OrdersApi;
  readonly deliveries: DeliveriesApi;
  readonly invoices: InvoicesApi;
  readonly documentPositions: DocumentPositionsApi;
  readonly documentComments: DocumentCommentsApi;
  readonly documentSettings: DocumentSettingsApi;
  // Purchase
  readonly bills: BillsApi;
  readonly expenses: ExpensesApi;
  readonly purchaseOrders: PurchaseOrdersApi;
  readonly outgoingPayments: OutgoingPaymentsApi;
  // Accounting
  readonly accounting: AccountingApi;
  readonly currencies: CurrenciesApi;
  readonly manualEntries: ManualEntriesApi;
  // Banking
  readonly banking: BankingApi;
  // Items & products
  readonly items: ItemsApi;
  readonly stock: StockApi;
  // Projects & time tracking
  readonly projects: ProjectsApi;
  readonly timesheets: TimesheetsApi;
  // Files
  readonly files: FilesApi;
  // Payroll
  readonly payroll: PayrollApi;
  // Other
  readonly masterData: MasterDataApi;
  readonly companyProfile: CompanyProfileApi;
  readonly notes: NotesApi;
  readonly tasks: TasksApi;
  readonly users: UsersApi;

  constructor(options: BexioClientOptions) {
    this.http = new BexioHttp(options);
    this.contacts = new ContactsApi(this.http);
    this.contactRelations = new ContactRelationsApi(this.http);
    this.contactGroups = new ContactGroupsApi(this.http);
    this.contactSectors = new ContactSectorsApi(this.http);
    this.additionalAddresses = new AdditionalAddressesApi(this.http);
    this.quotes = new QuotesApi(this.http);
    this.orders = new OrdersApi(this.http);
    this.deliveries = new DeliveriesApi(this.http);
    this.invoices = new InvoicesApi(this.http);
    this.documentPositions = new DocumentPositionsApi(this.http);
    this.documentComments = new DocumentCommentsApi(this.http);
    this.documentSettings = new DocumentSettingsApi(this.http);
    this.bills = new BillsApi(this.http);
    this.expenses = new ExpensesApi(this.http);
    this.purchaseOrders = new PurchaseOrdersApi(this.http);
    this.outgoingPayments = new OutgoingPaymentsApi(this.http);
    this.accounting = new AccountingApi(this.http);
    this.currencies = new CurrenciesApi(this.http);
    this.manualEntries = new ManualEntriesApi(this.http);
    this.banking = new BankingApi(this.http);
    this.items = new ItemsApi(this.http);
    this.stock = new StockApi(this.http);
    this.projects = new ProjectsApi(this.http);
    this.timesheets = new TimesheetsApi(this.http);
    this.files = new FilesApi(this.http);
    this.payroll = new PayrollApi(this.http);
    this.masterData = new MasterDataApi(this.http);
    this.companyProfile = new CompanyProfileApi(this.http);
    this.notes = new NotesApi(this.http);
    this.tasks = new TasksApi(this.http);
    this.users = new UsersApi(this.http);
  }
}

export { BexioHttp } from './http.js';
export type { BexioHttpOptions, RequestOptions, TokenProvider } from './http.js';
export * from './errors.js';
export * from './oauth.js';
export * from './types.js';
export * from './resources/accounting-entries.js';
export * from './resources/accounting-core.js';
export * from './resources/banking.js';
export * from './resources/contacts.js';
export * from './resources/files.js';
export * from './resources/invoices.js';
export * from './resources/items.js';
export * from './resources/master-data.js';
export * from './resources/orders.js';
export * from './resources/org.js';
export * from './resources/payroll.js';
export * from './resources/projects.js';
export * from './resources/purchase.js';
export * from './resources/quotes.js';
export * from './resources/sales-docs.js';
export * from './resources/timesheets.js';
