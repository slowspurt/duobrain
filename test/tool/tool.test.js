import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  ensureClaudeImport,
  renderAgentsBlock,
  updateTool,
  upsertManagedBlock,
} from '../../src/tool/index.js';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('bin/duobrain.js');

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function duobrain(cwd, ...args) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
  return JSON.parse(stdout);
}

async function repository(root, name) {
  const directory = path.join(root, name);
  await execFileAsync('git', ['init', '-q', '-b', 'main', directory]);
  await git(directory, 'config', 'user.name', 'Test');
  await git(directory, 'config', 'user.email', 'test@example.invalid');
  return directory;
}

test('the managed block is inserted, replaced in place and left alone when current', () => {
  const block = renderAgentsBlock();
  assert.equal(block.includes('/Users/'), false, 'no machine-specific paths');

  assert.deepEqual(upsertManagedBlock(null), { content: `${block}\n`, action: 'created' });

  const appended = upsertManagedBlock('# Project rules\n\nUse tabs.\n');
  assert.equal(appended.action, 'updated');
  assert.equal(appended.content, `# Project rules\n\nUse tabs.\n\n${block}\n`);
  assert.equal(upsertManagedBlock(appended.content).action, 'unchanged');

  const stale = appended.content.replace('## duobrain', '## duobrain (old)');
  const refreshed = upsertManagedBlock(stale);
  assert.equal(refreshed.action, 'updated');
  assert.equal(refreshed.content, appended.content);

  assert.throws(() => upsertManagedBlock('<!-- duobrain:start -->\nhalf'), { code: 'AGENTS_MARKER_BROKEN' });
});

test('CLAUDE.md imports AGENTS.md once', () => {
  assert.deepEqual(ensureClaudeImport(null), { content: '@AGENTS.md\n', action: 'created' });
  const updated = ensureClaudeImport('# Claude notes\n');
  assert.deepEqual(updated, { content: '@AGENTS.md\n\n# Claude notes\n', action: 'updated' });
  assert.equal(ensureClaudeImport(updated.content).action, 'unchanged');
});

test('init writes the agent files and agents-sync keeps them current', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-agents-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'product.git');
  await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  const product = await repository(root, 'product');
  await writeFile(path.join(product, 'AGENTS.md'), '# Existing rules\n');
  await git(product, 'add', 'AGENTS.md');
  await git(product, 'commit', '-q', '-m', 'init');
  await git(product, 'remote', 'add', 'origin', remote);
  await git(product, 'push', '-q', '-u', 'origin', 'main');

  const headBefore = await git(product, 'rev-parse', 'HEAD');
  const initialized = await duobrain(product, 'init', '--participants', 'alice,bob', '--participant', 'alice');
  assert.deepEqual(initialized.agents.files.map(({ path: filePath, action }) => [path.basename(filePath), action]), [
    ['AGENTS.md', 'updated'],
    ['CLAUDE.md', 'created'],
  ]);
  assert.equal(initialized.agents.commitNeeded, true);
  const agents = await readFile(path.join(product, 'AGENTS.md'), 'utf8');
  assert.match(agents, /^# Existing rules\n\n<!-- duobrain:start -->/);
  assert.equal(await readFile(path.join(product, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
  assert.equal(await git(product, 'rev-parse', 'HEAD'), headBefore, 'nothing is committed to the product');
  assert.equal(await git(product, 'status', '--porcelain'), 'M AGENTS.md\n?? CLAUDE.md');

  const again = await duobrain(product, 'agents-sync');
  assert.deepEqual(again.files.map(({ action }) => action), ['unchanged', 'unchanged']);
  assert.equal(again.commitNeeded, false);

  const skipped = await repository(root, 'skipped');
  await git(skipped, 'commit', '-q', '--allow-empty', '-m', 'init');
  await git(skipped, 'remote', 'add', 'origin', remote);
  const noAgents = await duobrain(skipped, 'init', '--participants', 'alice,bob', '--participant', 'bob', '--no-agents');
  assert.equal(noAgents.agents, undefined);
});

test('update fast-forwards a clean checkout and refuses local work', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-update-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const upstream = await repository(root, 'upstream');
  await writeFile(path.join(upstream, 'package.json'), '{"version":"0.1.0"}\n');
  await git(upstream, 'add', 'package.json');
  await git(upstream, 'commit', '-q', '-m', 'v0.1.0');
  await execFileAsync('git', ['clone', '-q', upstream, path.join(root, 'tool')]);
  const tool = path.join(root, 'tool');
  await git(tool, 'config', 'user.name', 'Test');
  await git(tool, 'config', 'user.email', 'test@example.invalid');

  assert.equal((await updateTool({ toolRoot: tool })).updated, false, 'already current');

  await writeFile(path.join(upstream, 'package.json'), '{"version":"0.2.0"}\n');
  await git(upstream, 'commit', '-q', '-am', 'release 0.2.0');

  const checked = await updateTool({ toolRoot: tool, check: true });
  assert.deepEqual([checked.current, checked.latest, checked.behind, checked.updated], ['0.1.0', '0.2.0', 1, false]);
  assert.match(checked.commits[0], /release 0.2.0$/);

  await writeFile(path.join(tool, 'package.json'), '{"version":"local"}\n');
  await assert.rejects(updateTool({ toolRoot: tool }), { code: 'UPDATE_DIRTY' });
  await git(tool, 'checkout', '--', 'package.json');

  const updated = await updateTool({ toolRoot: tool });
  assert.equal(updated.updated, true);
  assert.equal(JSON.parse(await readFile(path.join(tool, 'package.json'), 'utf8')).version, '0.2.0');
  assert.equal(updated.to, await git(upstream, 'rev-parse', 'HEAD'));

  await git(tool, 'commit', '-q', '--allow-empty', '-m', 'local change');
  await git(upstream, 'commit', '-q', '--allow-empty', '-m', 'upstream change');
  await assert.rejects(updateTool({ toolRoot: tool }), { code: 'UPDATE_DIVERGED' });

  const loose = await mkdtemp(path.join(os.tmpdir(), 'duobrain-loose-'));
  t.after(() => rm(loose, { recursive: true, force: true }));
  await assert.rejects(updateTool({ toolRoot: loose }), { code: 'UPDATE_NOT_GIT' });
});
