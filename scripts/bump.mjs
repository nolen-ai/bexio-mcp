/**
 * Bumps the package version (patch|minor|major), syncs src/version.ts and
 * commits the release. Usage: node scripts/bump.mjs [patch|minor|major]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const level = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(level)) {
  console.error(`error: unknown bump level "${level}" (patch|minor|major)`);
  process.exit(2);
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const git = (...args) => run('git', args).trim();
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (git('status', '--porcelain') !== '') {
  console.error('error: working tree not clean');
  process.exit(1);
}

run(npmCmd, ['version', level, '--no-git-tag-version'], { shell: process.platform === 'win32' });
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

writeFileSync(
  'src/version.ts',
  `/** Package version; keep in sync with package.json (checked by tests). */\nexport const VERSION = '${version}';\n`,
);

git('add', 'package.json', 'package-lock.json', 'src/version.ts');
git('commit', '-m', `Release v${version}`);
console.log(`Committed release v${version}. Push it, wait for CI, then run: just tag`);
