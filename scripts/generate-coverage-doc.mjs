/**
 * Generates docs/COVERAGE.md from the built package: every tool with its
 * actions and safety classification, plus the documented-API coverage table.
 * Run after `npm run build`:  node scripts/generate-coverage-doc.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { allBexioTools } = await import(new URL('../dist/index.js', import.meta.url));
const operations = JSON.parse(readFileSync(`${root}/tests/fixtures/operations.json`, 'utf8'));

const lines = [];
lines.push('# Coverage');
lines.push('');
lines.push(
  `This package covers **all ${operations.length} operations** documented in the official ` +
    'bexio OpenAPI specification (https://docs.bexio.com/), verified by `tests/coverage.test.ts`.',
);
lines.push('');
lines.push('## Tools');
lines.push('');
lines.push('| Tool | Group | Actions | Write actions | Destructive |');
lines.push('|------|-------|---------|---------------|-------------|');
for (const tool of allBexioTools) {
  const actionSchema = tool.inputSchema.action;
  const actions = actionSchema && actionSchema.options ? actionSchema.options.join(', ') : '—';
  const writes = (tool.writeActions ?? []).join(', ') || '—';
  const destructive = (tool.destructiveActions ?? []).join(', ') || '—';
  lines.push(`| \`${tool.name}\` | ${tool.group} | ${actions} | ${writes} | ${destructive} |`);
}
lines.push('');
lines.push('## Documented operations by API section');
lines.push('');
const byTag = new Map();
for (const op of operations) {
  if (!byTag.has(op.tag)) byTag.set(op.tag, []);
  byTag.get(op.tag).push(op);
}
lines.push('| API section (docs tag) | Operations |');
lines.push('|------------------------|------------|');
for (const [tag, ops] of [...byTag.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`| ${tag} | ${ops.length} |`);
}
lines.push('');
lines.push(`Total: ${operations.length} operations, ${allBexioTools.length} tools.`);
lines.push('');

writeFileSync(`${root}/docs/COVERAGE.md`, lines.join('\n'));
console.log(`Wrote docs/COVERAGE.md (${allBexioTools.length} tools, ${operations.length} operations)`);
