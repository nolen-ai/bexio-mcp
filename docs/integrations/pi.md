# Pi (pi.dev)

Connect [bexio-mcp](https://github.com/mydata-ag/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to the Pi coding agent.

## Prerequisites

- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)
- Pi installed, plus the MCP adapter extension: `pi install npm:pi-mcp-adapter` (restart Pi afterwards)

## Setup (stdio, recommended)

Pi's MCP adapter reads servers from `~/.pi/agent/mcp.json` (global; the agent dir is configurable via `$PI_CODING_AGENT_DIR`), `~/.config/mcp/mcp.json` (shared with other MCP clients), or `.mcp.json` / `.pi/mcp.json` in your project root. Add:

```json
{
  "mcpServers": {
    "bexio": {
      "command": "npx",
      "args": ["-y", "github:mydata-ag/bexio-mcp"],
      "env": {
        "BEXIO_API_TOKEN": "YOUR_BEXIO_TOKEN"
      }
    }
  }
}
```

Restart Pi (or run `/mcp reconnect`) and the bexio tools appear — check with `/mcp`.

To keep the token out of a project config, use the adapter's interpolation:
`"BEXIO_API_TOKEN": "${BEXIO_API_TOKEN}"`.

Prefer scoped OAuth over a PAT? Use the [OAuth app workflow](../../README.md#oauth-app-workflow).

## Setup (HTTP via Docker)

Run the server with Docker (streamable HTTP transport on port 8722, path `/mcp`). With no token in the container it runs in multi-user mode — each client authenticates per request with its own bexio token:

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/mydata-ag/bexio-mcp:latest
```

Point Pi at it via a `url` server with an `Authorization` header (headers support `${VAR}` interpolation):

```json
{
  "mcpServers": {
    "bexio": {
      "url": "http://127.0.0.1:8722/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_BEXIO_TOKEN"
      }
    }
  }
}
```

Health check: `curl http://127.0.0.1:8722/healthz`.

Alternatively, configure a single shared identity on the server and drop the `headers` block from the client config:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/mydata-ag/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

## Try it

Ask Pi things like:

- "List my 10 most recent open invoices" (uses `bexio_invoices`)
- "Create a quote for Muster AG with two positions" (uses `bexio_quotes`)
- "How many hours were tracked on project X this month?" (uses `bexio_timesheets`)

## Tips

- **Read-only mode**: add `"BEXIO_READ_ONLY": "true"` to `env` to disable all write actions — a good default while exploring.
- **Trim tool groups**: 35 tools use context; keep only what you need, e.g. `"BEXIO_TOOL_GROUPS": "contacts,sales"`. Available groups: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc.
- **Language**: set `"BEXIO_LANGUAGE": "de"` (or `fr`, `it`, `en`) for localized results.
- **Lifecycle**: Pi connects lazily by default (on first tool call, disconnecting after an idle timeout); set `"lifecycle": "eager"` or `"keep-alive"` on the server entry if you want it up from startup.
- **Direct tools**: by default the adapter exposes servers through a proxy tool; set `"directTools": true` (or a list like `["bexio_invoices", "bexio_contacts"]`) to register bexio tools individually.
- **In-session management**: `/mcp` opens a status panel with per-server toggles, `/mcp setup` scaffolds config, `/mcp tools` lists everything available.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
