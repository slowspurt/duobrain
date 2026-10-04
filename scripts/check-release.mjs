#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RUNTIME_ENTRIES } from '../src/tool/index.js';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const pkg = JSON.parse(await read('package.json'));
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'Release version must be x.y.z.');
assert.equal(pkg.license, 'MIT');
assert.equal(pkg.private, undefined, 'The release is published to npm; package.json must not be private.');
// npm always packs package.json and LICENSE; `files` must cover the rest of what `install` vendors.
assert.deepEqual([...pkg.files].sort(), RUNTIME_ENTRIES.filter((entry) => !['package.json', 'LICENSE'].includes(entry)).sort(),
  'package.json `files` must match the runtime files that `install` copies.');
assert.equal(pkg.repository.url, 'https://github.com/slowspurt/duobrain.git');
const tag = process.env.RELEASE_TAG;
if (tag) assert.equal(tag, `v${pkg.version}`, 'Tag and package version differ.');
assert.match(await read('LICENSE'), /^MIT License\n/);
assert.ok((await read('CHANGELOG.md')).includes(`## ${pkg.version}\n`));
assert.ok((await read(`docs/releases/v${pkg.version}.md`)).includes(`duobrain v${pkg.version}`));
const version = execFileSync(process.execPath, [fileURLToPath(new URL('bin/duobrain.js', root)), '--version'], { encoding: 'utf8' }).trim();
assert.equal(version, pkg.version, 'CLI must report the packaged version.');
execFileSync(process.execPath, [fileURLToPath(new URL('bin/duobrain.js', root)), '--help'], { stdio: 'pipe' });
execFileSync(process.execPath, [fileURLToPath(new URL('src/dashboard/run.js', root)), '--help'], { stdio: 'pipe' });
console.log(`Release metadata and CLI checks passed for v${pkg.version}.`);
