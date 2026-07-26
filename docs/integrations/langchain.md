# LangChain / LangGraph

Connect [bexio-mcp](https://github.com/mydata-ag/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to LangChain and LangGraph agents via the `langchain-mcp-adapters` package.

## Prerequisites

- Python 3.10+ with `pip install langchain-mcp-adapters langchain langgraph` (plus a model provider package, e.g. `langchain-anthropic` or `langchain-openai`)
- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months), exported as `BEXIO_API_TOKEN`

## Setup (stdio, recommended)

`MultiServerMCPClient` spawns bexio-mcp locally over stdio:

```python
import asyncio, os
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent

async def main():
    client = MultiServerMCPClient(
        {
            "bexio": {
                "transport": "stdio",
                "command": "npx",
                "args": ["-y", "github:mydata-ag/bexio-mcp"],
                "env": {"BEXIO_API_TOKEN": os.environ["BEXIO_API_TOKEN"]},
            }
        }
    )
    tools = await client.get_tools()
    agent = create_agent("anthropic:claude-sonnet-4-5", tools)
    result = await agent.ainvoke(
        {"messages": "List my 10 most recent open invoices"}
    )
    print(result["messages"][-1].content)

asyncio.run(main())
```

Prefer scoped OAuth over a PAT? Use the [OAuth app workflow](../../README.md#oauth-app-workflow).

## Setup (HTTP via Docker)

Run the published image, which serves streamable HTTP at `/mcp` on port 8722 (health check: `GET /healthz`). With no token in the container it runs in multi-user mode — each client authenticates per request with its own bexio token via the `Authorization` header (anonymous sessions get 401):

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/mydata-ag/bexio-mcp:latest
```

```python
import os
from langchain_mcp_adapters.client import MultiServerMCPClient

client = MultiServerMCPClient(
    {
        "bexio": {
            "transport": "http",  # streamable HTTP per the MCP spec
            "url": "http://127.0.0.1:8722/mcp",
            "headers": {
                "Authorization": f"Bearer {os.environ['BEXIO_API_TOKEN']}"
            },
        }
    }
)
tools = await client.get_tools()
```

Alternatively, configure a single shared identity on the server and drop the `headers` entry:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/mydata-ag/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

## Try it

Once the agent is running, ask things like:

- "List my 10 most recent open invoices"
- "Create a quote for Muster AG with two positions"
- "How many hours were tracked on project X this month?"

These route through tools such as `bexio_invoices`, `bexio_quotes`, `bexio_contacts`, and `bexio_timesheets`.

## Tips

- **Read-only agents:** set `BEXIO_READ_ONLY=true` (in the stdio `env` map or the Docker container) to disable all write actions — recommended while experimenting.
- **Trim the toolset:** set `BEXIO_TOOL_GROUPS` (e.g. `contacts,sales,accounting`) to load only the groups you need and keep the agent's context small. Available groups: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc.
- **Language:** set `BEXIO_LANGUAGE` to `de`, `fr`, `it`, or `en` for localized results.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
