#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RUNTIME_ENTRIES } from '../src/tool/index.js';
import { designTokensLine, tokenChanges, tokensAt } from './token-changes.mjs';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const pkg = JSON.parse(await read('package.json'));
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'Release version must be x.y.z.');
assert.equal(pkg.license, 'MIT');
assert.equal(pkg.private, undefined, 'The release is published to npm; package.json must not be private.');
// npm always packs package.json and LICENSE; `files` must cover the rest of what `install` vendors.
assert.deepEqual([...pkg.files].sort(), RUNTIME_ENTRIES.filter((entry) => !['package.json', 'LICENSE'].includes(entry)).sort(),
  'package.json `files` must match the runtime files that `install` copies.');
assert.equal(pkg.repository.url, 'git+https://github.com/slowspurt/duobrain.git');
const tag = process.env.RELEASE_TAG;
if (tag) assert.equal(tag, `v${pkg.version}`, 'Tag and package version differ.');
assert.match(await read('LICENSE'), /^MIT License\n/);
assert.ok((await read('CHANGELOG.md')).includes(`## ${pkg.version}\n`));
assert.ok((await read(`docs/releases/v${pkg.version}.md`)).includes(`duobrain v${pkg.version}`));

// From 0.1.8 every release note states whether the --duo-* design tokens changed, and a 0.x.y patch
// release may add or adjust tokens but never remove or rename one.
const [major, minor, patch] = pkg.version.split('.').map(Number);
if (major > 0 || minor > 1 || patch >= 8) {
  const notes = await read(`docs/releases/v${pkg.version}.md`);
  const line = notes.split('\n').find((text) => /^Design tokens: /.test(text.trim()))?.trim();
  assert.ok(line, `docs/releases/v${pkg.version}.md needs a "Design tokens: …" line.`);
  const cwd = fileURLToPath(root);
  const previous = execFileSync('git', ['tag', '--list', 'v*.*.*'], { cwd, encoding: 'utf8' }).split('\n')
    .filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
    .map((name) => ({ name, parts: name.slice(1).split('.').map(Number) }))
    .filter(({ parts }) => parts[0] < major || (parts[0] === major && (parts[1] < minor || (parts[1] === minor && parts[2] < patch))))
    .sort((left, right) => left.parts[0] - right.parts[0] || left.parts[1] - right.parts[1] || left.parts[2] - right.parts[2])
    .at(-1)?.name;
  // Only a release (RELEASE_TAG) must match; between releases tokens may change before the version bump.
  if (previous && tag) {
    const previousTokens = tokensAt(previous, cwd);
    const changes = tokenChanges(previousTokens, await read('src/dashboard/public/tokens.css'));
    assert.equal(line, designTokensLine(changes, { introduced: previousTokens === null }), `The design token line must match the change since ${previous}; run \`node scripts/token-changes.mjs ${previous}\`.`);
    const sameMinor = Number(previous.slice(1).split('.')[1]) === minor && Number(previous.slice(1).split('.')[0]) === major;
    assert.ok(!(sameMinor && changes.removed.length), `Patch releases cannot remove design tokens: ${changes.removed.join(', ')}.`);
  } else if (tag) {
    assert.fail('Release checks need the earlier version tags to compare design tokens; fetch tags first.');
  }
}
const version = execFileSync(process.execPath, [fileURLToPath(new URL('bin/duobrain.js', root)), '--version'], { encoding: 'utf8' }).trim();
assert.equal(version, pkg.version, 'CLI must report the packaged version.');
execFileSync(process.execPath, [fileURLToPath(new URL('bin/duobrain.js', root)), '--help'], { stdio: 'pipe' });
execFileSync(process.execPath, [fileURLToPath(new URL('src/dashboard/run.js', root)), '--help'], { stdio: 'pipe' });
console.log(`Release metadata and CLI checks passed for v${pkg.version}.`);
