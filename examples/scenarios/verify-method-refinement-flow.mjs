#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  addWikiNote,
  compareSharedMethods,
  getSnapshot,
  initSharedStore,
  listWikiNotes,
  respondToTicket,
  runWikiRefinement,
  syncStore,
} from '../../src/engine/index.js';
import { renderWikiNote } from '../../src/wiki/index.js';

const execFileAsync = promisify(execFile);
const participants = ['participant-a', 'participant-b'];
const leftId = '72000000-0000-4000-8000-000000000001';
const rightId = '72000000-0000-4000-8000-000000000002';
const leftPath = `wiki/${leftId}.md`;
const rightPath = `wiki/${rightId}.md`;

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
  await writeFile(path.join(seed, 'product.txt'), 'temporary product baseline\n');
  await git(seed, 'add', '--', 'product.txt');
  await git(seed, 'commit', '-m', 'Create temporary product baseline');
  await git(seed, 'push', '-u', 'origin', 'HEAD:main');
  await execFileAsync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await execFileAsync('git', ['clone', remote, a]);
  await execFileAsync('git', ['clone', remote, b]);
  return { remote, a, b };
}

function methodNote({ id, participant, title, promptRef, harnessRef, body }) {
  return renderWikiNote({
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title,
    author: { participant, kind: 'ai' },
    observedAt: '2026-09-19T09:00:00+09:00',
    workContext: { promptRef, harnessRef },
    status: 'personal',
    sources: [{ kind: 'observation', ref: `${participant}:${id}` }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
  }, `# ${title}\n\n${body}`);
}

function comparisonManifest({ includeRightArtifacts = false } = {}) {
  return {
    left: {
      label: 'A export method',
      participant: 'participant-a',
      workRef: 'session:a-export',
      noteRefs: [leftPath],
    },
    right: {
      label: 'B export method',
      participant: 'participant-b',
      workRef: 'session:b-export',
      noteRefs: [rightPath],
    },
    artifacts: [
      { ref: 'prompt:export-a', kind: 'prompt', version: '4', text: 'Return CSV rows.' },
      { ref: 'harness:export-a', kind: 'harness', version: '1.8', text: 'fixture: csv-only' },
      ...(includeRightArtifacts ? [
        { ref: 'prompt:export-b', kind: 'prompt', version: '3', text: 'Preserve multiline SRT cues.' },
        { ref: 'harness:export-b', kind: 'harness', version: '2.1', text: 'fixture: csv-and-srt' },
      ] : []),
    ],
  };
}

function refinementConfig() {
  return {
    timezone: 'Asia/Seoul',
    policy: {
      id: 'g4-daily-index',
      version: '1',
      staleAfterDays: 30,
      recencyWindowDays: 90,
      lowImportanceThreshold: 0.3,
      highImportanceThreshold: 0.7,
      unknownImportanceExposure: 'normal',
      importanceSignals: [{
        path: leftPath,
        score: 0.9,
        reason: 'The locally stored A method note is required for the active comparison.',
        evidenceRef: `wiki:${leftId}`,
      }],
    },
  };
}

function refinementNotes(notes) {
  return notes.filter(({ validation }) => (
    validation.valid
    && validation.note.format === 'structured'
    && validation.note.metadata.dailyRefinement
  ));
}

async function run() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-g4-'));
  try {
    const fixture = await createTwoCloneFixture(root);
    await initSharedStore({ repository: fixture.a, participants, participant: 'participant-a' });
    await initSharedStore({ repository: fixture.b, participants, participant: 'participant-b' });

    const leftMarkdown = methodNote({
      id: leftId,
      participant: 'participant-a',
      title: 'Participant A export method',
      promptRef: 'prompt:export-a',
      harnessRef: 'harness:export-a',
      body: 'Captured A method evidence.',
    });
    const leftAdded = await addWikiNote({ repository: fixture.a, markdown: leftMarkdown });
    assert.equal(leftAdded.sync.status, 'synced');

    const incompleteManifest = comparisonManifest();
    const proposed = await compareSharedMethods({
      repository: fixture.a,
      manifest: incompleteManifest,
    });
    assert.equal(proposed.comparison.complete, false);
    assert.equal(proposed.missingRequest.action, 'proposed');
    assert.equal((await getSnapshot({ repository: fixture.a })).tickets.length, 0);

    const created = await compareSharedMethods({
      repository: fixture.a,
      manifest: incompleteManifest,
      requestMissing: true,
    });
    assert.equal(created.missingRequest.action, 'created');
    assert.equal(created.missingRequest.sync.status, 'synced');
    const missingTicketId = created.missingRequest.ticketId;

    const reused = await compareSharedMethods({
      repository: fixture.a,
      manifest: incompleteManifest,
      requestMissing: true,
    });
    assert.equal(reused.missingRequest.action, 'reused');
    assert.equal(reused.missingRequest.ticketId, missingTicketId);
    assert.equal((await getSnapshot({ repository: fixture.a })).tickets.length, 1);

    assert.equal((await syncStore({ repository: fixture.b })).status, 'synced');
    const bMissingTicket = (await getSnapshot({ repository: fixture.b })).tickets
      .find(({ id }) => id === missingTicketId);
    assert.equal(bMissingTicket.requester, 'participant-a');
    assert.equal(bMissingTicket.assignee, 'participant-b');

    const rightMarkdown = methodNote({
      id: rightId,
      participant: 'participant-b',
      title: 'Participant B export method',
      promptRef: 'prompt:export-b',
      harnessRef: 'harness:export-b',
      body: 'Captured B method evidence supplied after the request.',
    });
    const rightAdded = await addWikiNote({ repository: fixture.b, markdown: rightMarkdown });
    assert.equal(rightAdded.sync.status, 'synced');
    const answered = await respondToTicket({
      repository: fixture.b,
      ticketId: missingTicketId,
      body: 'The requested B method note and work-context references are now shared.',
      evidence: [rightPath],
      actorKind: 'ai',
    });
    assert.equal(answered.sync.status, 'synced');
    assert.equal((await syncStore({ repository: fixture.a })).status, 'synced');

    const completedComparison = await compareSharedMethods({
      repository: fixture.a,
      manifest: comparisonManifest({ includeRightArtifacts: true }),
    });
    assert.equal(completedComparison.comparison.complete, true);
    assert.equal(completedComparison.missingRequest.action, 'none');
    assert.equal(
      completedComparison.comparison.comparisons.prompt.textComparison.available,
      true,
    );
    assert.equal(completedComparison.comparison.causalConclusion.supported, false);
    const aAnsweredTicket = (await getSnapshot({ repository: fixture.a })).tickets
      .find(({ id }) => id === missingTicketId);
    assert.equal(aAnsweredTicket.status, 'answered');
    assert.deepEqual(aAnsweredTicket.evidence, [rightPath]);

    const config = refinementConfig();
    const first = await runWikiRefinement({
      repository: fixture.a,
      config,
      now: '2026-09-20T09:05:00+09:00',
    });
    assert.equal(first.outcome, 'completed');
    assert.equal(first.sync.status, 'synced');
    const leftEntry = first.plan.entries.find(({ path: entryPath }) => entryPath === leftPath);
    assert.equal(leftEntry.importance.state, 'known');
    assert.equal(leftEntry.importance.evidence.kind, 'wiki');
    assert.equal(leftEntry.importance.evidence.verification, 'verified');

    assert.equal(refinementNotes(await listWikiNotes({ repository: fixture.b })).length, 0);
    assert.equal((await syncStore({ repository: fixture.b })).status, 'synced');
    const bFirstDayRefinements = refinementNotes(await listWikiNotes({ repository: fixture.b }));
    assert.equal(bFirstDayRefinements.length, 1);
    assert.equal(bFirstDayRefinements[0].path, first.summaryPath);

    const repeated = await runWikiRefinement({
      repository: fixture.a,
      config,
      now: '2026-09-20T22:00:00+09:00',
    });
    assert.equal(repeated.outcome, 'skipped');
    assert.equal(repeated.reason, 'no-new-input');
    assert.equal(repeated.summaryPath, first.summaryPath);

    const nextDay = await runWikiRefinement({
      repository: fixture.a,
      config,
      now: '2026-09-21T09:05:00+09:00',
    });
    assert.equal(nextDay.outcome, 'completed');
    assert.equal(nextDay.sync.status, 'synced');
    assert.notEqual(nextDay.summaryPath, first.summaryPath);
    assert.equal(nextDay.plan.candidate.metadata.previousSummary, first.summaryPath);
    assert.deepEqual(nextDay.plan.candidate.metadata.supersedes, [first.summaryPath]);
    assert.equal((await syncStore({ repository: fixture.b })).status, 'synced');
    const bSecondDayRefinements = refinementNotes(await listWikiNotes({ repository: fixture.b }));
    assert.equal(bSecondDayRefinements.length, 2);

    process.stdout.write(`${JSON.stringify({
      environment: {
        independentLocalClones: 2,
        temporaryBareRemote: fixture.remote,
        actualSeparateMachines: false,
        automaticAiExecution: false,
      },
      methodComparison: {
        dryRunAction: proposed.missingRequest.action,
        firstRequestedAction: created.missingRequest.action,
        duplicateRequestedAction: reused.missingRequest.action,
        reusedTicketId: missingTicketId,
        supplementedTicketStatus: aAnsweredTicket.status,
        comparisonCompleteAfterSupplement: completedComparison.comparison.complete,
        textComparisonAvailable: completedComparison.comparison.comparisons.prompt
          .textComparison.available,
        causalConclusionSupported: completedComparison.comparison.causalConclusion.supported,
      },
      manualRefinement: {
        invocationMode: 'runWikiRefinement({ config, now })',
        first: { outcome: first.outcome, sync: first.sync.status, summaryPath: first.summaryPath },
        peerSummaryCountBeforeSync: 0,
        peerSummaryCountAfterSync: bFirstDayRefinements.length,
        repeatedSameDay: { outcome: repeated.outcome, reason: repeated.reason },
        nextDay: {
          outcome: nextDay.outcome,
          sync: nextDay.sync.status,
          summaryPath: nextDay.summaryPath,
          previousSummary: nextDay.plan.candidate.metadata.previousSummary,
          peerSummaryCountAfterSync: bSecondDayRefinements.length,
        },
        importanceEvidence: {
          kind: leftEntry.importance.evidence.kind,
          verification: leftEntry.importance.evidence.verification,
        },
      },
    }, null, 2)}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await run();
