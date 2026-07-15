# Claude Agent SDK (TypeScript & Python)

Connect [bexio-mcp](https://github.com/mydata-ag/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to agents built with Anthropic's [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk) in TypeScript or Python.

## Prerequisites

- Node.js 18+ (to run the bexio-mcp stdio server), or Docker for the HTTP variant
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months), exported as `BEXIO_API_TOKEN`
- The Agent SDK package: `npm install @anthropic-ai/claude-agent-sdk` or `pip install claude-agent-sdk`

## Setup (stdio, recommended)

The Agent SDK spawns the server as a subprocess. Use `npx -y github:mydata-ag/bexio-mcp` (works today; once the package is on npm, `npx -y bexio-mcp` will too). MCP tools need explicit permission — allow them with `allowedTools` / `allowed_tools` (`mcp__bexio__*`).

**TypeScript**

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "List my 10 most recent open invoices",
  options: {
    mcpServers: {
      bexio: {
        command: "npx",
        args: ["-y", "github:mydata-ag/bexio-mcp"],
        env: { BEXIO_API_TOKEN: process.env.BEXIO_API_TOKEN },
      },
    },
    allowedTools: ["mcp__bexio__*"],
  },
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

**Python**

```python
import asyncio, os
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage


async def main():
    options = ClaudeAgentOptions(
        mcp_servers={
            "bexio": {
                "command": "npx",
                "args": ["-y", "github:mydata-ag/bexio-mcp"],
                "env": {"BEXIO_API_TOKEN": os.environ["BEXIO_API_TOKEN"]},
            }
        },
        allowed_tools=["mcp__bexio__*"],
    )
    async for message in query(prompt="List my 10 most recent open invoices", options=options):
        if isinstance(message, ResultMessage) and message.subtype == "success":
            print(message.result)


asyncio.run(main())
```

Prefer scoped OAuth over a PAT? Use the [app workflow](../../README.md#quick-start) (`bexio-mcp login`).

## Setup (HTTP via Docker)

Run the published image (it serves streamable HTTP at `/mcp` on port 8722; `GET /healthz` for health checks). With no token in the container it runs in multi-user mode — each client authenticates per request with its own bexio token:

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/mydata-ag/bexio-mcp:latest
```

Point the Agent SDK at it:

```typescript
options: {
  mcpServers: {
    bexio: {
      type: "http",
      url: "http://127.0.0.1:8722/mcp",
      headers: { Authorization: `Bearer ${process.env.BEXIO_API_TOKEN}` },
    },
  },
  allowedTools: ["mcp__bexio__*"],
}
```

Python is the same shape via `mcp_servers={"bexio": {"type": "http", "url": ..., "headers": ...}}`.

Alternatively, configure a single shared identity on the server and drop the `headers` entry:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=<your-pat> -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/mydata-ag/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

## Advanced — embed in-process (TypeScript only)

Instead of spawning a subprocess, build the server with a configured client and pass it as an SDK MCP server:

```typescript
import { BexioClient, createBexioMcpServer } from "bexio-mcp"; // npm install github:mydata-ag/bexio-mcp

const options = {
  mcpServers: {
    bexio: createBexioMcpServer({
      client: new BexioClient({ token: process.env.BEXIO_API_TOKEN! }),
    }),
  },
  allowedTools: ["mcp__bexio__*"],
};
```

## Try it

- "List my 10 most recent open invoices" (`bexio_invoices`)
- "Create a quote for Muster AG with two positions" (`bexio_quotes`, `bexio_contacts`)
- "How many hours were tracked on project X this month?" (`bexio_timesheets`)

## Tips

- **Read-only agents:** set `BEXIO_READ_ONLY=true` in the server's `env` block to disable all write actions — a good default while experimenting.
- **Trim tool groups:** set `BEXIO_TOOL_GROUPS=contacts,sales` (options: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc) to load only what your agent needs and keep its context small.
- **Language:** set `BEXIO_LANGUAGE=de|fr|it|en` to match your bexio account language.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
