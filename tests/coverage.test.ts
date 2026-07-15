/**
 * Guards full coverage of the documented bexio API surface:
 * every operation in the public OpenAPI spec (tests/fixtures/operations.json,
 * extracted from https://docs.bexio.com/) must be reachable through the MCP tools.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { allBexioTools, coveredOperationIds } from '../src/mcp/tools/index.js';

interface OperationFixture {
  id: string;
  method: string;
  path: string;
  tag: string;
}

const operations: OperationFixture[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/operations.json', import.meta.url)), 'utf8'),
);

describe('API coverage', () => {
  it('fixture contains the full documented surface', () => {
    expect(operations.length).toBe(310);
  });

  it('every documented operation is covered by a tool', () => {
    const covered = new Set<string>(coveredOperationIds);
    const missing = operations.filter((op) => !covered.has(op.id)).map((op) => `${op.tag}: ${op.id} (${op.method} ${op.path})`);
    expect(missing, `Missing operations:\n${missing.join('\n')}`).toEqual([]);
  });

  it('claims no operations outside the documented surface', () => {
    const known = new Set(operations.map((op) => op.id));
    const unknown = [...new Set(coveredOperationIds)].filter((id) => !known.has(id));
    expect(unknown, `Unknown operation ids:\n${unknown.join('\n')}`).toEqual([]);
  });

  it('tool names are unique and follow the bexio_ prefix convention', () => {
    const names = allBexioTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^bexio_[a-z0-9_]+$/);
    }
  });

  it('destructive actions are declared as write actions too', () => {
    for (const tool of allBexioTools) {
      const writes = new Set(tool.writeActions ?? []);
      for (const destructive of tool.destructiveActions ?? []) {
        expect(writes.has(destructive), `${tool.name}: "${destructive}" must also be in writeActions`).toBe(true);
      }
    }
  });
});
