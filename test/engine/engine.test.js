import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, link, mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  acknowledgeTicket,
  addWikiNote,
  closeTicket,
  createTicket,
  endSession,
  getSnapshot,
  getWikiNote,
  initSharedStore,
  pauseSession,
  reopenTicket,
  requestTicketInformation,
  resumeSession,
  resolveTicket,
  respondToTicket,
  startSession,
  syncStore,
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
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-engine-'));
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

function structuredNote({ id, participant, title = 'Handoff facts' }) {
  const metadata = {
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title,
    status: 'personal',
    observedAt: '2026-09-20T01:00:00.000Z',
    author: { participant, kind: 'ai' },
    workContext: { promptRef: null, harnessRef: null },
    sources: [{ kind: 'observation', ref: 'test-observation' }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
  };
  return `\`\`\`duobrain-wiki\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\nCSV passes; the SRT multiline fixture still fails.\n`;
}

test('two clones exchange session start/end without touching product changes', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));

  await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  await initSharedStore({
    repository: setup.bob,
    participants: ['alice', 'bob'],
    participant: 'bob',
  });

  await writeFile(path.join(setup.alice, 'product.txt'), 'alice has uncommitted product work\n');
  const started = await startSession({
    repository: setup.alice,
    title: 'Connect API',
    scope: ['src/api'],
  });
  assert.equal(started.sync.status, 'synced');
  assert.equal(await readFile(path.join(setup.alice, 'product.txt'), 'utf8'), 'alice has uncommitted product work\n');
  assert.equal(await git(setup.alice, 'status', '--short'), 'M product.txt');

  await syncStore({ repository: setup.bob });
  let snapshot = await getSnapshot({ repository: setup.bob });
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.sessions[0].status, 'active');
  assert.equal(snapshot.sessions[0].elapsedMs, null);
  assert.equal(snapshot.goals.project, null);
  assert.deepEqual(snapshot.tickets, []);

  const ended = await endSession({
    repository: setup.alice,
    sessionId: started.event.entityId,
    summary: 'Connected and verified',
    next: 'Hand off the response shape',
  });
  assert.equal(ended.sync.status, 'synced');
  await syncStore({ repository: setup.bob });
  snapshot = await getSnapshot({ repository: setup.bob });
  assert.equal(snapshot.sessions[0].status, 'ended');
  assert.equal(snapshot.sessions[0].next, 'Hand off the response shape');
  assert.ok(snapshot.sessions[0].elapsedMs >= 0);
});

test('session pause/resume enforces owner transitions and preserves handoff context', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  await initSharedStore({
    repository: setup.bob,
    participants: ['alice', 'bob'],
    participant: 'bob',
  });
  const started = await startSession({
    repository: setup.alice,
    title: 'Parser handoff',
    scope: ['src/parser'],
    branch: 'codex/parser-handoff',
    baseCommit: 'abc1234',
  });
  const sessionId = started.event.entityId;
  await pauseSession({
    repository: setup.alice,
    sessionId,
    body: 'Waiting for the failing fixture.',
    actorKind: 'ai',
  });
  let session = (await getSnapshot({ repository: setup.alice })).sessions[0];
  assert.equal(session.status, 'paused');
  assert.equal(session.elapsedMs, null);
  assert.equal(session.summary, null);
  assert.equal(session.branch, 'codex/parser-handoff');
  assert.equal(session.baseCommit, 'abc1234');
  await assert.rejects(
    pauseSession({ repository: setup.alice, sessionId }),
    (error) => error.code === 'INVALID_TRANSITION',
  );

  await syncStore({ repository: setup.bob });
  await assert.rejects(
    resumeSession({ repository: setup.bob, sessionId }),
    (error) => error.code === 'NOT_SESSION_OWNER',
  );
  await resumeSession({
    repository: setup.alice,
    sessionId,
    body: 'Fixture received; continuing.',
    actorKind: 'ai',
  });
  await endSession({
    repository: setup.alice,
    sessionId,
    summary: 'Parser now handles the failing fixture.',
    blockers: ['Upstream release is still pending.'],
    next: 'Share the verified fixture revision.',
  });
  session = (await getSnapshot({ repository: setup.alice })).sessions[0];
  assert.equal(session.status, 'ended');
  assert.equal(session.summary, 'Parser now handles the failing fixture.');
  assert.equal(session.history.length, 4);
  assert.equal(session.history[0].previous, null);
  assert.equal(session.history[1].previous, session.history[0].id);
  assert.equal(session.history[1].data.body, 'Waiting for the failing fixture.');
  assert.equal(session.history[2].previous, session.history[1].id);
  assert.equal(session.history[3].data.summary, session.summary);
  await assert.rejects(
    resumeSession({ repository: setup.alice, sessionId }),
    (error) => error.code === 'INVALID_TRANSITION',
  );
});

test('failed sharing remains pending and retry preserves concurrent distinct events', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  await initSharedStore({
    repository: setup.bob,
    participants: ['alice', 'bob'],
    participant: 'bob',
  });

  const unavailable = `${setup.remote}.offline`;
  await rename(setup.remote, unavailable);
  const aliceEvent = await startSession({ repository: setup.alice, title: 'Alice local event' });
  const bobEvent = await startSession({ repository: setup.bob, title: 'Bob local event' });
  assert.equal(aliceEvent.sync.status, 'pending');
  assert.equal(bobEvent.sync.status, 'pending');
  await rename(unavailable, setup.remote);

  assert.equal((await syncStore({ repository: setup.alice })).status, 'synced');
  assert.equal((await syncStore({ repository: setup.bob })).status, 'synced');
  assert.equal((await syncStore({ repository: setup.alice })).status, 'synced');

  const aliceSnapshot = await getSnapshot({ repository: setup.alice });
  const bobSnapshot = await getSnapshot({ repository: setup.bob });
  const expected = [aliceEvent.event.id, bobEvent.event.id].sort();
  assert.deepEqual(aliceSnapshot.sessions.map((session) => session.id).sort(), expected);
  assert.deepEqual(bobSnapshot.sessions.map((session) => session.id).sort(), expected);
  assert.deepEqual(aliceSnapshot.conflicts, []);
});

test('a rejected push keeps the local event and succeeds on explicit retry', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });

  const hook = path.join(setup.remote, 'hooks', 'pre-receive');
  await writeFile(hook, '#!/bin/sh\necho "intentional test rejection" >&2\nexit 1\n');
  await chmod(hook, 0o755);
  const started = await startSession({ repository: setup.alice, title: 'Survive rejected push' });
  assert.equal(started.sync.status, 'pending');
  assert.match(started.sync.message, /rejected|declined|intentional test rejection/i);
  assert.equal((await getSnapshot({ repository: setup.alice })).sessions[0].id, started.event.id);

  await unlink(hook);
  const retried = await syncStore({ repository: setup.alice });
  assert.equal(retried.status, 'synced');

  await initSharedStore({
    repository: setup.bob,
    participants: ['alice', 'bob'],
    participant: 'bob',
  });
  assert.equal((await getSnapshot({ repository: setup.bob })).sessions[0].id, started.event.id);
});

test('two clones complete an information ticket with immutable wiki evidence', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  await initSharedStore({
    repository: setup.bob,
    participants: ['alice', 'bob'],
    participant: 'bob',
  });

  const created = await createTicket({
    repository: setup.alice,
    kind: 'information',
    title: 'Export handoff',
    body: 'Share passing tests, remaining failures, and the next action.',
    actorKind: 'ai',
  });
  const ticketId = created.event.entityId;
  await assert.rejects(
    acknowledgeTicket({ repository: setup.alice, ticketId }),
    (error) => error.code === 'TICKET_ROLE_VIOLATION',
  );

  await syncStore({ repository: setup.bob });
  await acknowledgeTicket({ repository: setup.bob, ticketId, actorKind: 'ai' });
  await requestTicketInformation({
    repository: setup.bob,
    ticketId,
    body: 'Identify the source revision for the reported test result.',
    actorKind: 'ai',
  });
  await assert.rejects(
    respondToTicket({
      repository: setup.bob,
      ticketId,
      body: 'An unsupported answer.',
      actorKind: 'ai',
    }),
    (error) => error.code === 'MISSING_EVIDENCE',
  );

  const noteId = randomUUID();
  const note = await addWikiNote({
    repository: setup.bob,
    markdown: structuredNote({ id: noteId, participant: 'bob' }),
  });
  assert.equal(note.path, `wiki/${noteId}.md`);
  assert.equal(note.validation.valid, true);
  const responded = await respondToTicket({
    repository: setup.bob,
    ticketId,
    body: 'CSV passes; the SRT multiline fixture still fails.',
    evidence: [note.path],
    actorKind: 'ai',
  });
  assert.equal(responded.sync.status, 'synced');
  await assert.rejects(
    resolveTicket({ repository: setup.bob, ticketId, body: 'Assignee cannot resolve.' }),
    (error) => error.code === 'TICKET_ROLE_VIOLATION',
  );

  await syncStore({ repository: setup.alice });
  let snapshot = await getSnapshot({ repository: setup.alice });
  assert.equal(snapshot.tickets[0].status, 'answered');
  assert.deepEqual(snapshot.tickets[0].evidence, [note.path]);
  assert.deepEqual(
    snapshot.tickets[0].history.map((event) => event.type),
    ['ticket.created', 'ticket.acknowledged', 'ticket.needs_information', 'ticket.responded'],
  );
  await resolveTicket({
    repository: setup.alice,
    ticketId,
    body: 'The response and evidence cover the requested handoff facts.',
  });
  await reopenTicket({
    repository: setup.alice,
    ticketId,
    body: 'A new result needs a fresh response.',
  });
  snapshot = await getSnapshot({ repository: setup.alice });
  assert.equal(snapshot.tickets[0].status, 'open');
  assert.deepEqual(snapshot.tickets[0].evidence, []);
  await assert.rejects(
    resolveTicket({ repository: setup.alice, ticketId, body: 'Old response is not enough.' }),
    (error) => error.code === 'INVALID_TRANSITION',
  );

  await syncStore({ repository: setup.bob });
  await respondToTicket({
    repository: setup.bob,
    ticketId,
    body: 'The refreshed result is recorded in the same source note.',
    evidence: [note.path],
    actorKind: 'ai',
  });
  await syncStore({ repository: setup.alice });
  await resolveTicket({ repository: setup.alice, ticketId, body: 'Fresh response verified.' });
  await syncStore({ repository: setup.bob });
  assert.equal((await getSnapshot({ repository: setup.bob })).tickets[0].status, 'resolved');
});

test('feedback requires the assignee human and close is not resolution', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  await initSharedStore({
    repository: setup.bob,
    participants: ['alice', 'bob'],
    participant: 'bob',
  });
  const feedback = await createTicket({
    repository: setup.alice,
    kind: 'feedback',
    title: 'Choose onboarding copy',
    body: 'Choose draft A or B.',
    actorKind: 'ai',
  });
  await syncStore({ repository: setup.bob });
  await assert.rejects(
    respondToTicket({
      repository: setup.bob,
      ticketId: feedback.event.entityId,
      body: 'AI cannot make this choice.',
      actorKind: 'ai',
    }),
    (error) => error.code === 'HUMAN_RESPONSE_REQUIRED',
  );
  await respondToTicket({
    repository: setup.bob,
    ticketId: feedback.event.entityId,
    body: 'Use draft B.',
    actorKind: 'human',
  });
  await syncStore({ repository: setup.alice });
  await resolveTicket({
    repository: setup.alice,
    ticketId: feedback.event.entityId,
    body: 'Direct feedback received.',
  });

  const cancelled = await createTicket({
    repository: setup.alice,
    kind: 'information',
    title: 'No longer needed',
    body: 'This request will be cancelled.',
  });
  await closeTicket({
    repository: setup.alice,
    ticketId: cancelled.event.entityId,
    reason: 'cancelled',
    body: 'The dependent task was removed.',
  });
  const snapshot = await getSnapshot({ repository: setup.alice });
  assert.equal(snapshot.tickets.find((ticket) => ticket.id === feedback.event.entityId).status, 'resolved');
  assert.equal(snapshot.tickets.find((ticket) => ticket.id === cancelled.event.entityId).status, 'closed');
});

test('ticket push rejection is pending and explicit retry shares the same event', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  const hook = path.join(setup.remote, 'hooks', 'pre-receive');
  await writeFile(hook, '#!/bin/sh\necho "reject ticket once" >&2\nexit 1\n');
  await chmod(hook, 0o755);
  const created = await createTicket({
    repository: setup.alice,
    kind: 'information',
    title: 'Pending delivery',
    body: 'Keep this exact event for retry.',
  });
  assert.equal(created.sync.status, 'pending');
  await unlink(hook);
  assert.equal((await syncStore({ repository: setup.alice })).status, 'synced');
  await initSharedStore({
    repository: setup.bob,
    participants: ['alice', 'bob'],
    participant: 'bob',
  });
  const remoteTicket = (await getSnapshot({ repository: setup.bob })).tickets[0];
  assert.equal(remoteTicket.id, created.event.entityId);
  assert.equal(remoteTicket.history[0].id, created.event.id);
  assert.equal(remoteTicket.history.length, 1);
});

test('same-previous ticket branches are visible conflicts and block mutation', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  await initSharedStore({
    repository: setup.bob,
    participants: ['alice', 'bob'],
    participant: 'bob',
  });
  const created = await createTicket({
    repository: setup.alice,
    kind: 'feedback',
    title: 'Concurrent decision',
    body: 'This will branch from the same previous event.',
  });
  await syncStore({ repository: setup.bob });
  await closeTicket({
    repository: setup.alice,
    ticketId: created.event.entityId,
    reason: 'cancelled',
    body: 'Requester cancelled concurrently.',
    sync: false,
  });
  await acknowledgeTicket({
    repository: setup.bob,
    ticketId: created.event.entityId,
    sync: false,
  });
  await syncStore({ repository: setup.alice });
  await syncStore({ repository: setup.bob });
  await syncStore({ repository: setup.alice });

  const snapshot = await getSnapshot({ repository: setup.alice });
  assert.equal(snapshot.tickets[0].status, 'open');
  assert.equal(snapshot.conflicts.length, 1);
  assert.equal(snapshot.conflicts[0].entityId, created.event.entityId);
  await assert.rejects(
    closeTicket({
      repository: setup.alice,
      ticketId: created.event.entityId,
      reason: 'cancelled',
      body: 'Cannot mutate a conflicted ticket.',
    }),
    (error) => error.code === 'ENTITY_CONFLICT',
  );
});

test('documented CLI options run the normal two-clone ticket flow', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await duobrain(setup.alice, 'init', '--participants', 'alice,bob', '--participant', 'alice');
  await duobrain(setup.bob, 'init', '--participants', 'alice,bob', '--participant', 'bob');
  const created = await duobrain(
    setup.alice,
    'ticket-create',
    '--kind',
    'information',
    '--title',
    'Export handoff',
    '--body',
    'Share the passing tests and next action.',
    '--actor',
    'ai',
  );
  const ticketId = created.event.entityId;
  await duobrain(setup.bob, 'sync');
  await duobrain(setup.bob, 'ticket-ack', '--ticket', ticketId, '--actor', 'ai');

  const noteId = randomUUID();
  const noteFile = path.join(setup.root, 'handoff-note.md');
  await writeFile(noteFile, structuredNote({ id: noteId, participant: 'bob' }));
  const note = await duobrain(setup.bob, 'note-add', '--file', noteFile);
  await duobrain(
    setup.bob,
    'ticket-respond',
    '--ticket',
    ticketId,
    '--body',
    'CSV passes; the SRT multiline fixture still fails.',
    '--evidence',
    note.path,
    '--actor',
    'ai',
  );
  await duobrain(setup.alice, 'sync');
  await duobrain(
    setup.alice,
    'ticket-resolve',
    '--ticket',
    ticketId,
    '--body',
    'The response and evidence cover the request.',
  );
  const status = await duobrain(setup.alice, 'status');
  assert.equal(status.snapshot.tickets[0].status, 'resolved');
  assert.equal(status.snapshot.tickets[0].history.length, 4);
});

test('getWikiNote returns validated Markdown and rejects unsafe reads', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const initialized = await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  const noteId = randomUUID();
  const markdown = `${structuredNote({ id: noteId, participant: 'alice' })}<script>alert(1)</script>\n`;
  const added = await addWikiNote({ repository: setup.alice, markdown });
  const read = await getWikiNote({ repository: setup.alice, path: added.path });
  assert.deepEqual(read, { path: added.path, markdown, validation: added.validation });
  assert.equal(Object.hasOwn(read, 'html'), false);

  await assert.rejects(
    getWikiNote({ repository: setup.alice, path: '../product.txt' }),
    (error) => error.code === 'INVALID_WIKI_PATH',
  );
  await assert.rejects(
    getWikiNote({ repository: setup.alice, path: `wiki/${randomUUID()}.md` }),
    (error) => error.code === 'WIKI_NOTE_NOT_FOUND',
  );

  const linkedId = randomUUID();
  await symlink(path.join(setup.alice, 'product.txt'), path.join(initialized.storePath, 'wiki', `${linkedId}.md`));
  await assert.rejects(
    getWikiNote({ repository: setup.alice, path: `wiki/${linkedId}.md` }),
    (error) => error.code === 'UNSAFE_WIKI_NOTE',
  );

  const hardLinkedId = randomUUID();
  await link(path.join(setup.alice, 'product.txt'), path.join(initialized.storePath, 'wiki', `${hardLinkedId}.md`));
  await assert.rejects(
    getWikiNote({ repository: setup.alice, path: `wiki/${hardLinkedId}.md` }),
    (error) => error.code === 'UNSAFE_WIKI_NOTE',
  );

  const oversizedId = randomUUID();
  await writeFile(
    path.join(initialized.storePath, 'wiki', `${oversizedId}.md`),
    'x'.repeat((1024 * 1024) + 1),
  );
  await assert.rejects(
    getWikiNote({ repository: setup.alice, path: `wiki/${oversizedId}.md` }),
    (error) => error.code === 'WIKI_NOTE_TOO_LARGE',
  );

  const invalidId = randomUUID();
  const invalidPath = `wiki/${invalidId}.md`;
  await writeFile(
    path.join(initialized.storePath, invalidPath),
    '```duobrain-wiki\n{invalid json}\n```\n',
  );
  const invalid = await getWikiNote({ repository: setup.alice, path: invalidPath });
  assert.equal(invalid.validation.valid, false);
  assert.equal(invalid.validation.errors[0].code, 'INVALID_METADATA_JSON');
});

test('configuration requires exactly two distinct participants', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await assert.rejects(
    initSharedStore({ repository: setup.alice, participants: ['alice'], participant: 'alice' }),
    /Exactly two participant IDs/,
  );
  await assert.rejects(
    initSharedStore({
      repository: setup.alice,
      participants: ['alice', 'alice'],
      participant: 'alice',
    }),
    /must be distinct/,
  );
});

test('CLI exposes top-level and command help', async () => {
  const top = await execFileAsync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
  const command = await execFileAsync(process.execPath, [cliPath, 'start', '--help'], { encoding: 'utf8' });
  const pause = await execFileAsync(process.execPath, [cliPath, 'pause', '--help'], { encoding: 'utf8' });
  const ticket = await execFileAsync(process.execPath, [cliPath, 'ticket-respond', '--help'], { encoding: 'utf8' });
  const note = await execFileAsync(process.execPath, [cliPath, 'note-add', '--help'], { encoding: 'utf8' });
  assert.match(top.stdout, /duobrain init/);
  assert.match(top.stdout, /duobrain status/);
  assert.match(top.stdout, /ticket-needs-information/);
  assert.match(command.stdout, /--title/);
  assert.match(pause.stdout, /--session/);
  assert.match(pause.stdout, /--body/);
  assert.match(ticket.stdout, /--evidence/);
  assert.match(note.stdout, /--file/);
});
