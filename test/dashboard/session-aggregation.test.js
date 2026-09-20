import assert from 'node:assert/strict';
import test from 'node:test';

import { aggregateSessions, planPresentation } from '../../src/dashboard/public/model.js';

const hour = 60 * 60 * 1000;
const at = (hours) => new Date(Date.parse('2026-09-20T00:00:00.000Z') + (hours * hour)).toISOString();

function event(id, type, hours, previous, data = {}) {
  return { id, type, at: at(hours), previous, actor: { participant: 'alice', kind: 'human' }, data };
}

function endedSession({
  id = 'session-1',
  participant = 'alice',
  start = 0,
  end = 2,
  scope = ['src/example'],
  history,
} = {}) {
  const defaultHistory = [
    event(`${id}-start`, 'session.started', start, null, { scope, branch: 'feature/example', baseCommit: 'abc123' }),
    event(`${id}-end`, 'session.ended', end, `${id}-start`, { summary: 'Recorded result', blockers: ['Explicit blocker'] }),
  ];
  return {
    id,
    participant,
    title: `Work ${id}`,
    scope,
    goal: null,
    status: 'ended',
    startedAt: at(start),
    endedAt: at(end),
    elapsedMs: (end - start) * hour,
    blockers: [],
    next: null,
    history: history ?? defaultHistory,
  };
}

test('empty session data produces zero project wall time without invented work', () => {
  assert.deepEqual(aggregateSessions([]), {
    sessions: [],
    participantTotals: [],
    scopeTotals: [],
    projectWallClockMs: 0,
    unknownSessionCount: 0,
    blockers: [],
  });
});

test('separates ended wall clock from pause-excluded recorded active intervals', () => {
  const session = endedSession({
    end: 4,
    history: [
      event('start', 'session.started', 0, null, { branch: 'feature/pause', baseCommit: 'base1' }),
      event('pause', 'session.paused', 1, 'start', { body: 'Waiting for input' }),
      event('resume', 'session.resumed', 2, 'pause'),
      event('end', 'session.ended', 4, 'resume', { summary: 'Finished', blockers: ['API decision pending'] }),
    ],
  });
  const result = aggregateSessions([session]);
  assert.equal(result.sessions[0].wallClockMs, 4 * hour);
  assert.equal(result.sessions[0].recordedActiveMs, 3 * hour);
  assert.equal(result.participantTotals[0].recordedActiveMs, 3 * hour);
  assert.equal(result.sessions[0].summary, 'Finished');
  assert.equal(result.sessions[0].branch, 'feature/pause');
  assert.equal(result.sessions[0].baseCommit, 'base1');
  assert.deepEqual(result.blockers.map((item) => item.blocker), ['API decision pending']);
});

test('clips wall and active intervals at both period boundaries', () => {
  const session = endedSession({
    end: 4,
    history: [
      event('start', 'session.started', 0, null),
      event('pause', 'session.paused', 1, 'start'),
      event('resume', 'session.resumed', 2, 'pause'),
      event('end', 'session.ended', 4, 'resume'),
    ],
  });
  const result = aggregateSessions([session], { from: at(0.5), to: at(3) });
  assert.equal(result.projectWallClockMs, 2.5 * hour);
  assert.equal(result.sessions[0].recordedActiveMs, 1.5 * hour);
});

test('deduplicates overlapping sessions per participant and keeps project wall time separate', () => {
  const sessions = [
    endedSession({ id: 'alice-a', participant: 'alice', start: 0, end: 2, scope: ['src/a'] }),
    endedSession({ id: 'alice-b', participant: 'alice', start: 1, end: 3, scope: ['src/b'] }),
    endedSession({ id: 'bob-a', participant: 'bob', start: 1, end: 2, scope: ['src/a'] }),
  ];
  sessions[2].history = sessions[2].history.map((item) => ({ ...item, actor: { participant: 'bob', kind: 'human' } }));
  const result = aggregateSessions(sessions);
  assert.equal(result.projectWallClockMs, 3 * hour);
  assert.deepEqual(result.participantTotals.map(({ participant, recordedActiveMs }) => [participant, recordedActiveMs]), [
    ['alice', 3 * hour],
    ['bob', 1 * hour],
  ]);
  assert.deepEqual(result.scopeTotals.map(({ participant, scope, recordedActiveMs }) => [participant, scope, recordedActiveMs]), [
    ['alice', 'src/a', 2 * hour],
    ['alice', 'src/b', 2 * hour],
    ['bob', 'src/a', 1 * hour],
  ]);
});

test('leaves unclosed, invalidly ordered, conflicted, and incomplete histories unknown', () => {
  const open = {
    ...endedSession({ id: 'open' }),
    status: 'active',
    endedAt: null,
    elapsedMs: null,
    history: [event('open-start', 'session.started', 0, null)],
  };
  const invalid = endedSession({
    id: 'invalid',
    end: 3,
    history: [
      event('invalid-start', 'session.started', 0, null),
      event('invalid-pause', 'session.paused', 2, 'invalid-start'),
      event('invalid-resume', 'session.resumed', 1, 'invalid-pause'),
      event('invalid-end', 'session.ended', 3, 'invalid-resume'),
    ],
  });
  const conflicted = endedSession({ id: 'conflicted', start: 4, end: 5 });
  const incomplete = endedSession({ id: 'incomplete', start: 6, end: 7, history: [] });
  const result = aggregateSessions([open, invalid, conflicted, incomplete], {
    conflicts: [{ entityId: 'conflicted' }],
  });
  assert.equal(result.unknownSessionCount, 4);
  assert.equal(result.projectWallClockMs, hour);
  assert.deepEqual(result.sessions.map((session) => session.recordedActiveMs), [null, null, null, null]);
  assert.deepEqual(result.sessions.map((session) => session.timeReason), [
    '활동 구간 이력 없음',
    '기록 충돌',
    '종료 미확인',
    '시간 순서 오류',
  ]);
});

test('does not include sessions outside the selected period', () => {
  const result = aggregateSessions([
    endedSession({ id: 'before', start: 0, end: 1 }),
    endedSession({ id: 'inside', start: 3, end: 4 }),
  ], { from: at(2), to: at(5) });
  assert.deepEqual(result.sessions.map((session) => session.id), ['inside']);
  assert.equal(result.projectWallClockMs, hour);
});

test('scope updates preserve lifecycle and split active time by recorded scope', () => {
  const session = endedSession({
    id: 'scope-change',
    end: 6,
    scope: ['src/final'],
    history: [
      event('start', 'session.started', 0, null, { scope: ['src/old'], branch: 'feature/old', baseCommit: 'base-old' }),
      event('pause', 'session.paused', 1, 'start'),
      event('scope-1', 'session.scope_updated', 2, 'pause', { scope: ['src/new'], reason: 'Move while paused', branch: null }),
      event('resume', 'session.resumed', 3, 'scope-1'),
      event('scope-2', 'session.scope_updated', 4, 'resume', { scope: ['src/final'], reason: 'Narrow active work' }),
      event('end', 'session.ended', 6, 'scope-2', { summary: 'Done' }),
    ],
  });
  session.branch = null;
  session.baseCommit = null;
  session.summary = 'Done';
  const result = aggregateSessions([session]);
  assert.equal(result.sessions[0].timeStatus, 'known');
  assert.equal(result.sessions[0].recordedActiveMs, 4 * hour);
  assert.equal(result.sessions[0].branch, null);
  assert.equal(result.sessions[0].baseCommit, null);
  assert.deepEqual(result.sessions[0].scopeChanges.map(({ scope, reason }) => [scope, reason]), [
    [['src/new'], 'Move while paused'],
    [['src/final'], 'Narrow active work'],
  ]);
  assert.deepEqual(result.scopeTotals.map(({ scope, recordedActiveMs }) => [scope, recordedActiveMs]), [
    ['src/final', 2 * hour],
    ['src/new', hour],
    ['src/old', hour],
  ]);
});

test('legacy scope history stays unattributed instead of using the final projected scope', () => {
  const session = endedSession({
    id: 'legacy-scope',
    scope: ['src/final'],
    history: [
      event('start', 'session.started', 0, null),
      event('end', 'session.ended', 2, 'start', { summary: 'Done' }),
    ],
  });
  const result = aggregateSessions([session]);
  assert.deepEqual(result.scopeTotals, [{ participant: 'alice', scope: null, recordedActiveMs: 2 * hour }]);
});

test('plan presentation distinguishes proposal, agreement, absence, and plan conflict', () => {
  const proposed = { id: 'plan-id', status: 'proposed', assignments: [], evidence: [], history: [] };
  assert.equal(planPresentation({ plan: proposed }).state, 'proposed');
  assert.equal(planPresentation({ plan: { ...proposed, status: 'agreed' } }).state, 'agreed');
  assert.equal(planPresentation({ plan: null, conflicts: [] }).state, 'none');
  assert.equal(planPresentation({ plan: null, sessions: [{ id: 'session-id' }], conflicts: [{ entityId: 'session-id' }] }).state, 'none');
  assert.equal(planPresentation({ plan: null, sessions: [], conflicts: [{ entityId: 'invalid-session', message: 'Invalid session root' }] }).state, 'none');
  assert.equal(planPresentation({ plan: null, sessions: [], tickets: [], conflicts: [{ entityId: 'plan-id', message: 'Concurrent plan updates' }] }).state, 'conflict');
});
