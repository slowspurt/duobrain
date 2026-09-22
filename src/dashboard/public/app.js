import {
  aggregateSessions,
  filterTickets,
  planPresentation,
  peerConfirmation,
  recordedContextDifferences,
  ticketEvidence,
  wikiListRecords,
  wikiValidationPresentation,
} from '/model.js';
import { resolveLocale, translator } from '/i18n.js';

const byId = (id) => document.getElementById(id);
const locale = resolveLocale({ search: location.search, languages: navigator.languages });
const t = translator(locale);
document.documentElement.lang = locale;
document.title = `duobrain ${t('dashboardTitle')}`;
const labels = {
  project: t('project'), mediumTerm: t('mediumTerm'), currentPhase: t('currentPhase'),
  active: t('active'), paused: t('paused'), ended: t('ended'),
  information: t('information'), feedback: t('feedback'),
  synced: t('synced'), pending: t('pending'), error: t('error'), unknown: t('unknown'),
  open: t('open'), acknowledged: t('acknowledged'), needs_information: t('needs_information'), answered: t('answered'), resolved: t('resolved'), closed: t('closed'),
};

const state = {
  tickets: [], sessions: [], conflicts: [], participants: [], sample: false,
  tab: 'inbox', query: '', status: '', kind: '', peer: '', period: '30d',
  wikiTab: 'all', wikiRecords: [], wikiSearchResults: [], wikiIssues: [],
  section: 'current', selectedTicketId: null, selectedWikiPath: null, assignments: [],
  compactViews: { requests: 'list', records: 'work', wiki: 'list' }, locale,
};
const text = (value, fallback = locale === 'ko' ? '미확인' : 'Unknown') => typeof value === 'string' && value.trim() ? value : fallback;
const participantLabel = (value) => {
  if (!state.sample) return text(value);
  const index = state.participants.indexOf(value);
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : text(value);
};
const displayCopy = (value, fallback = locale === 'ko' ? '미확인' : 'Unknown') => {
  let result = text(value, fallback);
  if (!state.sample) return result;
  state.participants.forEach((participant, index) => {
    if (typeof participant !== 'string' || !participant) return;
    const escaped = participant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), String.fromCharCode(65 + index));
  });
  return result;
};

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
const empty = (message) => element('p', 'empty', message);

function applyStaticUi() {
  byId('brand-home').setAttribute('aria-label', t('brandHome'));
  byId('source-badge').textContent = t('source');
  byId('sync-badge').textContent = t('syncing');
  byId('nav-current').textContent = t('current');
  byId('nav-requests').firstChild.textContent = t('requests') + ' ';
  byId('nav-records').textContent = t('records');
  byId('nav-wiki').textContent = t('wiki');
  byId('retry').textContent = t('retry');
  byId('goals-title').textContent = t('goals');
  byId('people-title').textContent = t('people');
  byId('attention-title').textContent = t('attention');
  byId('inbox-tab').textContent = t('inbox');
  byId('history-tab').textContent = t('history');
  byId('ticket-search').placeholder = t('searchTickets');
  byId('wiki-query').placeholder = t('searchWiki');
  byId('wiki-participant').placeholder = t('all');
  document.querySelector('.wiki-submit').textContent = t('submitSearch');
  document.querySelector('.brand-lockup h1').textContent = t('dashboardTitle');
  document.querySelector('.brand-lockup p').textContent = t('dashboardDescription');
  document.querySelector('#sample-banner strong').textContent = t('sample');
  document.querySelector('#sample-banner span').textContent = t('sampleDescription');
  document.querySelector('#error-panel strong').textContent = t('loadFailed');
  document.querySelector('#error-panel span').textContent = t('loadFailed');
  document.querySelector('.people-section .caption').textContent = t('noInference');
  document.querySelector('.panel-heading h2').textContent = t('requests');
  document.querySelector('.records-heading h2').textContent = t('recordedWork');
  document.querySelector('.records-heading p').textContent = t('recordsDescription');
  document.querySelector('.records-heading label span').textContent = t('period');
  const wikiPanel = byId('panel-wiki');
  wikiPanel.querySelector('.panel-heading h2').textContent = t('wikiTitle');
  wikiPanel.querySelector('.panel-heading p').textContent = t('wikiDescription');
  document.querySelector('.delivery-panel span').textContent = t('delivery');
  document.querySelector('.delivery-panel div:nth-child(2) span').textContent = t('peer');
  document.querySelector('.delivery-panel div:nth-child(2) strong').textContent = t('peerHint');
  for (const option of byId('session-period').options) option.textContent = t(option.value === '7d' ? 'days7' : option.value === '30d' ? 'days30' : 'allRecords');
  for (const select of [byId('kind-filter'), byId('wiki-status'), byId('wiki-record-type')]) {
    for (const option of select.options) {
      const key = option.value === 'source-note' ? 'sourceNote' : option.value || 'all';
      option.textContent = t(key);
    }
  }
  for (const button of document.querySelectorAll('[data-compact-group="requests"], [data-compact-group="wiki"]')) {
    button.textContent = t(button.dataset.compactView === 'list' ? 'list' : button.dataset.compactView === 'detail' ? 'detail' : 'filters');
  }
  for (const button of document.querySelectorAll('[data-compact-group="records"]')) button.textContent = t(button.dataset.compactView);
}

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
  for (const key of ['currentPhase', 'project', 'mediumTerm']) {
    const card = element('article', `goal-card${key === 'currentPhase' ? ' current-goal' : ''}`);
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
  state.assignments = Array.isArray(presentation.plan.assignments) ? presentation.plan.assignments : [];
  const explorer = element('details', 'plan-explorer');
  explorer.append(element('summary', '', '공유 계획과 근거 보기'));
  const explorerBody = element('div', 'plan-explorer-body');
  explorerBody.append(element('p', 'plan-body', text(presentation.plan.body, '계획 근거 설명 미확인')));
  const assignments = element('div', 'assignment-grid');
  for (const assignment of state.assignments) {
    const card = element('article', 'assignment-card');
    card.append(element('h3', '', participantLabel(assignment?.participant)));
    const scopes = element('div', 'chips');
    const scopeItems = Array.isArray(assignment?.scope) ? assignment.scope : [];
    (scopeItems.length ? scopeItems : ['할당 범위 없음']).forEach((scope) => scopes.append(element('span', `chip${scopeItems.length ? '' : ' muted'}`, scope)));
    card.append(scopes, element('p', 'assignment-next', `다음 · ${displayCopy(assignment?.next)}`));
    assignments.append(card);
  }
  explorerBody.append(assignments);
  const expandable = element('details', 'plan-history');
  expandable.append(element('summary', '', '계획 이력·근거 보기'));
  const history = element('div', 'plan-history-list');
  for (const event of Array.isArray(presentation.plan.history) ? presentation.plan.history : []) {
    const item = element('article', 'timeline-item');
    item.append(element('p', 'timeline-type', text(event?.type, '이벤트 유형 미확인')));
    item.append(element('p', 'caption', `${formatDate(event?.at)} · ${participantLabel(event?.actor?.participant)} (${text(event?.actor?.kind, '주체 미확인')})`));
    if (event?.data?.body) item.append(element('p', 'timeline-body', displayCopy(event.data.body)));
    history.append(item);
  }
  if (!history.children.length) history.append(empty('계획 이력이 없습니다.'));
  const evidence = Array.isArray(presentation.plan.evidence) ? presentation.plan.evidence : [];
  history.append(element('h4', '', '합의 근거'));
  if (evidence.length) appendEvidenceButtons(history, evidence);
  else history.append(empty(presentation.state === 'proposed' ? '제안 상태에는 공동 합의 근거가 없습니다.' : '근거 경로가 없습니다.'));
  expandable.append(history);
  explorerBody.append(expandable);
  explorer.append(explorerBody);
  detail.append(explorer);
}

function formatDate(value, fallback = locale === 'ko' ? '시각 미확인' : 'Time unknown') {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
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
  participants.forEach((participant) => {
    const recent = sessions.filter((session) => session?.participant === participant).at(-1);
    const assignment = state.assignments.find((item) => item?.participant === participant);
    const card = element('article', 'person-card');
    const heading = element('div', 'person-heading');
    heading.append(element('h3', '', participantLabel(participant)), element('span', `status ${recent ? recent.status : 'unknown'}`, recent ? text(labels[recent.status], '상태 미확인') : '기록 없음'));
    card.append(heading);
    const role = element('dl', 'person-role');
    const scopes = Array.isArray(assignment?.scope) ? assignment.scope : [];
    role.append(element('dt', '', '담당 범위'), element('dd', '', scopes.join(', ') || (recent?.scope ?? []).join(', ') || '미확인'));
    role.append(element('dt', '', '다음 행동'), element('dd', '', displayCopy(assignment?.next ?? recent?.next)));
    card.append(role);
    if (!recent) {
      card.append(empty('최근 작업 기록이 없어 현재 활동과 범위를 확인할 수 없습니다.'));
      container.append(card);
      return;
    }
    card.append(element('p', 'session-title', displayCopy(recent.title, '제목 미확인')), element('p', 'recorded-time', formatRecordedRange(recent)));
    const scope = element('div', 'chips');
    const scopeItems = Array.isArray(recent.scope) ? recent.scope : [];
    (scopeItems.length ? scopeItems : ['범위 미확인']).forEach((item) => scope.append(element('span', `chip${scopeItems.length ? '' : ' muted'}`, text(item))));
    card.append(scope);
    const blockers = element('div', 'blockers');
    blockers.append(element('p', 'label', '기록된 병목'));
    const blockerItems = Array.isArray(recent.blockers) ? recent.blockers : [];
    blockers.append(blockerItems.length ? element('p', '', blockerItems.map((item) => displayCopy(item)).join(' · ')) : empty('기록된 병목 없음'));
    card.append(blockers);
    container.append(card);
  });
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
  overview.append(metricRow('함께 기록된 전체 구간', formatDuration(result.projectWallClockMs), '종료가 확인된 작업 구간의 합집합'));
  overview.append(metricRow('시간을 계산할 수 없는 기록', `${result.unknownSessionCount}건`, '미종료·시간 오류·충돌·활동 이력 누락'));

  const participant = byId('participant-time');
  participant.replaceChildren();
  const participantIds = [...new Set([...state.participants, ...result.participantTotals.map((item) => item.participant)])];
  if (!participantIds.length) participant.append(empty('집계할 참여자 기록이 없습니다.'));
  for (const participantId of participantIds) {
    const item = result.participantTotals.find((entry) => entry.participant === participantId);
    if (!item) {
      participant.append(metricRow(participantLabel(participantId), '기록 없음', '집계할 작업 기록 없음'));
      continue;
    }
    const note = item.unknownSessionCount ? `계산할 수 없는 기록 ${item.unknownSessionCount}건 별도` : '겹치는 작업 구간 중복 제거';
    participant.append(metricRow(participantLabel(item.participant), formatDuration(item.recordedActiveMs), note));
  }

  const scopes = byId('scope-time');
  scopes.replaceChildren();
  if (!result.scopeTotals.length) scopes.append(empty('집계 가능한 범위 기록이 없습니다.'));
  for (const item of result.scopeTotals) scopes.append(metricRow(`${participantLabel(item.participant)} · ${item.scope ?? '귀속 미확인'}`, formatDuration(item.recordedActiveMs)));

  const sessions = byId('session-records');
  sessions.replaceChildren();
  if (!result.sessions.length) sessions.append(empty('세션 기록이 없습니다.'));
  for (const item of result.sessions) {
    const card = element('article', 'session-record-card');
    const heading = element('div', 'person-heading');
    heading.append(element('strong', '', displayCopy(item.title, '제목 미확인')), element('span', `time-state ${item.timeStatus}`, item.timeStatus === 'known' ? '시간 확인' : '시간 미확인'));
    card.append(heading, element('p', 'caption', `${participantLabel(item.participant)} · ${formatDate(item.startedAt, '시작 미확인')}`));
    if (item.summary) card.append(element('p', 'session-summary', displayCopy(item.summary)));
    const technical = element('details', 'session-technical');
    technical.append(element('summary', '', '시간·개발자 정보'));
    const technicalBody = element('div', 'session-technical-body');
    const timings = element('div', 'session-times');
    timings.append(metricRow('전체 기록 구간', formatDuration(item.wallClockMs)));
    timings.append(metricRow('중지 시간을 뺀 기록 구간', formatDuration(item.recordedActiveMs), item.timeReason));
    technicalBody.append(timings);
    technicalBody.append(element('p', 'session-metadata', `브랜치 ${text(item.branch)} · 기준 커밋 ${text(item.baseCommit)}`));
    for (const change of item.scopeChanges) {
      technicalBody.append(element('p', 'scope-change', `범위 변경 ${formatDate(change.at)} · ${(change.scope ?? []).join(', ') || '범위 미확인'} · 사유 ${text(change.reason)}`));
    }
    technical.append(technicalBody);
    card.append(technical);
    sessions.append(card);
  }

  const blockers = byId('blocker-list');
  blockers.replaceChildren();
  if (!result.blockers.length) blockers.append(empty('명시적으로 기록된 병목이 없습니다.'));
  for (const item of result.blockers) {
    const row = element('article', 'blocker-row');
    row.append(element('p', 'label', `${participantLabel(item.participant)} · ${displayCopy(item.title)}`), element('p', '', displayCopy(item.blocker)));
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
    item.append(element('p', 'caption', `${formatDate(event?.at)} · ${participantLabel(event?.actor?.participant)} (${text(event?.actor?.kind, '주체 미확인')})`));
    if (event?.data?.body) item.append(element('p', 'timeline-body', displayCopy(event.data.body)));
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

function wikiMetadata(record) {
  const parts = [
    text(record.recordType, '종류 미확인'),
    text(record.status, '상태 미확인'),
    state.sample ? participantLabel(record.author?.participant) : text(record.author?.participant, '작성자 미확인'),
    formatDate(record.observedAt),
  ];
  return parts.join(' · ');
}

async function loadLineage(path, button, content) {
  button.disabled = true;
  content.hidden = false;
  content.replaceChildren(element('p', 'caption', '계보를 불러오는 중입니다.'));
  try {
    const response = await fetch(`/api/wiki/lineage?root=${encodeURIComponent(path)}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) {
      content.replaceChildren(element('strong', 'validation failure', '계보 조회 실패'), element('p', 'caption', text(result.message)));
      return;
    }
    content.replaceChildren(element('p', 'caption', `노드 ${result.nodes.length}개 · 연결 ${result.edges.length}개`));
    for (const edge of result.edges) content.append(element('p', 'lineage-edge', `${edge.from} — ${edge.relation} → ${edge.to}`));
    for (const issue of result.issues) {
      const missing = /^MISSING_/.test(issue?.code ?? '');
      content.append(element('p', `validation-issue${missing ? ' missing-copy' : ''}`, `${text(issue?.code, 'UNKNOWN')} · ${text(issue?.message, '세부 내용 없음')}`));
    }
    if (!result.edges.length && !result.issues.length) content.append(empty('연결된 위키 계보가 없습니다.'));
  } catch {
    content.replaceChildren(element('strong', 'validation failure', '계보 조회 실패'));
  } finally {
    button.disabled = false;
  }
}

function wikiRecordDetail(record) {
  const card = element('article', 'wiki-card');
  const heading = element('div', 'wiki-card-heading');
  heading.append(element('h3', '', text(record.title, record.format === 'legacy' ? '레거시 위키 기록' : '제목 미확인')));
  if (record.validation) {
    const validation = wikiValidationPresentation(record.validation);
    heading.append(element('span', `validation ${validation.kind}`, validation.title));
  }
  card.append(heading, element('p', 'caption', wikiMetadata(record)), element('code', 'wiki-path', record.path));
  const context = element('div', 'work-context');
  context.append(
    element('p', '', `promptRef · ${text(record.workContext?.promptRef, '기록 없음')}`),
    element('p', '', `harnessRef · ${text(record.workContext?.harnessRef, '기록 없음')}`),
  );
  card.append(context);
  if (record.dailyRefinement) {
    card.append(element('p', 'refinement-run', `정제 실행 · ${text(record.dailyRefinement.date)} · ${text(record.dailyRefinement.timezone)} · source ${text(record.dailyRefinement.sourceRevision)}`));
  }
  const actions = element('div', 'wiki-actions');
  const sourceButton = element('button', 'evidence-link', '원문 보기');
  const lineageButton = element('button', 'evidence-link', '계보 보기');
  sourceButton.type = 'button';
  lineageButton.type = 'button';
  const source = element('div', 'evidence-content');
  const lineage = element('div', 'lineage-content');
  source.hidden = true;
  lineage.hidden = true;
  sourceButton.addEventListener('click', () => loadEvidence(record.path, sourceButton, source));
  lineageButton.addEventListener('click', () => loadLineage(record.path, lineageButton, lineage));
  actions.append(sourceButton, lineageButton);
  card.append(actions, source, lineage);
  return card;
}

function wikiRecordListItem(record) {
  const button = element('button', `wiki-list-item${record.path === state.selectedWikiPath ? ' selected' : ''}`);
  button.type = 'button';
  button.append(element('h3', '', text(record.title, record.format === 'legacy' ? '레거시 위키 기록' : '제목 미확인')));
  button.append(element('p', 'caption', wikiMetadata(record)));
  button.addEventListener('click', () => {
    state.selectedWikiPath = record.path;
    renderWiki();
    selectCompactView('wiki', 'detail');
  });
  return button;
}

function renderWikiContext(records) {
  const container = byId('wiki-context-differences');
  container.replaceChildren();
  const differences = recordedContextDifferences(records);
  container.append(
    element('p', '', `promptRef ${differences.promptDiffers ? '차이 기록됨' : '비교 가능한 차이 없음'} · ${differences.promptRefs.join(', ') || '기록 없음'}`),
    element('p', '', `harnessRef ${differences.harnessDiffers ? '차이 기록됨' : '비교 가능한 차이 없음'} · ${differences.harnessRefs.join(', ') || '기록 없음'}`),
  );
}

function renderWiki() {
  const container = byId('wiki-records');
  const stateCopy = byId('wiki-state');
  container.replaceChildren();
  stateCopy.replaceChildren();
  let records = state.wikiTab === 'search' ? state.wikiSearchResults : state.wikiRecords;
  if (state.wikiTab === 'refinement') records = state.wikiRecords.filter((record) => record.dailyRefinement !== null);
  byId('wiki-count').textContent = `${records.length}건`;
  for (const issue of state.wikiIssues) stateCopy.append(element('p', 'validation-issue', `${text(issue?.code, 'UNKNOWN')} · ${text(issue?.message, '세부 내용 없음')}`));
  if (!records.length) {
    const message = state.wikiTab === 'refinement' ? '유효한 일일 정제 결과가 없습니다.' : '조건에 맞는 공유 위키 기록이 없습니다.';
    container.append(empty(message));
  } else {
    if (!records.some((record) => record.path === state.selectedWikiPath)) state.selectedWikiPath = records[0].path;
    records.forEach((record) => container.append(wikiRecordListItem(record)));
  }
  const detail = byId('wiki-detail-pane');
  detail.replaceChildren();
  const selected = records.find((record) => record.path === state.selectedWikiPath);
  if (selected) detail.append(wikiRecordDetail(selected));
  else detail.append(element('p', 'detail-empty', '표시할 공유 기록이 없습니다.'));
  renderWikiContext(records);
}

function selectWikiTab(tab) {
  state.wikiTab = tab;
  for (const name of ['all', 'search', 'refinement']) {
    const button = byId(`wiki-${name}-tab`);
    button.classList.toggle('active', name === tab);
    button.setAttribute('aria-selected', String(name === tab));
  }
  renderWiki();
}

async function loadWikiList() {
  if (state.sample) {
    state.wikiRecords = [];
    state.wikiIssues = [];
    renderWiki();
    byId('wiki-state').replaceChildren(element('p', 'sample-wiki', '예시 스냅샷에는 실제 공유 위키가 연결되지 않습니다. --repository로 실행하면 탐색할 수 있습니다.'));
    return;
  }
  byId('wiki-state').replaceChildren(element('p', 'caption', '공유 위키 목록을 불러오는 중입니다.'));
  try {
    const response = await fetch('/api/wiki/notes', { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    state.wikiRecords = wikiListRecords(result.notes);
    state.wikiIssues = [];
    renderWiki();
  } catch {
    state.wikiRecords = [];
    renderWiki();
    byId('wiki-state').replaceChildren(element('p', 'validation-issue', '공유 위키 목록을 불러오지 못했습니다.'));
  }
}

async function searchWiki(event) {
  event.preventDefault();
  if (state.sample) return selectWikiTab('search');
  const params = new URLSearchParams();
  const values = {
    q: byId('wiki-query').value,
    participant: byId('wiki-participant').value.trim(),
    status: byId('wiki-status').value,
    recordType: byId('wiki-record-type').value,
  };
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  params.set('includeSuperseded', String(byId('wiki-include-superseded').checked));
  selectWikiTab('search');
  byId('wiki-state').replaceChildren(element('p', 'caption', '공유 위키를 검색하는 중입니다.'));
  try {
    const response = await fetch(`/api/wiki/search?${params}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    state.wikiSearchResults = result.results;
    state.wikiIssues = result.issues;
    renderWiki();
  } catch {
    state.wikiSearchResults = [];
    state.wikiIssues = [];
    renderWiki();
    byId('wiki-state').replaceChildren(element('p', 'validation-issue', '공유 위키 검색 결과를 불러오지 못했습니다.'));
  }
}

function ticketListItem(ticket) {
  const card = element('button', `ticket-list-item${ticket.id === state.selectedTicketId ? ' selected' : ''}`);
  card.type = 'button';
  const meta = element('div', 'ticket-meta');
  meta.append(element('span', `kind ${ticket.kind ?? 'unknown'}`, text(labels[ticket.kind], '유형 미확인')));
  meta.append(element('span', `status ${ticket.status ?? 'unknown'}`, text(labels[ticket.status], '상태 미확인')));
  card.append(meta, element('h3', '', displayCopy(ticket.title, '제목 미확인')), element('p', 'caption', `${participantLabel(ticket.requester)} → ${participantLabel(ticket.assignee)} · ${peerConfirmation(ticket.status)}`));
  card.addEventListener('click', () => { state.selectedTicketId = ticket.id; renderTickets(); selectCompactView('requests', 'detail'); });
  return card;
}

function renderTicketDetail(ticket) {
  const pane = byId('ticket-detail-pane');
  pane.replaceChildren();
  if (!ticket) return pane.append(element('p', 'detail-empty', '표시할 요청이 없습니다.'));
  const header = element('header', 'ticket-detail-header');
  const meta = element('div', 'ticket-meta');
  meta.append(element('span', `kind ${ticket.kind ?? 'unknown'}`, text(labels[ticket.kind], '유형 미확인')));
  meta.append(element('span', `status ${ticket.status ?? 'unknown'}`, text(labels[ticket.status], '상태 미확인')));
  header.append(meta, element('h3', '', displayCopy(ticket.title, '제목 미확인')), element('p', 'ticket-body', displayCopy(ticket.body, '내용 미확인')));
  const facts = element('div', 'ticket-detail-facts');
  for (const [label, value] of [['요청 흐름', `${participantLabel(ticket.requester)} → ${participantLabel(ticket.assignee)}`], ['상대 확인', peerConfirmation(ticket.status)], ['연결 목표', displayCopy(ticket.goal)]]) {
    const fact = element('div', '');
    fact.append(element('span', '', label), element('strong', '', value));
    facts.append(fact);
  }
  header.append(facts);
  pane.append(header, renderTimeline(ticket));
}

function renderTickets() {
  const matches = filterTickets(state.tickets, state);
  const container = byId('tickets');
  container.replaceChildren();
  byId('ticket-count').textContent = `${matches.length}건`;
  byId('ticket-context').textContent = state.tab === 'inbox'
    ? '미종결 요청입니다. 응답 도착(answered)은 해결 확인(resolved)이 아닙니다.'
    : 'resolved와 closed를 구분한 종결 기록입니다.';
  if (!matches.some((ticket) => ticket.id === state.selectedTicketId)) state.selectedTicketId = matches[0]?.id ?? null;
  if (!matches.length) container.append(empty(state.tab === 'inbox' ? '조건에 맞는 진행 중 요청이 없습니다.' : '조건에 맞는 처리 이력이 없습니다.'));
  matches.forEach((ticket) => container.append(ticketListItem(ticket)));
  renderTicketDetail(matches.find((ticket) => ticket.id === state.selectedTicketId));
}

function renderAttention() {
  const container = byId('attention-list');
  container.replaceChildren();
  const openTickets = filterTickets(state.tickets, { tab: 'inbox' });
  const blockers = state.sessions.flatMap((session) => (session?.blockers ?? []).map((blocker) => ({ session, blocker })));
  const total = openTickets.length + blockers.length;
  byId('attention-count').textContent = total ? `${total}건` : '확인할 항목 없음';
  byId('nav-requests-count').textContent = openTickets.length ? String(openTickets.length) : '';
  for (const ticket of openTickets) {
    const button = element('button', 'attention-item');
    button.type = 'button';
    button.append(element('span', '', ticket.kind === 'feedback' ? '직접 피드백' : '정보 보충'), element('strong', '', displayCopy(ticket.title)), element('small', '', text(labels[ticket.status], '상태 미확인')));
    button.addEventListener('click', () => { state.selectedTicketId = ticket.id; selectCompactView('requests', 'detail'); selectSection('requests'); });
    container.append(button);
  }
  for (const { session, blocker } of blockers) {
    const button = element('button', 'attention-item');
    button.type = 'button';
    button.append(element('span', '', '기록된 병목'), element('strong', '', displayCopy(blocker)), element('small', '', participantLabel(session?.participant)));
    button.addEventListener('click', () => selectSection('records'));
    container.append(button);
  }
  if (!total) container.append(empty('현재 기록에서 확인할 요청이나 병목이 없습니다.'));
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
  state.participants.forEach((value) => peer.add(new Option(participantLabel(value), value)));
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
  byId('source-badge').hidden = sample;
  state.tickets = Array.isArray(snapshot.tickets) ? snapshot.tickets : [];
  state.sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  state.conflicts = Array.isArray(snapshot.conflicts) ? snapshot.conflicts : [];
  state.participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
  state.assignments = [];
  renderGoals(snapshot.goals, snapshot);
  renderParticipants(state.participants, state.sessions);
  renderSessionAnalysis();
  fillFilters();
  renderTickets();
  renderAttention();
  renderSync(snapshot.sync);
  loadWikiList();
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

function selectSection(section) {
  state.section = section;
  for (const name of ['current', 'requests', 'records', 'wiki']) {
    const selected = name === section;
    const button = byId(`nav-${name}`);
    const panel = byId(`panel-${name}`);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    panel.hidden = !selected;
  }
  history.replaceState(null, '', `#${section}`);
}

function selectCompactView(group, view) {
  state.compactViews[group] = view;
  const panel = byId(`panel-${group}`);
  panel.dataset.compactView = view;
  for (const button of document.querySelectorAll(`[data-compact-group="${group}"]`)) {
    const selected = button.dataset.compactView === view;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  }
}

byId('retry').addEventListener('click', load);
byId('brand-home').addEventListener('click', () => selectSection('current'));
for (const section of ['current', 'requests', 'records', 'wiki']) byId(`nav-${section}`).addEventListener('click', () => selectSection(section));
for (const button of document.querySelectorAll('[data-compact-group]')) button.addEventListener('click', () => selectCompactView(button.dataset.compactGroup, button.dataset.compactView));
byId('inbox-tab').addEventListener('click', () => selectTab('inbox'));
byId('history-tab').addEventListener('click', () => selectTab('history'));
byId('ticket-search').addEventListener('input', (event) => { state.query = event.target.value; renderTickets(); });
for (const key of ['status', 'kind', 'peer']) byId(`${key}-filter`).addEventListener('change', (event) => { state[key] = event.target.value; renderTickets(); });
byId('session-period').addEventListener('change', (event) => { state.period = event.target.value; renderSessionAnalysis(); });
byId('wiki-all-tab').addEventListener('click', () => selectWikiTab('all'));
byId('wiki-search-tab').addEventListener('click', () => selectWikiTab('search'));
byId('wiki-refinement-tab').addEventListener('click', () => selectWikiTab('refinement'));
byId('wiki-search-form').addEventListener('submit', searchWiki);
applyStaticUi();
const initialSection = location.hash.slice(1);
if (['current', 'requests', 'records', 'wiki'].includes(initialSection)) selectSection(initialSection);
for (const [group, view] of Object.entries(state.compactViews)) selectCompactView(group, view);
load();
