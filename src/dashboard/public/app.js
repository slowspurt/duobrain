import {
  aggregateSessions,
  filterTickets,
  planPresentation,
  ticketEvidence,
  wikiListRecords,
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
  personal: t('personal'), proposed: t('proposed'), agreed: t('agreed'), superseded: t('superseded'), sourceNote: t('sourceNote'), summary: t('summary'),
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
  document.querySelector('.app-nav').setAttribute('aria-label', t('navLabel'));
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
  byId('ticket-search').closest('label').firstElementChild.textContent = t('search');
  byId('status-filter').closest('label').firstElementChild.textContent = t('status');
  byId('kind-filter').closest('label').firstElementChild.textContent = t('kind');
  byId('peer-filter').closest('label').firstElementChild.textContent = t('peerFilter');
  byId('wiki-query').closest('label').firstElementChild.textContent = t('search');
  byId('wiki-participant').closest('label').firstElementChild.textContent = t('participant');
  byId('wiki-status').closest('label').firstElementChild.textContent = t('status');
  byId('wiki-record-type').closest('label').firstElementChild.textContent = t('recordType');
  byId('wiki-include-superseded').parentElement.lastChild.nodeValue = ` ${t('includeSuperseded')}`;
  document.querySelector('.wiki-submit').textContent = t('submitSearch');
  document.querySelector('.brand-lockup h1').textContent = t('dashboardTitle');
  document.querySelector('.brand-lockup p').textContent = t('dashboardDescription');
  document.querySelector('.brand-lockup p').hidden = !t('dashboardDescription');
  document.querySelector('#sample-banner strong').textContent = t('sample');
  document.querySelector('#sample-banner span').textContent = t('sampleDescription');
  document.querySelector('#error-panel strong').textContent = t('loadFailed');
  document.querySelector('#error-panel span').textContent = t('loadFailed');
  document.querySelector('.people-section .caption').textContent = t('noInference');
  document.querySelector('.panel-heading h2').textContent = t('requests');
  document.querySelector('.records-heading h2').textContent = t('recordedWork');
  document.querySelector('.records-heading p').textContent = t('recordsDescription');
  document.querySelector('.records-heading label span').textContent = t('period');
  byId('panel-records').querySelector('.records-summary .caption').textContent = '';
  const wikiPanel = byId('panel-wiki');
  wikiPanel.querySelector('.panel-heading h2').textContent = t('wikiTitle');
  wikiPanel.querySelector('.panel-heading p').textContent = t('wikiDescription');
  byId('wiki-all-tab').textContent = t('allRecords');
  byId('wiki-search-tab').textContent = t('searchResults');
  byId('wiki-refinement-tab').textContent = t('dailyRefinement');
  byId('panel-records').querySelector('.work-column h3').textContent = t('recentWork');
  byId('panel-records').querySelector('.blockers-column h3').textContent = t('blockers');
  const recordHeadings = byId('panel-records').querySelectorAll('.records-summary h3');
  recordHeadings[0].textContent = t('timeSummary');
  recordHeadings[1].textContent = t('participantTime');
  recordHeadings[2].textContent = t('scopeTime');
  byId('tickets').setAttribute('aria-label', t('requests'));
  byId('wiki-records').setAttribute('aria-label', t('wikiTitle'));
  document.querySelector('#panel-requests .compact-tabs').setAttribute('aria-label', t('compactRequests'));
  document.querySelector('#panel-records .compact-tabs').setAttribute('aria-label', t('compactRecords'));
  document.querySelector('#panel-wiki .compact-tabs').setAttribute('aria-label', t('compactWiki'));
  document.querySelector('#panel-requests .tabs').setAttribute('aria-label', t('requestView'));
  document.querySelector('#panel-wiki .tabs').setAttribute('aria-label', t('wikiView'));
  document.querySelector('.delivery-panel span').textContent = t('delivery');
  document.querySelector('.delivery-panel div:nth-child(2) span').textContent = t('peer');
  document.querySelector('.delivery-panel div:nth-child(2) strong').textContent = t('peerHint');
  for (const option of byId('session-period').options) option.textContent = t(option.value === '7d' ? 'days7' : option.value === '30d' ? 'days30' : 'allRecords');
  for (const select of [byId('kind-filter'), byId('wiki-status'), byId('wiki-record-type')]) {
    for (const option of select.options) {
      const key = option.value === 'source-note' ? 'sourceNote' : option.value || 'all';
      option.textContent = labels[key] ?? t(key);
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
  badge.textContent = ({ agreed: t('planAgreed'), proposed: t('proposed'), conflict: t('planConflict'), none: t('planNone') }[presentation.state] ?? t('unknown'));
  const detail = byId('plan-detail');
  detail.replaceChildren();
  if (!presentation.plan) {
    detail.append(empty(presentation.state === 'conflict'
      ? t('planConflictNotice') : t('planMissingNotice')));
    if (presentation.state === 'conflict') {
      presentation.conflicts.forEach((conflict) => detail.append(element('p', 'conflict-copy', text(conflict?.message, t('noConflictDetail')))));
    }
    return;
  }
  state.assignments = Array.isArray(presentation.plan.assignments) ? presentation.plan.assignments : [];
  const explorer = element('details', 'plan-explorer');
  explorer.append(element('summary', '', t('planView')));
  const explorerBody = element('div', 'plan-explorer-body');
  explorerBody.append(element('p', 'plan-body', text(presentation.plan.body, t('noPlanDetail'))));
  const assignments = element('div', 'assignment-grid');
  for (const assignment of state.assignments) {
    const card = element('article', 'assignment-card');
    card.append(element('h3', '', participantLabel(assignment?.participant)));
    const scopes = element('div', 'chips');
    const scopeItems = Array.isArray(assignment?.scope) ? assignment.scope : [];
    (scopeItems.length ? scopeItems : [t('noAssignments')]).forEach((scope) => scopes.append(element('span', `chip${scopeItems.length ? '' : ' muted'}`, scope)));
    card.append(scopes, element('p', 'assignment-next', `${t('next')} · ${displayCopy(assignment?.next)}`));
    assignments.append(card);
  }
  explorerBody.append(assignments);
  const expandable = element('details', 'plan-history');
  expandable.append(element('summary', '', t('planHistory')));
  const history = element('div', 'plan-history-list');
  for (const event of Array.isArray(presentation.plan.history) ? presentation.plan.history : []) {
    const item = element('article', 'timeline-item');
    item.append(element('p', 'timeline-type', text(event?.type, t('eventUnknown'))));
    item.append(element('p', 'caption', `${formatDate(event?.at)} · ${participantLabel(event?.actor?.participant)} (${text(event?.actor?.kind, t('noActor'))})`));
    if (event?.data?.body) item.append(element('p', 'timeline-body', displayCopy(event.data.body)));
    history.append(item);
  }
  if (!history.children.length) history.append(empty(t('noHistory')));
  const evidence = Array.isArray(presentation.plan.evidence) ? presentation.plan.evidence : [];
  history.append(element('h4', '', t('evidence')));
  if (evidence.length) appendEvidenceButtons(history, evidence);
  else history.append(empty(t('noEvidence')));
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
  const start = formatDate(session.startedAt, t('startUnknown'));
  if (!session.endedAt) return `${start} · ${t('unfinished')}`;
  return `${start} — ${formatDate(session.endedAt, t('endUnknown'))} · ${t('recordedRange')}`;
}

function renderParticipants(participants = [], sessions = []) {
  const container = byId('participants');
  container.replaceChildren();
  if (!participants.length) return container.append(empty(t('noParticipants')));
  participants.forEach((participant) => {
    const recent = sessions.filter((session) => session?.participant === participant).at(-1);
    const assignment = state.assignments.find((item) => item?.participant === participant);
    const card = element('article', 'person-card');
    const heading = element('div', 'person-heading');
    heading.append(element('h3', '', participantLabel(participant)), element('span', `status ${recent ? recent.status : 'unknown'}`, recent ? text(labels[recent.status]) : t('noRecord')));
    card.append(heading);
    const role = element('dl', 'person-role');
    const scopes = Array.isArray(assignment?.scope) ? assignment.scope : [];
    role.append(element('dt', '', t('roleScope')), element('dd', '', scopes.join(', ') || (recent?.scope ?? []).join(', ') || t('unknown')));
    role.append(element('dt', '', t('nextAction')), element('dd', '', displayCopy(assignment?.next ?? recent?.next)));
    card.append(role);
    if (!recent) {
      card.append(empty(t('noRecentWork')));
      container.append(card);
      return;
    }
    card.append(element('p', 'session-title', displayCopy(recent.title, t('noTitle'))), element('p', 'recorded-time', formatRecordedRange(recent)));
    const scope = element('div', 'chips');
    const scopeItems = Array.isArray(recent.scope) ? recent.scope : [];
    (scopeItems.length ? scopeItems : [t('noScope')]).forEach((item) => scope.append(element('span', `chip${scopeItems.length ? '' : ' muted'}`, text(item))));
    card.append(scope);
    const blockers = element('div', 'blockers');
    blockers.append(element('p', 'label', t('blockers')));
    const blockerItems = Array.isArray(recent.blockers) ? recent.blockers : [];
    blockers.append(blockerItems.length ? element('p', '', blockerItems.map((item) => displayCopy(item)).join(' · ')) : empty(t('noBlockers')));
    card.append(blockers);
    container.append(card);
  });
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return t('unknown');
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}${t('minutes')}`;
  return minutes ? `${hours}${t('hours')} ${minutes}${t('minutes')}` : `${hours}${t('hours')}`;
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
  overview.append(metricRow(t('projectInterval'), formatDuration(result.projectWallClockMs), t('projectIntervalNote')));
  overview.append(metricRow(t('unknownTime'), String(result.unknownSessionCount), t('unknownTimeNote')));

  const participant = byId('participant-time');
  participant.replaceChildren();
  const participantIds = [...new Set([...state.participants, ...result.participantTotals.map((item) => item.participant)])];
  if (!participantIds.length) participant.append(empty(t('noTimeRecords')));
  for (const participantId of participantIds) {
    const item = result.participantTotals.find((entry) => entry.participant === participantId);
    if (!item) {
      participant.append(metricRow(participantLabel(participantId), t('noRecord')));
      continue;
    }
    const note = item.unknownSessionCount ? `${t('unknownTime')} ${item.unknownSessionCount}` : '';
    participant.append(metricRow(participantLabel(item.participant), formatDuration(item.recordedActiveMs), note));
  }

  const scopes = byId('scope-time');
  scopes.replaceChildren();
  if (!result.scopeTotals.length) scopes.append(empty(t('noScopeRecords')));
  for (const item of result.scopeTotals) scopes.append(metricRow(`${participantLabel(item.participant)} · ${item.scope ?? t('unknown')}`, formatDuration(item.recordedActiveMs)));

  const sessions = byId('session-records');
  sessions.replaceChildren();
  if (!result.sessions.length) sessions.append(empty(t('noSessions')));
  for (const item of result.sessions) {
    const card = element('article', 'session-record-card');
    const heading = element('div', 'person-heading');
    heading.append(element('strong', '', displayCopy(item.title, t('noTitle'))), element('span', `time-state ${item.timeStatus}`, item.timeStatus === 'known' ? t('timeKnown') : t('timeUnknown')));
    card.append(heading, element('p', 'caption', `${participantLabel(item.participant)} · ${formatDate(item.startedAt, t('startUnknown'))}`));
    if (item.summary) card.append(element('p', 'session-summary', displayCopy(item.summary)));
    const technical = element('details', 'session-technical');
    technical.append(element('summary', '', t('timeDetails')));
    const technicalBody = element('div', 'session-technical-body');
    const timings = element('div', 'session-times');
    timings.append(metricRow(t('totalInterval'), formatDuration(item.wallClockMs)));
    timings.append(metricRow(t('activeInterval'), formatDuration(item.recordedActiveMs)));
    technicalBody.append(timings);
    technical.append(technicalBody);
    card.append(technical);
    sessions.append(card);
  }

  const blockers = byId('blocker-list');
  blockers.replaceChildren();
  if (!result.blockers.length) blockers.append(empty(t('noBlockers')));
  for (const item of result.blockers) {
    const row = element('article', 'blocker-row');
    row.append(element('p', 'label', `${participantLabel(item.participant)} · ${displayCopy(item.title)}`), element('p', '', displayCopy(item.blocker)));
    blockers.append(row);
  }
}

function renderTimeline(ticket) {
  const section = element('section', 'ticket-detail');
  section.append(element('h4', '', t('details')));
  const history = Array.isArray(ticket.history) ? ticket.history : [];
  if (!history.length) section.append(empty(t('noDetails')));
  for (const event of history) {
    const item = element('article', 'timeline-item');
    item.append(element('p', 'timeline-type', text(event?.type, t('eventUnknown'))));
    item.append(element('p', 'caption', `${formatDate(event?.at)} · ${participantLabel(event?.actor?.participant)} (${text(event?.actor?.kind, t('noActor'))})`));
    if (event?.data?.body) item.append(element('p', 'timeline-body', displayCopy(event.data.body)));
    section.append(item);
  }
  const evidence = ticketEvidence(ticket);
  section.append(element('h4', '', t('evidencePaths')));
  if (!evidence.length) section.append(empty(t('noEvidencePaths')));
  else appendEvidenceButtons(section, evidence);
  return section;
}

async function loadEvidence(path, button, content) {
  button.disabled = true;
  content.hidden = false;
  content.replaceChildren(element('p', 'caption', t('loadEvidence')));
  try {
    const response = await fetch(`/api/wiki?path=${encodeURIComponent(path)}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) {
      const missing = response.status === 404;
      const label = missing ? t('evidenceMissing') : response.status === 413 ? t('tooLarge') : t('requestFailed');
      content.replaceChildren(element('strong', `validation ${missing ? 'missing' : 'failure'}`, label), element('p', 'caption', text(result.message, t('noEvidenceNote'))));
      return;
    }
    const heading = element('div', 'evidence-heading');
    heading.append(element('strong', `validation ${result.validation?.valid === true ? 'valid' : 'failure'}`, result.validation?.valid === true ? (locale === 'ko' ? '검증 통과' : 'Validated') : (locale === 'ko' ? '검증 실패' : 'Validation failed')));
    if (state.sample) heading.append(element('span', 'sample-evidence', t('sampleEvidence')));
    content.replaceChildren(heading);
    for (const issue of [...(result.validation?.errors ?? []), ...(result.validation?.warnings ?? [])]) {
      content.append(element('p', 'validation-issue', `${text(issue?.code, 'UNKNOWN')} · ${text(issue?.message, t('noIssueDetail'))}`));
    }
    content.append(element('pre', 'note-markdown', result.markdown));
  } catch {
    content.replaceChildren(element('strong', 'validation failure', t('requestFailed')));
  } finally {
    button.disabled = false;
  }
}

function wikiMetadata(record) {
  const parts = [
    labels[record.recordType === 'source-note' ? 'sourceNote' : record.recordType] ?? t('unknown'),
    labels[record.status] ?? t('unknown'),
    state.sample ? participantLabel(record.author?.participant) : text(record.author?.participant, t('noAuthor')),
    formatDate(record.observedAt),
  ];
  return parts.join(' · ');
}

async function loadLineage(path, button, content) {
  button.disabled = true;
  content.hidden = false;
  content.replaceChildren(element('p', 'caption', t('lineageLoading')));
  try {
    const response = await fetch(`/api/wiki/lineage?root=${encodeURIComponent(path)}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) {
      content.replaceChildren(element('strong', 'validation failure', t('lineageFailed')), element('p', 'caption', text(result.message)));
      return;
    }
    content.replaceChildren(element('p', 'caption', `${result.nodes.length} ${t('countNodes')} · ${result.edges.length} ${t('countLinks')}`));
    for (const edge of result.edges) content.append(element('p', 'lineage-edge', `${edge.from} — ${edge.relation} → ${edge.to}`));
    for (const issue of result.issues) {
      const missing = /^MISSING_/.test(issue?.code ?? '');
      content.append(element('p', `validation-issue${missing ? ' missing-copy' : ''}`, `${text(issue?.code, 'UNKNOWN')} · ${text(issue?.message, t('noIssueDetail'))}`));
    }
    if (!result.edges.length && !result.issues.length) content.append(empty(t('noLineage')));
  } catch {
    content.replaceChildren(element('strong', 'validation failure', t('lineageFailed')));
  } finally {
    button.disabled = false;
  }
}

function wikiRecordDetail(record) {
  const card = element('article', 'wiki-card');
  const heading = element('div', 'wiki-card-heading');
  heading.append(element('h3', '', text(record.title, record.format === 'legacy' ? t('legacyRecord') : t('noTitle'))));
  if (record.validation) {
    heading.append(element('span', `validation ${record.validation.valid === true ? 'valid' : 'failure'}`, record.validation.valid === true ? (locale === 'ko' ? '검증 통과' : 'Validated') : (locale === 'ko' ? '검증 실패' : 'Validation failed')));
  }
  card.append(heading, element('p', 'caption', wikiMetadata(record)), element('code', 'wiki-path', record.path));
  const actions = element('div', 'wiki-actions');
  const sourceButton = element('button', 'evidence-link', t('viewSource'));
  const lineageButton = element('button', 'evidence-link', t('viewLineage'));
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
  button.append(element('h3', '', text(record.title, record.format === 'legacy' ? t('legacyRecord') : t('noTitle'))));
  button.append(element('p', 'caption', wikiMetadata(record)));
  button.addEventListener('click', () => {
    state.selectedWikiPath = record.path;
    renderWiki();
    selectCompactView('wiki', 'detail');
  });
  return button;
}

function renderWiki() {
  const container = byId('wiki-records');
  const stateCopy = byId('wiki-state');
  container.replaceChildren();
  stateCopy.replaceChildren();
  let records = state.wikiTab === 'search' ? state.wikiSearchResults : state.wikiRecords;
  if (state.wikiTab === 'refinement') records = state.wikiRecords.filter((record) => record.dailyRefinement !== null);
  byId('wiki-count').textContent = String(records.length);
  for (const issue of state.wikiIssues) stateCopy.append(element('p', 'validation-issue', `${text(issue?.code, 'UNKNOWN')} · ${text(issue?.message, t('noIssueDetail'))}`));
  if (!records.length) {
    const message = state.wikiTab === 'refinement' ? t('noRefinement') : t('noMatchingWiki');
    container.append(empty(message));
  } else {
    if (!records.some((record) => record.path === state.selectedWikiPath)) state.selectedWikiPath = records[0].path;
    records.forEach((record) => container.append(wikiRecordListItem(record)));
  }
  const detail = byId('wiki-detail-pane');
  detail.replaceChildren();
  const selected = records.find((record) => record.path === state.selectedWikiPath);
  if (selected) detail.append(wikiRecordDetail(selected));
  else detail.append(element('p', 'detail-empty', t('noWiki')));
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
    byId('wiki-state').replaceChildren(element('p', 'sample-wiki', t('noWiki')));
    return;
  }
  byId('wiki-state').replaceChildren(element('p', 'caption', t('wikiLoading')));
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
    byId('wiki-state').replaceChildren(element('p', 'validation-issue', t('wikiLoadFailed')));
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
  byId('wiki-state').replaceChildren(element('p', 'caption', t('wikiSearching')));
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
    byId('wiki-state').replaceChildren(element('p', 'validation-issue', t('wikiSearchFailed')));
  }
}

function ticketListItem(ticket) {
  const card = element('button', `ticket-list-item${ticket.id === state.selectedTicketId ? ' selected' : ''}`);
  card.type = 'button';
  const meta = element('div', 'ticket-meta');
  meta.append(element('span', `kind ${ticket.kind ?? 'unknown'}`, labels[ticket.kind] ?? t('unknown')));
  meta.append(element('span', `status ${ticket.status ?? 'unknown'}`, labels[ticket.status] ?? t('unknown')));
  card.append(meta, element('h3', '', displayCopy(ticket.title, t('noTitle'))), element('p', 'caption', `${participantLabel(ticket.requester)} → ${participantLabel(ticket.assignee)} · ${labels[ticket.status] ?? t('unknown')}`));
  card.addEventListener('click', () => { state.selectedTicketId = ticket.id; renderTickets(); selectCompactView('requests', 'detail'); });
  return card;
}

function renderTicketDetail(ticket) {
  const pane = byId('ticket-detail-pane');
  pane.replaceChildren();
  if (!ticket) return pane.append(element('p', 'detail-empty', t('noRequest')));
  const header = element('header', 'ticket-detail-header');
  const meta = element('div', 'ticket-meta');
  meta.append(element('span', `kind ${ticket.kind ?? 'unknown'}`, labels[ticket.kind] ?? t('unknown')));
  meta.append(element('span', `status ${ticket.status ?? 'unknown'}`, labels[ticket.status] ?? t('unknown')));
  header.append(meta, element('h3', '', displayCopy(ticket.title, t('noTitle'))), element('p', 'ticket-body', displayCopy(ticket.body, t('unknown'))));
  const facts = element('div', 'ticket-detail-facts');
  for (const [label, value] of [[t('requestFlow'), `${participantLabel(ticket.requester)} → ${participantLabel(ticket.assignee)}`], [t('peer'), labels[ticket.status] ?? t('unknown')], [t('linkedGoal'), displayCopy(ticket.goal)]]) {
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
  byId('ticket-count').textContent = String(matches.length);
  byId('ticket-context').textContent = state.tab === 'inbox'
    ? t('inboxContext') : t('historyContext');
  if (!matches.some((ticket) => ticket.id === state.selectedTicketId)) state.selectedTicketId = matches[0]?.id ?? null;
  if (!matches.length) container.append(empty(state.tab === 'inbox' ? t('noInbox') : t('noHistoryRequests')));
  matches.forEach((ticket) => container.append(ticketListItem(ticket)));
  renderTicketDetail(matches.find((ticket) => ticket.id === state.selectedTicketId));
}

function renderAttention() {
  const container = byId('attention-list');
  container.replaceChildren();
  const openTickets = filterTickets(state.tickets, { tab: 'inbox' });
  const blockers = state.sessions.flatMap((session) => (session?.blockers ?? []).map((blocker) => ({ session, blocker })));
  const total = openTickets.length + blockers.length;
  byId('attention-count').textContent = total ? String(total) : t('nothingToCheck');
  byId('nav-requests-count').textContent = openTickets.length ? String(openTickets.length) : '';
  for (const ticket of openTickets) {
    const button = element('button', 'attention-item');
    button.type = 'button';
    button.append(element('span', '', labels[ticket.kind] ?? t('unknown')), element('strong', '', displayCopy(ticket.title)), element('small', '', labels[ticket.status] ?? t('unknown')));
    button.addEventListener('click', () => { state.selectedTicketId = ticket.id; selectCompactView('requests', 'detail'); selectSection('requests'); });
    container.append(button);
  }
  for (const { session, blocker } of blockers) {
    const button = element('button', 'attention-item');
    button.type = 'button';
    button.append(element('span', '', t('blockers')), element('strong', '', displayCopy(blocker)), element('small', '', participantLabel(session?.participant)));
    button.addEventListener('click', () => selectSection('records'));
    container.append(button);
  }
  if (!total) container.append(empty(t('noAttention')));
}

function fillFilters() {
  const status = byId('status-filter');
  status.replaceChildren(new Option(t('all'), ''));
  const statuses = state.tab === 'inbox' ? ['open', 'acknowledged', 'needs_information', 'answered'] : ['resolved', 'closed'];
  statuses.forEach((value) => status.add(new Option(labels[value], value)));
  if (!statuses.includes(state.status)) state.status = '';
  status.value = state.status;
  const peer = byId('peer-filter');
  peer.replaceChildren(new Option(t('all'), ''));
  state.participants.forEach((value) => peer.add(new Option(participantLabel(value), value)));
  peer.value = state.peer;
}

function renderSync(sync = {}) {
  const status = ['synced', 'pending', 'error', 'unknown'].includes(sync.status) ? sync.status : 'unknown';
  const badge = byId('sync-badge');
  badge.className = `status ${status}`;
  badge.textContent = labels[status];
  const copy = { synced: t('syncedCopy'), pending: t('pendingCopy'), error: t('errorCopy'), unknown: t('unknownCopy') };
  byId('delivery-copy').textContent = copy[status];
  byId('sync-message').textContent = text(sync.message, sync.lastSyncedAt ? formatDate(sync.lastSyncedAt) : t('unknown'));
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
