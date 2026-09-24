import {
  aggregateSessions,
  filterTickets,
  peerConfirmation,
  planPresentation,
  ticketEvidence,
  ticketTurn,
  wikiListRecords,
  wikiValidationPresentation,
} from '/model.js';
import { resolveLocale, translator } from '/i18n.js';

const byId = (id) => document.getElementById(id);
const localeStorageKey = 'duobrain.dashboard.locale';
function storedLocale() {
  try { return localStorage.getItem(localeStorageKey); } catch { return null; }
}
const viewerStorageKey = 'duobrain.dashboard.viewer';
function storedViewer() {
  try { return localStorage.getItem(viewerStorageKey) ?? ''; } catch { return ''; }
}
const locale = resolveLocale({ search: location.search, stored: storedLocale(), languages: navigator.languages });
const t = translator(locale);
document.documentElement.lang = locale;
document.title = `duobrain ${t('dashboardTitle')}`;
const labels = {
  project: t('project'), mediumTerm: t('mediumTerm'), currentPhase: t('currentPhase'),
  active: t('active'), paused: t('paused'), ended: t('ended'),
  information: t('information'), feedback: t('feedback'),
  synced: t('synced'), pending: t('pending'), error: t('error'), unknown: t('unknown'), syncUnknown: t('syncUnknown'),
  open: t('open'), acknowledged: t('acknowledged'), needs_information: t('needs_information'), answered: t('answered'), resolved: t('resolved'), closed: t('closed'),
  personal: t('personal'), proposed: t('proposed'), agreed: t('agreed'), superseded: t('superseded'), sourceNote: t('sourceNote'), summary: t('summary'),
};

const state = {
  tickets: [], sessions: [], conflicts: [], participants: [], sample: false,
  tab: 'inbox', query: '', status: '', kind: '', peer: '', period: '30d',
  wikiTab: 'all', wikiRecords: [], wikiSearchResults: [], wikiIssues: [],
  section: 'current', selectedTicketId: null, selectedWikiPath: null, assignments: [],
  compactViews: { requests: 'list', records: 'work', wiki: 'list' }, locale, viewer: storedViewer(),
};
const format = (key, values) => t(key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const text = (value, fallback = t('unknown')) => typeof value === 'string' && value.trim() ? value : fallback;
const participantLabel = (value) => {
  if (!state.sample) return text(value);
  const index = state.participants.indexOf(value);
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : text(value);
};
const displayCopy = (value, fallback = t('unknown')) => {
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
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
  for (const node of document.querySelectorAll('[data-i18n-aria-label]')) node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  for (const button of document.querySelectorAll('[data-locale]')) {
    const selected = button.dataset.locale === locale;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function switchLocale(next) {
  try { localStorage.setItem(localeStorageKey, next); } catch { /* the query parameter still applies */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  location.replace(url);
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
    // The status badge already says there is no shared plan; only a conflict needs explaining.
    if (presentation.state === 'conflict') {
      detail.append(empty(t('planConflictNotice')));
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
    item.append(element('p', 'timeline-type', eventLabel(event?.type)));
    item.append(element('p', 'caption', `${actorLabel(event?.actor)} · ${formatDate(event?.at)}`));
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

function formatDate(value, fallback = t('unknown')) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
    : fallback;
}

const relativeFormat = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
function relativeTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const difference = timestamp - Date.now();
  if (Math.abs(difference) < 60_000) return t('justNow');
  for (const [unit, size] of [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]]) {
    if (Math.abs(difference) >= size || unit === 'minute') return relativeFormat.format(Math.round(difference / size), unit);
  }
  return null;
}

function formatRecordedRange(session) {
  const started = relativeTime(session.startedAt);
  if (!started) return t('startUnknown');
  if (!session.endedAt) return format('startedRelative', { time: started });
  return format('finishedRange', { range: `${formatDate(session.startedAt)} — ${formatDate(session.endedAt, t('endUnknown'))}`, time: relativeTime(session.endedAt) ?? '' });
}

const ticketOpenedAt = (ticket) => (Array.isArray(ticket?.history) ? ticket.history : []).find((event) => event?.type === 'ticket.created')?.at ?? null;
const ticketAge = (ticket) => {
  const opened = relativeTime(ticketOpenedAt(ticket));
  return opened ? format('askedRelative', { time: opened }) : null;
};
const eventLabel = (type) => typeof type === 'string' && t(`event.${type}`) !== `event.${type}` ? t(`event.${type}`) : text(type, t('eventUnknown'));
const actorLabel = (actor) => {
  const person = participantLabel(actor?.participant);
  return actor?.kind === 'ai' ? format('viaAi', { person }) : person;
};

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
    const scopes = Array.isArray(assignment?.scope) && assignment.scope.length ? assignment.scope : (Array.isArray(recent?.scope) ? recent.scope : []);
    const next = assignment?.next ?? recent?.next;
    if (scopes.length) role.append(element('dt', '', t('roleScope')), element('dd', '', scopes.join(', ')));
    if (typeof next === 'string' && next.trim()) role.append(element('dt', '', t('nextAction')), element('dd', 'next-copy', displayCopy(next)));
    if (role.children.length) card.append(role);
    if (!recent) {
      card.append(empty(t('noRecentWork')));
      container.append(card);
      return;
    }
    card.append(element('p', 'session-title', displayCopy(recent.title, t('noTitle'))), element('p', 'recorded-time', formatRecordedRange(recent)));
    const blockerItems = Array.isArray(recent.blockers) ? recent.blockers : [];
    if (blockerItems.length) {
      const blockers = element('div', 'blockers');
      blockers.append(element('p', 'label', t('blockers')), element('p', '', blockerItems.map((item) => displayCopy(item)).join(' · ')));
      card.append(blockers);
    }
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
    const note = item.unknownSessionCount ? format('notCountedCount', { count: item.unknownSessionCount }) : '';
    const nothingCounted = item.recordedActiveMs === 0 && item.unknownSessionCount > 0;
    participant.append(metricRow(participantLabel(item.participant), nothingCounted ? '—' : formatDuration(item.recordedActiveMs), note));
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
    card.append(heading, element('p', 'caption', `${participantLabel(item.participant)} · ${formatRecordedRange(item)}`));
    if (item.timeStatus !== 'known' && item.timeReason) card.append(element('p', 'caption time-reason', format('notCountedBecause', { reason: t(`reason.${item.timeReason}`) })));
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
    item.append(element('p', 'timeline-type', eventLabel(event?.type)));
    item.append(element('p', 'caption', `${actorLabel(event?.actor)} · ${formatDate(event?.at)}`));
    if (event?.data?.body) item.append(element('p', 'timeline-body', displayCopy(event.data.body)));
    section.append(item);
  }
  const evidence = ticketEvidence(ticket);
  section.append(element('h4', '', t('evidencePaths')));
  if (!evidence.length) section.append(empty(t('noEvidencePaths')));
  else appendEvidenceButtons(section, evidence);
  return section;
}

const apiErrorCopy = (result) => t(`apiError.${result?.error}`) === `apiError.${result?.error}` ? t('noIssueDetail') : t(`apiError.${result?.error}`);

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
      content.replaceChildren(element('strong', `validation ${missing ? 'missing' : 'failure'}`, label), element('p', 'caption', apiErrorCopy(result)));
      return;
    }
    const validation = wikiValidationPresentation(result.validation);
    const heading = element('div', 'evidence-heading');
    heading.append(element('strong', `validation ${validation.kind}`, t(validation.title)));
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
      content.replaceChildren(element('strong', 'validation failure', t('lineageFailed')), element('p', 'caption', apiErrorCopy(result)));
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
    const validation = wikiValidationPresentation(record.validation);
    heading.append(element('span', `validation ${validation.kind}`, t(validation.title)));
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
  byId('panel-wiki').classList.toggle('sample-mode', state.sample);
  if (state.sample) {
    state.wikiRecords = [];
    state.wikiIssues = [];
    renderWiki();
    byId('wiki-state').replaceChildren(element('p', 'sample-wiki', t('wikiSampleNotice')));
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
  card.append(meta, element('h3', '', displayCopy(ticket.title, t('noTitle'))), element('p', 'caption', [`${participantLabel(ticket.requester)} → ${participantLabel(ticket.assignee)}`, ticketAge(ticket), turnCopy(ticket)].filter(Boolean).join(' · ')));
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
  for (const [label, value] of [[t('requestFlow'), `${participantLabel(ticket.requester)} → ${participantLabel(ticket.assignee)}`], [t('peer'), [t(`peer.${peerConfirmation(ticket.status)}`), turnCopy(ticket)].filter(Boolean).join(' · ')], [t('linkedGoal'), displayCopy(ticket.goal)]]) {
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

function turnCopy(ticket) {
  const turn = ticketTurn(ticket);
  if (!turn) return null;
  return state.viewer && turn === state.viewer ? t('yourTurn') : format('waitingOn', { person: participantLabel(turn) });
}

function renderViewer() {
  const select = byId('viewer');
  if (state.viewer && !state.participants.includes(state.viewer)) state.viewer = '';
  select.replaceChildren(new Option(t('everyone'), ''));
  state.participants.forEach((value) => select.add(new Option(participantLabel(value), value)));
  select.value = state.viewer;
}

function renderAttention() {
  const container = byId('attention-list');
  container.replaceChildren();
  const openedAt = (ticket) => Date.parse(ticketOpenedAt(ticket)) || Number.POSITIVE_INFINITY;
  const mine = (ticket) => Boolean(state.viewer) && ticketTurn(ticket) === state.viewer;
  const openTickets = filterTickets(state.tickets, { tab: 'inbox' })
    .sort((left, right) => Number(mine(right)) - Number(mine(left)) || openedAt(left) - openedAt(right));
  const blockers = state.sessions.flatMap((session) => (session?.blockers ?? []).map((blocker) => ({ session, blocker })));
  const total = openTickets.length + blockers.length;
  byId('attention-count').textContent = total ? String(total) : '';
  byId('nav-requests-count').textContent = openTickets.length ? String(openTickets.length) : '';
  for (const ticket of openTickets) {
    const button = element('button', `attention-item${mine(ticket) ? ' mine' : ''}`);
    button.type = 'button';
    const meta = [turnCopy(ticket), labels[ticket.status] ?? t('unknown'), relativeTime(ticketOpenedAt(ticket))].filter(Boolean).join(' · ');
    button.append(element('span', '', labels[ticket.kind] ?? t('unknown')), element('strong', '', displayCopy(ticket.title)), element('small', '', meta));
    button.addEventListener('click', () => { state.selectedTicketId = ticket.id; renderTickets(); selectCompactView('requests', 'detail'); selectSection('requests'); });
    container.append(button);
  }
  for (const { session, blocker } of blockers) {
    const button = element('button', 'attention-item blocker');
    button.type = 'button';
    button.append(element('span', '', t('blockers')), element('strong', '', displayCopy(blocker)), element('small', '', [participantLabel(session?.participant), displayCopy(session?.title, '')].filter(Boolean).join(' · ')));
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
  badge.textContent = labels[status === 'unknown' ? 'syncUnknown' : status];
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
  renderViewer();
  renderAttention();
  renderSync(snapshot.sync);
  loadWikiList();
}

const refreshIntervalMs = 30_000;
let lastSnapshotBody = null;
let lastLoadedAt = null;

function renderUpdated() {
  const button = byId('refresh');
  button.textContent = lastLoadedAt ? format('updatedRelative', { time: relativeTime(new Date(lastLoadedAt).toISOString()) }) : t('refresh');
  button.title = t('refresh');
}

// Re-renders only when the snapshot changed, so open details survive quiet refreshes.
async function load() {
  try {
    const response = await fetch(`/api/snapshot?lang=${locale}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    byId('error-panel').hidden = true;
    if (body !== lastSnapshotBody) {
      lastSnapshotBody = body;
      render(JSON.parse(body));
    }
    lastLoadedAt = Date.now();
  } catch {
    byId('error-panel').hidden = false;
    if (lastSnapshotBody === null) render({ sample: false, participants: [], goals: {}, sessions: [], tickets: [], sync: { status: 'error', message: t('loadFailed') } });
  }
  renderUpdated();
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
byId('refresh').addEventListener('click', load);
byId('viewer').addEventListener('change', (event) => {
  state.viewer = event.target.value;
  try { localStorage.setItem(viewerStorageKey, state.viewer); } catch { /* the choice lasts for this page */ }
  renderAttention();
  renderTickets();
});
setInterval(() => {
  if (document.visibilityState === 'visible') load();
}, refreshIntervalMs);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!lastLoadedAt || Date.now() - lastLoadedAt > refreshIntervalMs)) load();
});
window.addEventListener('hashchange', () => {
  const section = location.hash.slice(1);
  if (['current', 'requests', 'records', 'wiki'].includes(section) && section !== state.section) selectSection(section);
});
for (const button of document.querySelectorAll('[data-locale]')) button.addEventListener('click', () => switchLocale(button.dataset.locale));
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
