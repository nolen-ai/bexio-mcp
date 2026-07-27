# Pydantic AI

Use [bexio-mcp](https://github.com/nolen-ai/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, from a [Pydantic AI](https://pydantic.dev/docs/ai/) agent via its `MCPToolset`.

## Prerequisites

- Python 3.10+ with Pydantic AI and MCP support: `pip install "pydantic-ai-slim[mcp]"` (this extra includes `fastmcp`, whose transports are used below)
- Node.js 18+ (for stdio) or Docker (for HTTP)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)

> Pydantic AI's current MCP client API is `MCPToolset` (from `pydantic_ai.mcp`), which replaced the older `MCPServerStdio` / `MCPServerStreamableHTTP` classes. Toolsets are passed to `Agent` via `toolsets=[...]`.

## Setup (stdio, recommended)

Pydantic AI spawns bexio-mcp as a subprocess. Note that stdio subprocesses do **not** inherit your shell environment, so pass the token explicitly via `env`:

```python
import asyncio
import os

from fastmcp.client.transports import StdioTransport
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset

bexio = MCPToolset(
    StdioTransport(
        command="npx",
        args=["-y", "github:nolen-ai/bexio-mcp"],
        env={"BEXIO_API_TOKEN": os.environ["BEXIO_API_TOKEN"]},
    )
)

agent = Agent("anthropic:claude-sonnet-4-5", toolsets=[bexio])

async def main():
    result = await agent.run("List my 10 most recent open invoices")
    print(result.output)

asyncio.run(main())
```

Prefer scoped OAuth over a PAT? Use the [OAuth app workflow](../../README.md#oauth-app-workflow).

## Setup (HTTP via Docker)

Run the published Docker image, which serves Streamable HTTP at `/mcp` on port 8722 (health check: `GET /healthz`). With no token in the container it runs in multi-user mode — each client sends its own bexio token per request:

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/nolen-ai/bexio-mcp:latest
```

Point `MCPToolset` at the URL, passing the token as a header:

```python
import os

from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset

bexio = MCPToolset(
    "http://127.0.0.1:8722/mcp",
    headers={"Authorization": f"Bearer {os.environ['BEXIO_API_TOKEN']}"},
)
agent = Agent("anthropic:claude-sonnet-4-5", toolsets=[bexio])
```

Alternatively, configure a single shared identity on the server and connect without headers (`MCPToolset("http://127.0.0.1:8722/mcp")`):

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/nolen-ai/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

## Try it

Ask the agent things like:

- "List my 10 most recent open invoices"
- "Create a quote for Muster AG with two positions"
- "How many hours were tracked on project X this month?"

These map to tools such as `bexio_invoices`, `bexio_quotes`, and `bexio_timesheets`.

## Tips

- **Read-only safety:** set `BEXIO_READ_ONLY=true` to disable all write actions while experimenting.
- **Smaller tool surface:** set `BEXIO_TOOL_GROUPS` (e.g. `contacts,sales,items`) to load only the groups you need — smaller context, fewer irrelevant tools. Available groups: `contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc`.
- **Language:** set `BEXIO_LANGUAGE` to `de`, `fr`, `it`, or `en`.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
