import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  acknowledgeTicket,
  addWikiNote,
  closeTicket,
  createTicket,
  getSnapshot,
  initSharedStore,
  resolveTicket,
  respondToTicket,
  syncStore,
} from '../../src/engine/index.js';
import { startDashboard } from '../../src/dashboard/index.js';
import { filterTickets, peerConfirmation, ticketEvidence } from '../../src/dashboard/public/model.js';
import { createSnapshotGetter, createWikiNoteGetter } from '../../src/dashboard/source.js';

const execFileAsync = promisify(execFile);

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function twoCloneFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-dashboard-g1-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const alice = path.join(root, 'alice');
  const bob = path.join(root, 'bob');
  await execFileAsync('git', ['init', '--bare', remote]);
  await execFileAsync('git', ['clone', remote, seed]);
  await git(seed, 'config', 'user.name', 'Dashboard G1');
  await git(seed, 'config', 'user.email', 'dashboard-g1@example.invalid');
  await writeFile(path.join(seed, 'product.txt'), 'product\n');
  await git(seed, 'add', '--', 'product.txt');
  await git(seed, 'commit', '-m', 'Initial product');
  await git(seed, 'push', '-u', 'origin', 'HEAD:main');
  await execFileAsync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await execFileAsync('git', ['clone', remote, alice]);
  await execFileAsync('git', ['clone', remote, bob]);
  return { root, alice, bob };
}

function sourceNote(id) {
  const metadata = {
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title: 'Export handoff evidence',
    status: 'personal',
    observedAt: '2026-09-20T01:00:00.000Z',
    author: { participant: 'bob', kind: 'ai' },
    workContext: { promptRef: null, harnessRef: null },
    sources: [{ kind: 'observation', ref: 'dashboard-g1-flow' }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
  };
  return `\`\`\`duobrain-wiki\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\nCSV passes; the SRT multiline fixture still fails.\n\n<script>alert('not executed')</script>\n`;
}

async function launchDashboard(repository) {
  const server = startDashboard({
    getSnapshot: createSnapshotGetter({ repository }),
    getWikiNote: createWikiNoteGetter({ repository }),
    port: 0,
  });
  await once(server, 'listening');
  const address = server.address();
  assert.equal(address.address, '127.0.0.1');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

test('live dashboard preserves the two-clone ticket lifecycle through its API and UI model', async (t) => {
  const setup = await twoCloneFixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({ repository: setup.alice, participants: ['alice', 'bob'], participant: 'alice' });
  await initSharedStore({ repository: setup.bob, participants: ['alice', 'bob'], participant: 'bob' });

  const created = await createTicket({
    repository: setup.alice,
    kind: 'information',
    title: 'Export handoff facts',
    body: 'Share passing tests, remaining failures, and the next action.',
    actorKind: 'ai',
  });
  const ticketId = created.event.entityId;
  await syncStore({ repository: setup.bob });
  await acknowledgeTicket({ repository: setup.bob, ticketId, actorKind: 'ai' });

  const beforeAliceSync = await getSnapshot({ repository: setup.alice });
  assert.equal(beforeAliceSync.sample, false);
  assert.equal(beforeAliceSync.sync.status, 'synced');
  assert.equal(beforeAliceSync.tickets[0].status, 'open');
  assert.equal(peerConfirmation(beforeAliceSync.tickets[0].status), '상대 확인 안 됨');

  const noteId = randomUUID();
  const note = await addWikiNote({ repository: setup.bob, markdown: sourceNote(noteId) });
  await respondToTicket({
    repository: setup.bob,
    ticketId,
    body: 'CSV passes; the SRT multiline fixture still fails.',
    evidence: [note.path],
    actorKind: 'ai',
  });
  await syncStore({ repository: setup.alice });

  const { server, origin } = await launchDashboard(setup.alice);
  t.after(async () => {
    server.close();
    await once(server, 'close');
  });

  let response = await fetch(`${origin}/api/snapshot`);
  assert.equal(response.status, 200);
  let live = await response.json();
  assert.equal(live.sample, false);
  assert.equal(live.sync.status, 'synced');
  assert.equal(live.tickets[0].status, 'answered');
  assert.deepEqual(filterTickets(live.tickets).map((ticket) => ticket.id), [ticketId]);
  assert.deepEqual(filterTickets(live.tickets, { tab: 'history' }), []);
  assert.equal(peerConfirmation(live.tickets[0].status), '응답 도착 · 해결 확인 전');
  assert.deepEqual(ticketEvidence(live.tickets[0]), [note.path]);

  const answeredHistory = live.tickets[0].history;
  assert.deepEqual(answeredHistory.map((event) => event.type), [
    'ticket.created',
    'ticket.acknowledged',
    'ticket.responded',
  ]);
  assert.deepEqual(answeredHistory.map((event) => event.actor.participant), ['alice', 'bob', 'bob']);
  assert.equal(answeredHistory[2].actor.kind, 'ai');
  assert.equal(answeredHistory[2].data.body, 'CSV passes; the SRT multiline fixture still fails.');
  assert.deepEqual(answeredHistory[2].data.evidence, [note.path]);

  response = await fetch(`${origin}/api/wiki?path=${encodeURIComponent(note.path)}`);
  assert.equal(response.status, 200);
  const evidence = await response.json();
  assert.equal(evidence.path, note.path);
  assert.equal(evidence.validation.valid, true);
  assert.match(evidence.markdown, /<script>alert\('not executed'\)<\/script>/);

  await resolveTicket({
    repository: setup.alice,
    ticketId,
    body: 'The response and evidence cover the requested handoff facts.',
  });
  const closed = await createTicket({
    repository: setup.alice,
    kind: 'information',
    title: 'Obsolete duplicate',
    body: 'This request is no longer needed.',
  });
  await closeTicket({
    repository: setup.alice,
    ticketId: closed.event.entityId,
    reason: 'duplicate',
    body: 'The resolved handoff ticket covers this question.',
  });

  response = await fetch(`${origin}/api/snapshot`);
  live = await response.json();
  assert.deepEqual(filterTickets(live.tickets), []);
  assert.deepEqual(
    filterTickets(live.tickets, { tab: 'history' }).map((ticket) => ticket.status).sort(),
    ['closed', 'resolved'],
  );

  const resolved = live.tickets.find((ticket) => ticket.id === ticketId);
  assert.equal(resolved.history.at(-1).type, 'ticket.resolved');
  assert.equal(resolved.history.at(-1).actor.participant, 'alice');
  assert.equal(resolved.history.at(-1).data.body, 'The response and evidence cover the requested handoff facts.');
  assert.deepEqual(ticketEvidence(resolved), [note.path]);

  const closedTicket = live.tickets.find((ticket) => ticket.id === closed.event.entityId);
  assert.equal(closedTicket.status, 'closed');
  assert.equal(closedTicket.history.at(-1).data.reason, 'duplicate');
  assert.equal(peerConfirmation(closedTicket.status), '해결되지 않고 종료');
});
