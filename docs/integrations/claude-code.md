# Claude Code

Connect [bexio-mcp](https://github.com/mydata-ag/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to Claude Code, Anthropic's agentic CLI.

## Prerequisites

- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`) and signed in

## Setup (stdio, recommended)

Add bexio-mcp for yourself in the current project:

```bash
claude mcp add --env BEXIO_API_TOKEN=your-token --transport stdio bexio \
  -- npx -y github:mydata-ag/bexio-mcp
```

The `--` separates Claude Code's own flags from the server command. Once the package is published on npm, `npx -y bexio-mcp` will work as well; the GitHub form above works today.

### Project scope via `.mcp.json`

To share the config with your team, commit a `.mcp.json` file at the project root (or run the command above with `--scope project`). Keep the token out of version control by using environment variable expansion:

```json
{
  "mcpServers": {
    "bexio": {
      "command": "npx",
      "args": ["-y", "github:mydata-ag/bexio-mcp"],
      "env": {
        "BEXIO_API_TOKEN": "${BEXIO_API_TOKEN}"
      }
    }
  }
}
```

Each teammate sets `BEXIO_API_TOKEN` in their shell; Claude Code expands `${VAR}` (and `${VAR:-default}`) when loading `.mcp.json`.

Prefer scoped OAuth over a PAT? Use the [app workflow](../../README.md#quick-start) (`bexio-mcp login`).

## Setup (HTTP via Docker)

Run the published image, which serves streamable HTTP on port 8722 at `/mcp`. With no token in the container it runs in multi-user mode — every client authenticates per request with its own bexio token, and anonymous sessions get 401:

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/mydata-ag/bexio-mcp:latest
```

Point Claude Code at it:

```bash
claude mcp add --transport http bexio http://127.0.0.1:8722/mcp \
  --header "Authorization: Bearer your-bexio-token"
```

Alternatively, configure a single shared identity on the server and omit the `--header` flag:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=<your-pat> -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/mydata-ag/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

Health check: `GET http://127.0.0.1:8722/healthz`.

Verify either setup with `claude mcp list`, or `/mcp` inside a session.

## Try it

Ask Claude Code things like:

- "List my 10 most recent open invoices"
- "Create a quote for Muster AG with two positions"
- "How many hours were tracked on project X this month?"

These map to tools such as `bexio_invoices`, `bexio_quotes`, `bexio_contacts`, and `bexio_timesheets`.

## Tips

- **Read-only mode**: set `BEXIO_READ_ONLY=true` to disable all write actions — a good default while exploring.
- **Trim tool groups**: set `BEXIO_TOOL_GROUPS` (comma-separated: `contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc`) to load only what you need and keep Claude's context small, e.g. `BEXIO_TOOL_GROUPS=contacts,sales`.
- **Language**: set `BEXIO_LANGUAGE` to `de`, `fr`, `it`, or `en`.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
