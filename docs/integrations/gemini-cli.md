# Gemini CLI

Connect [bexio-mcp](https://github.com/nolen-ai/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to Google's Gemini CLI so Gemini can work with your contacts, invoices, projects and more directly from the terminal.

## Prerequisites

- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) installed (`npm install -g @google/gemini-cli`)

## Setup (stdio, recommended)

Gemini CLI reads MCP servers from the `mcpServers` object in `.gemini/settings.json` — project-level in your repo, or user-level at `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "bexio": {
      "command": "npx",
      "args": ["-y", "github:nolen-ai/bexio-mcp"],
      "env": {
        "BEXIO_API_TOKEN": "$BEXIO_API_TOKEN"
      }
    }
  }
}
```

Set the token in your shell environment
(`export BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN`) so it
stays out of the config file.

Or add it in one command instead of editing JSON:

```bash
gemini mcp add -e BEXIO_API_TOKEN=$BEXIO_API_TOKEN bexio npx -y github:nolen-ai/bexio-mcp
```

Prefer scoped OAuth over a PAT? Use the [OAuth app workflow](../../README.md#oauth-app-workflow).

## Setup (HTTP via Docker)

Run the published image, which serves streamable HTTP at `http://127.0.0.1:8722/mcp`. With no token in the container it runs in multi-user mode — each client authenticates itself:

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/nolen-ai/bexio-mcp:latest
```

Then point Gemini CLI at it with `httpUrl`, passing the token per client:

```json
{
  "mcpServers": {
    "bexio": {
      "httpUrl": "http://127.0.0.1:8722/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_BEXIO_TOKEN"
      }
    }
  }
}
```

Alternatively, configure a single shared identity on the server and drop the `headers` block from the config:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/nolen-ai/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

Check the server with `curl http://127.0.0.1:8722/healthz`, and verify the connection with `gemini mcp list` or the `/mcp` command inside a Gemini CLI session.

## Try it

Start `gemini` and ask:

- "List my 10 most recent open invoices"
- "Create a quote for Muster AG with two positions"
- "How many hours were tracked on project X this month?"

Gemini CLI will call tools like `bexio_invoices`, `bexio_quotes` and `bexio_timesheets` (confirm each call, or set `"trust": true` on the server entry to skip prompts).

## Tips

- **Read-only mode:** add `"BEXIO_READ_ONLY": "true"` to the `env` block to disable all write actions — a good default while exploring.
- **Trim tool groups:** set `"BEXIO_TOOL_GROUPS": "contacts,sales"` (available: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc) to shrink Gemini's context and limit blast radius.
- **Language:** set `"BEXIO_LANGUAGE": "de"` (de|fr|it|en) for localized output.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
