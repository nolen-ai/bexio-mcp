# bexio-mcp

**MCP server and typed TypeScript client for the [bexio](https://www.bexio.com) API** — the Swiss business software for contacts, quotes, orders, invoicing, purchasing, accounting, banking, projects, time tracking and payroll.

- **Complete**: covers all **310 documented operations** of the [bexio API](https://docs.bexio.com/) through 35 well-described MCP tools (enforced by a coverage test against the official OpenAPI spec).
- **Reusable**: the typed API client is a standalone entry point (`bexio-mcp/client`) with zero MCP dependencies — use it in any Node.js project.
- **Safe**: opt-in read-only mode, destructive-action annotations, tool-group filtering, and API errors mapped to actionable messages (expired token, missing scope, rate limit) instead of crashes.
- **Robust**: automatic retry on rate limits (honouring `RateLimit-Reset`), retries for transient GET failures, request timeouts, typed error hierarchy.

## Quick start

### 1. Choose an authentication method

**Option A — Personal Access Token** (simplest, personal use): create a PAT at [developer.bexio.com/pat](https://developer.bexio.com/pat). PATs have full access to your company data and expire after six months. Set it as `BEXIO_API_TOKEN`.

**Option B — App workflow** (OAuth 2.0 Authorization Code Flow, for apps and scoped access):

1. Create an app at [developer.bexio.com](https://developer.bexio.com) and add
   `http://127.0.0.1:33771/callback` to its **Allowed redirect URLs**.
2. Reveal the **Client ID** and **Client Secret** under "App Details".
3. Authorize once — a browser opens for the bexio consent screen:

   ```bash
   BEXIO_CLIENT_ID=… BEXIO_CLIENT_SECRET=… npx bexio-mcp login
   ```

   Requested scopes are derived from the enabled tool groups (write scopes are dropped in `--read-only` mode); override with `--scopes`. Tokens land in `~/.bexio-mcp/tokens.json` — treat that file like a password.
4. Start the server with the same `BEXIO_CLIENT_ID`/`BEXIO_CLIENT_SECRET` env (no `BEXIO_API_TOKEN`): it uses the stored tokens and **auto-refreshes** them, persisting the rotated refresh token on every refresh. With `offline_access` the session stays valid as long as it refreshes at least once a year.

`bexio-mcp whoami` prints the authenticated user; `bexio-mcp logout` deletes the stored tokens (and also revokes them at the identity provider when the app credentials are set).

### 2. Add the server to your MCP host

**Claude Code**

```bash
claude mcp add bexio --env BEXIO_API_TOKEN=<your-token> -- npx -y bexio-mcp
```

**Claude Desktop / any MCP host** (`claude_desktop_config.json` or equivalent):

```json
{
  "mcpServers": {
    "bexio": {
      "command": "npx",
      "args": ["-y", "bexio-mcp"],
      "env": {
        "BEXIO_API_TOKEN": "<your-token>"
      }
    }
  }
}
```

That's it — ask your model to "list open bexio invoices", "create a quote for Muster AG", or "how many hours were tracked on project X this month?".

## Configuration

| Environment variable | CLI flag        | Description                                                                 |
|----------------------|-----------------|-----------------------------------------------------------------------------|
| `BEXIO_API_TOKEN`    | `--token`       | Static token (PAT or OAuth access token). Wins over the app workflow.       |
| `BEXIO_CLIENT_ID`    | `--client-id`   | OAuth app client id (app workflow).                                         |
| `BEXIO_CLIENT_SECRET`| `--client-secret`| OAuth app client secret (app workflow).                                    |
| `BEXIO_SCOPES`       | `--scopes`      | Scopes for `login` (default: derived from tool groups).                     |
| `BEXIO_REDIRECT_URI` | `--redirect-uri`| Loopback redirect URI (default `http://127.0.0.1:33771/callback`).          |
| `BEXIO_TOKEN_STORE`  | `--token-store` | OAuth token file (default `~/.bexio-mcp/tokens.json`).                      |
| `BEXIO_NO_BROWSER`   | `--no-browser`  | `login` prints the authorization URL instead of opening a browser.          |
| `BEXIO_TOOL_GROUPS`  | `--groups`      | Comma-separated groups to enable (default: all). See groups below.          |
| `BEXIO_READ_ONLY`    | `--read-only`   | `true` disables every write action (create/update/delete/issue/send/…).     |
| `BEXIO_LANGUAGE`     | `--language`    | `Accept-Language` for translated fields (e.g. `de`, `fr`, `it`, `en`).      |
| `BEXIO_BASE_URL`     | `--base-url`    | API host override (default `https://api.bexio.com`).                        |
| `BEXIO_TIMEOUT_MS`   | `--timeout-ms`  | Per-request timeout in milliseconds (default 30000).                        |

`bexio-mcp --list-tools` prints the tools that would be registered; `--help` shows usage.

### Read-only mode

```bash
BEXIO_API_TOKEN=… BEXIO_READ_ONLY=true npx bexio-mcp
```

Write actions return an explanatory error without touching the API; tools that only write are hidden entirely. Recommended when you want analysis/reporting but no mutations.

### Tool groups

`contacts`, `sales`, `purchase`, `accounting`, `banking`, `items`, `projects`, `files`, `payroll`, `misc`

```bash
BEXIO_TOOL_GROUPS=contacts,sales,items npx bexio-mcp
```

## Tools

Tools are grouped per resource with an `action` argument; each tool's description documents every action and its required arguments.

| Group      | Tools |
|------------|-------|
| contacts   | `bexio_contacts` · `bexio_contact_relations` · `bexio_contact_groups` · `bexio_contact_sectors` · `bexio_additional_addresses` |
| sales      | `bexio_quotes` · `bexio_orders` · `bexio_deliveries` · `bexio_invoices` · `bexio_invoice_payments` · `bexio_invoice_reminders` · `bexio_document_positions` · `bexio_document_comments` · `bexio_document_settings` |
| purchase   | `bexio_bills` · `bexio_expenses` · `bexio_purchase_orders` · `bexio_outgoing_payments` |
| accounting | `bexio_accounting` · `bexio_currencies` · `bexio_manual_entries` |
| banking    | `bexio_bank_accounts` · `bexio_banking_payments` |
| items      | `bexio_items` · `bexio_stock` |
| projects   | `bexio_projects` · `bexio_project_planning` · `bexio_timesheets` |
| files      | `bexio_files` |
| payroll    | `bexio_payroll` |
| misc       | `bexio_master_data` · `bexio_company_profile` · `bexio_notes` · `bexio_tasks` · `bexio_users` |

Highlights:

- Full document lifecycle: create → issue → send/mark-as-sent → payments/reminders → PDF, for quotes, orders, deliveries and invoices — including converting quotes to orders/invoices and orders to deliveries/invoices.
- All seven position types (item, custom, text, subtotal, discount, pagebreak, sub-position) on quotes, orders and invoices via one generic `bexio_document_positions` tool.
- PDF and file downloads accept a `save_path` argument so large documents go to disk instead of the context window.
- Legacy search endpoints take `search_criteria`: `[{ "field": "name_1", "value": "Muster", "criteria": "like" }]`, combined with AND.

## Server-side & Docker

`bexio-mcp serve-http` runs the server on the **streamable HTTP transport** — no GUI, configuration only, with automatic token refresh. Two auth modes, combinable:

- **Multi-user (pass-through)**: don't configure any server credentials. Every client sends its own `Authorization: Bearer <bexio PAT or OAuth access token>` header; each MCP session acts as that user against bexio, and nothing is stored server-side. Sessions without a token are rejected with 401.
- **Shared identity (single-tenant)**: configure `BEXIO_API_TOKEN` **or** the app credentials — then sessions without their own bearer use the server's identity. **This grants unauthenticated, full access to that bexio account to anyone who can reach the port.** On non-loopback binds (including Docker) it therefore stays off until you explicitly set `BEXIO_HTTP_SHARED_IDENTITY=true`; publish the port to loopback or a private network only (`-p 127.0.0.1:8722:8722`).

Headless OAuth (no browser anywhere): obtain a refresh token once — either run `bexio-mcp login` on a workstation and copy `~/.bexio-mcp/tokens.json` into the container volume, or seed via `BEXIO_REFRESH_TOKEN`. The server refreshes it on first use and persists the rotated tokens to `BEXIO_TOKEN_STORE`; a stale seed left in the environment is ignored once the store holds fresher tokens.

```bash
docker build -t bexio-mcp .            # or: docker pull ghcr.io/mydata-ag/bexio-mcp:latest

# Multi-user: clients authenticate themselves per request
docker run -p 8722:8722 bexio-mcp

# Single-tenant with app workflow + automatic refresh, tokens survive restarts.
# Note the explicit shared-identity opt-in and the loopback-only publish.
docker run -p 127.0.0.1:8722:8722 -v bexio-tokens:/data \
  -e BEXIO_CLIENT_ID=… -e BEXIO_CLIENT_SECRET=… -e BEXIO_REFRESH_TOKEN=… \
  -e BEXIO_HTTP_SHARED_IDENTITY=true \
  bexio-mcp
```

Connect any MCP client to `http://host:8722/mcp` (e.g. Agno: `MCPTools(transport="streamable-http", url="http://host:8722/mcp")`, with the bearer header for multi-user mode). `GET /healthz` serves Docker health checks.

Security notes: terminate TLS in a reverse proxy — bearer tokens must not cross networks in plain HTTP; the server binds `127.0.0.1` by default outside Docker; idle sessions are closed after 30 minutes and concurrent sessions are capped (503 past the limit); loopback binds validate the Host header against loopback values (DNS-rebinding protection) — behind a proxy, list your public hostname(s) in `BEXIO_HTTP_ALLOWED_HOSTS`; a bind-mounted `/data` must be writable by uid 1000 (prefer the named volume); env-passed secrets are visible via `docker inspect` — use your orchestrator's secret mechanism where available.

| Environment variable          | CLI flag              | Description                                                    |
|-------------------------------|-----------------------|----------------------------------------------------------------|
| `BEXIO_HTTP_HOST`             | `--http-host`         | Bind address (default `127.0.0.1`; `0.0.0.0` in the image).    |
| `BEXIO_HTTP_PORT`             | `--http-port`         | Port (default `8722`).                                         |
| `BEXIO_HTTP_PATH`             | `--http-path`         | Endpoint path (default `/mcp`).                                |
| `BEXIO_HTTP_SHARED_IDENTITY`  | `--shared-identity`   | Opt-in: anonymous sessions may use the server identity on non-loopback binds (**unauthenticated account access — see above**). |
| `BEXIO_HTTP_MAX_SESSIONS`     | `--http-max-sessions` | Max concurrent MCP sessions (default 64).                      |
| `BEXIO_HTTP_ALLOWED_HOSTS`    | `--http-allowed-hosts`| Accepted `Host` header values behind a reverse proxy.          |
| `BEXIO_REFRESH_TOKEN`         | `--refresh-token`     | Headless bootstrap: seed the token store from a refresh token. |

## Using the client without MCP

The typed client is dependency-free (uses global `fetch`) and importable on its own:

```ts
import { BexioClient } from 'bexio-mcp/client';

const bexio = new BexioClient({
  token: process.env.BEXIO_API_TOKEN!,   // string or async () => string
  language: 'de',
});
```

The OAuth building blocks are exported too — `BexioOAuth` (authorization URL with PKCE, code exchange, refresh with rotation) and `OAuthTokenProvider` (auto-refreshing token source) from `bexio-mcp/client`, plus `FileTokenStore` and `runLoginFlow` from `bexio-mcp`:

```ts
import { BexioClient, BexioOAuth, OAuthTokenProvider } from 'bexio-mcp/client';
import { FileTokenStore } from 'bexio-mcp';

const oauth = new BexioOAuth({ clientId, clientSecret });
const provider = new OAuthTokenProvider(oauth, new FileTokenStore());
const bexio = new BexioClient({ token: provider.accessTokenProvider() });

// Typed resource APIs mirroring the bexio docs
const contacts = await bexio.contacts.search([{ field: 'name_1', value: 'Muster' }]);
const invoice = await bexio.invoices.createInvoice({ contact_id: contacts[0]!.id, positions: [/* … */] });
await bexio.invoices.issueInvoice(invoice.id);

// Escape hatch for anything else
const me = await bexio.http.get('/3.0/users/me');
```

Errors are typed: `BexioApiError` (with `status`, `errorCode`, `body`, plus `isAuthError`/`isPermissionError`/`isNotFound`/`isRateLimit`), `BexioRateLimitError`, `BexioNetworkError`, `BexioConfigError`.

Embedding the server in your own process:

```ts
import { BexioClient, createBexioMcpServer } from 'bexio-mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createBexioMcpServer({
  client: new BexioClient({ token: myToken }),
  groups: ['contacts', 'sales'],
  readOnly: true,
});
await server.connect(new StdioServerTransport());
```

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (includes the API coverage gate)
npm run build       # tsup → dist/ (ESM + CJS + d.ts)
```

With [just](https://github.com/casey/just): `just check` runs the full gate, `just docker-build` builds the image.

### Releasing

Releases are tag-driven: pushing `vX.Y.Z` triggers the release workflow, which verifies the tag against `package.json`, runs the full gate, pushes the multi-arch Docker image to `ghcr.io/mydata-ag/bexio-mcp` (`latest`, `X.Y`, `X.Y.Z`), creates the GitHub release with generated notes, and publishes to npm when the `NPM_TOKEN` secret is configured.

```bash
just bump minor   # bump package.json + src/version.ts, commit "Release vX.Y.Z"
git push          # let CI pass on main
just tag          # tag vX.Y.Z (verifies clean tree, main, pushed, version sync) and push it
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the layering and module conventions. The API surface is pinned in `tests/fixtures/operations.json` (extracted from the official docs); `tests/coverage.test.ts` fails when bexio documents operations this package does not cover.

## Notes & limitations

- The bexio API rate limit is per company; heavy parallel use of tools can hit 429s — the client waits and retries automatically.
- bexio deletes are permanent (no trash). Destructive tool actions are annotated and blocked in read-only mode, but be deliberate.
- Credit notes and a handful of business processes are not exposed by the bexio API itself (see their [FAQ](https://docs.bexio.com/#section/API-basics/FAQ)).
- This is an unofficial project; not affiliated with bexio AG.

## License

MIT
