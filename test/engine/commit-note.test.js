import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  captureWorkContext,
  getWikiNote,
  initSharedStore,
  listWikiNotes,
  recordCommitNote,
  syncStore,
} from '../../src/engine/index.js';

const execFileAsync = promisify(execFile);

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-commit-note-'));
  const remote = path.join(root, 'product.git');
  const seed = path.join(root, 'seed');
  const alice = path.join(root, 'alice');
  const bob = path.join(root, 'bob');
  await execFileAsync('git', ['init', '--bare', remote]);
  await execFileAsync('git', ['clone', remote, seed]);
  await git(seed, 'config', 'user.name', 'Test');
  await git(seed, 'config', 'user.email', 'test@example.invalid');
  await writeFile(path.join(seed, 'product.txt'), 'original\n');
  await git(seed, 'add', '--', 'product.txt');
  await git(seed, 'commit', '-m', 'Initial product');
  await git(seed, 'push', '-u', 'origin', 'HEAD:main');
  await execFileAsync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await execFileAsync('git', ['clone', remote, alice]);
  await execFileAsync('git', ['clone', remote, bob]);
  await initSharedStore({ repository: alice, participants: ['alice', 'bob'], participant: 'alice' });
  await initSharedStore({ repository: bob, participants: ['alice', 'bob'], participant: 'bob' });
  const transcript = path.join(root, 'session.jsonl');
  const event = (timestamp, content) => JSON.stringify({
    type: 'user', sessionId: 'sess-1', timestamp, message: { role: 'user', content },
  });
  await writeFile(transcript, [
    event('2026-09-24T01:00:00Z', 'Use a semicolon delimiter'),
    event('2026-09-24T02:00:00Z', 'Now add the export button'),
  ].join('\n'));
  return { root, alice, bob, transcript };
}

function summary(capture) {
  return {
    subject: 'feat(export): use semicolon CSV delimiter',
    why: 'European spreadsheet locales read commas as decimals; contact me at dev@example.com',
    method: 'Changed the writer, then ran the export tests.',
    requests: ['Use a semicolon delimiter'],
    decisions: [{ decision: 'Semicolon over tab', reason: 'Excel opens it without an import dialog' }],
    failedAttempts: ['Quoting every field broke the SRT fixture'],
    verification: ['npm test: 12 passed'],
    openQuestions: [],
    capture,
  };
}

test('commit-note stores a linked source note and advances the capture marker', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await writeFile(path.join(setup.alice, 'export.js'), 'export const delimiter = ";";\n');
  await git(setup.alice, 'add', 'export.js');

  const first = await captureWorkContext({
    repository: setup.alice, transcript: setup.transcript, until: '2026-09-24T01:30:00Z',
  });
  assert.equal(first.capture.since, null);
  assert.equal(first.text, '[user] Use a semicolon delimiter');
  assert.deepEqual(first.product.stagedFiles, ['export.js']);

  const preview = await recordCommitNote({ repository: setup.alice, summary: summary(first.capture), dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.equal((await listWikiNotes({ repository: setup.alice })).length, 0, 'dry run writes nothing');

  const recorded = await recordCommitNote({ repository: setup.alice, summary: summary(first.capture) });
  assert.equal(recorded.sync.status, 'synced');
  assert.equal(recorded.message, [
    'feat(export): use semicolon CSV delimiter',
    '',
    'Why: European spreadsheet locales read commas as decimals; contact me at [email]',
    `Duobrain-Record: ${recorded.path}`,
    '',
  ].join('\n'));

  await syncStore({ repository: setup.bob });
  const note = await getWikiNote({ repository: setup.bob, path: recorded.path });
  const { metadata, body } = note.validation.note;
  assert.equal(note.validation.valid, true);
  assert.equal(metadata.author.participant, 'alice');
  assert.equal(metadata.workContext.promptRef, 'transcript:claude-code/sess-1#start..2026-09-24T01:30:00Z');
  assert.deepEqual(metadata.sources.map(({ kind, ref }) => `${kind}:${ref}`), [
    'observation:transcript:claude-code/sess-1#start..2026-09-24T01:30:00Z',
    'file:export.js',
  ]);
  assert.match(body, /\*\*Semicolon over tab\*\*: Excel opens it without an import dialog/);
  assert.match(body, /## Failed attempts\n\n- Quoting every field broke the SRT fixture/);
  assert.equal(body.includes('## Open questions'), false, 'empty sections are omitted');

  const next = await captureWorkContext({ repository: setup.alice, transcript: setup.transcript });
  assert.equal(next.capture.since, '2026-09-24T01:30:00Z');
  assert.equal(next.text, '[user] Now add the export button');
  const markers = JSON.parse(await readFile(
    path.join(await git(setup.alice, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'duobrain', 'capture.json'),
    'utf8',
  ));
  assert.equal(markers.transcripts[setup.transcript], '2026-09-24T01:30:00Z');
});

test('capture-extract --bundle joins instructions, capture and the capped staged diff', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await writeFile(path.join(setup.alice, 'big.txt'), `${'line with token=abcdef123456\n'.repeat(200)}`);
  await git(setup.alice, 'add', 'big.txt');
  const bundled = await captureWorkContext({
    repository: setup.alice, transcript: setup.transcript, bundle: true, diffLimit: 500,
  });
  assert.match(bundled.text, /^You write the work record for one Git commit/);
  assert.match(bundled.text, /=== CAPTURE ===\n\[user\] Use a semicolon delimiter/);
  assert.match(bundled.text, /=== DIFF ===\nbig.txt \| 200 \+/);
  assert.match(bundled.text, /…\[diff truncated: \d+ more characters\]/);
  assert.equal(/token=(?!\[secret\])/.test(bundled.text), false, 'the diff is redacted before capping');
});

test('commit-note rejects summaries without the required fields', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const invalid = [
    { ...summary(null), subject: '' },
    { ...summary(null), subject: 'x'.repeat(101) },
    { ...summary(null), decisions: [{ decision: 'No reason' }] },
    { ...summary(null), verification: [''] },
  ];
  for (const candidate of invalid) {
    await assert.rejects(recordCommitNote({ repository: setup.alice, summary: candidate, dryRun: true }), {
      code: 'INVALID_SUMMARY',
    });
  }
});
