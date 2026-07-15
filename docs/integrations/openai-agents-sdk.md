# OpenAI Agents SDK (Python)

Connect [bexio-mcp](https://github.com/mydata-ag/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to agents built with the [OpenAI Agents SDK for Python](https://openai.github.io/openai-agents-python/).

## Prerequisites

- Python 3.10+ with the Agents SDK: `pip install openai-agents`
- Node.js 18+ (for the stdio setup) or Docker (for the HTTP setup)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months), exported as `BEXIO_API_TOKEN`
- An OpenAI API key (`OPENAI_API_KEY`)

## Setup (stdio, recommended)

The SDK spawns bexio-mcp locally with `MCPServerStdio`:

```python
import asyncio
import os

from agents import Agent, Runner
from agents.mcp import MCPServerStdio


async def main():
    async with MCPServerStdio(
        name="bexio",
        params={
            "command": "npx",
            "args": ["-y", "github:mydata-ag/bexio-mcp"],
            "env": {"BEXIO_API_TOKEN": os.environ["BEXIO_API_TOKEN"]},
        },
        cache_tools_list=True,
    ) as server:
        agent = Agent(
            name="Bexio Assistant",
            instructions="You help with bexio accounting tasks.",
            mcp_servers=[server],
        )
        result = await Runner.run(agent, "List my 10 most recent open invoices")
        print(result.final_output)


asyncio.run(main())
```

Once the package is published on npm you can use `"args": ["-y", "bexio-mcp"]` instead; the GitHub form above works today (it builds on install). You can also `npm install -g github:mydata-ag/bexio-mcp` and set `"command": "bexio-mcp"` with no args.

Prefer scoped OAuth over a PAT? Use the [app workflow](../../README.md#quick-start) (`bexio-mcp login`).

## Setup (HTTP via Docker)

Run the published image, which serves streamable HTTP at `http://127.0.0.1:8722/mcp` by default (health check: `GET /healthz`). With no token in the container it runs in multi-user mode — each client must send its own bexio token as a Bearer header (anonymous sessions get 401):

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/mydata-ag/bexio-mcp:latest
```

Connect with `MCPServerStreamableHttp`, passing the token per client:

```python
from agents.mcp import MCPServerStreamableHttp

async with MCPServerStreamableHttp(
    name="bexio",
    params={
        "url": "http://127.0.0.1:8722/mcp",
        "headers": {"Authorization": f"Bearer {os.environ['BEXIO_API_TOKEN']}"},
    },
    cache_tools_list=True,
) as server:
    agent = Agent(name="Bexio Assistant", mcp_servers=[server])
```

Alternatively, configure a single shared identity on the server and drop the `headers` entry:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=<your-pat> -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/mydata-ag/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

## Try it

Example prompts to send via `Runner.run`:

- "List my 10 most recent open invoices"
- "Create a quote for Muster AG with two positions"
- "How many hours were tracked on project X this month?"

The agent will call tools such as `bexio_contacts`, `bexio_invoices`, `bexio_quotes`, and `bexio_timesheets`.

## Tips

- **Read-only safety:** set `BEXIO_READ_ONLY=true` to disable all write actions — useful while experimenting.
- **Trim the toolset:** set `BEXIO_TOOL_GROUPS` (e.g. `contacts,sales,items`) to expose only what your agent needs and keep its context small. Available groups: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc.
- **Language:** set `BEXIO_LANGUAGE` to `de`, `fr`, `it`, or `en`.
- **Fewer round trips:** keep `cache_tools_list=True` so the SDK caches the tool list between runs.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
