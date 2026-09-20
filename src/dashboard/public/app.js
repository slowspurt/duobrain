const byId = (id) => document.getElementById(id);

const labels = {
  project: '전체 목표',
  mediumTerm: '중기 목표',
  currentPhase: '현 단계 목표',
  active: '진행 중',
  paused: '일시 정지',
  ended: '종료 기록',
  open: '미확인',
  acknowledged: '읽음',
  answered: '응답 도착',
  needs_information: '정보 필요',
  information: '정보 보충',
  feedback: '직접 피드백',
  synced: '동기화됨',
  pending: '공유 대기',
  error: '동기화 오류',
  unknown: '동기화 미확인',
};

function text(value, fallback = '미확인') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function empty(message) {
  return element('p', 'empty', message);
}

function renderGoals(goals = {}) {
  const container = byId('goals');
  container.replaceChildren();
  for (const key of ['project', 'mediumTerm', 'currentPhase']) {
    const card = element('article', 'goal-card');
    card.append(element('p', 'label', labels[key]), element('p', 'goal-copy', text(goals[key])));
    container.append(card);
  }
}

function formatRecordedRange(session) {
  const started = Date.parse(session.startedAt);
  if (!Number.isFinite(started)) return '시작 기록 미확인';
  const startLabel = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(started);
  if (!session.endedAt) return `${startLabel} 시작 · 종료 기록 없음`;
  const ended = Date.parse(session.endedAt);
  if (!Number.isFinite(ended)) return `${startLabel} 시작 · 종료 시각 미확인`;
  const endLabel = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(ended);
  return `${startLabel} — ${endLabel} · 기록 구간`;
}

function renderParticipants(participants = [], sessions = []) {
  const container = byId('participants');
  container.replaceChildren();
  if (!participants.length) {
    container.append(empty('참여자 기록이 없습니다.'));
    return;
  }

  for (const participant of participants) {
    const ownSessions = sessions.filter((session) => session?.participant === participant);
    const recent = ownSessions.at(-1);
    const card = element('article', 'person-card');
    const heading = element('div', 'person-heading');
    heading.append(element('h3', '', text(participant)), element('span', `status ${recent ? recent.status : 'unknown'}`, recent ? text(labels[recent.status], '상태 미확인') : '기록 없음'));
    card.append(heading);

    if (!recent) {
      card.append(empty('최근 작업 기록이 없어 현재 활동과 범위를 확인할 수 없습니다.'));
      container.append(card);
      continue;
    }

    card.append(element('p', 'session-title', text(recent.title, '제목 미확인')));
    card.append(element('p', 'recorded-time', formatRecordedRange(recent)));

    const scope = element('div', 'chips');
    const scopeItems = Array.isArray(recent.scope) ? recent.scope : [];
    if (scopeItems.length) scopeItems.forEach((item) => scope.append(element('span', 'chip', text(item))));
    else scope.append(element('span', 'chip muted', '범위 미확인'));
    card.append(scope);

    const blockers = element('div', 'blockers');
    blockers.append(element('p', 'label', '기록된 병목'));
    const blockerItems = Array.isArray(recent.blockers) ? recent.blockers : [];
    blockers.append(blockerItems.length ? element('p', '', blockerItems.map((item) => text(item)).join(' · ')) : empty('기록된 병목 없음'));
    card.append(blockers);
    container.append(card);
  }
}

function renderTickets(tickets = []) {
  const active = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket?.status));
  const container = byId('tickets');
  container.replaceChildren();
  byId('ticket-count').textContent = `${active.length}건`;
  if (!active.length) {
    container.append(empty('진행 중인 정보 보충·피드백 요청이 없습니다.'));
    return;
  }

  for (const ticket of active) {
    const card = element('article', 'ticket-card');
    const meta = element('div', 'ticket-meta');
    meta.append(element('span', `kind ${ticket.kind ?? 'unknown'}`, text(labels[ticket.kind], '유형 미확인')));
    meta.append(element('span', `status ${ticket.status ?? 'unknown'}`, text(labels[ticket.status], '상태 미확인')));
    card.append(meta, element('h3', '', text(ticket.title, '제목 미확인')), element('p', 'ticket-body', text(ticket.body, '내용 미확인')));
    const route = element('p', 'route');
    route.append(element('span', '', text(ticket.requester)), document.createTextNode(' → '), element('span', '', text(ticket.assignee)));
    card.append(route, element('p', 'ticket-goal', `연결 목표 · ${text(ticket.goal)}`));
    container.append(card);
  }
}

function renderSync(sync = {}) {
  const status = ['synced', 'pending', 'error', 'unknown'].includes(sync.status) ? sync.status : 'unknown';
  const badge = byId('sync-badge');
  badge.className = `status ${status}`;
  badge.textContent = labels[status];
  badge.title = text(sync.message, status === 'unknown' ? '실제 동기화 상태를 확인하지 못했습니다.' : '추가 메시지 없음');
}

function render(snapshot) {
  byId('sample-banner').hidden = snapshot.sample !== true;
  renderGoals(snapshot.goals);
  renderParticipants(Array.isArray(snapshot.participants) ? snapshot.participants : [], Array.isArray(snapshot.sessions) ? snapshot.sessions : []);
  renderTickets(Array.isArray(snapshot.tickets) ? snapshot.tickets : []);
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
    renderSync({ status: 'error', message: '스냅샷을 읽지 못했습니다.' });
    renderGoals({});
    renderParticipants([], []);
    renderTickets([]);
  }
}

byId('retry').addEventListener('click', load);
load();
