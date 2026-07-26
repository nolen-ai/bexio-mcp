/**
 * Exercises the built CLI through the same stdio transport used by MCP hosts.
 *
 * This deliberately uses only Node.js built-ins so it validates the packaged
 * executable rather than reaching into the TypeScript source or test helpers.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const childEnv = {
  ...process.env,
  // Tool discovery does not call bexio, but the server requires credentials
  // before accepting an MCP connection. Never inherit a real token here.
  BEXIO_API_TOKEN: 'stdio-smoke-test-token',
};
delete childEnv.BEXIO_CLIENT_ID;
delete childEnv.BEXIO_CLIENT_SECRET;
delete childEnv.BEXIO_REFRESH_TOKEN;

const child = spawn(process.execPath, ['dist/cli.js'], {
  env: childEnv,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const pending = new Map();
const output = createInterface({ input: child.stdout });
output.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    fail(new Error(`CLI wrote non-JSON data to stdout: ${line}`, { cause: error }));
    return;
  }
  const waiter = pending.get(message.id);
  if (waiter !== undefined) {
    pending.delete(message.id);
    waiter.resolve(message);
  }
});

let settled = false;
const timeout = setTimeout(() => {
  fail(new Error('Timed out waiting for the stdio MCP handshake.'));
}, 10_000);

function fail(error) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  child.kill();
  const detail = stderr.trim();
  console.error(detail === '' ? error.message : `${error.message}\nCLI stderr:\n${detail}`);
  process.exitCode = 1;
}

function request(id, method, params) {
  const response = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  return response;
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

child.once('error', fail);
child.once('exit', (code, signal) => {
  if (!settled) {
    fail(new Error(`CLI exited before the smoke test completed (code ${code}, signal ${signal}).`));
  }
});

try {
  const initialized = await request(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'bexio-mcp-stdio-smoke', version: '1.0.0' },
  });
  if (initialized.error !== undefined) {
    throw new Error(`Initialize failed: ${JSON.stringify(initialized.error)}`);
  }
  if (initialized.result?.serverInfo?.name !== 'bexio-mcp') {
    throw new Error(`Unexpected server info: ${JSON.stringify(initialized.result?.serverInfo)}`);
  }

  notify('notifications/initialized', {});
  const listed = await request(2, 'tools/list', {});
  if (listed.error !== undefined) {
    throw new Error(`Tool listing failed: ${JSON.stringify(listed.error)}`);
  }
  const tools = listed.result?.tools;
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error('The built CLI returned no MCP tools.');
  }

  child.stdin.end();
  settled = true;
  clearTimeout(timeout);
  console.log(
    `stdio MCP smoke test passed (${initialized.result.serverInfo.name} ` +
      `v${initialized.result.serverInfo.version}, ${tools.length} tools)`,
  );
} catch (error) {
  fail(error instanceof Error ? error : new Error(String(error)));
}
