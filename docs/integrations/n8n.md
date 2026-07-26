# n8n

Connect [bexio-mcp](https://github.com/mydata-ag/bexio-mcp), an MCP server covering all 310 documented bexio API operations via 35 tools, to n8n's **MCP Client Tool** node so your AI Agent workflows can work with bexio contacts, invoices, projects and more. n8n cannot spawn local stdio servers, so you run bexio-mcp as an HTTP server (Docker) and point n8n at its endpoint.

## Prerequisites

- Docker (to run the published `ghcr.io/mydata-ag/bexio-mcp` image)
- A bexio Personal Access Token from <https://developer.bexio.com/pat> (full account access, expires after 6 months)
- n8n (cloud or self-hosted) with an AI Agent workflow — the MCP Client Tool node is built in

## Setup (HTTP via Docker)

### 1. Run the bexio-mcp HTTP server

Start the server in multi-user mode (no token baked into the container — n8n sends the token per request instead):

```bash
docker run -d --name bexio-mcp -p 8722:8722 ghcr.io/mydata-ag/bexio-mcp:latest
```

The MCP endpoint is now at `http://127.0.0.1:8722/mcp` (streamable HTTP). Check it with `curl http://127.0.0.1:8722/healthz`.

Because no server identity is configured, every MCP request must carry an `Authorization: Bearer <token>` header — anonymous sessions get a 401. That is exactly what n8n's Bearer credential provides below.

Networking notes:

- If n8n runs in Docker on the same machine, put both containers on one Docker network (or use `http://host.docker.internal:8722/mcp`).
- If you use n8n Cloud, the endpoint must be reachable from n8n's servers. Keep authentication mandatory (multi-user mode, as above) and prefer exposing it through a reverse proxy with TLS. Never publish an unauthenticated shared-identity server to the internet.

Alternative — shared identity: configure the token on the server itself, so n8n connects without a Bearer credential:

```bash
docker run -d --name bexio-mcp -p 127.0.0.1:8722:8722 -e BEXIO_API_TOKEN=YOUR_BEXIO_TOKEN -e BEXIO_HTTP_SHARED_IDENTITY=true ghcr.io/mydata-ag/bexio-mcp:latest
```

> **Warning**: `BEXIO_HTTP_SHARED_IDENTITY=true` serves this bexio account to *every* client that can reach the port, without authentication — keep the port on loopback or a private network.

### 2. Add the MCP Client Tool node in n8n

1. Open your workflow and add an **AI Agent** node (with a chat model attached).
2. Under the agent's **Tools**, add the **MCP Client Tool** node.
3. Configure it:
   - **Endpoint**: `http://127.0.0.1:8722/mcp` (adjust host for your networking setup). Choose the **HTTP Streamable** transport if your n8n version asks — SSE is deprecated.
   - **Authentication**: `Bearer` — create a Bearer credential and paste your bexio Personal Access Token.
   - **Tools to Include**: `All`, or use `Selected` to expose only the tools your agent needs (e.g. `bexio_contacts`, `bexio_invoices`).

n8n also has a plain **MCP Client** core node (Server Transport + MCP Endpoint URL) for calling a single bexio tool as a regular workflow step, outside an AI Agent.

Prefer scoped OAuth over a PAT? Use the [OAuth app workflow](../../README.md#oauth-app-workflow).

## Try it

Send these to your AI Agent's chat:

- "List my 10 most recent open invoices."
- "Create a quote for Muster AG with two positions."
- "How many hours were tracked on project X this month?"

## Tips

- **Read-only safety**: add `-e BEXIO_READ_ONLY=true` to the `docker run` command to disable all write actions — a good default while experimenting with agents.
- **Trim the toolset**: add `-e BEXIO_TOOL_GROUPS=contacts,sales` (available groups: contacts, sales, purchase, accounting, banking, items, projects, files, payroll, misc) to shrink the agent's context, and combine with the node's `Selected` tool filter.
- **Language**: set `-e BEXIO_LANGUAGE=de` (de|fr|it|en) for localized behavior.

Full configuration reference: [main README](../../README.md). Other integrations: [guide index](./README.md).
