import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BexioClient } from '../src/client/index.js';
import { createBexioMcpServer } from '../src/mcp/index.js';
import { allBexioTools } from '../src/mcp/tools/index.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

async function connect(fetchMock: typeof fetch, options: { readOnly?: boolean; groups?: string[] } = {}) {
  const bexio = new BexioClient({ token: 'test-token', fetch: fetchMock });
  const server = createBexioMcpServer({
    client: bexio,
    readOnly: options.readOnly,
    groups: options.groups as never,
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe('bexio MCP server', () => {
  it('lists tools with schemas and annotations', async () => {
    const { client } = await connect(vi.fn() as typeof fetch);
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    const bankAccounts = tools.find((t) => t.name === 'bexio_bank_accounts');
    expect(bankAccounts).toBeDefined();
    expect(bankAccounts!.description).toContain('bank account');
    expect(bankAccounts!.annotations?.readOnlyHint).toBe(true);
    const payments = tools.find((t) => t.name === 'bexio_banking_payments');
    expect(payments!.annotations?.readOnlyHint).toBe(false);
    expect(payments!.annotations?.destructiveHint).toBe(true);
  });

  it('executes a tool call end-to-end against a mocked API', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe('https://api.bexio.com/3.0/banking/accounts/5');
      return jsonResponse({ id: 5, name: 'Business CHF', iban_nr: 'CH93 0076 2011 6238 5295 7' });
    });
    const { client } = await connect(fetchMock as typeof fetch);
    const result = await client.callTool({ name: 'bexio_bank_accounts', arguments: { action: 'get', id: 5 } });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(JSON.parse(text)).toMatchObject({ id: 5, name: 'Business CHF' });
  });

  it('returns a readable tool error for API failures instead of throwing', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error_code: 401, message: 'Invalid token' }, { status: 401 }),
    );
    const { client } = await connect(fetchMock as typeof fetch);
    const result = await client.callTool({ name: 'bexio_bank_accounts', arguments: { action: 'list' } });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('401');
    expect(text).toContain('Personal Access Tokens');
  });

  it('reports missing action-dependent arguments as tool errors', async () => {
    const { client } = await connect(vi.fn() as typeof fetch);
    const result = await client.callTool({ name: 'bexio_bank_accounts', arguments: { action: 'get' } });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('"id"');
  });

  it('blocks write actions in read-only mode', async () => {
    const fetchMock = vi.fn();
    const { client } = await connect(fetchMock as typeof fetch, { readOnly: true });
    const result = await client.callTool({
      name: 'bexio_banking_payments',
      arguments: { action: 'delete', id: 'abc' },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('read-only');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters tools by group', async () => {
    const { client } = await connect(vi.fn() as typeof fetch, { groups: ['banking'] });
    const { tools } = await client.listTools();
    expect(tools.every((t) => t.name.startsWith('bexio_'))).toBe(true);
    expect(tools.some((t) => t.name === 'bexio_bank_accounts')).toBe(true);
    for (const tool of allBexioTools) {
      if (tool.group !== 'banking') {
        expect(tools.some((t) => t.name === tool.name)).toBe(false);
      }
    }
  });

  it('truncates oversized results', async () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `Bank account ${i}`, iban: 'CH'.repeat(10) }));
    const fetchMock = vi.fn(async () => jsonResponse(big));
    const bexio = new BexioClient({ token: 't', fetch: fetchMock as typeof fetch });
    const server = createBexioMcpServer({ client: bexio, maxResultChars: 10_000 });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    const result = await client.callTool({ name: 'bexio_bank_accounts', arguments: { action: 'list' } });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text.length).toBeLessThan(11_000);
    expect(text).toContain('Result truncated');
    expect(text).toContain('5000 items');
  });
});
