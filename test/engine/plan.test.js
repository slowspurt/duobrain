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
  getSnapshot,
  initSharedStore,
  setPlan,
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
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-plan-'));
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

function planData({
  project = 'Ship the first collaborative flow',
  phase = 'Connect plan projection',
  status,
  evidence = [],
  body = 'Explicit plan revision prepared by the collaborators.',
} = {}) {
  return {
    goals: {
      project,
      mediumTerm: 'Verify shared planning in two clones',
      currentPhase: phase,
    },
    assignments: [
      { participant: 'alice', scope: ['src/ui'], next: 'Connect the plan view' },
      { participant: 'bob', scope: ['src/engine'], next: 'Verify immutable history' },
    ],
    ...(status === undefined ? {} : { status }),
    evidence,
    body,
  };
}

function humanNote(id, participant) {
  const metadata = {
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title: `${participant} plan confirmation`,
    status: 'personal',
    observedAt: '2026-09-20T03:00:00.000Z',
    author: { participant, kind: 'human' },
    workContext: { promptRef: null, harnessRef: null },
    sources: [{ kind: 'observation', ref: `${participant}-explicit-plan-confirmation` }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
  };
  return `\`\`\`duobrain-wiki\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\n${participant} explicitly confirmed this exact plan revision.\n`;
}

test('two clones exchange plan revisions and agreed status requires both human sources', async (t) => {
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

  await setPlan({ repository: setup.alice, plan: planData(), actorKind: 'ai' });
  await syncStore({ repository: setup.bob });
  let snapshot = await getSnapshot({ repository: setup.bob });
  assert.equal(snapshot.plan.status, 'proposed');
  assert.equal(snapshot.goals.currentPhase, 'Connect plan projection');

  const cliPlanPath = path.join(setup.root, 'plan.json');
  await writeFile(cliPlanPath, JSON.stringify(planData({ phase: 'Verify the CLI plan update' })));
  await duobrain(setup.bob, 'plan-set', '--file', cliPlanPath, '--actor', 'human');
  await syncStore({ repository: setup.alice });
  assert.equal((await getSnapshot({ repository: setup.alice })).goals.currentPhase, 'Verify the CLI plan update');

  const aliceNote = await addWikiNote({
    repository: setup.alice,
    markdown: humanNote(randomUUID(), 'alice'),
  });
  await syncStore({ repository: setup.bob });
  const bobNote = await addWikiNote({
    repository: setup.bob,
    markdown: humanNote(randomUUID(), 'bob'),
  });
  await syncStore({ repository: setup.alice });
  await assert.rejects(
    setPlan({
      repository: setup.alice,
      plan: planData({ status: 'agreed', evidence: [aliceNote.path] }),
    }),
    (error) => error.code === 'PLAN_AGREEMENT_EVIDENCE_REQUIRED',
  );

  await setPlan({
    repository: setup.alice,
    plan: planData({
      phase: 'Execute the human-confirmed plan',
      status: 'agreed',
      evidence: [aliceNote.path, bobNote.path],
      body: 'Both human-attributed notes were reviewed before recording this revision.',
    }),
    actorKind: 'ai',
  });
  await syncStore({ repository: setup.bob });
  snapshot = await getSnapshot({ repository: setup.bob });
  assert.equal(snapshot.plan.status, 'agreed');
  assert.equal(snapshot.plan.history.length, 3);
  assert.deepEqual(snapshot.goals, snapshot.plan.goals);
  assert.deepEqual(snapshot.plan.evidence, [aliceNote.path, bobNote.path]);
});

test('concurrent independent plan roots remain conflicts with unknown goals', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({ repository: setup.alice, participants: ['alice', 'bob'], participant: 'alice' });
  await initSharedStore({ repository: setup.bob, participants: ['alice', 'bob'], participant: 'bob' });
  await setPlan({ repository: setup.alice, plan: planData({ phase: 'Alice root' }), sync: false });
  await setPlan({ repository: setup.bob, plan: planData({ phase: 'Bob root' }), sync: false });
  await syncStore({ repository: setup.alice });
  await syncStore({ repository: setup.bob });
  await syncStore({ repository: setup.alice });
  const snapshot = await getSnapshot({ repository: setup.alice });
  assert.equal(snapshot.plan, null);
  assert.deepEqual(snapshot.goals, { project: null, mediumTerm: null, currentPhase: null });
  assert.equal(snapshot.conflicts[0].candidateEntityIds.length, 2);
  await assert.rejects(
    setPlan({ repository: setup.alice, plan: planData() }),
    (error) => error.code === 'PLAN_CONFLICT',
  );
});

test('concurrent plan updates sharing one predecessor remain conflicts', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({ repository: setup.alice, participants: ['alice', 'bob'], participant: 'alice' });
  await initSharedStore({ repository: setup.bob, participants: ['alice', 'bob'], participant: 'bob' });
  const created = await setPlan({ repository: setup.alice, plan: planData() });
  await syncStore({ repository: setup.bob });
  await setPlan({ repository: setup.alice, plan: planData({ phase: 'Alice update' }), sync: false });
  await setPlan({ repository: setup.bob, plan: planData({ phase: 'Bob update' }), sync: false });
  await syncStore({ repository: setup.alice });
  await syncStore({ repository: setup.bob });
  await syncStore({ repository: setup.alice });
  const snapshot = await getSnapshot({ repository: setup.alice });
  assert.equal(snapshot.plan, null);
  assert.equal(snapshot.conflicts[0].eventIds.length, 2);
  assert.equal(snapshot.conflicts[0].previous, created.event.id);
});

test('invalid remote actor metadata never becomes a projected plan fact', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const initialized = await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  const created = await setPlan({ repository: setup.alice, plan: planData(), sync: false });
  const invalid = {
    schemaVersion: 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    actor: { participant: 'mallory', kind: 'human' },
    entityId: created.event.entityId,
    type: 'plan.updated',
    previous: created.event.id,
    data: planData({ phase: 'Injected invalid plan' }),
  };
  const relative = `events/${invalid.id}.json`;
  await writeFile(path.join(initialized.storePath, relative), `${JSON.stringify(invalid, null, 2)}\n`);
  await git(initialized.storePath, 'add', '--', relative);
  await git(initialized.storePath, 'commit', '-m', 'Inject invalid remote plan event');

  const snapshot = await getSnapshot({ repository: setup.alice });
  assert.equal(snapshot.plan, null);
  assert.deepEqual(snapshot.goals, { project: null, mediumTerm: null, currentPhase: null });
  assert.match(snapshot.conflicts[0].message, /Invalid plan history/);
  await assert.rejects(
    setPlan({ repository: setup.alice, plan: planData() }),
    (error) => error.code === 'PLAN_CONFLICT',
  );
});
