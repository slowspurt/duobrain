export const terminalTicketStatuses = new Set(['resolved', 'closed']);

export const ticketStatusLabels = {
  open: '미확인',
  acknowledged: '읽음',
  needs_information: '추가 정보 필요',
  answered: '응답 도착',
  resolved: '요청자가 해결 확인',
  closed: '해결 없이 종료',
};

export function ticketEvidence(ticket) {
  const paths = Array.isArray(ticket?.evidence) ? ticket.evidence : [];
  const historyPaths = (Array.isArray(ticket?.history) ? ticket.history : [])
    .flatMap((event) => Array.isArray(event?.data?.evidence) ? event.data.evidence : []);
  return [...new Set([...paths, ...historyPaths].filter((path) => typeof path === 'string' && path.trim()))];
}

export function peerConfirmation(status) {
  if (status === 'open') return '상대 확인 안 됨';
  if (status === 'acknowledged') return '상대 확인됨 · 답변 전';
  if (status === 'needs_information') return '상대 확인됨 · 추가 정보 요청';
  if (status === 'answered') return '응답 도착 · 해결 확인 전';
  if (status === 'resolved') return '응답과 해결 확인 완료';
  if (status === 'closed') return '해결되지 않고 종료';
  return '상대 확인 상태 미확인';
}

export function wikiValidationPresentation(validation) {
  const errors = Array.isArray(validation?.errors) ? validation.errors : [];
  const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
  if (validation?.valid !== true) return { kind: 'failure', title: '검증 실패', issues: errors };
  if (warnings.length) return { kind: 'warning', title: '검증 경고', issues: warnings };
  return { kind: 'valid', title: '검증 통과', issues: [] };
}

export function filterTickets(tickets, { tab = 'inbox', query = '', status = '', kind = '', peer = '' } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return (Array.isArray(tickets) ? tickets : []).filter((ticket) => {
    const terminal = terminalTicketStatuses.has(ticket?.status);
    if ((tab === 'history') !== terminal) return false;
    if (status && ticket?.status !== status) return false;
    if (kind && ticket?.kind !== kind) return false;
    if (peer && ticket?.requester !== peer && ticket?.assignee !== peer) return false;
    if (!needle) return true;
    const searchable = [ticket?.title, ticket?.body, ticket?.goal, ticket?.requester, ticket?.assignee, ...ticketEvidence(ticket)]
      .filter((value) => typeof value === 'string').join('\n').toLocaleLowerCase();
    return searchable.includes(needle);
  });
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval[0] > previous[1]) merged.push([...interval]);
    else previous[1] = Math.max(previous[1], interval[1]);
  }
  return merged;
}

function totalIntervals(intervals) {
  return mergeIntervals(intervals).reduce((total, [start, end]) => total + (end - start), 0);
}

function clipped(interval, from, to) {
  const start = Math.max(interval[0], from);
  const end = Math.min(interval[1], to);
  return end >= start ? [start, end] : null;
}

function explicitSessionFields(session) {
  const history = Array.isArray(session?.history) ? session.history : [];
  const started = history.find((event) => event?.type === 'session.started');
  const ended = history.findLast((event) => event?.type === 'session.ended');
  const blockers = [
    ...(Array.isArray(session?.blockers) ? session.blockers : []),
    ...(Array.isArray(ended?.data?.blockers) ? ended.data.blockers : []),
  ].filter((value) => typeof value === 'string' && value.trim());
  return {
    summary: typeof session?.summary === 'string' ? session.summary : typeof ended?.data?.summary === 'string' ? ended.data.summary : null,
    branch: typeof session?.branch === 'string' ? session.branch : typeof started?.data?.branch === 'string' ? started.data.branch : null,
    baseCommit: typeof session?.baseCommit === 'string' ? session.baseCommit : typeof started?.data?.baseCommit === 'string' ? started.data.baseCommit : null,
    blockers: [...new Set(blockers)],
  };
}

function sessionIntervals(session, conflicted, from, to) {
  const startedAt = timestamp(session?.startedAt);
  const endedAt = timestamp(session?.endedAt);
  const wall = startedAt === null || endedAt === null ? null : [startedAt, endedAt];
  if (conflicted) return { status: 'unknown', reason: '기록 충돌', wall: null, active: null };
  if (session?.status !== 'ended' || endedAt === null) return { status: 'unknown', reason: '종료 미확인', wall: null, active: null };
  if (startedAt === null || endedAt < startedAt) return { status: 'unknown', reason: '시간 순서 오류', wall: null, active: null };

  const history = Array.isArray(session.history) ? session.history : [];
  if (!history.length) {
    const clippedWall = clipped(wall, from, to);
    return { status: 'partial', reason: '활동 구간 이력 없음', wall: clippedWall, active: null };
  }

  let lifecycle = null;
  let activeStart = null;
  let priorAt = null;
  let priorId = null;
  let recordedEnd = null;
  const active = [];
  for (const event of history) {
    const at = timestamp(event?.at);
    if (at === null || (priorAt !== null && at < priorAt)) return { status: 'unknown', reason: '시간 순서 오류', wall: null, active: null };
    if (event?.previous != null && event.previous !== priorId) return { status: 'unknown', reason: '이력 연결 오류', wall: null, active: null };
    if (event?.type === 'session.started' && lifecycle === null) {
      if (at !== startedAt) return { status: 'unknown', reason: '시작 시각 불일치', wall: null, active: null };
      lifecycle = 'active';
      activeStart = at;
    } else if (event?.type === 'session.paused' && lifecycle === 'active') {
      active.push([activeStart, at]);
      lifecycle = 'paused';
      activeStart = null;
    } else if (event?.type === 'session.resumed' && lifecycle === 'paused') {
      lifecycle = 'active';
      activeStart = at;
    } else if (event?.type === 'session.ended' && (lifecycle === 'active' || lifecycle === 'paused')) {
      if (lifecycle === 'active') active.push([activeStart, at]);
      lifecycle = 'ended';
      recordedEnd = at;
    } else {
      return { status: 'unknown', reason: '이력 순서 오류', wall: null, active: null };
    }
    priorAt = at;
    priorId = event?.id ?? null;
  }
  if (lifecycle !== 'ended' || recordedEnd !== endedAt) return { status: 'unknown', reason: '종료 시각 불일치', wall: null, active: null };
  const clippedWall = clipped(wall, from, to);
  const clippedActive = active.map((interval) => clipped(interval, from, to)).filter(Boolean);
  return { status: 'known', reason: null, wall: clippedWall, active: clippedActive };
}

export function aggregateSessions(sessions, { conflicts = [], from, to } = {}) {
  const fromMs = from === undefined ? Number.NEGATIVE_INFINITY : timestamp(from);
  const toMs = to === undefined ? Number.POSITIVE_INFINITY : timestamp(to);
  if (fromMs === null || toMs === null || fromMs > toMs) throw new RangeError('period must have valid ordered ISO boundaries');
  const conflictIds = new Set((Array.isArray(conflicts) ? conflicts : []).map((conflict) => conflict?.entityId));
  const projected = (Array.isArray(sessions) ? sessions : []).map((session) => {
    const timing = sessionIntervals(session, conflictIds.has(session?.id), fromMs, toMs);
    const fields = explicitSessionFields(session);
    return {
      id: session?.id ?? null,
      participant: typeof session?.participant === 'string' ? session.participant : null,
      title: typeof session?.title === 'string' ? session.title : null,
      scope: Array.isArray(session?.scope) ? session.scope.filter((value) => typeof value === 'string' && value.trim()) : [],
      startedAt: session?.startedAt ?? null,
      endedAt: session?.endedAt ?? null,
      ...fields,
      timeStatus: timing.status,
      timeReason: timing.reason,
      wallClockMs: timing.wall ? timing.wall[1] - timing.wall[0] : timing.status === 'unknown' ? null : 0,
      recordedActiveMs: timing.active ? totalIntervals(timing.active) : null,
      wallInterval: timing.wall,
      activeIntervals: timing.active,
    };
  }).filter((session) => {
    const start = timestamp(session.startedAt);
    const end = timestamp(session.endedAt);
    if (start === null) return true;
    return start <= toMs && (end === null || end >= fromMs);
  });

  const participantIntervals = new Map();
  const participantUnknown = new Map();
  const scopeIntervals = new Map();
  const projectWallIntervals = [];
  const blockers = [];
  for (const session of projected) {
    if (session.wallInterval) projectWallIntervals.push(session.wallInterval);
    if (session.participant) {
      if (!participantIntervals.has(session.participant)) participantIntervals.set(session.participant, []);
      if (!participantUnknown.has(session.participant)) participantUnknown.set(session.participant, 0);
      if (session.activeIntervals) participantIntervals.get(session.participant).push(...session.activeIntervals);
      else participantUnknown.set(session.participant, participantUnknown.get(session.participant) + 1);
      if (session.activeIntervals) {
        for (const scope of session.scope) {
          const key = `${session.participant}\u0000${scope}`;
          if (!scopeIntervals.has(key)) scopeIntervals.set(key, { participant: session.participant, scope, intervals: [] });
          scopeIntervals.get(key).intervals.push(...session.activeIntervals);
        }
      }
    }
    for (const blocker of session.blockers) blockers.push({ sessionId: session.id, participant: session.participant, title: session.title, blocker });
  }

  const participants = new Set([...participantIntervals.keys(), ...participantUnknown.keys()]);
  const participantTotals = [...participants].sort().map((participant) => ({
    participant,
    recordedActiveMs: totalIntervals(participantIntervals.get(participant) ?? []),
    unknownSessionCount: participantUnknown.get(participant) ?? 0,
  }));
  const scopeTotals = [...scopeIntervals.values()]
    .map(({ participant, scope, intervals }) => ({ participant, scope, recordedActiveMs: totalIntervals(intervals) }))
    .sort((left, right) => left.participant.localeCompare(right.participant) || left.scope.localeCompare(right.scope));

  return {
    sessions: projected.sort((left, right) => (timestamp(right.startedAt) ?? -Infinity) - (timestamp(left.startedAt) ?? -Infinity)),
    participantTotals,
    scopeTotals,
    projectWallClockMs: totalIntervals(projectWallIntervals),
    unknownSessionCount: projected.filter((session) => session.timeStatus !== 'known').length,
    blockers,
  };
}
