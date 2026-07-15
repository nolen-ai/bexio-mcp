# Coverage

This package covers **all 310 operations** documented in the official bexio OpenAPI specification (https://docs.bexio.com/), verified by `tests/coverage.test.ts`.

## Tools

| Tool | Group | Actions | Write actions | Destructive |
|------|-------|---------|---------------|-------------|
| `bexio_contacts` | contacts | list, search, get, create, update, delete, bulk_create, restore | create, update, delete, bulk_create, restore | delete |
| `bexio_contact_relations` | contacts | list, search, get, create, update, delete | create, update, delete | delete |
| `bexio_contact_groups` | contacts | list, search, get, create, update, delete | create, update, delete | delete |
| `bexio_contact_sectors` | contacts | list, search | — | — |
| `bexio_additional_addresses` | contacts | list, search, get, create, update, delete | create, update, delete | delete |
| `bexio_quotes` | sales | list, search, get, create, update, delete, issue, revert_issue, accept, decline, reissue, mark_as_sent, send, copy, pdf, create_invoice, create_order | create, update, delete, issue, revert_issue, accept, decline, reissue, mark_as_sent, send, copy, create_invoice, create_order | delete |
| `bexio_orders` | sales | list, search, get, create, update, delete, pdf, get_repetition, edit_repetition, delete_repetition, create_delivery, create_invoice | create, update, delete, edit_repetition, delete_repetition, create_delivery, create_invoice | delete, delete_repetition |
| `bexio_deliveries` | sales | list, get, issue | issue | — |
| `bexio_invoices` | sales | list, search, get, create, update, delete, issue, revert_issue, cancel, mark_as_sent, send, copy, pdf | create, update, delete, issue, revert_issue, cancel, mark_as_sent, send, copy | delete |
| `bexio_invoice_payments` | sales | list, get, create, delete | create, delete | delete |
| `bexio_invoice_reminders` | sales | list, search, get, create, delete, send, mark_as_sent, mark_as_unsent, pdf | create, delete, send, mark_as_sent, mark_as_unsent | delete |
| `bexio_document_positions` | sales | list, get, create, update, delete | create, update, delete | delete |
| `bexio_document_comments` | sales | list, get, create | create | — |
| `bexio_document_settings` | sales | list_settings, list_templates | — | — |
| `bexio_bills` | purchase | list, get, create, update, delete, execute_action, update_status, validate_document_number | create, update, delete, execute_action, update_status | delete |
| `bexio_expenses` | purchase | list, get, create, update, delete, execute_action, update_status, validate_document_number | create, update, delete, execute_action, update_status | delete |
| `bexio_purchase_orders` | purchase | list, get, create, update, delete | create, update, delete | delete |
| `bexio_outgoing_payments` | purchase | list, get, create, update, delete | create, update, delete | delete |
| `bexio_accounting` | accounting | list, search, get, create, delete | create, delete | delete |
| `bexio_currencies` | accounting | list, get, create, update, delete, list_codes, list_exchange_rates | create, update, delete | delete |
| `bexio_manual_entries` | accounting | list, create, update, delete, next_reference_number, list_files, get_file, add_file, delete_file | create, update, delete, add_file, delete_file | delete, delete_file |
| `bexio_bank_accounts` | banking | list, get | — | — |
| `bexio_banking_payments` | banking | list, get, create, update, cancel, delete | create, update, cancel, delete | delete |
| `bexio_items` | items | list, search, get, create, update, delete | create, update, delete | delete |
| `bexio_stock` | items | list_locations, search_locations, list_areas, search_areas | — | — |
| `bexio_projects` | projects | list, search, get, create, update, delete, archive, unarchive, list_statuses, list_types | create, update, delete, archive, unarchive | delete |
| `bexio_project_planning` | projects | list, get, create, update, delete | create, update, delete | delete |
| `bexio_timesheets` | projects | list, search, get, create, update, delete, list_statuses | create, update, delete | delete |
| `bexio_files` | files | list, search, get, download, preview, usage, upload, update, delete | upload, update, delete | delete |
| `bexio_payroll` | payroll | list, get, create, update, delete, download_pdf | create, update, delete | delete |
| `bexio_master_data` | misc | list, search, get, create, update, delete | create, update, delete | delete |
| `bexio_company_profile` | misc | list, get | — | — |
| `bexio_notes` | misc | list, search, get, create, update, delete | create, update, delete | delete |
| `bexio_tasks` | misc | list, search, get, create, update, delete, list_priorities, list_statuses | create, update, delete | delete |
| `bexio_users` | misc | list, get, me, list_fictional, get_fictional, create_fictional, update_fictional, delete_fictional, permissions | create_fictional, update_fictional, delete_fictional | delete_fictional |

## Documented operations by API section

| API section (docs tag) | Operations |
|------------------------|------------|
| Absences | 5 |
| Account Groups | 1 |
| Accounts | 2 |
| Additional Addresses | 6 |
| Bank Accounts | 2 |
| Bills | 8 |
| Business Activities | 3 |
| Business Years | 2 |
| Calendar Years | 4 |
| Comments | 3 |
| Communication Types | 2 |
| Company Profile | 2 |
| Contact Groups | 6 |
| Contact Relations | 6 |
| Contact Sectors | 2 |
| Contacts | 8 |
| Countries | 6 |
| Currencies | 7 |
| Default positions | 5 |
| Deliveries | 3 |
| Discount positions | 5 |
| Document Settings | 1 |
| Document templates | 1 |
| Documents | 2 |
| Employees | 4 |
| Expenses | 8 |
| Files | 9 |
| Invoices | 26 |
| Item positions | 5 |
| Items | 6 |
| Languages | 2 |
| Manual Entries | 13 |
| Notes | 6 |
| Orders | 12 |
| Outgoing Payment | 5 |
| Pagebreak positions | 5 |
| Payment Types | 2 |
| Payments | 6 |
| Permissions | 1 |
| Projects | 20 |
| Purchase Orders | 5 |
| Quotes | 17 |
| Reports | 1 |
| Salutations | 6 |
| Stock Areas | 2 |
| Stock locations | 2 |
| Sub positions | 5 |
| Subtotal positions | 5 |
| Tasks | 8 |
| Taxes | 3 |
| Text positions | 5 |
| Timesheets | 7 |
| Titles | 6 |
| Units | 6 |
| User Management | 8 |
| Vat Periods | 2 |

Total: 310 operations, 35 tools.
