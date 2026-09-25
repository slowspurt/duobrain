import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { RUNTIME_ENTRIES, ensureGitattributes } from '../../src/tool/index.js';

const execFileAsync = promisify(execFile);
const toolRoot = path.resolve('.');

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function run(cwd, cli, ...args) {
  const { stdout } = await execFileAsync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  return JSON.parse(stdout);
}

async function identify(directory) {
  await git(directory, 'config', 'user.name', 'Test');
  await git(directory, 'config', 'user.email', 'test@example.invalid');
}

/** A local stand-in for the GitHub repository: this checkout's runtime files, released as v0.1.0. */
async function upstreamRelease(root) {
  const upstream = path.join(root, 'upstream');
  await execFileAsync('git', ['init', '-q', '-b', 'main', upstream]);
  await identify(upstream);
  const files = (await git(toolRoot, 'ls-files', '--', ...RUNTIME_ENTRIES)).split('\n');
  for (const file of files) {
    await mkdir(path.dirname(path.join(upstream, file)), { recursive: true });
    await cp(path.join(toolRoot, file), path.join(upstream, file));
  }
  const pkg = JSON.parse(await readFile(path.join(upstream, 'package.json'), 'utf8'));
  await writeFile(path.join(upstream, 'package.json'), `${JSON.stringify({
    ...pkg, version: '0.1.0', repository: { type: 'git', url: upstream },
  }, null, 2)}\n`);
  await git(upstream, 'add', '-A');
  await git(upstream, 'commit', '-q', '-m', 'release 0.1.0');
  await git(upstream, 'tag', 'v0.1.0');
  return upstream;
}

test('.gitattributes gains the vendored-copy line once', () => {
  const line = '/.duobrain/** linguist-vendored linguist-generated';
  assert.deepEqual(ensureGitattributes(null), { content: `${line}\n`, action: 'created' });
  const updated = ensureGitattributes('*.png binary\n');
  assert.deepEqual(updated, { content: `*.png binary\n${line}\n`, action: 'updated' });
  assert.equal(ensureGitattributes(updated.content).action, 'unchanged');
});

test('one person vendors duobrain, the other joins from the clone, and update pulls a release', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-vendor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const upstream = await upstreamRelease(root);

  const remote = path.join(root, 'product.git');
  await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  const alice = path.join(root, 'alice');
  await execFileAsync('git', ['init', '-q', '-b', 'main', alice]);
  await identify(alice);
  await writeFile(path.join(alice, 'app.js'), 'console.log("product");\n');
  await git(alice, 'add', 'app.js');
  await git(alice, 'commit', '-q', '-m', 'product');
  await git(alice, 'remote', 'add', 'origin', remote);
  await git(alice, 'push', '-q', '-u', 'origin', 'main');

  // Alice: install from a downloaded duobrain, then connect with the vendored CLI.
  const installed = await run(alice, path.join(upstream, 'bin', 'duobrain.js'), 'install');
  assert.equal(installed.action, 'created');
  assert.deepEqual(
    [installed.manifest.version, installed.manifest.ref, installed.manifest.source],
    ['0.1.0', 'v0.1.0', upstream],
  );
  assert.equal(installed.agents.vendored, true);
  assert.deepEqual(installed.agents.files.map(({ path: file, action }) => [path.basename(file), action]), [
    ['AGENTS.md', 'created'], ['CLAUDE.md', 'created'], ['.gitattributes', 'created'],
  ]);
  const vendored = path.join(alice, '.duobrain', 'bin', 'duobrain.js');
  assert.equal((await execFileAsync(process.execPath, [vendored, '--version'], { encoding: 'utf8' })).stdout.trim(), '0.1.0');
  assert.match(await readFile(path.join(alice, 'AGENTS.md'), 'utf8'), /`node \.duobrain\/bin\/duobrain\.js <command>`/);
  assert.match(await readFile(path.join(alice, '.duobrain', 'README.md'), 'utf8'), /^# Vendored duobrain 0\.1\.0/);
  await assert.rejects(stat(path.join(alice, '.duobrain', '.git')), { code: 'ENOENT' },
    'the copy has no .git of its own; it is ordinary product files');
  assert.equal(await git(alice, 'status', '--porcelain', '--', '.duobrain/bin/duobrain.js'), '?? .duobrain/bin/duobrain.js');

  assert.equal((await run(alice, path.join(upstream, 'bin', 'duobrain.js'), 'install')).action, 'unchanged');
  await run(alice, vendored, 'init', '--participants', 'alice,bob', '--participant', 'alice');
  await git(alice, 'add', '-A');
  await git(alice, 'commit', '-q', '-m', 'chore: vendor duobrain');
  await git(alice, 'push', '-q');

  // Bob: clone the product only; no separate duobrain download, no participant list.
  const bob = path.join(root, 'bob');
  await execFileAsync('git', ['clone', '-q', remote, bob]);
  await identify(bob);
  const joined = await run(bob, path.join(bob, '.duobrain', 'bin', 'duobrain.js'), 'init', '--participant', 'bob');
  assert.equal(joined.participant, 'bob');
  assert.equal(joined.agents.commitNeeded, false, 'the committed agent files are already current');
  const brief = await run(bob, path.join(bob, '.duobrain', 'bin', 'duobrain.js'), 'status', '--brief');
  assert.deepEqual([brief.participant, brief.partner], ['bob', 'alice']);

  // A new release with a changed block.
  const toolSource = path.join(upstream, 'src', 'tool', 'index.js');
  await writeFile(toolSource, (await readFile(toolSource, 'utf8')).replace(
    'is a vendored copy of the duobrain tool', 'is a vendored copy (release two) of the duobrain tool',
  ));
  const pkg = JSON.parse(await readFile(path.join(upstream, 'package.json'), 'utf8'));
  await writeFile(path.join(upstream, 'package.json'), `${JSON.stringify({ ...pkg, version: '0.1.1' }, null, 2)}\n`);
  await git(upstream, 'commit', '-q', '-am', 'release 0.1.1');
  await git(upstream, 'tag', 'v0.1.1');

  const checked = await run(alice, vendored, 'update', '--check');
  assert.deepEqual([checked.mode, checked.current, checked.latest, checked.updated], ['vendored', '0.1.0', '0.1.1', false]);

  const updated = await run(alice, vendored, 'update');
  assert.deepEqual([updated.updated, updated.from, updated.to], [true, '0.1.0', '0.1.1']);
  assert.equal(JSON.parse(await readFile(path.join(alice, '.duobrain', 'VENDOR.json'), 'utf8')).ref, 'v0.1.1');
  assert.match(await readFile(path.join(alice, 'AGENTS.md'), 'utf8'), /release two/, 'the new code rewrote the block');
  assert.equal(updated.agents.commitNeeded, true);
  assert.equal((await run(alice, vendored, 'update')).updated, false, 'already on the newest release');

  // Local edits to the committed copy are never overwritten.
  await git(alice, 'add', '-A');
  await git(alice, 'commit', '-q', '-m', 'chore: update duobrain to 0.1.1');
  await writeFile(vendored, `${await readFile(vendored, 'utf8')}// local edit\n`);
  await assert.rejects(run(alice, vendored, 'update', '--ref', 'v0.1.0'), /VENDOR_DIRTY/);
});

test('joining without shared state fails before creating anything', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-join-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'product.git');
  await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  const product = path.join(root, 'product');
  await execFileAsync('git', ['init', '-q', '-b', 'main', product]);
  await identify(product);
  await git(product, 'commit', '-q', '--allow-empty', '-m', 'init');
  await git(product, 'remote', 'add', 'origin', remote);
  await git(product, 'push', '-q', '-u', 'origin', 'main');
  await assert.rejects(run(product, path.join(toolRoot, 'bin', 'duobrain.js'), 'init', '--participant', 'bob'), /PARTICIPANTS_REQUIRED/);
  await assert.rejects(stat(path.join(product, '.git', 'duobrain')), { code: 'ENOENT' });
});

test('a copy inside another repository never updates that repository and can migrate to .duobrain', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-inside-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'product.git');
  await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  const product = path.join(root, 'product');
  await execFileAsync('git', ['clone', '-q', remote, product]);
  await identify(product);
  await writeFile(path.join(product, 'package.json'), '{"name":"product","version":"2.0.0"}\n');
  const files = (await git(toolRoot, 'ls-files', '--', ...RUNTIME_ENTRIES)).split('\n');
  for (const file of files) {
    await mkdir(path.dirname(path.join(product, 'tools', 'duobrain', file)), { recursive: true });
    await cp(path.join(toolRoot, file), path.join(product, 'tools', 'duobrain', file));
  }
  await git(product, 'add', '-A');
  await git(product, 'commit', '-q', '-m', 'product with a copied tools/duobrain');
  await git(product, 'push', '-q', '-u', 'origin', 'main');

  const partner = path.join(root, 'partner');
  await execFileAsync('git', ['clone', '-q', remote, partner]);
  await identify(partner);
  await git(partner, 'commit', '-q', '--allow-empty', '-m', 'partner change');
  await git(partner, 'push', '-q');

  const copied = path.join(product, 'tools', 'duobrain', 'bin', 'duobrain.js');
  const before = await git(product, 'rev-parse', 'HEAD');
  await assert.rejects(run(product, copied, 'update'), /UPDATE_INSIDE_PROJECT/);
  await assert.rejects(run(product, copied, 'update', '--check'), /UPDATE_INSIDE_PROJECT/);
  assert.equal(await git(product, 'rev-parse', 'HEAD'), before, 'the product branch did not move');

  const installed = await run(product, copied, 'install');
  const { version } = JSON.parse(await readFile(path.join(toolRoot, 'package.json'), 'utf8'));
  assert.deepEqual([installed.action, installed.manifest.ref, installed.manifest.commit], ['created', `v${version}`, null]);
  assert.equal(
    (await execFileAsync(process.execPath, [path.join(product, '.duobrain', 'bin', 'duobrain.js'), '--version'], { encoding: 'utf8' })).stdout.trim(),
    version,
  );
  assert.equal((await run(product, copied, 'install')).action, 'unchanged');
});
