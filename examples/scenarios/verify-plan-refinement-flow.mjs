#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { aggregateSessions } from '../../src/dashboard/public/model.js';
import {
  addWikiNote,
  clarifyTicket,
  createTicket,
  endSession,
  getEngineStatus,
  getSnapshot,
  getWikiNote,
  initSharedStore,
  requestTicketInformation,
  respondToTicket,
  setPlan,
  startSession,
  syncStore,
  updateSessionScope,
} from '../../src/engine/index.js';
import { planDailyWikiRefinement, renderWikiNote } from '../../src/wiki/index.js';

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
  await writeFile(path.join(seed, 'product.txt'), 'temporary product baseline\n');
  await git(seed, 'add', '--', 'product.txt');
  await git(seed, 'commit', '-m', 'Create temporary product baseline');
  await git(seed, 'push', '-u', 'origin', 'HEAD:main');
  await execFileAsync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await execFileAsync('git', ['clone', remote, a]);
  await execFileAsync('git', ['clone', remote, b]);
  return { remote, a, b };
}

function planRevision({ phase, bScope, bNext }) {
  return {
    goals: {
      project: 'Ship the revised export experience',
      mediumTerm: 'Verify the changed brief without losing shared evidence',
      currentPhase: phase,
    },
    assignments: [
      {
        participant: 'participant-a',
        scope: ['docs/export-brief'],
        next: 'Confirm the revised acceptance criteria',
      },
      { participant: 'participant-b', scope: bScope, next: bNext },
    ],
    status: 'proposed',
    evidence: [],
    body: `Synthetic complete replacement plan: ${phase}`,
  };
}

function sourceNote({ id, participant, kind = 'ai', title, observedAt, status = 'proposed', sources, decisionEvidence = [] }) {
  const notePath = `wiki/${id}.md`;
  const metadata = {
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title,
    status,
    observedAt,
    author: { participant, kind },
    workContext: { promptRef: null, harnessRef: null },
    sources: sources ?? [{ kind: 'observation', ref: `${participant}:${id}` }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence,
    supersedes: [],
  };
  return {
    path: notePath,
    markdown: renderWikiNote(metadata, `# ${title}\n\nOriginal immutable evidence.`),
  };
}

function refinementEntry(plan, notePath) {
  return plan.entries.find(({ path: entryPath }) => entryPath === notePath);
}

async function run() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-g3-'));
  try {
    const fixture = await createTwoCloneFixture(root);
    await initSharedStore({ repository: fixture.a, participants, participant: 'participant-a' });
    await initSharedStore({ repository: fixture.b, participants, participant: 'participant-b' });

    const initialPlan = await setPlan({
      repository: fixture.a,
      plan: planRevision({
        phase: 'Review the original brief',
        bScope: ['src/export/parser'],
        bNext: 'Review the parser contract',
      }),
      actorKind: 'ai',
    });
    assert.equal(initialPlan.sync.status, 'synced');
    assert.equal((await syncStore({ repository: fixture.b })).status, 'synced');
    assert.equal(
      (await getSnapshot({ repository: fixture.b })).goals.currentPhase,
      'Review the original brief',
    );

    const revisedPlan = await setPlan({
      repository: fixture.a,
      plan: planRevision({
        phase: 'Implement the changed empty-state brief',
        bScope: ['src/export/ui'],
        bNext: 'Implement the empty-state copy before parser integration',
      }),
      actorKind: 'ai',
    });
    assert.equal(revisedPlan.sync.status, 'synced');
    const bBeforePlanSync = await getSnapshot({ repository: fixture.b });
    assert.equal(bBeforePlanSync.goals.currentPhase, 'Review the original brief');
    assert.equal((await syncStore({ repository: fixture.b })).status, 'synced');
    const bPlanSnapshot = await getSnapshot({ repository: fixture.b });
    const bAssignment = bPlanSnapshot.plan.assignments.find(
      ({ participant }) => participant === 'participant-b',
    );
    assert.equal(bPlanSnapshot.goals.currentPhase, 'Implement the changed empty-state brief');
    assert.deepEqual(bAssignment.scope, ['src/export/ui']);
    assert.equal(bAssignment.next, 'Implement the empty-state copy before parser integration');

    const started = await startSession({
      repository: fixture.b,
      title: 'Revised export UI',
      scope: bAssignment.scope,
      goal: bAssignment.next,
      branch: 'codex/revised-export-ui',
      baseCommit: await git(fixture.b, 'rev-parse', 'HEAD'),
      actorKind: 'ai',
    });
    assert.equal(started.sync.status, 'synced');
    const sessionId = started.event.entityId;
    const scopeUpdated = await updateSessionScope({
      repository: fixture.b,
      sessionId,
      scope: ['src/export/empty-state'],
      reason: 'The revised brief narrows the first deliverable to the empty state.',
      goal: 'Implement and verify the empty-state copy only.',
      actorKind: 'ai',
    });
    assert.equal(scopeUpdated.sync.status, 'synced');
    const bUpdatedSession = (await getSnapshot({ repository: fixture.b })).sessions
      .find(({ id }) => id === sessionId);
    assert.deepEqual(bUpdatedSession.scope, ['src/export/empty-state']);
    assert.deepEqual(bUpdatedSession.history[0].data.scope, ['src/export/ui']);
    assert.equal(bUpdatedSession.history[1].type, 'session.scope_updated');
    const ended = await endSession({
      repository: fixture.b,
      sessionId,
      summary: 'Recorded the narrowed empty-state scope.',
      next: 'Wait for the parser contract before integration.',
      actorKind: 'ai',
    });
    assert.equal(ended.sync.status, 'synced');
    assert.equal((await syncStore({ repository: fixture.a })).status, 'synced');
    const aAfterScopeSync = await getSnapshot({ repository: fixture.a });
    const aggregated = aggregateSessions(aAfterScopeSync.sessions, {
      conflicts: aAfterScopeSync.conflicts,
    });
    const aggregatedSession = aggregated.sessions.find(({ id }) => id === sessionId);
    assert.equal(aggregatedSession.timeStatus, 'unknown');
    assert.ok(aggregatedSession.timeReason);
    assert.equal(aggregated.unknownSessionCount, 1);

    const oldRoutine = sourceNote({
      id: '71000000-0000-4000-8000-000000000001',
      participant: 'participant-b',
      title: 'Old export observation',
      observedAt: '2026-01-01T09:00:00+09:00',
    });
    const decision = sourceNote({
      id: '71000000-0000-4000-8000-000000000002',
      participant: 'participant-a',
      kind: 'human',
      title: 'Shared API decision evidence',
      observedAt: '2026-02-01T09:00:00+09:00',
    });
    const agreed = sourceNote({
      id: '71000000-0000-4000-8000-000000000003',
      participant: 'participant-b',
      kind: 'human',
      title: 'Agreed export API boundary',
      observedAt: '2026-02-02T09:00:00+09:00',
      status: 'agreed',
      sources: [{ kind: 'wiki', ref: decision.path }],
      decisionEvidence: [decision.path],
    });
    const oldAdded = await addWikiNote({ repository: fixture.b, markdown: oldRoutine.markdown });
    assert.equal(oldAdded.sync.status, 'synced');
    assert.equal((await syncStore({ repository: fixture.a })).status, 'synced');
    const decisionAdded = await addWikiNote({ repository: fixture.a, markdown: decision.markdown });
    assert.equal(decisionAdded.sync.status, 'synced');
    assert.equal((await syncStore({ repository: fixture.b })).status, 'synced');
    const agreedAdded = await addWikiNote({ repository: fixture.b, markdown: agreed.markdown });
    assert.equal(agreedAdded.sync.status, 'synced');
    assert.equal((await syncStore({ repository: fixture.a })).status, 'synced');

    const createdTicket = await createTicket({
      repository: fixture.a,
      kind: 'information',
      title: 'Clarify the revised export evidence',
      body: 'Identify the evidence needed to validate the narrowed assignment.',
      goal: 'Connect the revised plan to verifiable work information.',
      actorKind: 'ai',
    });
    assert.equal(createdTicket.sync.status, 'synced');
    const ticketId = createdTicket.event.entityId;
    assert.equal((await syncStore({ repository: fixture.b })).status, 'synced');
    const requested = await requestTicketInformation({
      repository: fixture.b,
      ticketId,
      body: 'Provide the plan revision, source commit, and validation harness.',
      actorKind: 'ai',
    });
    assert.equal(requested.sync.status, 'synced');
    assert.equal((await syncStore({ repository: fixture.a })).status, 'synced');
    assert.equal(
      (await getSnapshot({ repository: fixture.a })).tickets.find(({ id }) => id === ticketId).status,
      'needs_information',
    );
    const clarified = await clarifyTicket({
      repository: fixture.a,
      ticketId,
      body: 'Use plan revision 2, the temporary main commit, and the empty-state harness.',
      actorKind: 'ai',
    });
    assert.equal(clarified.sync.status, 'synced');
    const aClarifiedTicket = (await getSnapshot({ repository: fixture.a })).tickets
      .find(({ id }) => id === ticketId);
    assert.equal(aClarifiedTicket.status, 'needs_information');
    assert.equal(aClarifiedTicket.history.at(-1).type, 'ticket.clarified');
    assert.equal((await syncStore({ repository: fixture.b })).status, 'synced');
    const bClarifiedTicket = (await getSnapshot({ repository: fixture.b })).tickets
      .find(({ id }) => id === ticketId);
    assert.equal(bClarifiedTicket.status, 'needs_information');
    assert.equal(bClarifiedTicket.history.at(-1).type, 'ticket.clarified');

    const responded = await respondToTicket({
      repository: fixture.b,
      ticketId,
      body: 'The old export observation is the recorded source for the requested comparison.',
      evidence: [oldRoutine.path],
      actorKind: 'ai',
    });
    assert.equal(responded.sync.status, 'synced');
    assert.equal((await syncStore({ repository: fixture.a })).status, 'synced');
    const aReadySnapshot = await getSnapshot({ repository: fixture.a });
    const unresolvedTicket = aReadySnapshot.tickets.find(({ id }) => id === ticketId);
    assert.equal(unresolvedTicket.status, 'answered');
    assert.deepEqual(unresolvedTicket.evidence, [oldRoutine.path]);

    const notePaths = [oldRoutine.path, decision.path, agreed.path];
    const notes = await Promise.all(notePaths.map(async (notePath) => {
      const note = await getWikiNote({ repository: fixture.a, path: notePath });
      return { path: note.path, markdown: note.markdown };
    }));
    const originalMarkdown = notes.map(({ markdown }) => markdown);
    const beforePlannerHead = (await getEngineStatus({ repository: fixture.a })).head;
    const refinement = planDailyWikiRefinement({
      notes,
      tickets: [unresolvedTicket],
      now: '2026-09-20T09:00:00+09:00',
      date: '2026-09-20',
      timezone: 'Asia/Seoul',
      sourceRevision: beforePlannerHead,
      policy: {
        id: 'g3-daily-index',
        version: '1',
        staleAfterDays: 30,
        recencyWindowDays: 90,
        lowImportanceThreshold: 0.3,
        highImportanceThreshold: 0.7,
        unknownImportanceExposure: 'normal',
        importanceSignals: [{
          path: oldRoutine.path,
          score: 0.1,
          reason: 'Old routine observation',
          evidenceRef: 'policy:g3-routine-observation',
        }],
      },
      candidate: {
        id: '71000000-0000-4000-8000-000000000004',
        author: { participant: 'participant-a', kind: 'ai' },
        observedAt: '2026-09-20T09:00:00+09:00',
        workContext: { promptRef: 'daily-refinement:g3', harnessRef: 'duobrain:manual-run' },
      },
    });
    assert.equal(refinement.outcome, 'planned');
    assert.equal(refinement.ready, true);
    assert.equal(refinementEntry(refinement, oldRoutine.path).exposure.level, 'action-required');
    assert.deepEqual(
      refinementEntry(refinement, oldRoutine.path).unresolvedTicketIds,
      [ticketId],
    );
    assert.equal(refinementEntry(refinement, agreed.path).exposure.level, 'protected');
    assert.ok(refinementEntry(refinement, agreed.path).preservationReasons.includes('agreement'));
    assert.equal(refinement.candidate.metadata.status, 'proposed');
    assert.deepEqual(refinement.candidate.metadata.summarizes.sort(), [...notePaths].sort());
    assert.deepEqual(refinement.candidate.metadata.supersedes, []);
    assert.equal(
      refinement.candidate.metadata.sources.some(({ kind, ref }) => (
        kind === 'ticket' && ref === `ticket:${ticketId}`
      )),
      true,
    );
    assert.deepEqual(notes.map(({ markdown }) => markdown), originalMarkdown);
    assert.equal((await getEngineStatus({ repository: fixture.a })).head, beforePlannerHead);
    const afterPlannerMarkdown = await Promise.all(notePaths.map(async (notePath) => {
      const { markdown } = await getWikiNote({ repository: fixture.a, path: notePath });
      return markdown;
    }));
    assert.deepEqual(afterPlannerMarkdown, originalMarkdown);
    await assert.rejects(
      getWikiNote({ repository: fixture.a, path: refinement.candidate.path }),
      (error) => error.code === 'WIKI_NOTE_NOT_FOUND',
    );

    process.stdout.write(`${JSON.stringify({
      environment: {
        independentLocalClones: 2,
        temporaryBareRemote: fixture.remote,
        actualSeparateMachines: false,
        automaticAiExecution: false,
      },
      planConnection: {
        initialDelivery: initialPlan.sync.status,
        revisedDelivery: revisedPlan.sync.status,
        peerPhaseBeforeExplicitSync: bBeforePlanSync.goals.currentPhase,
        peerPhaseAfterExplicitSync: bPlanSnapshot.goals.currentPhase,
        participantBAssignment: bAssignment,
      },
      scopeChange: {
        originalScope: bUpdatedSession.history[0].data.scope,
        projectedScope: bUpdatedSession.scope,
        historyPreserved: true,
        timeAggregationStatus: aggregatedSession.timeStatus,
        timeAggregationReason: aggregatedSession.timeReason,
        scopeUpdateAttributionComplete: false,
      },
      clarification: {
        statusBeforeClarification: 'needs_information',
        statusAfterClarification: aClarifiedTicket.status,
        peerStatusAfterExplicitSync: bClarifiedTicket.status,
        laterExplicitResponseStatus: unresolvedTicket.status,
      },
      refinement: {
        outcome: refinement.outcome,
        oldTicketEvidenceExposure: refinementEntry(refinement, oldRoutine.path).exposure.level,
        agreedRecordExposure: refinementEntry(refinement, agreed.path).exposure.level,
        agreedOriginalSummarized: refinement.candidate.metadata.summarizes.includes(agreed.path),
        originalNotesPreserved: true,
        unresolvedTicketPreserved: refinement.unresolvedTickets.some(({ id }) => id === ticketId),
        candidatePersisted: false,
        scheduledExecution: false,
        schedulingFollowUp: 'E5',
      },
    }, null, 2)}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await run();
