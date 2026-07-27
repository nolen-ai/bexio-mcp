# OpenAI Codex CLI

Connect [bexio-mcp](https://github.com/nolen-ai/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to OpenAI Codex CLI so Codex can work with your contacts, invoices, projects and more.

## Prerequisites

- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)
- Codex CLI installed (`npm install -g @openai/codex`)

## Setup (stdio, recommended)

Add the server with one command:

```bash
codex mcp add bexio --env BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN -- npx -y github:nolen-ai/bexio-mcp
```

Or edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.bexio]
command = "npx"
args = ["-y", "github:nolen-ai/bexio-mcp"]

[mcp_servers.bexio.env]
BEXIO_API_TOKEN = "YOUR_BEXIO_TOKEN"
```

Prefer scoped OAuth over a PAT? Use the [OAuth app workflow](../../README.md#oauth-app-workflow).

## Setup (HTTP via Docker)

Run the server with Docker (streamable HTTP on port 8722, path `/mcp`). With no token in the container it runs in multi-user mode — each client sends its own bexio token:

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/nolen-ai/bexio-mcp:latest
```

Then point Codex at it in `~/.codex/config.toml`, referencing the token via an environment variable:

```toml
[mcp_servers.bexio]
url = "http://127.0.0.1:8722/mcp"
bearer_token_env_var = "BEXIO_API_TOKEN"
```

Alternatively, configure a single shared identity on the server; Codex then needs only `url = "http://127.0.0.1:8722/mcp"` with no `bearer_token_env_var`:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/nolen-ai/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

## Try it

Start `codex` and ask, for example:

- "List my 10 most recent open invoices"
- "Create a quote for Muster AG with two positions"
- "How many hours were tracked on project X this month?"

Codex will call tools such as `bexio_contacts`, `bexio_invoices`, `bexio_quotes` and `bexio_timesheets`.

## Tips

- **Read-only mode:** set `BEXIO_READ_ONLY = "true"` in the `env` table to disable all write actions — a good default while exploring.
- **Trim tool groups:** set `BEXIO_TOOL_GROUPS = "contacts,sales"` (available: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc) to load fewer tools and keep Codex's context small.
- **Language:** set `BEXIO_LANGUAGE` to `de`, `fr`, `it` or `en`.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
