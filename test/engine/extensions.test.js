import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  assessOverlap,
  clarifyTicket,
  closeTicket,
  createTicket,
  endSession,
  getSnapshot,
  initSharedStore,
  pauseSession,
  requestTicketInformation,
  resumeSession,
  startSession,
  syncStore,
  updateSessionScope,
} from '../../src/engine/index.js';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('bin/duobrain.js');

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function duobrain(repository, ...args) {
  const result = await execFileAsync(
    process.execPath,
    [cliPath, ...args, '--repository', repository],
    { encoding: 'utf8' },
  );
  return JSON.parse(result.stdout);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-extensions-'));
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
  return { root, remote, alice, bob };
}

async function initializeBoth(setup) {
  const alice = await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  const bob = await initSharedStore({
    repository: setup.bob,
    participants: ['alice', 'bob'],
    participant: 'bob',
  });
  return { alice, bob };
}

test('scope update preserves lifecycle context and changes overlap projection', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initializeBoth(setup);
  const started = await startSession({
    repository: setup.bob,
    title: 'Export work',
    scope: ['src/export/parser'],
    goal: 'Implement the old parser contract',
    branch: 'codex/export-old',
    baseCommit: 'base-old',
  });
  const sessionId = started.event.entityId;
  await pauseSession({ repository: setup.bob, sessionId, body: 'Reviewing the new boundary.' });
  await updateSessionScope({
    repository: setup.bob,
    sessionId,
    scope: ['src/export/empty-state'],
    reason: 'The parser work moved; take the empty-state boundary instead.',
    goal: null,
    baseCommit: 'base-new',
    actorKind: 'ai',
  });
  let session = (await getSnapshot({ repository: setup.bob })).sessions[0];
  assert.equal(session.status, 'paused');
  assert.deepEqual(session.scope, ['src/export/empty-state']);
  assert.equal(session.goal, null);
  assert.equal(session.branch, 'codex/export-old');
  assert.equal(session.baseCommit, 'base-new');
  assert.equal(session.startedAt, started.event.at);
  assert.deepEqual(session.history[0].data.scope, ['src/export/parser']);
  assert.equal(session.history[2].type, 'session.scope_updated');
  assert.equal(session.history[2].previous, session.history[1].id);

  await syncStore({ repository: setup.alice });
  const overlap = await assessOverlap({
    repository: setup.alice,
    scope: ['src/export/empty-state/view.js'],
  });
  assert.equal(overlap.pathAssessment.status, 'overlap');
  assert.equal(overlap.pathAssessment.overlaps[0].recorded, 'src/export/empty-state');
  const oldScope = await assessOverlap({ repository: setup.alice, scope: ['src/export/parser'] });
  assert.equal(oldScope.pathAssessment.status, 'no_overlap');
  await assert.rejects(
    updateSessionScope({
      repository: setup.alice,
      sessionId,
      scope: ['src/forbidden'],
      reason: 'Not the owner.',
    }),
    (error) => error.code === 'NOT_SESSION_OWNER',
  );

  const changePath = path.join(setup.root, 'scope-change.json');
  await writeFile(changePath, JSON.stringify({
    scope: ['src/export/empty-state', 'test/export/empty-state.test.js'],
    reason: 'Add the matching fixture without resuming the paused session.',
    goal: 'Verify the new empty-state behavior',
    branch: null,
  }));
  await duobrain(setup.bob, 'scope-update', '--session', sessionId, '--file', changePath, '--actor', 'ai');
  session = (await getSnapshot({ repository: setup.bob })).sessions[0];
  assert.equal(session.status, 'paused');
  assert.equal(session.goal, 'Verify the new empty-state behavior');
  assert.equal(session.branch, null);
  assert.equal(session.baseCommit, 'base-new');
  await resumeSession({ repository: setup.bob, sessionId });
  await endSession({ repository: setup.bob, sessionId, summary: 'Updated scope completed.' });
  await assert.rejects(
    updateSessionScope({
      repository: setup.bob,
      sessionId,
      scope: ['src/late'],
      reason: 'Ended sessions cannot change scope.',
    }),
    (error) => error.code === 'INVALID_TRANSITION',
  );
});

test('requester clarification keeps ticket status and cannot cross role or terminal boundaries', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initializeBoth(setup);
  const created = await createTicket({
    repository: setup.alice,
    kind: 'information',
    title: 'Which export run?',
    body: 'Share the relevant export result.',
    actorKind: 'ai',
  });
  const ticketId = created.event.entityId;
  await syncStore({ repository: setup.bob });
  await requestTicketInformation({
    repository: setup.bob,
    ticketId,
    body: 'Identify the run and evaluation revision.',
    actorKind: 'ai',
  });
  await syncStore({ repository: setup.alice });
  await duobrain(
    setup.alice,
    'ticket-clarify',
    '--ticket',
    ticketId,
    '--body',
    'Use export run 42 against evaluation revision 7.',
    '--actor',
    'ai',
  );
  let ticket = (await getSnapshot({ repository: setup.alice })).tickets[0];
  assert.equal(ticket.status, 'needs_information');
  assert.equal(ticket.history.at(-1).type, 'ticket.clarified');
  assert.equal(ticket.history.at(-1).data.body, 'Use export run 42 against evaluation revision 7.');
  await syncStore({ repository: setup.bob });
  ticket = (await getSnapshot({ repository: setup.bob })).tickets[0];
  assert.equal(ticket.status, 'needs_information');
  await assert.rejects(
    clarifyTicket({ repository: setup.bob, ticketId, body: 'Assignee cannot clarify for requester.' }),
    (error) => error.code === 'TICKET_ROLE_VIOLATION',
  );
  await closeTicket({
    repository: setup.alice,
    ticketId,
    reason: 'cancelled',
    body: 'The run is no longer relevant.',
  });
  await assert.rejects(
    clarifyTicket({ repository: setup.alice, ticketId, body: 'Terminal ticket cannot be clarified.' }),
    (error) => error.code === 'INVALID_TRANSITION',
  );
});

test('invalid extension roles and predecessor chains do not alter projected scope', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const initialized = await initializeBoth(setup);
  const started = await startSession({
    repository: setup.bob,
    title: 'Protected scope',
    scope: ['src/original'],
    branch: 'codex/original',
    baseCommit: 'base-original',
    sync: false,
  });
  const invalidRole = {
    schemaVersion: 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    actor: { participant: 'alice', kind: 'human' },
    entityId: started.event.entityId,
    type: 'session.scope_updated',
    previous: started.event.id,
    data: { scope: ['src/injected'], reason: 'Wrong owner injection.' },
  };
  const invalidHistory = {
    ...invalidRole,
    id: randomUUID(),
    actor: { participant: 'bob', kind: 'human' },
    previous: randomUUID(),
    data: { scope: ['src/orphaned'], reason: 'Unreachable predecessor.' },
  };
  for (const event of [invalidRole, invalidHistory]) {
    const relative = `events/${event.id}.json`;
    await writeFile(
      path.join(initialized.bob.storePath, relative),
      `${JSON.stringify(event, null, 2)}\n`,
    );
    await git(initialized.bob.storePath, 'add', '--', relative);
    await git(initialized.bob.storePath, 'commit', '-m', `Inject invalid extension ${event.id}`);
  }
  const snapshot = await getSnapshot({ repository: setup.bob });
  assert.deepEqual(snapshot.sessions[0].scope, ['src/original']);
  assert.ok(snapshot.conflicts.some((conflict) => /Invalid session history/.test(conflict.message)));
  assert.ok(snapshot.conflicts.some((conflict) => /unreachable/.test(conflict.message)));
  await assert.rejects(
    updateSessionScope({
      repository: setup.bob,
      sessionId: started.event.entityId,
      scope: ['src/blocked'],
      reason: 'Conflicted history blocks mutation.',
    }),
    (error) => error.code === 'ENTITY_CONFLICT',
  );
});
