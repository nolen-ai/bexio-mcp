/**
 * `bexio-mcp` command-line entry point: stdio MCP server.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BexioClient } from './client/index.js';
import { createBexioMcpServer } from './mcp/index.js';
import { allBexioTools } from './mcp/tools/index.js';
import { CLI_USAGE, parseCliConfig } from './config.js';
import { VERSION } from './version.js';

async function main(): Promise<void> {
  const parsed = parseCliConfig(process.argv.slice(2), process.env);

  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    process.exit(2);
  }
  if (parsed.help) {
    process.stdout.write(CLI_USAGE);
    return;
  }
  if (parsed.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const config = parsed.config!;

  if (parsed.listTools) {
    const groups = config.groups && config.groups.length > 0 ? new Set(config.groups) : null;
    for (const tool of allBexioTools) {
      if (groups && !groups.has(tool.group)) continue;
      process.stdout.write(`${tool.name}  [${tool.group}]  ${tool.title}\n`);
    }
    return;
  }

  if (!config.token) {
    process.stderr.write(
      'Missing bexio API token.\n' +
        'Set the BEXIO_API_TOKEN environment variable (or pass --token).\n' +
        'Create a Personal Access Token at https://developer.bexio.com/pat\n',
    );
    process.exit(1);
  }

  const client = new BexioClient({
    token: config.token,
    baseUrl: config.baseUrl,
    language: config.language,
    timeoutMs: config.timeoutMs,
  });
  const server = createBexioMcpServer({
    client,
    groups: config.groups,
    readOnly: config.readOnly,
  });

  await server.connect(new StdioServerTransport());
  // The process stays alive on the stdio transport; exit cleanly when it closes.
  process.stdin.on('close', () => {
    void server.close().finally(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`bexio-mcp fatal error: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
