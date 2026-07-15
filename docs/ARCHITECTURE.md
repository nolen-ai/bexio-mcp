# Architecture

`bexio-mcp` has two strictly separated layers:

```
src/
├── client/                  Typed bexio API client — ZERO MCP dependencies.
│   ├── http.ts              BexioHttp: fetch, auth, retries, rate limits, errors
│   ├── errors.ts            BexioError hierarchy
│   ├── oauth.ts             App workflow: BexioOAuth (PKCE, code exchange, rotating
│   │                        refresh) + OAuthTokenProvider (auto-refresh token source)
│   ├── types.ts             Shared types (SearchCriteria, ListParams, …)
│   ├── resources/           One module per API domain (contacts.ts, quotes.ts, …)
│   └── index.ts             BexioClient aggregating all resource APIs
├── auth/                    Node-side OAuth companions (fs/http-bound).
│   ├── token-store.ts       FileTokenStore (~/.bexio-mcp/tokens.json, atomic writes)
│   └── login.ts             Loopback-browser authorization flow (bexio-mcp login)
├── mcp/                     MCP layer on top of the client.
│   ├── registry.ts          Tool definition model + registration (filtering, errors, truncation)
│   ├── binary.ts            documentResult() for PDF/file returning tools
│   ├── scopes.ts            Tool group -> API scope map (drives default login scopes)
│   ├── tools/               One module per API domain mirroring client/resources/
│   └── index.ts             createBexioMcpServer()
├── config.ts                Env/CLI configuration
├── version.ts               Package version constant (kept in sync with package.json by a test)
└── cli.ts                   stdio entry point (bin: bexio-mcp)
```

The client is published as its own entry point (`bexio-mcp/client`) so it can be
reused in any project without pulling in the MCP SDK.

## Data source

All resource modules are derived from the official bexio OpenAPI specification
(310 operations, extracted from https://docs.bexio.com/). The full list of
operation ids lives in `tests/fixtures/operations.json`; `tests/coverage.test.ts`
fails if any documented operation is not reachable through an MCP tool.

## Domain module conventions

Every domain contributes exactly two files. Using `contacts` as the example:

### 1. `src/client/resources/contacts.ts`

- One `XxxApi` class per sub-resource (e.g. `ContactsApi`, `ContactRelationsApi`),
  each taking `BexioHttp` in the constructor. `BexioClient` mounts them as
  readonly properties (`client.contacts`, `client.contactRelations`, …).
- TypeScript interfaces for entities (`Contact`) and payloads (`ContactCreate`,
  `ContactUpdate`). Field optionality follows the spec's `required` arrays;
  `nullable: true` becomes `| null`. Field-level doc comments carry over the
  spec descriptions where they add value.
- Every public method has a JSDoc comment with the operation summary and
  `@see <operationId> — scope \`<scope>\``.
- Relative imports use explicit `.js` extensions (NodeNext ESM).
- Paths embed string ids with `encodeURIComponent(...)`; numeric ids directly.
- Legacy search endpoints take `(criteria: SearchCriteria[], params?: ListParams)`
  and POST the criteria array.
- Binary endpoints use `responseType: 'binary'` and return `Uint8Array`;
  endpoints returning `{ name, size, mime, content }` use the `FetchedFile` type.
- File uploads pass a `FormData` via the `form` request option.
- The module exports `<module>Operations`: the operation ids it implements
  (checked by the coverage test).

### 2. `src/mcp/tools/contacts.ts`

- Exports `<module>Tools` (array of `defineTool(...)`) and
  `<module>ToolOperations` (operation ids reachable through those tools).
- Tools are **grouped per resource with an `action` enum** rather than one tool
  per endpoint (35 tools instead of 310 keeps the tool list usable for models).
  The description documents every action and the arguments it requires.
- `writeActions` lists every action that modifies data; `destructiveActions`
  the irreversible subset (bexio deletes cannot be undone). Read-only mode and
  MCP annotations are derived from these.
- Shared schema fragments come from `../registry.js`: `searchCriteriaSchema`,
  `listParamsShape`, `idSchema`. Handlers use `requireArg()` for
  action-dependent arguments and `unknownAction()` in the default branch.
- Create/update payloads are zod objects with described fields (`.describe()`),
  `.partial()` so updates can send subsets, and the create-required fields named
  in the schema description. Unknown extra fields are not stripped by bexio, so
  schemas prefer completeness over strictness.
- Tools returning documents (PDF, downloads) accept an optional `save_path`
  argument and delegate to `documentResult()` so large blobs can go to disk
  instead of the context window.

### Wiring

`src/client/index.ts`, `src/mcp/tools/index.ts` aggregate all domain modules;
`tests/coverage.test.ts` asserts the union of `*ToolOperations` equals the
documented API surface exactly.

## Tool inventory

| Group      | Tools |
|------------|-------|
| contacts   | `bexio_contacts`, `bexio_contact_relations`, `bexio_contact_groups`, `bexio_contact_sectors`, `bexio_additional_addresses` |
| sales      | `bexio_quotes`, `bexio_orders`, `bexio_deliveries`, `bexio_invoices`, `bexio_invoice_payments`, `bexio_invoice_reminders`, `bexio_document_positions`, `bexio_document_comments`, `bexio_document_settings` |
| purchase   | `bexio_bills`, `bexio_expenses`, `bexio_purchase_orders`, `bexio_outgoing_payments` |
| accounting | `bexio_accounting`, `bexio_currencies`, `bexio_manual_entries` |
| banking    | `bexio_bank_accounts`, `bexio_banking_payments` |
| items      | `bexio_items`, `bexio_stock` |
| projects   | `bexio_projects`, `bexio_project_planning`, `bexio_timesheets` |
| files      | `bexio_files` |
| payroll    | `bexio_payroll` |
| misc       | `bexio_master_data`, `bexio_company_profile`, `bexio_notes`, `bexio_tasks`, `bexio_users` |

## Error handling

`BexioHttp` maps failures to a small hierarchy (`BexioApiError`,
`BexioRateLimitError`, `BexioNetworkError`, `BexioConfigError`). 429 responses
are retried with the server-reported reset time; transient network/5xx failures
are retried for GETs only. The MCP registry converts these into readable tool
errors with actionable hints (expired PAT, missing scope, validation details)
instead of protocol failures.

## Authentication

Two token sources feed `BexioHttp`'s `token` option (a string or async provider):

1. **Static token** (`BEXIO_API_TOKEN`): PAT or externally-managed OAuth access token.
2. **App workflow**: `bexio-mcp login` runs the OIDC Authorization Code Flow against
   `auth.bexio.com` (loopback redirect, state + PKCE S256, secrets only in the token
   request body). Tokens persist via `FileTokenStore`; `OAuthTokenProvider` refreshes
   single-flight 60 s before expiry and persists the **rotated** refresh token before
   releasing the new access token (bexio invalidates the old one). `invalid_grant`
   surfaces as "run bexio-mcp login again". Default login scopes derive from the
   enabled tool groups via `mcp/scopes.ts` (write scopes dropped in read-only mode);
   the spec-quirk scopes (`stock_edit` for stock reads, single `accounting` scope,
   combined `file` scope) are encoded there. The pseudo-scope `general` is implicit
   and never requested.

## bexio API conventions encoded here

- Base URL `https://api.bexio.com`; paths carry their version prefix
  (`/2.0/…`, `/3.0/…`, `/4.0/…`).
- Auth: `Authorization: Bearer <token>` — PAT or OAuth 2.0 access token.
- Errors: `{ "error_code": number, "message": string }` (4.0 endpoints may use
  RFC 7807-style bodies).
- Legacy search: `POST /…/search` with `[{ field, value, criteria }]`,
  AND-combined, default operator `like`.
- Pagination: `limit`/`offset` (2.0/3.0), `page`/`per-page` or
  `limit`/`page` (4.0) — encoded per endpoint in the client.
- Amounts allow at most 6 decimals; dates are ISO 8601.
