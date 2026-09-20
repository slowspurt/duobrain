#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  assessOverlap,
  endSession,
  getSnapshot,
  initSharedStore,
  pauseSession,
  prepareProductWorktree,
  resumeSession,
  startSession,
  syncStore,
} from '../../src/engine/index.js';
import { compareKnowledgeMethods, renderWikiNote } from '../../src/wiki/index.js';

const execFileAsync = promisify(execFile);
const participants = ['participant-a', 'participant-b'];

async function git(repository, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
  });
  return stdout.trim();
}

async function createTwoCloneFixture(root) {
  const remote = path.join(root, 'product.git');
  const seed = path.join(root, 'seed');
  const a = path.join(root, 'participant-a');
  const b = path.join(root, 'participant-b');

  await execFileAsync('git', ['init', '--bare', remote]);
  await execFileAsync('git', ['clone', remote, seed]);
  await git(seed, 'config', 'user.name', 'Scenario Seed');
  await git(seed, 'config', 'user.email', 'scenario@example.invalid');
  await writeFile(path.join(seed, 'product.txt'), 'shared product baseline\n');
  await git(seed, 'add', '--', 'product.txt');
  await git(seed, 'commit', '-m', 'Create temporary product baseline');
  await git(seed, 'push', '-u', 'origin', 'HEAD:main');
  await execFileAsync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await execFileAsync('git', ['clone', remote, a]);
  await execFileAsync('git', ['clone', remote, b]);

  return { remote, a, b };
}

function comparisonNote({ id, participant, title, promptRef, harnessRef }) {
  const notePath = `wiki/${id}.md`;
  const metadata = {
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title,
    status: 'personal',
    observedAt: '2026-09-20T09:00:00.000Z',
    author: { participant, kind: 'ai' },
    workContext: { promptRef, harnessRef },
    sources: [{ kind: 'observation', ref: `${participant}:captured-method` }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
  };
  return {
    path: notePath,
    markdown: renderWikiNote(metadata, `# ${title}\n\nSynthetic comparison evidence.`),
  };
}

function runW3Comparisons() {
  const leftId = '51000000-0000-4000-8000-000000000001';
  const rightId = '51000000-0000-4000-8000-000000000002';
  const left = comparisonNote({
    id: leftId,
    participant: 'participant-a',
    title: 'Participant A export method',
    promptRef: 'prompt:export-a',
    harnessRef: 'harness:export-1.8',
  });
  const right = comparisonNote({
    id: rightId,
    participant: 'participant-b',
    title: 'Participant B export method',
    promptRef: 'prompt:export-b',
    harnessRef: 'harness:export-2.1',
  });
  const input = {
    notes: [left, right],
    left: {
      label: 'A export method',
      participant: 'participant-a',
      workRef: 'session:a-export',
      noteRefs: [left.path],
    },
    right: {
      label: 'B export method',
      participant: 'participant-b',
      workRef: 'session:b-export',
      noteRefs: [right.path],
    },
  };
  const versionedReferences = [
    { ref: 'prompt:export-a', kind: 'prompt', version: '4' },
    { ref: 'prompt:export-b', kind: 'prompt', version: '3' },
    { ref: 'harness:export-1.8', kind: 'harness', version: '1.8' },
    { ref: 'harness:export-2.1', kind: 'harness', version: '2.1' },
  ];
  const referenceOnly = compareKnowledgeMethods({ ...input, artifacts: versionedReferences });
  assert.equal(referenceOnly.comparisons.prompt.relation, 'different-reference');
  assert.equal(referenceOnly.comparisons.harness.relation, 'different-reference');
  assert.equal(referenceOnly.comparisons.prompt.textComparison.available, false);
  assert.equal(referenceOnly.comparisons.harness.textComparison.available, false);
  assert.equal(referenceOnly.causalConclusion.supported, false);
  assert.equal(referenceOnly.ticketCandidate.kind, 'information');
  assert.ok(referenceOnly.ticketCandidate.requestedFields.includes('promptText'));
  assert.ok(referenceOnly.ticketCandidate.requestedFields.includes('harnessText'));

  const capturedText = compareKnowledgeMethods({
    ...input,
    artifacts: versionedReferences.map((artifact) => ({
      ...artifact,
      text: artifact.kind === 'prompt'
        ? (artifact.ref.endsWith('-a') ? 'Return CSV rows.' : 'Preserve multiline SRT cues.')
        : (artifact.ref.endsWith('1.8') ? 'fixture: csv-only' : 'fixture: csv-and-srt'),
    })),
  });
  assert.equal(capturedText.complete, true);
  assert.equal(capturedText.ticketCandidate, null);
  assert.equal(capturedText.comparisons.prompt.textComparison.available, true);
  assert.equal(capturedText.comparisons.harness.textComparison.available, true);
  assert.deepEqual(
    capturedText.comparisons.prompt.textComparison.leftChangedExcerpt,
    ['Return CSV rows.'],
  );
  assert.deepEqual(
    capturedText.comparisons.prompt.textComparison.rightChangedExcerpt,
    ['Preserve multiline SRT cues.'],
  );
  assert.equal(capturedText.causalConclusion.supported, false);

  return {
    referenceOnly: {
      promptRelation: referenceOnly.comparisons.prompt.relation,
      harnessRelation: referenceOnly.comparisons.harness.relation,
      textComparisonAvailable: false,
      requestedFields: referenceOnly.ticketCandidate.requestedFields,
      causalConclusionSupported: referenceOnly.causalConclusion.supported,
    },
    capturedText: {
      promptRelation: capturedText.comparisons.prompt.relation,
      harnessRelation: capturedText.comparisons.harness.relation,
      textComparisonAvailable: true,
      promptChangedExcerpts: {
        left: capturedText.comparisons.prompt.textComparison.leftChangedExcerpt,
        right: capturedText.comparisons.prompt.textComparison.rightChangedExcerpt,
      },
      causalConclusionSupported: capturedText.causalConclusion.supported,
    },
  };
}

async function run() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-g2-'));
  try {
    const fixture = await createTwoCloneFixture(root);
    await initSharedStore({ repository: fixture.a, participants, participant: 'participant-a' });
    await initSharedStore({ repository: fixture.b, participants, participant: 'participant-b' });

    const sharedBase = await git(fixture.b, 'rev-parse', 'HEAD');
    const bStarted = await startSession({
      repository: fixture.b,
      title: 'SRT export parser',
      scope: ['src/export'],
      goal: 'Define the empty-result parser behavior.',
      branch: 'codex/export-parser',
      baseCommit: sharedBase,
      actorKind: 'ai',
    });
    assert.equal(bStarted.sync.status, 'synced');

    const aSync = await syncStore({ repository: fixture.a });
    assert.equal(aSync.status, 'synced');

    await writeFile(path.join(fixture.a, 'product.txt'), 'staged product work\n');
    await git(fixture.a, 'add', '--', 'product.txt');
    await writeFile(path.join(fixture.a, 'product.txt'), 'staged plus unstaged product work\n');
    const sourceBefore = {
      head: await git(fixture.a, 'rev-parse', 'HEAD'),
      branch: await git(fixture.a, 'branch', '--show-current'),
      status: await git(fixture.a, 'status', '--porcelain=v1'),
      staged: await git(fixture.a, 'diff', '--cached', '--', 'product.txt'),
      contents: await readFile(path.join(fixture.a, 'product.txt'), 'utf8'),
    };

    const overlap = await assessOverlap({
      repository: fixture.a,
      scope: ['src/export/empty-state.tsx'],
      baseCommit: 'HEAD',
    });
    assert.equal(overlap.pathAssessment.status, 'overlap');
    assert.equal(overlap.semanticAssessment.status, 'unknown');
    assert.equal(overlap.comparedSessions[0].endKnown, false);
    assert.ok(overlap.unknowns.includes('peer_live_presence_unknown'));
    assert.ok(overlap.unknowns.includes('peer_unpushed_product_changes_unknown'));

    const worktreeDirectory = path.join(root, 'participant-a-worktree');
    const prepared = await prepareProductWorktree({
      repository: fixture.a,
      directory: worktreeDirectory,
      branch: 'codex/g2-empty-state',
      baseCommit: 'HEAD',
    });
    assert.equal(prepared.sourceCheckoutPreserved, true);
    assert.equal(prepared.uncommittedChangesCopied, false);
    assert.equal(prepared.automaticIntegration, false);
    assert.equal(await git(fixture.a, 'rev-parse', 'HEAD'), sourceBefore.head);
    assert.equal(await git(fixture.a, 'branch', '--show-current'), sourceBefore.branch);
    assert.equal(await git(fixture.a, 'status', '--porcelain=v1'), sourceBefore.status);
    assert.equal(await git(fixture.a, 'diff', '--cached', '--', 'product.txt'), sourceBefore.staged);
    assert.equal(await readFile(path.join(fixture.a, 'product.txt'), 'utf8'), sourceBefore.contents);
    assert.equal(await readFile(path.join(worktreeDirectory, 'product.txt'), 'utf8'), 'shared product baseline\n');

    const aStarted = await startSession({
      repository: worktreeDirectory,
      title: 'Empty export state',
      scope: ['src/export/empty-state.tsx'],
      goal: 'Implement copy and display state without changing the parser contract.',
      branch: prepared.branch,
      baseCommit: prepared.baseCommit,
      actorKind: 'ai',
    });
    assert.equal(aStarted.sync.status, 'synced');
    const aSessionId = aStarted.event.entityId;
    const paused = await pauseSession({
      repository: worktreeDirectory,
      sessionId: aSessionId,
      body: 'Waiting for the empty-result contract evidence.',
      actorKind: 'ai',
    });
    assert.equal(paused.sync.status, 'synced');
    assert.equal(
      (await getSnapshot({ repository: worktreeDirectory })).sessions
        .find(({ id }) => id === aSessionId).status,
      'paused',
    );
    const resumed = await resumeSession({
      repository: worktreeDirectory,
      sessionId: aSessionId,
      body: 'Continuing with copy and display state only.',
      actorKind: 'ai',
    });
    assert.equal(resumed.sync.status, 'synced');
    const ended = await endSession({
      repository: worktreeDirectory,
      sessionId: aSessionId,
      summary: 'Implemented the isolated empty-state presentation flow.',
      blockers: ['Parser return-contract confirmation is still pending.'],
      next: 'Review the shared contract evidence before changing parser integration.',
      actorKind: 'ai',
    });
    assert.equal(ended.sync.status, 'synced');

    const bBeforeSync = await getSnapshot({ repository: fixture.b });
    assert.equal(bBeforeSync.sessions.some(({ id }) => id === aSessionId), false);
    const bSync = await syncStore({ repository: fixture.b });
    assert.equal(bSync.status, 'synced');
    const bAfterSync = await getSnapshot({ repository: fixture.b });
    const handoff = bAfterSync.sessions.find(({ id }) => id === aSessionId);
    assert.equal(handoff.status, 'ended');
    assert.equal(handoff.history.length, 4);
    assert.equal(handoff.summary, 'Implemented the isolated empty-state presentation flow.');
    assert.deepEqual(handoff.blockers, ['Parser return-contract confirmation is still pending.']);
    assert.equal(handoff.next, 'Review the shared contract evidence before changing parser integration.');
    assert.equal(await git(fixture.a, 'rev-parse', 'HEAD'), sourceBefore.head);
    assert.equal(await git(fixture.a, 'branch', '--show-current'), sourceBefore.branch);
    assert.equal(await git(fixture.a, 'status', '--porcelain=v1'), sourceBefore.status);
    assert.equal(await git(fixture.a, 'diff', '--cached', '--', 'product.txt'), sourceBefore.staged);
    assert.equal(await readFile(path.join(fixture.a, 'product.txt'), 'utf8'), sourceBefore.contents);

    const w3 = runW3Comparisons();
    const result = {
      environment: {
        independentLocalClones: 2,
        temporaryBareRemote: fixture.remote,
        actualSeparateMachines: false,
        automaticAiExecution: false,
      },
      connectionFlow: {
        bStartDelivery: bStarted.sync.status,
        aExplicitSync: aSync.status,
        pathAssessment: overlap.pathAssessment.status,
        semanticAssessment: overlap.semanticAssessment.status,
        dirtySourceCheckoutPreserved: true,
        isolatedWorktreeCreated: prepared.created,
        sessionTransitions: ['active', 'paused', 'active', 'ended'],
        aEndDelivery: ended.sync.status,
        peerObservedBeforeExplicitSync: false,
        peerObservedAfterExplicitSync: true,
        handoff: {
          summary: handoff.summary,
          blockers: handoff.blockers,
          next: handoff.next,
        },
      },
      w3,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await run();
