# Claude Desktop

Connect [bexio-mcp](https://github.com/mydata-ag/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to Claude Desktop so Claude can work with your contacts, invoices, projects, and more.

## Prerequisites

- [Claude Desktop](https://claude.ai/download) (macOS or Windows), latest version
- Node.js 18+ (`node --version` to check)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)

## Setup (stdio, recommended)

Claude Desktop spawns local MCP servers from `claude_desktop_config.json`. Open it via **Settings → Developer → Edit Config**, or edit it directly:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add bexio-mcp under `mcpServers` (the package is not on npm yet, so install straight from GitHub):

```json
{
  "mcpServers": {
    "bexio": {
      "command": "npx",
      "args": ["-y", "github:mydata-ag/bexio-mcp"],
      "env": {
        "BEXIO_API_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

Once the package is published to npm, `"args": ["-y", "bexio-mcp"]` will work too.

Save the file, then fully quit and restart Claude Desktop. Click the "Add files, connectors, and more" button in the input box → **Connectors** to confirm the bexio tools are listed.

### Windows note

Claude Desktop launches servers with a minimal environment, so a bare `"command": "npx"` can fail with ENOENT. If the server does not start, wrap it in `cmd`:

```json
{
  "mcpServers": {
    "bexio": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "github:mydata-ag/bexio-mcp"],
      "env": {
        "BEXIO_API_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

Alternatively, use the full path to `npx.cmd` (find it with `where npx`), e.g. `"command": "C:\\Program Files\\nodejs\\npx.cmd"`. If startup still fails, check the logs in `%APPDATA%\Claude\logs` (macOS: `~/Library/Logs/Claude`).

Prefer scoped OAuth over a PAT? Use the [app workflow](../../README.md#quick-start) (`bexio-mcp login`).

## Setup (HTTP via Docker)

Claude Desktop can also reach a bexio-mcp instance running as a remote MCP server via **Settings → Connectors → Add → Add custom connector**. The custom-connector UI cannot send per-user `Authorization` headers, so the server needs a shared identity:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=<your-pat> -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/mydata-ag/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

The server exposes streamable HTTP at `/mcp` on port 8722 (health check: `GET /healthz`). Enter your server's URL, e.g. `https://your-host.example.com/mcp`, as the custom connector URL — for anything beyond your own machine, expose it only through a TLS reverse proxy on a private network.

## Try it

Ask Claude things like:

- "List my 10 most recent open invoices"
- "Create a quote for Muster AG with two positions"
- "How many hours were tracked on project X this month?"

Claude asks for your approval before each tool call, so you stay in control of writes.

## Tips

- **Read-only mode**: add `"BEXIO_READ_ONLY": "true"` to the `env` block to disable all write actions — a good default while exploring.
- **Trim tool groups**: 35 tools take up context. Set e.g. `"BEXIO_TOOL_GROUPS": "contacts,sales"` to load only what you need (available: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc).
- **Language**: set `"BEXIO_LANGUAGE": "de"` (or `fr`, `it`, `en`) for localized behavior.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
