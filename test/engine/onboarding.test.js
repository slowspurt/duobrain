import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  detectGithubAccount,
  getSnapshot,
  initSharedStore,
  inspectOnboarding,
  saveOnboardingProgress,
  setDashboardLocale,
  setParticipantProfile,
  setPlan,
  syncStore,
} from '../../src/engine/index.js';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('bin/duobrain.js');

async function duobrain(repository, ...args) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, ...args, '--repository', repository],
    { encoding: 'utf8' },
  );
  return JSON.parse(stdout);
}

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-onboarding-'));
  const remote = path.join(root, 'product.git');
  const seed = path.join(root, 'seed');
  const alice = path.join(root, 'alice');
  const bob = path.join(root, 'bob');
  await execFileAsync('git', ['init', '--bare', remote]);
  await execFileAsync('git', ['clone', remote, seed]);
  await git(seed, 'config', 'user.name', 'Test');
  await git(seed, 'config', 'user.email', 'test@example.invalid');
  await writeFile(path.join(seed, 'README.md'), '# Existing product\n');
  await writeFile(path.join(seed, 'planning.md'), '# Current plan\n');
  await git(seed, 'add', '--', 'README.md', 'planning.md');
  await git(seed, 'commit', '-m', 'Initial product');
  await git(seed, 'push', '-u', 'origin', 'HEAD:main');
  await execFileAsync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await execFileAsync('git', ['clone', remote, alice]);
  await execFileAsync('git', ['clone', remote, bob]);
  return { root, alice, bob };
}

function progress(overrides = {}) {
  return {
    mode: 'existing-project',
    projectKind: 'existing',
    projectEvidence: [
      { source: 'planning.md', fact: 'The document describes the current milestone.' },
    ],
    identity: { status: 'explicit', githubLogin: 'alice-gh' },
    context: {
      sources: ['README.md', 'planning.md'],
      summary: 'The product has an existing milestone and role split.',
      missingFacts: [],
    },
    planReviewed: false,
    roleReviewed: false,
    ...overrides,
  };
}

test('onboarding inspection stays evidence-neutral before the user AI assesses the project', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));

  const inspected = await inspectOnboarding({ repository: setup.alice });
  assert.equal(inspected.initialized, false);
  assert.equal(inspected.projectKindProposal, 'undetermined');
  assert.equal(inspected.nextStage, 'assess-project');
  assert.deepEqual(inspected.repository.contextCandidates, ['README.md', 'planning.md']);
  assert.equal(inspected.repository.commitCount, 1);

  const saved = await saveOnboardingProgress({ repository: setup.alice, progress: progress() });
  assert.equal(saved.progress.projectKind, 'existing');
  assert.equal(saved.nextStage, 'initialize');

  await assert.rejects(
    saveOnboardingProgress({
      repository: setup.bob,
      progress: progress({ projectEvidence: [] }),
    }),
    (error) => error.code === 'INVALID_ONBOARDING',
  );
});

test('onboarding resumes through profile, plan review and ready without rewriting participant IDs', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));

  await saveOnboardingProgress({ repository: setup.alice, progress: progress() });
  await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  let inspected = await inspectOnboarding({ repository: setup.alice });
  assert.equal(inspected.nextStage, 'profile');

  await setParticipantProfile({
    repository: setup.alice,
    nickname: 'Ali',
    githubLogin: 'alice-gh',
    actorKind: 'ai',
  });
  inspected = await inspectOnboarding({ repository: setup.alice });
  assert.equal(inspected.nextStage, 'review-plan');

  await setPlan({
    repository: setup.alice,
    actorKind: 'ai',
    plan: {
      goals: { project: 'Ship the product', mediumTerm: 'Finish the milestone', currentPhase: 'Integrate' },
      assignments: [
        { participant: 'alice', scope: ['src/ui'], next: 'Connect the UI' },
        { participant: 'bob', scope: ['src/api'], next: 'Confirm the API' },
      ],
      status: 'proposed',
      evidence: [],
      body: 'Grounded revision for review.',
    },
    sync: false,
  });
  inspected = await saveOnboardingProgress({
    repository: setup.alice,
    progress: { planReviewed: true },
  });
  assert.equal(inspected.nextStage, 'sync');
  await syncStore({ repository: setup.alice });
  inspected = await inspectOnboarding({ repository: setup.alice });
  assert.equal(inspected.ready, true);
  assert.equal(inspected.participant, 'alice');
  assert.equal(inspected.local.profile.nickname, 'Ali');
});

test('init recovers a missing local identity after an interrupted initialization', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await saveOnboardingProgress({ repository: setup.alice, progress: progress() });
  const initialized = await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  await unlink(path.join(path.dirname(initialized.storePath), 'identity.json'));

  const interrupted = await inspectOnboarding({ repository: setup.alice });
  assert.equal(interrupted.initialized, true);
  assert.equal(interrupted.identityAvailable, false);
  assert.equal(interrupted.nextStage, 'initialize');

  const recovered = await initSharedStore({
    repository: setup.alice,
    participants: ['alice', 'bob'],
    participant: 'alice',
  });
  assert.equal(recovered.recoveredIdentity, true);
  assert.equal((await inspectOnboarding({ repository: setup.alice })).nextStage, 'profile');
});

test('nickname history is shared while dashboard locale remains local', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({ repository: setup.alice, participants: ['alice', 'bob'], participant: 'alice' });
  await initSharedStore({ repository: setup.bob, participants: ['alice', 'bob'], participant: 'bob' });

  await setParticipantProfile({ repository: setup.alice, githubLogin: 'alice-gh' });
  await setParticipantProfile({ repository: setup.alice, nickname: 'Ali' });
  await syncStore({ repository: setup.bob });
  const bobView = await getSnapshot({ repository: setup.bob });
  const aliceProfile = bobView.profiles.find((item) => item.participant === 'alice');
  assert.equal(aliceProfile.nickname, 'Ali');
  assert.equal(aliceProfile.githubLogin, 'alice-gh');
  assert.equal(aliceProfile.history.length, 2);

  await setDashboardLocale({ repository: setup.alice, locale: 'ko-KR' });
  assert.equal((await getSnapshot({ repository: setup.alice })).localPreferences.dashboardLocale, 'ko-KR');
  assert.equal((await getSnapshot({ repository: setup.bob })).localPreferences.dashboardLocale, 'system');
});

test('join mode is proposed from remote shared state and requires role review', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({ repository: setup.alice, participants: ['alice', 'bob'], participant: 'alice' });
  await setPlan({
    repository: setup.alice,
    actorKind: 'ai',
    plan: {
      goals: { project: 'Ship the product', mediumTerm: 'Finish the milestone', currentPhase: 'Integrate' },
      assignments: [
        { participant: 'alice', scope: ['src/ui'], next: 'Connect the UI' },
        { participant: 'bob', scope: ['src/api'], next: 'Confirm the API' },
      ],
      status: 'proposed',
      evidence: [],
      body: 'Existing shared plan.',
    },
  });
  const beforeJoin = await inspectOnboarding({ repository: setup.bob });
  assert.equal(beforeJoin.suggestedMode, 'join-existing');

  await saveOnboardingProgress({
    repository: setup.bob,
    progress: progress({
      mode: 'join-existing',
      identity: { status: 'explicit', githubLogin: 'bob-gh' },
      planReviewed: false,
      roleReviewed: false,
    }),
  });
  await initSharedStore({ repository: setup.bob, participants: ['alice', 'bob'], participant: 'bob' });
  await setParticipantProfile({ repository: setup.bob, nickname: 'Bob', githubLogin: 'bob-gh' });
  let inspected = await inspectOnboarding({ repository: setup.bob });
  assert.equal(inspected.nextStage, 'review-role');

  inspected = await saveOnboardingProgress({ repository: setup.bob, progress: { roleReviewed: true } });
  assert.equal(inspected.nextStage, 'ready');
});

test('GitHub detection accepts only the authenticated account command result', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-gh-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'fake-gh');
  await writeFile(executable, '#!/bin/sh\nprintf authenticated-user\n');
  await chmod(executable, 0o755);
  assert.deepEqual(await detectGithubAccount({ executable }), {
    provider: 'github',
    status: 'confirmed',
    login: 'authenticated-user',
    source: 'gh-api-user',
  });
  assert.equal((await detectGithubAccount({ executable: path.join(root, 'missing-gh') })).status, 'unavailable');
});

test('onboarding CLI exposes resumable entry points', async () => {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
  assert.match(stdout, /onboarding-inspect/);
  assert.match(stdout, /onboarding-save/);
  assert.match(stdout, /profile-set/);
  assert.match(stdout, /dashboard-locale-set/);
  assert.match(stdout, /account-detect/);
});

test('onboarding CLI saves progress, defaults profile nickname, and keeps locale local', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const progressFile = path.join(setup.root, 'onboarding.json');
  await writeFile(progressFile, `${JSON.stringify(progress(), null, 2)}\n`);

  assert.equal((await duobrain(setup.alice, 'onboarding-inspect')).nextStage, 'assess-project');
  assert.equal(
    (await duobrain(setup.alice, 'onboarding-save', '--file', progressFile)).nextStage,
    'initialize',
  );
  await duobrain(setup.alice, 'init', '--participants', 'alice,bob', '--participant', 'alice');
  await duobrain(setup.alice, 'profile-set', '--github-login', 'alice-gh', '--actor', 'ai');
  await duobrain(setup.alice, 'dashboard-locale-set', '--locale', 'en');

  const status = await duobrain(setup.alice, 'status');
  assert.equal(status.snapshot.profiles[0].nickname, 'alice-gh');
  assert.equal(status.snapshot.localPreferences.dashboardLocale, 'en');
});

test('a changed plan requires a fresh local review for both initial and joining participants', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  await initSharedStore({ repository: setup.alice, participants: ['alice', 'bob'], participant: 'alice' });
  await initSharedStore({ repository: setup.bob, participants: ['alice', 'bob'], participant: 'bob' });
  for (const repository of [setup.alice, setup.bob]) {
    await setParticipantProfile({ repository });
  }
  const plan = {
    goals: { project: 'Ship', mediumTerm: 'Connect', currentPhase: 'First scope' },
    assignments: [
      { participant: 'alice', scope: ['src/ui'], next: 'Build the UI' },
      { participant: 'bob', scope: ['src/api'], next: 'Build the API' },
    ],
    status: 'proposed', evidence: [], body: 'Initial plan for local review.',
  };
  await setPlan({ repository: setup.alice, plan });
  await syncStore({ repository: setup.bob });
  await saveOnboardingProgress({ repository: setup.alice, progress: progress({ planReviewed: true }) });
  await saveOnboardingProgress({ repository: setup.bob, progress: progress({ mode: 'join-existing', roleReviewed: true }) });
  assert.equal((await inspectOnboarding({ repository: setup.alice })).ready, true);
  assert.equal((await inspectOnboarding({ repository: setup.bob })).ready, true);

  await setPlan({ repository: setup.alice, plan: { ...plan, body: 'Revised scope for review.' } });
  await syncStore({ repository: setup.bob });
  // Unrelated checkpoint writes must not silently approve the new revision.
  await saveOnboardingProgress({ repository: setup.alice, progress: { context: { summary: 'Resuming work.' } } });
  assert.equal((await inspectOnboarding({ repository: setup.alice })).nextStage, 'review-plan');
  assert.equal((await inspectOnboarding({ repository: setup.bob })).nextStage, 'review-role');
  await saveOnboardingProgress({ repository: setup.alice, progress: { planReviewed: true } });
  await saveOnboardingProgress({ repository: setup.bob, progress: { roleReviewed: true } });
  assert.equal((await inspectOnboarding({ repository: setup.alice })).ready, true);
  assert.equal((await inspectOnboarding({ repository: setup.bob })).ready, true);
  assert.equal((await getSnapshot({ repository: setup.alice })).plan.status, 'proposed');
});

test('first-run inspection supports a new Git project before its first commit', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-empty-project-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await execFileAsync('git', ['init', root]);
  const inspected = await inspectOnboarding({ repository: root });
  assert.equal(inspected.repository.head, null);
  assert.equal(inspected.repository.commitCount, 0);
  assert.equal(inspected.projectKindProposal, 'undetermined');
  assert.equal(inspected.nextStage, 'assess-project');
  const saved = await saveOnboardingProgress({
    repository: root,
    progress: progress({ mode: 'new-project', projectKind: 'new', projectEvidence: [] }),
  });
  assert.equal(saved.nextStage, 'initialize');
});
