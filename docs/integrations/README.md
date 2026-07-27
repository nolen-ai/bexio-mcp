# Choose your MCP client

Each guide below starts with a working, copy-paste setup for `bexio-mcp`.

For the recommended local setup you need [Node.js 18+](https://nodejs.org/)
and a [bexio Personal Access Token](https://developer.bexio.com/pat). Your MCP
client starts the server with:

```text
npx -y github:nolen-ai/bexio-mcp
```

There is nothing to clone or install globally. The first start downloads and
builds the package and can take a few seconds.

| Integration | Guide | stdio | HTTP |
|-------------|-------|:-----:|:----:|
| Claude Code | [claude-code.md](claude-code.md) | ✅ | ✅ |
| Claude Desktop | [claude-desktop.md](claude-desktop.md) | ✅ | ✅ |
| Claude Agent SDK (TS & Python) | [claude-agent-sdk.md](claude-agent-sdk.md) | ✅ | ✅ |
| Cursor | [cursor.md](cursor.md) | ✅ | ✅ |
| VS Code (GitHub Copilot) | [vscode.md](vscode.md) | ✅ | ✅ |
| Windsurf | [windsurf.md](windsurf.md) | ✅ | ✅ |
| Gemini CLI | [gemini-cli.md](gemini-cli.md) | ✅ | ✅ |
| OpenAI Codex CLI | [codex-cli.md](codex-cli.md) | ✅ | ✅ |
| Pi (pi.dev) | [pi.md](pi.md) | ✅ | ✅ |
| Agno | [agno.md](agno.md) | ✅ | ✅ |
| OpenAI Agents SDK (Python) | [openai-agents-sdk.md](openai-agents-sdk.md) | ✅ | ✅ |
| Pydantic AI | [pydantic-ai.md](pydantic-ai.md) | ✅ | ✅ |
| LangChain / LangGraph | [langchain.md](langchain.md) | ✅ | ✅ |
| n8n | [n8n.md](n8n.md) | — | ✅ |

Use **stdio** unless you specifically need a shared or remote deployment. For
remote clients, every guide also includes a Docker setup using the published
image and streamable HTTP endpoint at `http://host:8722/mcp`.

Useful options in every setup:

- **Safety**: `BEXIO_READ_ONLY=true` disables all write actions.
- **Smaller toolset**: `BEXIO_TOOL_GROUPS=contacts,sales` loads only the groups you need.
- **Language**: `BEXIO_LANGUAGE=de|fr|it|en` for translated fields (tax codes etc.).
- **Scoped authentication**: use the [OAuth app workflow](../../README.md#oauth-app-workflow) instead of a PAT.

Having trouble connecting? Follow the
[two-command startup and authentication check](../../README.md#troubleshooting).
Full configuration reference: [main README](../../README.md).
