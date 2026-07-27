# Agno

Use [bexio-mcp](https://github.com/nolen-ai/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, from [Agno](https://docs.agno.com) agents via `MCPTools`.

## Prerequisites

- Python 3.9+ with `agno` and `mcp` installed (`pip install agno mcp`), plus a model provider key (e.g. `ANTHROPIC_API_KEY`)
- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months), exported as `BEXIO_API_TOKEN`

## Setup (stdio, recommended)

Agno spawns the server directly:

```python
import asyncio
import os

from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.mcp import MCPTools


async def main():
    mcp_tools = MCPTools(
        command="npx -y github:nolen-ai/bexio-mcp",
        env={
            **os.environ,
            "BEXIO_API_TOKEN": os.environ["BEXIO_API_TOKEN"],
        },
    )
    await mcp_tools.connect()
    try:
        agent = Agent(
            name="Bexio Agent",
            model=Claude(id="claude-sonnet-4-5"),
            tools=[mcp_tools],
        )
        await agent.aprint_response(
            "List my 10 most recent open invoices", stream=True
        )
    finally:
        await mcp_tools.close()


asyncio.run(main())
```

Prefer scoped OAuth over a PAT? Use the [OAuth app workflow](../../README.md#oauth-app-workflow).

## Setup (HTTP via Docker)

Run the published image; it serves streamable HTTP at `/mcp` on port 8722 (health check: `GET /healthz`). With no token in the container it runs in multi-user mode — every client sends its own bexio token per request (anonymous sessions get 401):

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/nolen-ai/bexio-mcp:latest
```

```python
import os

from agno.tools.mcp import MCPTools, StreamableHTTPClientParams

server_params = StreamableHTTPClientParams(
    url="http://127.0.0.1:8722/mcp",
    headers={"Authorization": f"Bearer {os.environ['BEXIO_API_TOKEN']}"},
)
mcp_tools = MCPTools(server_params=server_params)
await mcp_tools.connect()
```

Alternatively, configure a single shared identity on the server and connect without headers (`MCPTools(transport="streamable-http", url="http://127.0.0.1:8722/mcp")`):

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/nolen-ai/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

## Try it

Ask your agent things like:

- "List my 10 most recent open invoices" (`bexio_invoices`)
- "Create a quote for Muster AG with two positions" (`bexio_quotes`)
- "How many hours were tracked on project X this month?" (`bexio_timesheets`)

## Tips

- **Read-only agents:** set `BEXIO_READ_ONLY=true` in the `env` dict (or `docker run -e`) to disable all write actions.
- **Smaller tool surface:** set `BEXIO_TOOL_GROUPS` (e.g. `contacts,sales,items`) to load only the groups you need — fewer tools means a smaller agent context. Available groups: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc.
- **Language:** set `BEXIO_LANGUAGE` to `de`, `fr`, `it`, or `en`.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
