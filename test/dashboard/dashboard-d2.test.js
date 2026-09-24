import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  endSession,
  initSharedStore,
  pauseSession,
  resumeSession,
  setPlan,
  startSession,
  updateSessionScope,
} from '../../src/engine/index.js';
import { startDashboard } from '../../src/dashboard/index.js';
import {
  aggregateSessions,
  filterTickets,
  planPresentation,
  peerConfirmation,
  ticketEvidence,
  wikiValidationPresentation,
} from '../../src/dashboard/public/model.js';
import { createSnapshotGetter } from '../../src/dashboard/source.js';

const execFileAsync = promisify(execFile);
const ticketFixture = new URL('./fixtures/ticket-snapshot.json', import.meta.url);

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

test('ticket model separates inbox, answered, resolved, and closed records', async () => {
  const snapshot = JSON.parse(await readFile(ticketFixture, 'utf8'));
  assert.deepEqual(filterTickets(snapshot.tickets).map((ticket) => ticket.status), ['open', 'answered']);
  assert.deepEqual(filterTickets(snapshot.tickets, { tab: 'history' }).map((ticket) => ticket.status), ['resolved', 'closed']);
  assert.deepEqual(filterTickets(snapshot.tickets, { tab: 'inbox', status: 'answered' }).map((ticket) => ticket.id), ['20000000-0000-4000-8000-000000000002']);
  assert.deepEqual(filterTickets(snapshot.tickets, { tab: 'history', kind: 'feedback', peer: 'participant-b' }).map((ticket) => ticket.status), ['resolved']);
  assert.deepEqual(filterTickets(snapshot.tickets, { query: '30000000-0000' }).map((ticket) => ticket.status), ['answered']);
  assert.deepEqual(ticketEvidence(snapshot.tickets[1]), ['wiki/30000000-0000-4000-8000-000000000001.md']);
  assert.equal(peerConfirmation('answered'), 'answered_unresolved');
  assert.equal(peerConfirmation('resolved'), 'resolved');
  assert.equal(peerConfirmation('closed'), 'closed_unresolved');
  assert.equal(wikiValidationPresentation({ valid: true, errors: [], warnings: [] }).kind, 'valid');
  assert.equal(wikiValidationPresentation({ valid: true, errors: [], warnings: [{ code: 'LEGACY' }] }).kind, 'warning');
  assert.equal(wikiValidationPresentation({ valid: false, errors: [{ code: 'INVALID' }], warnings: [] }).kind, 'failure');
});

test('live API exposes a real E4 plan and scope-updated session to the dashboard model', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-dashboard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const repository = path.join(root, 'product');
  await execFileAsync('git', ['init', '--bare', remote]);
  await execFileAsync('git', ['clone', remote, seed]);
  await git(seed, 'config', 'user.name', 'Dashboard Test');
  await git(seed, 'config', 'user.email', 'dashboard@example.invalid');
  await writeFile(path.join(seed, 'product.txt'), 'product\n');
  await git(seed, 'add', '--', 'product.txt');
  await git(seed, 'commit', '-m', 'Initial product');
  await git(seed, 'push', '-u', 'origin', 'HEAD:main');
  await execFileAsync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await execFileAsync('git', ['clone', remote, repository]);

  await initSharedStore({ repository, participants: ['alice', 'bob'], participant: 'alice' });
  await setPlan({
    repository,
    plan: {
      goals: { project: 'Ship safely', mediumTerm: 'Verify E4', currentPhase: 'Connect dashboard' },
      assignments: [
        { participant: 'alice', scope: ['src/dashboard'], next: 'Verify scope timing' },
        { participant: 'bob', scope: ['src/engine'], next: 'Review projection' },
      ],
      status: 'proposed',
      evidence: [],
      body: 'Explicit E4 dashboard integration plan.',
    },
  });
  const started = await startSession({
    repository,
    title: 'Real engine session',
    scope: ['src/old'],
    goal: 'Old goal',
    branch: 'feature/old',
    baseCommit: 'base-old',
  });
  const sessionId = started.event.entityId;
  await pauseSession({ repository, sessionId, body: 'Changing the safe boundary.' });
  await updateSessionScope({
    repository,
    sessionId,
    scope: ['src/new'],
    reason: 'Move to the independent boundary.',
    goal: null,
    branch: null,
  });
  await resumeSession({ repository, sessionId, body: 'Continue with the new boundary.' });
  await endSession({ repository, sessionId, summary: 'Scope transition verified.', blockers: ['Recorded blocker'], next: 'Review dashboard' });

  const server = startDashboard({ getSnapshot: createSnapshotGetter({ repository }), port: 0 });
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
  });
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/snapshot`);
  assert.equal(response.status, 200);
  const snapshot = await response.json();

  assert.equal(snapshot.sample, false);
  assert.deepEqual(snapshot.participants, ['alice', 'bob']);
  assert.equal(planPresentation(snapshot).state, 'proposed');
  assert.equal(snapshot.plan.assignments[0].next, 'Verify scope timing');
  assert.equal(snapshot.plan.history[0].data.body, 'Explicit E4 dashboard integration plan.');
  assert.equal(snapshot.sessions[0].title, 'Real engine session');
  assert.equal(snapshot.sessions[0].status, 'ended');
  assert.deepEqual(snapshot.sessions[0].scope, ['src/new']);
  assert.equal(snapshot.sessions[0].goal, null);
  assert.equal(snapshot.sessions[0].branch, null);
  assert.equal(snapshot.sessions[0].baseCommit, 'base-old');
  assert.deepEqual(snapshot.sessions[0].history.map((event) => event.type), [
    'session.started',
    'session.paused',
    'session.scope_updated',
    'session.resumed',
    'session.ended',
  ]);
  const aggregate = aggregateSessions(snapshot.sessions, { conflicts: snapshot.conflicts });
  assert.equal(aggregate.sessions[0].timeStatus, 'known');
  assert.equal(aggregate.sessions[0].branch, null);
  assert.equal(aggregate.sessions[0].baseCommit, 'base-old');
  assert.deepEqual(aggregate.sessions[0].scopeChanges.map((change) => change.reason), ['Move to the independent boundary.']);
  assert.deepEqual(aggregate.scopeTotals.map((item) => item.scope).sort(), ['src/new', 'src/old']);
  assert.deepEqual(snapshot.tickets, []);
});

test('dashboard entrypoint documents the explicit repository option', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['src/dashboard/run.js', '--help'], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
  });
  assert.match(stdout, /--repository <path>/);
  assert.match(stdout, /real isolated duobrain store/);
});
