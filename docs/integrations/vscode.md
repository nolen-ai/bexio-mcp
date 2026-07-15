# VS Code (GitHub Copilot)

Connect [bexio-mcp](https://github.com/mydata-ag/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to GitHub Copilot's agent mode in Visual Studio Code via a `.vscode/mcp.json` file.

## Prerequisites

- VS Code with GitHub Copilot (MCP servers are used in agent mode)
- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)

## Setup (stdio, recommended)

Create `.vscode/mcp.json` in your workspace. The `inputs` block makes VS Code prompt for your token the first time the server starts and store it encrypted — nothing secret is committed to the repo:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "bexio-token",
      "description": "bexio Personal Access Token",
      "password": true
    }
  ],
  "servers": {
    "bexio": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:mydata-ag/bexio-mcp"],
      "env": {
        "BEXIO_API_TOKEN": "${input:bexio-token}"
      }
    }
  }
}
```

Once the package is published on npm you can use `"args": ["-y", "bexio-mcp"]` instead.

VS Code will offer to start the server; you can also run **MCP: List Servers** from the Command Palette to start it and check its status. Open Copilot Chat in agent mode and the bexio tools appear in the tools picker.

Prefer scoped OAuth over a PAT? Use the [app workflow](../../README.md#quick-start) (`bexio-mcp login`).

## Setup (HTTP via Docker)

Run the server with Docker (streamable HTTP on port 8722, path `/mcp`). With no token in the container it runs in multi-user mode — each client authenticates per request with its own bexio token:

```sh
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/mydata-ag/bexio-mcp:latest
```

Point VS Code at it and pass the token as a header:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "bexio-token",
      "description": "bexio Personal Access Token",
      "password": true
    }
  ],
  "servers": {
    "bexio": {
      "type": "http",
      "url": "http://127.0.0.1:8722/mcp",
      "headers": {
        "Authorization": "Bearer ${input:bexio-token}"
      }
    }
  }
}
```

Alternatively, configure a single shared identity on the server and drop the `headers` block from the config:

```sh
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=<your-pat> -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/mydata-ag/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

## Try it

Ask Copilot in agent mode:

- "List my 10 most recent open invoices"
- "Create a quote for Muster AG with two positions"
- "How many hours were tracked on project X this month?"

Copilot will call tools such as `bexio_invoices`, `bexio_quotes`, and `bexio_timesheets` (confirm each tool run in the chat UI).

## Tips

- **Read-only**: add `"BEXIO_READ_ONLY": "true"` to `env` to disable all write actions while you explore.
- **Trim tools**: set `"BEXIO_TOOL_GROUPS": "contacts,sales"` (available groups: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc) to keep Copilot's tool list and context small.
- **Language**: set `"BEXIO_LANGUAGE": "de"` (de|fr|it|en) for localized behavior.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
