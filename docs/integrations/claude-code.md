# Claude Code

Connect [bexio-mcp](https://github.com/nolen-ai/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to Claude Code, Anthropic's agentic CLI.

## Prerequisites

- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`) and signed in

## Quick setup (recommended)

Replace `YOUR_BEXIO_TOKEN` with your PAT and run:

```bash
claude mcp add --env BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN \
  --transport stdio bexio -- npx -y github:nolen-ai/bexio-mcp
```

Check it immediately:

```bash
claude mcp list
```

You should see `bexio … ✔ Connected`. The first connection downloads and
builds the server and can take a few seconds. Start Claude Code and ask:

> List my 10 most recent open invoices in bexio.

The `--` separates Claude Code's options from the server command. The default
scope is local to the current project; add `--scope user` before `bexio` to make
the server available in every project.

### Project scope via `.mcp.json`

To share the config with your team, commit a `.mcp.json` file at the project root (or run the command above with `--scope project`). Keep the token out of version control by using environment variable expansion:

```json
{
  "mcpServers": {
    "bexio": {
      "command": "npx",
      "args": ["-y", "github:nolen-ai/bexio-mcp"],
      "env": {
        "BEXIO_API_TOKEN": "${BEXIO_API_TOKEN}"
      }
    }
  }
}
```

Each teammate sets `BEXIO_API_TOKEN` in their shell; Claude Code expands `${VAR}` (and `${VAR:-default}`) when loading `.mcp.json`.

Prefer scoped OAuth over a PAT? Use the [OAuth app workflow](../../README.md#oauth-app-workflow).

## Setup (HTTP via Docker)

Run the published image, which serves streamable HTTP on port 8722 at `/mcp`. With no token in the container it runs in multi-user mode — every client authenticates per request with its own bexio token, and anonymous sessions get 401:

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/nolen-ai/bexio-mcp:latest
```

Point Claude Code at it:

```bash
claude mcp add --transport http bexio http://127.0.0.1:8722/mcp \
  --header "Authorization: Bearer YOUR_BEXIO_TOKEN"
```

Alternatively, configure a single shared identity on the server and omit the `--header` flag:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 \
  -e BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN \
  -e BEXIO_HTTP_SHARED_IDENTITY=true \
  ghcr.io/nolen-ai/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

Health check: `GET http://127.0.0.1:8722/healthz`. Verify the connection with
`claude mcp list`, or `/mcp` inside a session.

## Troubleshooting `Failed to reconnect … -32000`

Claude Code uses `-32000` for several MCP subprocess failures. If the server was
added with `npx -y bexio-mcp`, npm currently returns `E404` because the package
is not published on the npm registry yet. Replace that entry with the working
GitHub package specifier:

```bash
claude mcp remove bexio
claude mcp add --env BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN \
  --transport stdio bexio -- npx -y github:nolen-ai/bexio-mcp
```

Then run `claude mcp list` again. If it still fails, run the tool-list command
directly to expose installation, build, or configuration errors (a successful
run prints 35 tools):

```bash
BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN \
  npx -y github:nolen-ai/bexio-mcp --list-tools
```

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
