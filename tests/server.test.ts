import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BexioClient } from '../src/client/index.js';
import { createBexioMcpServer } from '../src/mcp/index.js';
import { allBexioTools } from '../src/mcp/tools/index.js';
import type { WriteMode } from '../src/mcp/registry.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

async function connect(
  fetchMock: typeof fetch,
  options: { readOnly?: boolean; writeMode?: WriteMode; groups?: string[] } = {},
) {
  const bexio = new BexioClient({ token: 'test-token', fetch: fetchMock });
  const server = createBexioMcpServer({
    client: bexio,
    readOnly: options.readOnly,
    writeMode: options.writeMode,
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
    expect(text).toContain('Invalid enum value');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows only the conservative write set in drafts mode', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 91, name_1: 'Example AG' }));
    const { client } = await connect(fetchMock as typeof fetch, { writeMode: 'drafts' });

    const created = await client.callTool({
      name: 'bexio_contacts',
      arguments: {
        action: 'create',
        payload: { contact_type_id: 1, name_1: 'Example AG', user_id: 1, owner_id: 1 },
      },
    });
    expect(created.isError).toBeFalsy();

    fetchMock.mockClear();
    const deleted = await client.callTool({
      name: 'bexio_contacts',
      arguments: { action: 'delete', id: 91 },
    });
    expect(deleted.isError).toBe(true);
    expect((deleted.content as Array<{ text: string }>)[0]!.text).toContain('Invalid enum value');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('advertises only actions allowed by the active write policy', async () => {
    const { client } = await connect(vi.fn() as typeof fetch, { writeMode: 'drafts', groups: ['sales'] });
    const { tools } = await client.listTools();
    const actions = (name: string) =>
      (
        (tools.find((tool) => tool.name === name)!.inputSchema.properties as Record<string, unknown>)
          .action as { enum: string[] }
      ).enum;

    expect(actions('bexio_quotes')).toContain('create');
    expect(actions('bexio_quotes')).toContain('update');
    expect(actions('bexio_quotes')).not.toContain('send');
    expect(actions('bexio_orders')).toEqual(['list', 'search', 'get', 'pdf', 'get_repetition']);
  });

  it('guards quote updates with the live draft state in drafts mode', async () => {
    const draft = { id: 39, document_nr: 'AN-0039', kb_item_status_id: 1, network_link: '' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(draft))
      .mockResolvedValueOnce(jsonResponse({ ...draft, title: 'Updated' }));
    const { client } = await connect(fetchMock as typeof fetch, { writeMode: 'drafts' });

    const result = await client.callTool({
      name: 'bexio_quotes',
      arguments: { action: 'update', id: 39, payload: { title: 'Updated' } },
    });
    expect(result.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/2.0/kb_offer/39');
  });

  it('rejects issued quote mutations before the write in drafts mode', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 39,
        document_nr: 'AN-0039',
        kb_item_status_id: 2,
        network_link: 'https://network.bexio.com/quote/39',
      }),
    );
    const { client } = await connect(fetchMock as typeof fetch, { writeMode: 'drafts' });
    const result = await client.callTool({
      name: 'bexio_document_positions',
      arguments: {
        action: 'delete',
        document_type: 'kb_offer',
        document_id: 39,
        position_type: 'custom',
        position_id: 500,
      },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain('not an editable draft');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects non-custom or non-quote position writes in drafts mode without API traffic', async () => {
    const fetchMock = vi.fn();
    const { client } = await connect(fetchMock as typeof fetch, { writeMode: 'drafts' });
    const result = await client.callTool({
      name: 'bexio_document_positions',
      arguments: {
        action: 'create',
        document_type: 'kb_invoice',
        document_id: 12,
        position_type: 'article',
        payload: { text: 'Nope' },
      },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain('only custom positions');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-custom inline positions when creating a quote in drafts mode', async () => {
    const fetchMock = vi.fn();
    const { client } = await connect(fetchMock as typeof fetch, { writeMode: 'drafts' });
    const result = await client.callTool({
      name: 'bexio_quotes',
      arguments: {
        action: 'create',
        payload: {
          contact_id: 12,
          user_id: 3,
          positions: [{ type: 'KbPositionArticle', article_id: 8, amount: '1' }],
        },
      },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain('KbPositionCustom');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prevents server-filesystem writes outside full mode', async () => {
    const fetchMock = vi.fn();
    const { client } = await connect(fetchMock as typeof fetch, { writeMode: 'drafts' });
    const result = await client.callTool({
      name: 'bexio_orders',
      arguments: { action: 'pdf', id: 44, save_path: '/tmp/order.pdf' },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain('server filesystem');
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
