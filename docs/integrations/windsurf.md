# Windsurf

Connect [bexio-mcp](https://github.com/mydata-ag/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to Windsurf's Cascade agent so it can work with your bexio contacts, invoices, projects, and more.

## Prerequisites

- Windsurf with Cascade (MCP support enabled)
- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)

## Setup (stdio, recommended)

Windsurf reads MCP servers from `~/.codeium/windsurf/mcp_config.json`. Add bexio-mcp under `mcpServers`:

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

You can also edit this file from the UI: open the **MCPs** icon in the Cascade panel, then choose to manage/add a custom server, which opens `mcp_config.json`. After saving, refresh the MCP server list in Windsurf.

Tip: Windsurf supports `${env:VAR_NAME}` interpolation in `mcp_config.json`, so you can write `"BEXIO_API_TOKEN": "${env:BEXIO_API_TOKEN}"` instead of pasting the token into the file.

Prefer scoped OAuth over a PAT? Use the [OAuth app workflow](../../README.md#oauth-app-workflow).

## Setup (HTTP via Docker)

Run the published image, which starts the streamable HTTP transport on port 8722. With no token in the container it runs in multi-user mode — each client sends its own bexio token:

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/mydata-ag/bexio-mcp:latest
```

Then point Windsurf at it with the `serverUrl` form, passing the token as a header:

```json
{
  "mcpServers": {
    "bexio": {
      "serverUrl": "http://127.0.0.1:8722/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_BEXIO_TOKEN"
      }
    }
  }
}
```

Alternatively, configure a single shared identity on the server and drop the `headers` block from the config:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/mydata-ag/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

Health check: `GET http://127.0.0.1:8722/healthz`.

## Try it

Ask Cascade things like:

- "List my 10 most recent open invoices"
- "Create a quote for Muster AG with two positions"
- "How many hours were tracked on project X this month?"

These use tools such as `bexio_invoices`, `bexio_quotes`, and `bexio_timesheets`.

## Tips

- **Read-only mode:** set `"BEXIO_READ_ONLY": "true"` in the `env` block to disable all write actions — a good default while exploring.
- **Trim tool groups:** Windsurf caps the total number of active MCP tools, so load only what you need, e.g. `"BEXIO_TOOL_GROUPS": "contacts,sales"`. Available groups: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc.
- **Language:** set `"BEXIO_LANGUAGE": "de"` (or `fr`, `it`, `en`) for localized behavior.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
