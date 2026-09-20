import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  addWikiNote,
  createTicket,
  initSharedStore,
  listWikiNotes,
  runDailyWikiRefinement,
  syncStore,
} from '../../src/engine/index.js';
import { renderWikiNote } from '../../src/wiki/index.js';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('bin/duobrain.js');

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function duobrain(repository, ...args) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, ...args, '--repository', repository],
    { encoding: 'utf8' },
  );
  return JSON.parse(stdout);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-refinement-runner-'));
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
  return { root, remote, alice, bob };
}

function sourceNote(id, participant, title) {
  return renderWikiNote({
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title,
    author: { participant, kind: 'ai' },
    observedAt: '2026-09-19T02:00:00.000Z',
    workContext: { promptRef: null, harnessRef: null },
    status: 'proposed',
    sources: [{ kind: 'observation', ref: `test:${id}` }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
  }, `# ${title}\n\nImmutable source evidence.`);
}

function schedule() {
  return {
    timezone: 'Asia/Seoul',
    time: '09:00',
    policy: {
      id: 'default-daily-index',
      version: '1',
      staleAfterDays: 30,
      recencyWindowDays: 90,
      lowImportanceThreshold: 0.3,
      highImportanceThreshold: 0.7,
      unknownImportanceExposure: 'normal',
      importanceSignals: [],
    },
  };
}

function refinements(notes) {
  return notes.filter(({ validation }) => (
    validation.valid
    && validation.note.format === 'structured'
    && validation.note.metadata.dailyRefinement
  ));
}

test('daily if-due execution is owner-only, delayed, once per date, and CLI-backed', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const noteId = randomUUID();
  await addWikiNote({
    repository: setup.alice,
    markdown: sourceNote(noteId, 'alice', 'Parser evidence'),
  });
  await syncStore({ repository: setup.bob });

  const nonOwner = await runDailyWikiRefinement({
    repository: setup.bob,
    schedule: schedule(),
    ifDue: true,
    now: '2026-09-20T09:30:00+09:00',
  });
  assert.equal(nonOwner.outcome, 'skipped');
  assert.equal(nonOwner.reason, 'not-scheduler-owner');
  assert.equal(nonOwner.schedule.owner, 'alice');

  const early = await runDailyWikiRefinement({
    repository: setup.alice,
    schedule: schedule(),
    ifDue: true,
    now: '2026-09-20T08:59:00+09:00',
  });
  assert.equal(early.reason, 'not-due');

  const schedulePath = path.join(setup.root, 'daily.json');
  await writeFile(schedulePath, `${JSON.stringify(schedule(), null, 2)}\n`);
  const completed = await duobrain(
    setup.alice,
    'wiki-refine',
    '--file', schedulePath,
    '--if-due',
    '--now', '2026-09-20T18:30:00+09:00',
  );
  assert.equal(completed.outcome, 'completed');
  assert.equal(completed.schedule.cadence, 'daily');
  assert.equal(completed.sync.status, 'synced');

  const repeated = await runDailyWikiRefinement({
    repository: setup.alice,
    schedule: schedule(),
    ifDue: true,
    now: '2026-09-20T22:00:00+09:00',
  });
  assert.equal(repeated.outcome, 'skipped');
  assert.equal(repeated.reason, 'already-successful');
  assert.equal(repeated.summaryPath, completed.summaryPath);

  await syncStore({ repository: setup.bob });
  const bobRefinements = refinements(await listWikiNotes({ repository: setup.bob }));
  assert.equal(bobRefinements.length, 1);
  assert.equal(bobRefinements[0].path, completed.summaryPath);
});

test('manual refresh requires a stable-hash input change and chains a real prior summary', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const firstSourceId = randomUUID();
  await addWikiNote({
    repository: setup.alice,
    markdown: sourceNote(firstSourceId, 'alice', 'First source'),
  });
  const first = await runDailyWikiRefinement({
    repository: setup.alice,
    schedule: schedule(),
    now: '2026-09-20T09:00:00+09:00',
  });
  assert.equal(first.outcome, 'completed');

  const unchanged = await runDailyWikiRefinement({
    repository: setup.alice,
    schedule: schedule(),
    now: '2026-09-20T10:00:00+09:00',
  });
  assert.equal(unchanged.outcome, 'skipped');
  assert.equal(unchanged.reason, 'no-new-input');
  assert.equal(unchanged.sourceRevision, first.sourceRevision);

  await createTicket({
    repository: setup.alice,
    kind: 'information',
    title: 'New refinement input',
    body: 'This ticket must change the stable source revision.',
  });
  const ticketRefresh = await runDailyWikiRefinement({
    repository: setup.alice,
    schedule: schedule(),
    now: '2026-09-20T10:02:00+09:00',
  });
  assert.equal(ticketRefresh.outcome, 'completed');
  assert.notEqual(ticketRefresh.sourceRevision, first.sourceRevision);
  assert.equal(ticketRefresh.plan.candidate.metadata.previousSummary, first.summaryPath);

  const secondSourceId = randomUUID();
  await addWikiNote({
    repository: setup.alice,
    markdown: sourceNote(secondSourceId, 'alice', 'Second source'),
  });
  const refreshed = await runDailyWikiRefinement({
    repository: setup.alice,
    schedule: schedule(),
    now: '2026-09-20T10:05:00+09:00',
  });
  assert.equal(refreshed.outcome, 'completed');
  assert.notEqual(refreshed.sourceRevision, ticketRefresh.sourceRevision);
  assert.equal(refreshed.plan.candidate.metadata.previousSummary, ticketRefresh.summaryPath);

  const notes = await listWikiNotes({ repository: setup.alice });
  assert.equal(refinements(notes).length, 3);
});

test('a rejected refinement push stays pending and the next scheduled run recovers it', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const noteId = randomUUID();
  await addWikiNote({
    repository: setup.alice,
    markdown: sourceNote(noteId, 'alice', 'Retry source'),
  });
  await syncStore({ repository: setup.bob });

  const hook = path.join(setup.remote, 'hooks', 'pre-receive');
  await writeFile(hook, '#!/bin/sh\necho "reject refinement once" >&2\nexit 1\n');
  await chmod(hook, 0o755);
  const failed = await runDailyWikiRefinement({
    repository: setup.alice,
    schedule: schedule(),
    ifDue: true,
    now: '2026-09-21T12:00:00+09:00',
  });
  assert.equal(failed.outcome, 'pending');
  assert.equal(failed.reason, 'push-failed');
  assert.equal(failed.sync.status, 'pending');
  assert.equal(refinements(await listWikiNotes({ repository: setup.bob })).length, 0);

  await unlink(hook);
  const retried = await runDailyWikiRefinement({
    repository: setup.alice,
    schedule: schedule(),
    ifDue: true,
    now: '2026-09-21T12:05:00+09:00',
  });
  assert.equal(retried.outcome, 'skipped');
  assert.equal(retried.reason, 'already-successful');
  assert.equal(retried.sync.status, 'synced');
  assert.equal(retried.summaryPath, failed.summaryPath);

  await syncStore({ repository: setup.bob });
  const remoteRefinements = refinements(await listWikiNotes({ repository: setup.bob }));
  assert.equal(remoteRefinements.length, 1);
  assert.equal(remoteRefinements[0].path, failed.summaryPath);
});
