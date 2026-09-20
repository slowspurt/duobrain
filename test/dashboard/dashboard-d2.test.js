import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { initSharedStore, startSession } from '../../src/engine/index.js';
import {
  filterTickets,
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
  assert.equal(peerConfirmation('answered'), '응답 도착 · 해결 확인 전');
  assert.equal(peerConfirmation('resolved'), '응답과 해결 확인 완료');
  assert.equal(peerConfirmation('closed'), '해결되지 않고 종료');
  assert.equal(wikiValidationPresentation({ valid: true, errors: [], warnings: [] }).kind, 'valid');
  assert.equal(wikiValidationPresentation({ valid: true, errors: [], warnings: [{ code: 'LEGACY' }] }).kind, 'warning');
  assert.equal(wikiValidationPresentation({ valid: false, errors: [{ code: 'INVALID' }], warnings: [] }).kind, 'failure');
});

test('repository source reads a real E1 session snapshot', async (t) => {
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
  await startSession({ repository, title: 'Real engine session', scope: ['src/example'], sync: false });
  const snapshot = await createSnapshotGetter({ repository })();

  assert.equal(snapshot.sample, false);
  assert.deepEqual(snapshot.participants, ['alice', 'bob']);
  assert.equal(snapshot.sessions[0].title, 'Real engine session');
  assert.equal(snapshot.sessions[0].status, 'active');
  assert.equal(snapshot.sessions[0].endedAt, null);
  assert.equal(snapshot.sessions[0].elapsedMs, null);
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
