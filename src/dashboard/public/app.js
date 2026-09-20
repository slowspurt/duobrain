import {
  aggregateSessions,
  filterTickets,
  planPresentation,
  peerConfirmation,
  ticketEvidence,
  ticketStatusLabels,
  wikiValidationPresentation,
} from '/model.js';

const byId = (id) => document.getElementById(id);
const labels = {
  project: '전체 목표', mediumTerm: '중기 목표', currentPhase: '현 단계 목표',
  active: '미종료 기록', paused: '일시 정지 기록', ended: '종료 기록',
  information: '정보 보충', feedback: '직접 피드백',
  synced: '동기화됨', pending: '공유 대기', error: '동기화 오류', unknown: '동기화 미확인',
  ...ticketStatusLabels,
};

const state = { tickets: [], sessions: [], conflicts: [], participants: [], sample: false, tab: 'inbox', query: '', status: '', kind: '', peer: '', period: '30d' };
const text = (value, fallback = '미확인') => typeof value === 'string' && value.trim() ? value : fallback;

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
const empty = (message) => element('p', 'empty', message);

function appendEvidenceButtons(container, evidence) {
  for (const path of evidence) {
    const item = element('div', 'evidence-item');
    const button = element('button', 'evidence-link', path);
    button.type = 'button';
    const content = element('div', 'evidence-content');
    content.hidden = true;
    button.addEventListener('click', () => loadEvidence(path, button, content));
    item.append(button, content);
    container.append(item);
  }
}

function renderGoals(goals = {}, snapshot = {}) {
  const container = byId('goals');
  container.replaceChildren();
  for (const key of ['project', 'mediumTerm', 'currentPhase']) {
    const card = element('article', 'goal-card');
    card.append(element('p', 'label', labels[key]), element('p', 'goal-copy', text(goals[key])));
    container.append(card);
  }
  const presentation = planPresentation(snapshot);
  const badge = byId('plan-status');
  badge.className = `plan-status ${presentation.state}`;
  badge.textContent = presentation.label;
  const detail = byId('plan-detail');
  detail.replaceChildren();
  if (!presentation.plan) {
    detail.append(empty(presentation.state === 'conflict'
      ? '계획 이력이 충돌해 목표와 담당을 선택하지 않습니다.'
      : '공유 계획 기록이 없어 목표와 담당을 추정하지 않습니다.'));
    if (presentation.state === 'conflict') {
      presentation.conflicts.forEach((conflict) => detail.append(element('p', 'conflict-copy', text(conflict?.message, '계획 충돌 세부 내용 미확인'))));
    }
    return;
  }
  detail.append(element('p', 'plan-body', text(presentation.plan.body, '계획 근거 설명 미확인')));
  const assignments = element('div', 'assignment-grid');
  for (const assignment of Array.isArray(presentation.plan.assignments) ? presentation.plan.assignments : []) {
    const card = element('article', 'assignment-card');
    card.append(element('h3', '', text(assignment?.participant)));
    const scopes = element('div', 'chips');
    const scopeItems = Array.isArray(assignment?.scope) ? assignment.scope : [];
    (scopeItems.length ? scopeItems : ['할당 범위 없음']).forEach((scope) => scopes.append(element('span', `chip${scopeItems.length ? '' : ' muted'}`, scope)));
    card.append(scopes, element('p', 'assignment-next', `다음 · ${text(assignment?.next, '미확인')}`));
    assignments.append(card);
  }
  detail.append(assignments);
  const expandable = element('details', 'plan-history');
  expandable.append(element('summary', '', '계획 이력·근거 보기'));
  const history = element('div', 'plan-history-list');
  for (const event of Array.isArray(presentation.plan.history) ? presentation.plan.history : []) {
    const item = element('article', 'timeline-item');
    item.append(element('p', 'timeline-type', text(event?.type, '이벤트 유형 미확인')));
    item.append(element('p', 'caption', `${formatDate(event?.at)} · ${text(event?.actor?.participant)} (${text(event?.actor?.kind, '주체 미확인')})`));
    if (event?.data?.body) item.append(element('p', 'timeline-body', event.data.body));
    history.append(item);
  }
  if (!history.children.length) history.append(empty('계획 이력이 없습니다.'));
  const evidence = Array.isArray(presentation.plan.evidence) ? presentation.plan.evidence : [];
  history.append(element('h4', '', '합의 근거'));
  if (evidence.length) appendEvidenceButtons(history, evidence);
  else history.append(empty(presentation.state === 'proposed' ? '제안 상태에는 공동 합의 근거가 없습니다.' : '근거 경로가 없습니다.'));
  expandable.append(history);
  detail.append(expandable);
}

function formatDate(value, fallback = '시각 미확인') {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
    : fallback;
}

function formatRecordedRange(session) {
  const start = formatDate(session.startedAt, '시작 기록 미확인');
  if (!session.endedAt) return `${start} 시작 · 종료 미확인 · 최종 경과 시간 미확정`;
  return `${start} — ${formatDate(session.endedAt, '종료 시각 미확인')} · 기록 구간`;
}

function renderParticipants(participants = [], sessions = []) {
  const container = byId('participants');
  container.replaceChildren();
  if (!participants.length) return container.append(empty('참여자 기록이 없습니다.'));
  for (const participant of participants) {
    const recent = sessions.filter((session) => session?.participant === participant).at(-1);
    const card = element('article', 'person-card');
    const heading = element('div', 'person-heading');
    heading.append(element('h3', '', text(participant)), element('span', `status ${recent ? recent.status : 'unknown'}`, recent ? text(labels[recent.status], '상태 미확인') : '기록 없음'));
    card.append(heading);
    if (!recent) {
      card.append(empty('최근 작업 기록이 없어 현재 활동과 범위를 확인할 수 없습니다.'));
      container.append(card);
      continue;
    }
    card.append(element('p', 'session-title', text(recent.title, '제목 미확인')), element('p', 'recorded-time', formatRecordedRange(recent)));
    const scope = element('div', 'chips');
    const scopeItems = Array.isArray(recent.scope) ? recent.scope : [];
    (scopeItems.length ? scopeItems : ['범위 미확인']).forEach((item) => scope.append(element('span', `chip${scopeItems.length ? '' : ' muted'}`, text(item))));
    card.append(scope);
    const blockers = element('div', 'blockers');
    blockers.append(element('p', 'label', '기록된 병목'));
    const blockerItems = Array.isArray(recent.blockers) ? recent.blockers : [];
    blockers.append(blockerItems.length ? element('p', '', blockerItems.map((item) => text(item)).join(' · ')) : empty('기록된 병목 없음'));
    card.append(blockers);
    container.append(card);
  }
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '미확인';
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}분`;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

function selectedPeriod() {
  if (state.period === 'all') return {};
  const days = state.period === '7d' ? 7 : 30;
  const to = new Date();
  const from = new Date(to.getTime() - (days * 24 * 60 * 60 * 1000));
  return { from: from.toISOString(), to: to.toISOString() };
}

function metricRow(label, value, note) {
  const row = element('div', 'metric-row');
  const copy = element('div', '');
  copy.append(element('strong', '', label));
  if (note) copy.append(element('p', 'caption', note));
  row.append(copy, element('span', 'metric-value', value));
  return row;
}

function renderSessionAnalysis() {
  const result = aggregateSessions(state.sessions, { conflicts: state.conflicts, ...selectedPeriod() });
  const overview = byId('time-overview');
  overview.replaceChildren();
  overview.append(metricRow('프로젝트 벽시계 구간', formatDuration(result.projectWallClockMs), '종료가 확인된 세션 구간의 합집합'));
  overview.append(metricRow('시간 미확인 세션', `${result.unknownSessionCount}건`, '미종료·시간 오류·충돌·활동 이력 누락'));

  const participant = byId('participant-time');
  participant.replaceChildren();
  if (!result.participantTotals.length) participant.append(empty('집계할 참여자 기록이 없습니다.'));
  for (const item of result.participantTotals) {
    const note = item.unknownSessionCount ? `시간 미확인 ${item.unknownSessionCount}건 별도` : '겹치는 세션 구간 중복 제거';
    participant.append(metricRow(item.participant, formatDuration(item.recordedActiveMs), note));
  }

  const scopes = byId('scope-time');
  scopes.replaceChildren();
  if (!result.scopeTotals.length) scopes.append(empty('집계 가능한 범위 기록이 없습니다.'));
  for (const item of result.scopeTotals) scopes.append(metricRow(`${item.participant} · ${item.scope ?? '귀속 미확인'}`, formatDuration(item.recordedActiveMs)));

  const sessions = byId('session-records');
  sessions.replaceChildren();
  if (!result.sessions.length) sessions.append(empty('세션 기록이 없습니다.'));
  for (const item of result.sessions) {
    const card = element('article', 'session-record-card');
    const heading = element('div', 'person-heading');
    heading.append(element('strong', '', text(item.title, '제목 미확인')), element('span', `time-state ${item.timeStatus}`, item.timeStatus === 'known' ? '시간 확인' : '시간 미확인'));
    card.append(heading, element('p', 'caption', `${text(item.participant)} · ${formatDate(item.startedAt, '시작 미확인')}`));
    const timings = element('div', 'session-times');
    timings.append(metricRow('벽시계 경과', formatDuration(item.wallClockMs)));
    timings.append(metricRow('pause 제외 기록상 활동', formatDuration(item.recordedActiveMs), item.timeReason));
    card.append(timings);
    const metadata = element('p', 'session-metadata', `요약 ${text(item.summary)} · 브랜치 ${text(item.branch)} · 기준 커밋 ${text(item.baseCommit)}`);
    card.append(metadata);
    for (const change of item.scopeChanges) {
      card.append(element('p', 'scope-change', `범위 변경 ${formatDate(change.at)} · ${(change.scope ?? []).join(', ') || '범위 미확인'} · 사유 ${text(change.reason)}`));
    }
    sessions.append(card);
  }

  const blockers = byId('blocker-list');
  blockers.replaceChildren();
  if (!result.blockers.length) blockers.append(empty('명시적으로 기록된 병목이 없습니다.'));
  for (const item of result.blockers) {
    const row = element('article', 'blocker-row');
    row.append(element('p', 'label', `${text(item.participant)} · ${text(item.title)}`), element('p', '', item.blocker));
    blockers.append(row);
  }
}

function renderTimeline(ticket) {
  const section = element('section', 'ticket-detail');
  section.append(element('h4', '', '상세 기록'));
  const history = Array.isArray(ticket.history) ? ticket.history : [];
  if (!history.length) section.append(empty('상세 이력이 기록되지 않았습니다.'));
  for (const event of history) {
    const item = element('article', 'timeline-item');
    item.append(element('p', 'timeline-type', text(event?.type, '이벤트 유형 미확인')));
    item.append(element('p', 'caption', `${formatDate(event?.at)} · ${text(event?.actor?.participant)} (${text(event?.actor?.kind, '주체 미확인')})`));
    if (event?.data?.body) item.append(element('p', 'timeline-body', text(event.data.body)));
    section.append(item);
  }
  const evidence = ticketEvidence(ticket);
  section.append(element('h4', '', '근거 경로'));
  if (!evidence.length) section.append(empty('연결된 근거 경로가 없습니다.'));
  else appendEvidenceButtons(section, evidence);
  section.append(element('p', 'caption evidence-note', '허용된 위키 경로만 읽기 전용으로 조회하며 Markdown은 실행하지 않습니다.'));
  return section;
}

async function loadEvidence(path, button, content) {
  button.disabled = true;
  content.hidden = false;
  content.replaceChildren(element('p', 'caption', '근거 원문을 불러오는 중입니다.'));
  try {
    const response = await fetch(`/api/wiki?path=${encodeURIComponent(path)}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) {
      const missing = response.status === 404;
      const label = missing ? '근거 누락' : response.status === 413 ? '크기 초과' : '조회 실패';
      content.replaceChildren(element('strong', `validation ${missing ? 'missing' : 'failure'}`, label), element('p', 'caption', text(result.message, '근거 노트를 불러오지 못했습니다.')));
      return;
    }
    const summary = wikiValidationPresentation(result.validation);
    const heading = element('div', 'evidence-heading');
    heading.append(element('strong', `validation ${summary.kind}`, summary.title));
    if (state.sample) heading.append(element('span', 'sample-evidence', '예시 근거'));
    content.replaceChildren(heading);
    for (const issue of summary.issues) {
      content.append(element('p', 'validation-issue', `${text(issue?.code, 'UNKNOWN')} · ${text(issue?.message, '세부 내용 없음')}`));
    }
    content.append(element('pre', 'note-markdown', result.markdown));
  } catch {
    content.replaceChildren(element('strong', 'validation failure', '조회 실패'), element('p', 'caption', '근거 노트 응답을 처리하지 못했습니다.'));
  } finally {
    button.disabled = false;
  }
}

function ticketCard(ticket) {
  const card = element('article', 'ticket-card');
  const summary = element('div', 'ticket-summary');
  const meta = element('div', 'ticket-meta');
  meta.append(element('span', `kind ${ticket.kind ?? 'unknown'}`, text(labels[ticket.kind], '유형 미확인')));
  meta.append(element('span', `status ${ticket.status ?? 'unknown'}`, text(labels[ticket.status], '상태 미확인')));
  summary.append(meta, element('h3', '', text(ticket.title, '제목 미확인')), element('p', 'ticket-body', text(ticket.body, '내용 미확인')));
  summary.append(
    element('p', 'route', `${text(ticket.requester)} → ${text(ticket.assignee)}`),
    element('p', 'receipt', peerConfirmation(ticket.status)),
    element('p', 'ticket-goal', `연결 목표 · ${text(ticket.goal)}`),
  );
  const details = element('details', 'ticket-details');
  details.append(element('summary', '', '상세·근거 보기'), renderTimeline(ticket));
  card.append(summary, details);
  return card;
}

function renderTickets() {
  const matches = filterTickets(state.tickets, state);
  const container = byId('tickets');
  container.replaceChildren();
  byId('ticket-count').textContent = `${matches.length}건`;
  byId('ticket-context').textContent = state.tab === 'inbox'
    ? '미종결 요청입니다. 응답 도착(answered)은 해결 확인(resolved)이 아닙니다.'
    : 'resolved와 closed를 구분한 종결 기록입니다.';
  if (!matches.length) return container.append(empty(state.tab === 'inbox' ? '조건에 맞는 진행 중 요청이 없습니다.' : '조건에 맞는 처리 이력이 없습니다.'));
  matches.forEach((ticket) => container.append(ticketCard(ticket)));
}

function fillFilters() {
  const status = byId('status-filter');
  status.replaceChildren(new Option('전체', ''));
  const statuses = state.tab === 'inbox' ? ['open', 'acknowledged', 'needs_information', 'answered'] : ['resolved', 'closed'];
  statuses.forEach((value) => status.add(new Option(labels[value], value)));
  if (!statuses.includes(state.status)) state.status = '';
  status.value = state.status;
  const peer = byId('peer-filter');
  peer.replaceChildren(new Option('전체', ''));
  state.participants.forEach((value) => peer.add(new Option(text(value), value)));
  peer.value = state.peer;
}

function renderSync(sync = {}) {
  const status = ['synced', 'pending', 'error', 'unknown'].includes(sync.status) ? sync.status : 'unknown';
  const badge = byId('sync-badge');
  badge.className = `status ${status}`;
  badge.textContent = labels[status];
  const copy = {
    synced: '마지막 원격 동기화 성공', pending: '로컬 기록 있음 · 원격 공유 미확인',
    error: '원격 공유 실패', unknown: '원격 공유 상태 미확인',
  };
  byId('delivery-copy').textContent = copy[status];
  byId('sync-message').textContent = text(sync.message, sync.lastSyncedAt ? `마지막 성공 기록 ${formatDate(sync.lastSyncedAt)}` : '동기화 시각 미확인');
}

function render(snapshot) {
  const sample = snapshot.sample === true;
  state.sample = sample;
  byId('sample-banner').hidden = !sample;
  byId('source-badge').textContent = sample ? '예시 스냅샷' : '실제 엔진 기록';
  state.tickets = Array.isArray(snapshot.tickets) ? snapshot.tickets : [];
  state.sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  state.conflicts = Array.isArray(snapshot.conflicts) ? snapshot.conflicts : [];
  state.participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
  renderGoals(snapshot.goals, snapshot);
  renderParticipants(state.participants, state.sessions);
  renderSessionAnalysis();
  fillFilters();
  renderTickets();
  renderSync(snapshot.sync);
}

async function load() {
  byId('error-panel').hidden = true;
  try {
    const response = await fetch('/api/snapshot', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch {
    byId('error-panel').hidden = false;
    render({ sample: false, participants: [], goals: {}, sessions: [], tickets: [], sync: { status: 'error', message: '스냅샷을 읽지 못했습니다.' } });
  }
}

function selectTab(tab) {
  state.tab = tab;
  state.status = '';
  for (const name of ['inbox', 'history']) {
    const button = byId(`${name}-tab`);
    button.classList.toggle('active', name === tab);
    button.setAttribute('aria-selected', String(name === tab));
  }
  fillFilters();
  renderTickets();
}

byId('retry').addEventListener('click', load);
byId('inbox-tab').addEventListener('click', () => selectTab('inbox'));
byId('history-tab').addEventListener('click', () => selectTab('history'));
byId('ticket-search').addEventListener('input', (event) => { state.query = event.target.value; renderTickets(); });
for (const key of ['status', 'kind', 'peer']) byId(`${key}-filter`).addEventListener('change', (event) => { state[key] = event.target.value; renderTickets(); });
byId('session-period').addEventListener('change', (event) => { state.period = event.target.value; renderSessionAnalysis(); });
load();
