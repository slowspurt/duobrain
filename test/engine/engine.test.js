import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  endSession,
  getSnapshot,
  initSharedStore,
  startSession,
  syncStore,
} from '../../src/engine/index.js';

const execFileAsync = promisify(execFile);

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
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
  const cli = path.resolve('bin/duobrain.js');
  const top = await execFileAsync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  const command = await execFileAsync(process.execPath, [cli, 'start', '--help'], { encoding: 'utf8' });
  assert.match(top.stdout, /duobrain init/);
  assert.match(top.stdout, /duobrain status/);
  assert.match(command.stdout, /--title/);
});
