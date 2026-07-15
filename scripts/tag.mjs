/**
 * Tags the current release commit as v<package.json version> and pushes the
 * tag, triggering the release workflow (Docker image, GitHub release, npm).
 * Usage: node scripts/tag.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const tag = `v${version}`;

if (run('status', '--porcelain') !== '') {
  console.error('error: working tree not clean');
  process.exit(1);
}

const branch = run('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') {
  console.error(`error: releases are tagged from main (currently on ${branch})`);
  process.exit(1);
}

if (!readFileSync('src/version.ts', 'utf8').includes(`'${version}'`)) {
  console.error(`error: src/version.ts does not match ${version}`);
  process.exit(1);
}

run('fetch', 'origin', 'main', '--quiet');
if (run('rev-parse', 'HEAD') !== run('rev-parse', 'origin/main')) {
  console.error('error: HEAD is not pushed to origin/main yet');
  process.exit(1);
}

try {
  run('rev-parse', `refs/tags/${tag}`);
  console.error(`error: ${tag} already exists`);
  process.exit(1);
} catch {
  // Tag does not exist yet — good.
}

run('tag', '-a', tag, '-m', `Release ${tag}`);
run('push', 'origin', tag);
console.log(`Pushed ${tag} — the release workflow is building the Docker image and GitHub release.`);
