import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  addWikiNote,
  createTicket,
  endSession,
  initSharedStore,
  respondToTicket,
  startSession,
  syncStore,
} from '../../src/engine/index.js';
import { renderWikiNote } from '../../src/wiki/index.js';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('bin/duobrain.js');

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function duobrainRaw(repository, ...args) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, ...args, '--repository', repository],
    { encoding: 'utf8' },
  );
  return stdout;
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-brief-'));
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
  return { root, alice, bob };
}

function sourceNote(id) {
  return renderWikiNote({
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title: 'Delimiter decision',
    author: { participant: 'alice', kind: 'ai' },
    observedAt: '2026-09-20T02:00:00.000Z',
    workContext: { promptRef: null, harnessRef: null },
    status: 'proposed',
    sources: [{ kind: 'observation', ref: 'test:delimiter' }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
  }, '# Delimiter decision\n\nSemicolon keeps spreadsheet locales working.');
}

test('status --brief keeps open work, latest handoffs and actionable tickets only', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));

  const older = await startSession({
    repository: setup.bob, title: 'Old parser', scope: ['src/parser'], actorKind: 'ai',
  });
  await endSession({
    repository: setup.bob, sessionId: older.event.entityId, summary: 'Parser done', actorKind: 'ai',
  });
  const latest = await startSession({
    repository: setup.bob, title: 'CSV writer', scope: ['src/export/csv'], actorKind: 'ai',
  });
  await endSession({
    repository: setup.bob,
    sessionId: latest.event.entityId,
    summary: 'CSV writer passes',
    blockers: ['SRT fixture fails'],
    next: 'Wire the export button',
    actorKind: 'ai',
  });
  await startSession({
    repository: setup.bob, title: 'Export screen', scope: ['src/export'], actorKind: 'ai',
  });
  const forAlice = await createTicket({
    repository: setup.bob, kind: 'information', title: 'Delimiter reason', body: 'Why semicolon?', actorKind: 'ai',
  });
  await syncStore({ repository: setup.alice });
  const fromAlice = await createTicket({
    repository: setup.alice, kind: 'feedback', title: 'Button copy', body: 'Pick a label.', actorKind: 'ai',
  });
  const noteId = randomUUID();
  await addWikiNote({ repository: setup.alice, markdown: sourceNote(noteId) });
  await respondToTicket({
    repository: setup.alice,
    ticketId: forAlice.event.entityId,
    body: 'See the note.',
    evidence: [`wiki/${noteId}.md`],
    actorKind: 'ai',
  });

  const raw = await duobrainRaw(setup.alice, 'status', '--brief');
  assert.equal(raw.trim().split('\n').length, 1, 'brief output is a single compact JSON line');
  const brief = JSON.parse(raw);
  assert.equal(raw.includes('"history"'), false);
  assert.equal(brief.participant, 'alice');
  assert.equal(brief.partner, 'bob');
  assert.equal(brief.sync.status, 'synced');
  assert.equal(brief.plan, null);

  assert.deepEqual(brief.sessions.map(({ title, status }) => [title, status]), [
    ['Export screen', 'active'],
    ['CSV writer', 'ended'],
  ]);
  const handoff = brief.sessions[1];
  assert.equal(handoff.summary, 'CSV writer passes');
  assert.deepEqual(handoff.blockers, ['SRT fixture fails']);
  assert.equal(handoff.next, 'Wire the export button');
  assert.equal(Object.hasOwn(brief.sessions[0], 'blockers'), false, 'empty fields are omitted');

  assert.deepEqual(brief.tickets.forMe, [], 'an answered request waits on the requester');
  assert.deepEqual(brief.tickets.fromMe.map(({ id, kind, status }) => [id, kind, status]), [
    [fromAlice.event.entityId, 'feedback', 'open'],
  ]);

  await syncStore({ repository: setup.bob });
  const bobBrief = JSON.parse(await duobrainRaw(setup.bob, 'status', '--brief'));
  assert.deepEqual(bobBrief.tickets.forMe.map(({ title, requester, body }) => [title, requester, body]), [
    ['Button copy', 'alice', 'Pick a label.'],
  ]);
  assert.deepEqual(bobBrief.tickets.fromMe.map(({ status, evidence }) => [status, evidence]), [
    ['answered', [`wiki/${noteId}.md`]],
  ]);

  const full = await duobrainRaw(setup.alice, 'status');
  assert.ok(raw.length < full.length / 3, `brief ${raw.length} vs full ${full.length}`);
});

test('overlap --brief reports the verdict, overlapping paths and unknowns', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await startSession({
    repository: setup.bob, title: 'Export screen', scope: ['src/export'], actorKind: 'ai',
  });
  await syncStore({ repository: setup.alice });

  const overlap = JSON.parse(await duobrainRaw(setup.alice, 'overlap', '--scope', 'src/export/csv.ts', '--brief'));
  assert.equal(overlap.verdict, 'overlap');
  assert.deepEqual(overlap.overlaps, [{
    participant: 'bob',
    proposed: 'src/export/csv.ts',
    recorded: 'src/export',
    relation: 'proposed_within_recorded',
  }]);
  assert.equal(overlap.semantic, 'unknown');
  assert.equal(overlap.unknowns.includes('peer_unpushed_product_changes_unknown'), true);

  const clear = JSON.parse(await duobrainRaw(setup.alice, 'overlap', '--scope', 'src/import', '--brief'));
  assert.equal(clear.verdict, 'no_overlap');
  assert.deepEqual(clear.overlaps, []);
});
