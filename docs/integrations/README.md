# Integration quick-starts

Copy-paste guides for connecting `bexio-mcp` to coding agents, desktop apps and agent frameworks.

Two ways to run the server, supported by every integration below in at least one form:

- **stdio (local)** — the integration spawns the server per session: `npx -y github:mydata-ag/bexio-mcp` with `BEXIO_API_TOKEN` in the environment.
- **HTTP (shared/Docker)** — one `serve-http` deployment (e.g. `docker run -p 8722:8722 ghcr.io/mydata-ag/bexio-mcp:latest`) serving many clients at `http://host:8722/mcp`; in multi-user mode each client sends its own `Authorization: Bearer <token>` header.

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

Common to all setups:

- **Token**: create a Personal Access Token at [developer.bexio.com/pat](https://developer.bexio.com/pat), or use the [OAuth app workflow](../../README.md#quick-start) (`bexio-mcp login`).
- **Safety**: `BEXIO_READ_ONLY=true` disables all write actions; `BEXIO_TOOL_GROUPS=contacts,sales,…` trims the 35 tools to what you need.
- **Language**: `BEXIO_LANGUAGE=de|fr|it|en` for translated fields (tax codes etc.).

Full configuration reference: [main README](../../README.md).
