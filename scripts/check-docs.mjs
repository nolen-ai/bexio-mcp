/**
 * Lightweight documentation gate: all local Markdown links and anchors must
 * resolve, and every fenced JSON configuration example must parse.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';

const root = process.cwd();

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && extname(path) === '.md' ? [path] : [];
  });
}

function headingSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function headings(source) {
  return new Set(
    [...source.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => headingSlug(match[1])),
  );
}

const failures = [];
const files = markdownFiles(root);

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const sourceHeadings = headings(source);

  for (const match of source.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(https?:|mailto:)/.test(target)) continue;

    const [pathPart, anchor] = target.split('#', 2);
    const targetFile =
      pathPart === '' ? file : resolve(dirname(file), decodeURIComponent(pathPart));
    if (!existsSync(targetFile)) {
      failures.push(`${relative(root, file)}: missing link target ${target}`);
      continue;
    }

    if (anchor !== undefined && anchor !== '') {
      const targetHeadings =
        targetFile === file
          ? sourceHeadings
          : headings(readFileSync(targetFile, 'utf8'));
      if (!targetHeadings.has(anchor)) {
        failures.push(`${relative(root, file)}: missing anchor ${target}`);
      }
    }
  }

  for (const block of source.matchAll(/```json\s*\n([\s\S]*?)```/g)) {
    try {
      JSON.parse(block[1]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${relative(root, file)}: invalid JSON example: ${message}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(
  `Documentation check passed (${files.length} Markdown files; ` +
    'relative links, anchors, and JSON examples valid).',
);
