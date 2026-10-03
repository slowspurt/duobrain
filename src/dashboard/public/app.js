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
const storage = {
  get(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* the choice lasts for this page */ } },
};
const keys = { locale: 'duobrain.dashboard.locale', viewer: 'duobrain.dashboard.viewer', sidebar: 'duobrain.dashboard.sidebar', refresh: 'duobrain.dashboard.refresh' };
const locale = resolveLocale({ search: location.search, stored: storage.get(keys.locale), languages: navigator.languages });
const t = translator(locale);
document.documentElement.lang = locale;
document.title = `duobrain ${t('dashboardTitle')}`;
const sections = ['current', 'requests', 'records', 'wiki', 'settings'];

const state = {
  tickets: [], sessions: [], conflicts: [], participants: [], profiles: [], goals: {}, sample: false, identity: null,
  tab: 'inbox', query: '', status: '', kind: '', peer: '', period: '30d',
  wikiTab: 'all', wikiRecords: [], wikiSearchResults: [], wikiIssues: [],
  section: 'current', selectedTicketId: null, selectedWikiPath: null, assignments: [],
  viewer: storage.get(keys.viewer, ''),
};

// ---------- copy helpers ----------
const format = (key, values) => t(key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const text = (value, fallback = t('unknown')) => typeof value === 'string' && value.trim() ? value : fallback;
const profileFor = (participant) => state.profiles.find((profile) => profile?.participant === participant) ?? null;
const participantLabel = (value) => {
  if (!state.sample) return text(profileFor(value)?.nickname, text(value));
  const index = state.participants.indexOf(value);
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : text(value);
};
const personName = (value) => (state.viewer && value === state.viewer ? format('youSuffix', { person: participantLabel(value) }) : participantLabel(value));
const personRef = (value) => (state.viewer && value === state.viewer ? t('you') : participantLabel(value));
// Sample copy mentions people by id; show the same A/B letters the rest of the sample uses.
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
const labels = {
  active: t('active'), paused: t('paused'), ended: t('ended'), information: t('information'), feedback: t('feedback'),
  synced: t('synced'), pending: t('pending'), error: t('error'), unknown: t('syncUnknown'),
  open: t('open'), acknowledged: t('acknowledged'), needs_information: t('needs_information'), answered: t('answered'), resolved: t('resolved'), closed: t('closed'),
  personal: t('personal'), proposed: t('proposed'), agreed: t('agreed'), superseded: t('superseded'), 'source-note': t('sourceNote'), summary: t('summary'),
};

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined && value !== null) node.textContent = value;
  return node;
}
const empty = (message) => element('p', 'empty', message);
const personClass = (participant) => {
  const index = state.participants.indexOf(participant);
  return index === 0 ? 'p0' : index === 1 ? 'p1' : 'px';
};
function face(participant, { size = '', status } = {}) {
  const node = element('span', `face ${personClass(participant)} ${size}`.trim(), participantLabel(participant).slice(0, 1).toUpperCase());
  node.setAttribute('aria-hidden', 'true');
  if (status) node.dataset.state = status;
  return node;
}

// ---------- time helpers ----------
function formatDate(value, fallback = t('unknown')) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp) : fallback;
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
function dayLabel(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return t('unknown');
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const days = Math.floor((startOfToday - new Date(timestamp).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 1) return relativeFormat.format(-days, 'day');
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(timestamp);
}
function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '—';
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}${t('minutes')}`;
  return minutes ? `${hours}${t('hours')} ${minutes}${t('minutes')}` : `${hours}${t('hours')}`;
}
function formatRecordedRange(session) {
  const started = relativeTime(session.startedAt);
  if (!started) return t('startUnknown');
  if (!session.endedAt) return format('startedRelative', { time: started });
  return format('finishedRange', { range: `${formatDate(session.startedAt)} — ${formatDate(session.endedAt, t('endUnknown'))}`, time: relativeTime(session.endedAt) ?? '' });
}
function selectedPeriod() {
  if (state.period === 'all') return {};
  const days = state.period === '7d' ? 7 : 30;
  const to = new Date();
  return { from: new Date(to.getTime() - days * 86_400_000).toISOString(), to: to.toISOString() };
}
const ticketOpenedAt = (ticket) => (Array.isArray(ticket?.history) ? ticket.history : []).find((event) => event?.type === 'ticket.created')?.at ?? null;
const eventLabel = (type) => (typeof type === 'string' && t(`event.${type}`) !== `event.${type}` ? t(`event.${type}`) : text(type, t('eventUnknown')));
const actorLabel = (actor) => {
  const person = personName(actor?.participant);
  return actor?.kind === 'ai' ? format('viaAi', { person }) : person;
};
const latestSession = (participant) => state.sessions
  .filter((session) => session?.participant === participant)
  .sort((left, right) => (Date.parse(left?.startedAt) || 0) - (Date.parse(right?.startedAt) || 0))
  .at(-1);

// ---------- static copy and shell ----------
function applyStaticUi() {
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
  for (const node of document.querySelectorAll('[data-i18n-aria-label]')) node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  for (const section of sections) byId(`nav-${section}`).title = t(section);
  byId('update-button').title = t('checkUpdates');
  const chosen = new URLSearchParams(location.search).get('lang') ?? storage.get(keys.locale) ?? 'auto';
  for (const button of document.querySelectorAll('[data-locale]')) button.setAttribute('aria-checked', String(button.dataset.locale === chosen));
  const browserLocale = resolveLocale({ languages: navigator.languages });
  const languageName = new Intl.DisplayNames([browserLocale], { type: 'language' }).of(browserLocale);
  byId('language-help').textContent = format('languageHelp', { language: languageName });
}
// "auto" forgets the saved choice so the browser's first language decides again.
function switchLocale(next) {
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  if (next === 'auto') {
    try { localStorage.removeItem(keys.locale); } catch { /* nothing saved */ }
  } else {
    storage.set(keys.locale, next);
    url.searchParams.set('lang', next);
  }
  location.replace(url);
}
function setSidebar(collapsed) {
  byId('app-shell').dataset.sidebar = collapsed ? 'collapsed' : 'open';
  const toggle = byId('sidebar-toggle');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', t(collapsed ? 'expandSidebar' : 'collapseSidebar'));
  toggle.title = t(collapsed ? 'expandSidebar' : 'collapseSidebar');
  storage.set(keys.sidebar, collapsed ? 'collapsed' : 'open');
  for (const button of document.querySelectorAll('[data-sidebar-mode]')) {
    button.setAttribute('aria-checked', String((button.dataset.sidebarMode === 'collapsed') === collapsed));
  }
}

function renderSidebarPeople() {
  const container = byId('sidebar-people');
  container.replaceChildren();
  for (const participant of state.participants) {
    const recent = latestSession(participant);
    const row = element('div', 'side-person');
    row.title = participantLabel(participant);
    row.append(face(participant, { status: recent?.status ?? 'none' }), element('b', '', personName(participant)));
    row.append(element('small', '', recent ? `${recent.status === 'paused' ? `${labels.paused} · ` : ''}${displayCopy(recent.title, t('noTitle'))}` : t('noRecord')));
    container.append(row);
  }
}

// The dashboard knows "you" from the checkout's local identity; only without one does the
// viewer pick themselves, and that choice stays in this browser.
function renderProfile() {
  const known = Boolean(state.identity);
  if (known) state.viewer = state.identity;
  else if (state.viewer && !state.participants.includes(state.viewer)) state.viewer = '';
  const control = byId('viewer-control');
  control.hidden = known;
  if (!known) {
    const select = byId('viewer');
    select.replaceChildren(new Option(t('chooseMe'), ''));
    state.participants.forEach((value) => select.add(new Option(participantLabel(value), value)));
    select.value = state.viewer;
  }
  const me = state.viewer;
  const profileFace = byId('profile-face');
  profileFace.className = `face ${me ? personClass(me) : 'px'}`;
  profileFace.textContent = me ? participantLabel(me).slice(0, 1).toUpperCase() : '?';
  byId('profile-name').textContent = me ? participantLabel(me) : t('whoAreYou');
  const login = profileFor(me)?.githubLogin;
  byId('profile-detail').textContent = me ? (login && !state.sample ? format('profileDetail', { login }) : t('thisIsYou')) : t('whoAreYouDetail');
  byId('profile').title = me ? participantLabel(me) : t('whoAreYou');
}

function renderSync(sync = {}) {
  const status = ['synced', 'pending', 'error', 'unknown'].includes(sync.status) ? sync.status : 'unknown';
  byId('sync-dot').className = `sync-dot ${status}`;
  const shared = status === 'synced' ? relativeTime(sync.lastSyncedAt) : null;
  byId('sync-badge').textContent = shared ? format('sharedRelative', { time: shared }) : labels[status];
  const copy = { synced: t('syncedCopy'), pending: t('pendingCopy'), error: t('errorCopy'), unknown: t('unknownCopy') }[status];
  const detail = text(sync.message, sync.lastSyncedAt ? formatDate(sync.lastSyncedAt) : '');
  byId('refresh').title = [t('syncHelp'), copy, detail].filter(Boolean).join('\n');
}

// ---------- evidence ----------
const apiErrorCopy = (result) => (t(`apiError.${result?.error}`) === `apiError.${result?.error}` ? t('noIssueDetail') : t(`apiError.${result?.error}`));
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
async function loadEvidence(path, button, content) {
  button.disabled = true;
  content.hidden = false;
  content.replaceChildren(element('p', 'empty', t('loadEvidence')));
  try {
    const response = await fetch(`/api/wiki?path=${encodeURIComponent(path)}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) {
      const missing = response.status === 404;
      const label = missing ? t('evidenceMissing') : response.status === 413 ? t('tooLarge') : t('requestFailed');
      content.replaceChildren(element('strong', `validation ${missing ? 'missing' : 'failure'}`, label), element('p', 'empty', apiErrorCopy(result)));
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

// ---------- now: goal and plan ----------
function renderGoals() {
  const goals = state.goals ?? {};
  byId('goal-current').textContent = text(goals.currentPhase, text(goals.mediumTerm, text(goals.project, t('noGoal'))));
  const trail = byId('goal-trail');
  trail.replaceChildren();
  for (const [key, label] of [['mediumTerm', t('onTheWay')], ['project', t('bigPicture')]]) {
    if (typeof goals[key] !== 'string' || !goals[key].trim() || goals[key] === byId('goal-current').textContent) continue;
    if (trail.childNodes.length) trail.append(' · ');
    trail.append(`${label}: `, element('b', '', goals[key]));
  }

  const presentation = planPresentation({ plan: state.plan, conflicts: state.conflicts, sessions: state.sessions, tickets: state.tickets });
  const badge = byId('plan-status');
  badge.className = `plan-status ${presentation.state}`;
  badge.textContent = { agreed: t('planAgreed'), proposed: t('proposed'), conflict: t('planConflict'), none: t('planNone') }[presentation.state] ?? t('unknown');
  const detail = byId('plan-detail');
  detail.replaceChildren();
  state.assignments = Array.isArray(presentation.plan?.assignments) ? presentation.plan.assignments : [];
  if (!presentation.plan) {
    if (presentation.state === 'conflict') {
      detail.append(element('p', 'conflict-copy', t('planConflictNotice')));
      presentation.conflicts.forEach((conflict) => detail.append(element('p', 'conflict-copy', text(conflict?.message, t('noConflictDetail')))));
    }
    return;
  }
  const explorer = element('details', 'plan-explorer');
  explorer.append(element('summary', '', t('planView')));
  const body = element('div', 'plan-explorer-body');
  body.append(element('p', '', displayCopy(presentation.plan.body, t('noPlanDetail'))));
  const assignments = element('div', 'assignment-grid');
  for (const assignment of state.assignments) {
    const card = element('article', 'assignment-card');
    card.append(element('h3', '', personName(assignment?.participant)));
    const chips = element('div', 'chips');
    const scopes = Array.isArray(assignment?.scope) ? assignment.scope : [];
    (scopes.length ? scopes : [t('noAssignments')]).forEach((scope) => chips.append(element('span', `chip${scopes.length ? '' : ' muted'}`, scope)));
    card.append(chips, element('p', 'assignment-next', `${t('next')} · ${displayCopy(assignment?.next)}`));
    assignments.append(card);
  }
  body.append(assignments);
  const history = element('details', 'plan-history');
  history.append(element('summary', '', t('planHistory')));
  const list = element('div', 'timeline');
  for (const event of Array.isArray(presentation.plan.history) ? presentation.plan.history : []) list.append(timelineItem(event));
  if (!list.children.length) list.append(empty(t('noHistory')));
  const evidence = Array.isArray(presentation.plan.evidence) ? presentation.plan.evidence : [];
  list.append(element('h3', '', t('evidence')));
  if (evidence.length) appendEvidenceButtons(list, evidence);
  else list.append(empty(t('noEvidence')));
  history.append(list);
  body.append(history);
  explorer.append(body);
  detail.append(explorer);
}

// ---------- now: two people ----------
function renderParticipants() {
  const container = byId('participants');
  container.replaceChildren();
  if (!state.participants.length) return container.append(empty(t('noParticipants')));
  for (const participant of state.participants) {
    const recent = latestSession(participant);
    const assignment = state.assignments.find((item) => item?.participant === participant);
    const card = element('article', 'card person');
    const who = element('div', 'who');
    const name = element('div', '');
    name.append(element('h3', '', personName(participant)), element('p', '', recent ? formatRecordedRange(recent) : t('noRecord')));
    who.append(face(participant, { size: 'lg' }), name, element('span', `badge ${recent?.status ?? 'none'}`, recent ? labels[recent.status] ?? t('unknown') : t('noRecord')));
    card.append(who);
    if (!recent && !assignment) {
      card.append(empty(t('noRecentWork')));
      container.append(card);
      continue;
    }
    const scopes = Array.isArray(recent?.scope) && recent.scope.length ? recent.scope : (Array.isArray(assignment?.scope) ? assignment.scope : []);
    if (recent) {
      const line = element('div', 'line');
      line.append(element('label', '', t('workingOn')), element('div', '', displayCopy(recent.title, t('noTitle'))));
      if (scopes.length) line.append(element('code', '', scopes.join(', ')));
      card.append(line);
    }
    const next = recent?.next ?? assignment?.next;
    if (typeof next === 'string' && next.trim()) {
      const line = element('div', 'line');
      line.append(element('label', '', t('upNext')), element('div', '', displayCopy(next)));
      card.append(line);
    }
    const blockers = Array.isArray(recent?.blockers) ? recent.blockers.filter((item) => typeof item === 'string' && item.trim()) : [];
    if (blockers.length) {
      const line = element('div', 'line stuck');
      line.append(element('label', '', t('stuckOn')), element('div', '', blockers.map((item) => displayCopy(item)).join(' · ')));
      card.append(line);
    }
    container.append(card);
  }
}

// ---------- requests as sentences ----------
const isMine = (ticket) => Boolean(state.viewer) && ticketTurn(ticket) === state.viewer;
function turnTag(ticket) {
  const turn = ticketTurn(ticket);
  if (!turn) return element('span', `status ${ticket.status ?? 'unknown'}`, labels[ticket.status] ?? t('unknown'));
  if (state.viewer && turn === state.viewer) return element('span', 'turn you', t('yourTurn'));
  return element('span', 'turn them', format('theirTurn', { person: participantLabel(turn) }));
}
function askLine(ticket) {
  const values = { from: personRef(ticket.requester), to: personRef(ticket.assignee) };
  const key = { needs_information: 'needsInfoBy', answered: 'answeredBy', resolved: 'resolvedBy', closed: 'closedBy' }[ticket.status] ?? 'askedBy';
  return format(key, values);
}
const lastBody = (ticket, type) => (Array.isArray(ticket.history) ? ticket.history : []).filter((event) => (!type || event?.type === type) && event?.data?.body).at(-1);
function askCard(ticket, { selectable = false } = {}) {
  const card = element('button', `card ask${isMine(ticket) ? ' mine' : ''}${selectable && ticket.id === state.selectedTicketId ? ' selected' : ''}`);
  card.type = 'button';
  const speaker = ['answered', 'needs_information'].includes(ticket.status) ? ticket.assignee : ticket.requester;
  const copy = element('div', '');
  copy.append(element('p', 'ask-line', askLine(ticket)), element('p', 'ask-title', displayCopy(ticket.title, t('noTitle'))));
  const opened = relativeTime(ticketOpenedAt(ticket));
  copy.append(element('p', 'ask-meta', [labels[ticket.kind], labels[ticket.status], opened ? format('askedRelative', { time: opened }) : null].filter(Boolean).join(' · ')));
  if (ticket.status === 'answered') {
    const answer = lastBody(ticket, 'ticket.responded');
    if (answer) copy.append(element('p', 'ask-reply', displayCopy(answer.data.body)));
  }
  card.append(face(speaker), copy, turnTag(ticket));
  card.addEventListener('click', () => openTicket(ticket.id));
  return card;
}
function sortedOpenTickets() {
  const openedAt = (ticket) => Date.parse(ticketOpenedAt(ticket)) || Number.POSITIVE_INFINITY;
  return filterTickets(state.tickets, { tab: 'inbox' }).sort((left, right) => Number(isMine(right)) - Number(isMine(left)) || openedAt(left) - openedAt(right));
}
function renderAttention() {
  const container = byId('attention-list');
  container.replaceChildren();
  const open = sortedOpenTickets();
  const mine = open.filter(isMine).length;
  byId('attention-count').textContent = open.length ? format('openCount', { count: open.length }) : '';
  byId('nav-requests-count').textContent = state.viewer ? (mine ? String(mine) : '') : (open.length ? String(open.length) : '');
  if (!open.length) container.append(empty(t('noAttention')));
  open.forEach((ticket) => container.append(askCard(ticket)));
}

// ---------- requests panel ----------
function timelineItem(event) {
  const item = element('article', 'timeline-item');
  const meta = element('small', '');
  meta.append(element('b', '', actorLabel(event?.actor)), ` · ${eventLabel(event?.type)} · ${relativeTime(event?.at) ?? formatDate(event?.at)}`);
  meta.title = formatDate(event?.at);
  item.append(meta);
  if (event?.data?.body) item.append(element('p', `timeline-body ${personClass(event?.actor?.participant)}`, displayCopy(event.data.body)));
  return item;
}
function renderTicketDetail(ticket) {
  const pane = byId('ticket-detail-pane');
  pane.replaceChildren();
  if (!ticket) return pane.append(element('p', 'detail-empty', t('noRequest')));
  const kinds = element('div', 'detail-kind');
  kinds.append(element('span', 'kind', labels[ticket.kind] ?? t('unknown')), turnTag(ticket));
  pane.append(kinds, element('h2', '', displayCopy(ticket.title, t('noTitle'))));
  if (ticket.body) pane.append(element('p', 'detail-body', displayCopy(ticket.body)));
  const props = element('dl', 'props');
  const turn = ticketTurn(ticket);
  for (const [label, value] of [
    [t('turn'), turn ? personName(turn) : '—'],
    [t('progress'), t(`peer.${peerConfirmation(ticket.status)}`)],
    [t('requestFlow'), `${personName(ticket.requester)} → ${personName(ticket.assignee)}`],
    [t('linkedGoal'), displayCopy(ticket.goal)],
  ]) props.append(element('dt', '', label), element('dd', '', value));
  pane.append(props);
  const timeline = element('section', 'timeline');
  timeline.append(element('h3', '', t('details')));
  const history = Array.isArray(ticket.history) ? ticket.history : [];
  if (!history.length) timeline.append(empty(t('noDetails')));
  history.forEach((event) => timeline.append(timelineItem(event)));
  timeline.append(element('h3', '', t('evidencePaths')));
  const evidence = ticketEvidence(ticket);
  if (evidence.length) appendEvidenceButtons(timeline, evidence);
  else timeline.append(empty(t('noEvidencePaths')));
  pane.append(timeline);
}
function visibleTickets() {
  const matches = filterTickets(state.tickets, state);
  if (state.tab !== 'inbox') return matches;
  const openedAt = (ticket) => Date.parse(ticketOpenedAt(ticket)) || Number.POSITIVE_INFINITY;
  return matches.sort((left, right) => Number(isMine(right)) - Number(isMine(left)) || openedAt(left) - openedAt(right));
}
function renderTickets() {
  const matches = visibleTickets();
  const container = byId('tickets');
  container.replaceChildren();
  byId('ticket-count').textContent = String(matches.length);
  byId('ticket-context').textContent = state.tab === 'inbox' ? t('inboxContext') : t('historyContext');
  if (!matches.some((ticket) => ticket.id === state.selectedTicketId)) state.selectedTicketId = matches[0]?.id ?? null;
  if (!matches.length) container.append(empty(state.tab === 'inbox' ? t('noInbox') : t('noHistoryRequests')));
  const mine = state.tab === 'inbox' && state.viewer ? matches.filter(isMine) : [];
  if (mine.length) {
    const label = element('p', 'group-label', t('yourTurn'));
    label.append(element('span', 'nav-count', String(mine.length)));
    container.append(label);
  }
  matches.forEach((ticket, index) => {
    if (mine.length && index === mine.length) container.append(element('p', 'group-label', t('waitingOnOthers')));
    container.append(askCard(ticket, { selectable: true }));
  });
  renderTicketDetail(matches.find((ticket) => ticket.id === state.selectedTicketId));
}
function openTicket(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) return;
  const terminal = ['resolved', 'closed'].includes(ticket.status);
  if ((state.tab === 'history') !== terminal) selectTab(terminal ? 'history' : 'inbox');
  state.selectedTicketId = id;
  renderTickets();
  selectSection('requests');
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

// ---------- flow: two lanes ----------
function laneEvents(projectedSessions) {
  const events = [];
  for (const session of projectedSessions) {
    const who = session.participant;
    if (session.endedAt) {
      events.push({ at: session.endedAt, who, kind: 'session', session, label: format('finishedIn', { duration: formatDuration(session.recordedActiveMs ?? session.wallClockMs) }), title: session.title, note: session.summary });
    } else {
      events.push({ at: session.startedAt, who, kind: 'session', session, label: labels[state.sessions.find((item) => item?.id === session.id)?.status] ?? t('workingNow'), title: session.title });
    }
    for (const blocker of session.blockers ?? []) events.push({ at: session.endedAt ?? session.startedAt, who, kind: 'stuck', label: t('stuck'), title: blocker, offset: 1 });
  }
  for (const ticket of state.tickets) {
    for (const event of Array.isArray(ticket.history) ? ticket.history : []) {
      events.push({ at: event?.at, who: event?.actor?.participant, kind: 'request', ticket, label: event?.actor?.kind === 'ai' ? `${eventLabel(event?.type)} · AI` : eventLabel(event?.type), title: ticket.title, note: event?.data?.body });
    }
  }
  for (const record of state.wikiRecords) {
    if (record.observedAt) events.push({ at: record.observedAt, who: record.author?.participant, kind: 'wiki', label: t('wroteWiki'), title: text(record.title, t('noTitle')) });
  }
  return events
    .filter((event) => Number.isFinite(Date.parse(event.at)))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at) || (right.offset ?? 0) - (left.offset ?? 0));
}
function laneBubble(event) {
  const bubble = element(event.kind === 'request' ? 'button' : 'div', `bubble${event.kind === 'request' ? ' request' : ''}${event.kind === 'stuck' ? ' stuck' : ''}`);
  if (event.kind === 'request') {
    bubble.type = 'button';
    bubble.addEventListener('click', () => openTicket(event.ticket.id));
  }
  bubble.append(element('small', '', event.label), element('p', '', displayCopy(event.title, t('noTitle'))));
  if (event.note) bubble.append(element('p', 'bubble-note', displayCopy(event.note)));
  if (event.kind === 'session' && event.session.endedAt) {
    const session = event.session;
    bubble.append(element('span', `time-state ${session.timeStatus}`, session.timeStatus === 'known' ? t('timeKnown') : format('notCountedBecause', { reason: t(`reason.${session.timeReason}`) })));
    if (session.timeStatus === 'known') {
      const details = element('details', '');
      details.append(element('summary', '', t('timeDetails')));
      const list = element('div', 'metric-list');
      list.append(metricRow(t('totalInterval'), formatDuration(session.wallClockMs)), metricRow(t('activeInterval'), formatDuration(session.recordedActiveMs)));
      details.append(list);
      bubble.append(details);
    }
  }
  if (event.kind === 'request' && ticketTurn(event.ticket) && event === laneEvents.latestFor?.get(event.ticket.id)) bubble.append(turnTag(event.ticket));
  const time = element('small', '', relativeTime(event.at));
  time.title = formatDate(event.at);
  bubble.append(time);
  return bubble;
}
function renderLanes(container, events, { emptyMessage }) {
  container.replaceChildren();
  const heads = element('div', 'lane-heads');
  state.participants.slice(0, 2).forEach((participant, index) => {
    const recent = latestSession(participant);
    const head = element('div', `lane-head${index ? ' right' : ''}`);
    const copy = element('div', '');
    copy.append(element('b', '', personName(participant)), element('small', '', recent ? [labels[recent.status], recent.next ? `${t('next')}: ${displayCopy(recent.next)}` : null].filter(Boolean).join(' · ') : t('noRecord')));
    head.append(face(participant), copy);
    heads.append(head);
  });
  if (state.participants.length) container.append(heads);
  // The newest event of each request carries its turn tag; older ones are history.
  laneEvents.latestFor = new Map();
  for (const event of events) if (event.kind === 'request' && !laneEvents.latestFor.has(event.ticket.id)) laneEvents.latestFor.set(event.ticket.id, event);
  if (!events.length) return container.append(element('p', 'lane-empty', emptyMessage));
  let lastDay = null;
  for (const event of events) {
    const day = dayLabel(event.at);
    if (day !== lastDay) {
      const divider = element('div', 'lane-day');
      divider.append(element('span', '', day));
      container.append(divider);
      lastDay = day;
    }
    const side = state.participants.indexOf(event.who) === 1 ? 'right' : 'left';
    const row = element('div', `lane-row ${side}`);
    row.append(laneBubble(event), element('span', `lane-pin ${personClass(event.who)}`));
    container.append(row);
  }
}

function metricRow(label, value, note) {
  const row = element('div', 'metric-row');
  const copy = element('div', '');
  copy.append(element('strong', '', label));
  if (note) copy.append(element('p', 'empty', note));
  row.append(copy, element('span', 'metric-value', value));
  return row;
}
function stat(label, value, note, participant) {
  const card = element('div', 'card stat');
  const heading = element('span', '');
  if (participant) heading.append(face(participant));
  heading.append(label);
  card.append(heading, element('strong', '', value));
  if (note) card.append(element('small', '', note));
  return card;
}
function renderFlow() {
  const result = aggregateSessions(state.sessions, { conflicts: state.conflicts, ...selectedPeriod() });
  const overview = byId('time-overview');
  overview.replaceChildren(
    stat(t('projectInterval'), formatDuration(result.projectWallClockMs), t('projectIntervalNote')),
    stat(t('unknownTime'), String(result.unknownSessionCount), t('unknownTimeNote')),
  );
  for (const participant of state.participants) {
    const item = result.participantTotals.find((entry) => entry.participant === participant);
    const nothingCounted = !item || (item.recordedActiveMs === 0 && item.unknownSessionCount > 0);
    overview.append(stat(personName(participant), nothingCounted ? '—' : formatDuration(item.recordedActiveMs), item?.unknownSessionCount ? format('notCountedCount', { count: item.unknownSessionCount }) : '', participant));
  }

  const scopes = byId('scope-time');
  scopes.replaceChildren();
  if (!result.scopeTotals.length) scopes.append(empty(t('noScopeRecords')));
  for (const item of result.scopeTotals) scopes.append(metricRow(`${participantLabel(item.participant)} · ${item.scope ?? t('unknown')}`, formatDuration(item.recordedActiveMs)));

  const blockers = byId('blocker-list');
  blockers.replaceChildren();
  if (!result.blockers.length) blockers.append(empty(t('noBlockers')));
  for (const item of result.blockers) {
    const row = element('div', 'blocker-row');
    row.append(element('small', '', `${participantLabel(item.participant)} · ${displayCopy(item.title, t('noTitle'))}`), displayCopy(item.blocker));
    blockers.append(row);
  }

  const from = Date.parse(selectedPeriod().from ?? '') || Number.NEGATIVE_INFINITY;
  renderLanes(byId('session-lanes'), laneEvents(result.sessions).filter((event) => Date.parse(event.at) >= from), { emptyMessage: t('noFlow') });
}
function renderLatestLanes() {
  const all = aggregateSessions(state.sessions, { conflicts: state.conflicts });
  renderLanes(byId('latest-lanes'), laneEvents(all.sessions).slice(0, 6), { emptyMessage: t('noFlow') });
}

// ---------- wiki ----------
function wikiMetadata(record) {
  return [
    labels[record.recordType] ?? t('unknown'),
    labels[record.status] ?? t('unknown'),
    record.author?.participant ? participantLabel(record.author.participant) : t('noAuthor'),
    relativeTime(record.observedAt) ?? formatDate(record.observedAt),
  ].join(' · ');
}
async function loadLineage(path, button, content) {
  button.disabled = true;
  content.hidden = false;
  content.replaceChildren(element('p', 'empty', t('lineageLoading')));
  try {
    const response = await fetch(`/api/wiki/lineage?root=${encodeURIComponent(path)}`, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) {
      content.replaceChildren(element('strong', 'validation failure', t('lineageFailed')), element('p', 'empty', apiErrorCopy(result)));
      return;
    }
    content.replaceChildren(element('p', 'empty', `${result.nodes.length} ${t('countNodes')} · ${result.edges.length} ${t('countLinks')}`));
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
function wikiTitle(record) {
  return text(record.title, record.format === 'legacy' ? t('legacyRecord') : t('noTitle'));
}
function renderWikiDetail(record) {
  const pane = byId('wiki-detail-pane');
  pane.replaceChildren();
  if (!record) return pane.append(element('p', 'detail-empty', t('noWiki')));
  const kinds = element('div', 'detail-kind');
  if (record.validation) {
    const validation = wikiValidationPresentation(record.validation);
    kinds.append(element('span', `validation ${validation.kind}`, t(validation.title)));
  }
  pane.append(kinds, element('h2', '', wikiTitle(record)), element('p', 'wiki-meta', wikiMetadata(record)), element('code', 'wiki-path', record.path));
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
  pane.append(actions, source, lineage);
}
function renderWiki() {
  const container = byId('wiki-records');
  const stateCopy = byId('wiki-state');
  container.replaceChildren();
  if (!state.sample) stateCopy.replaceChildren();
  let records = state.wikiTab === 'search' ? state.wikiSearchResults : state.wikiRecords;
  if (state.wikiTab === 'refinement') records = state.wikiRecords.filter((record) => record.dailyRefinement !== null);
  byId('wiki-count').textContent = String(records.length);
  for (const issue of state.wikiIssues) stateCopy.append(element('p', 'validation-issue', `${text(issue?.code, 'UNKNOWN')} · ${text(issue?.message, t('noIssueDetail'))}`));
  if (!records.length) container.append(empty(state.wikiTab === 'refinement' ? t('noRefinement') : t('noMatchingWiki')));
  else if (!records.some((record) => record.path === state.selectedWikiPath)) state.selectedWikiPath = records[0].path;
  for (const record of records) {
    const item = element('button', `card wiki-item${record.path === state.selectedWikiPath ? ' selected' : ''}`);
    item.type = 'button';
    item.append(element('h3', '', wikiTitle(record)), element('p', '', wikiMetadata(record)));
    item.addEventListener('click', () => { state.selectedWikiPath = record.path; renderWiki(); });
    container.append(item);
  }
  renderWikiDetail(records.find((record) => record.path === state.selectedWikiPath));
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
    byId('wiki-state').replaceChildren(element('p', 'sample-wiki', t('wikiSampleNotice')));
    renderWiki();
    return;
  }
  byId('wiki-state').replaceChildren(element('p', 'empty', t('wikiLoading')));
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
  // Wiki notes also appear in the two-lane flow.
  renderLatestLanes();
  renderFlow();
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
  byId('wiki-state').replaceChildren(element('p', 'empty', t('wikiSearching')));
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

// ---------- duobrain update ----------
const updateDialog = byId('update-dialog');
let updateBusy = false;
const versionLabel = (value) => (value ? `v${value}` : t('unknown'));
const updateErrorCopy = (result) => {
  const key = result?.error === 'update_unavailable' || result?.error === 'update_in_progress' ? `updateError.${result.error}` : `updateError.${result?.code}`;
  return t(key) === key ? t('updateError.default') : t(key);
};
function updateButton(label, onClick, primary = false) {
  const button = element('button', primary ? 'primary-button' : 'secondary-button', label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}
function showUpdate(view, result) {
  const body = byId('update-body');
  const actions = byId('update-actions');
  body.replaceChildren();
  actions.replaceChildren();
  const close = () => updateDialog.close();
  if (view === 'checking' || view === 'updating') {
    const progress = element('div', 'update-progress');
    progress.append(element('span', 'update-spinner'), t(view === 'checking' ? 'updateChecking' : 'updating'));
    body.append(progress);
    if (view === 'updating') body.append(element('p', '', t('updatingNote')));
    return;
  }
  if (view === 'current') {
    body.append(element('h3', '', t('upToDate')), element('p', '', format('upToDateDetail', { version: versionLabel(result.current) })));
    actions.append(updateButton(t('close'), close, true));
    return;
  }
  if (view === 'available') {
    const versions = element('p', 'update-versions');
    versions.append(element('span', '', versionLabel(result.current)), '→', element('span', 'to', versionLabel(result.latest)));
    body.append(element('h3', '', t('updateAvailable')), versions);
    if (result.changes?.length) {
      body.append(element('p', '', t('updateChanges')));
      const list = element('ul', 'update-changes');
      result.changes.forEach((change) => list.append(element('li', '', change)));
      body.append(list);
    }
    body.append(element('p', '', t('updateAsk')));
    actions.append(updateButton(t('notNow'), close), updateButton(t('updateNow'), runUpdate, true));
    return;
  }
  if (view === 'done') {
    body.append(element('h3', '', format('updatedTo', { version: versionLabel(result.latest) })), element('p', '', t('restartNeeded')));
    if (result.commitNeeded) body.append(element('p', 'update-note', t('commitAfterUpdate')));
    actions.append(updateButton(t('close'), close, true));
    return;
  }
  body.append(element('h3', '', t(view === 'check-error' ? 'updateCheckFailed' : 'updateFailed')), element('p', 'update-error', updateErrorCopy(result)));
  actions.append(updateButton(t('close'), close), updateButton(t('retry'), view === 'check-error' ? checkForUpdates : runUpdate, true));
}
async function checkForUpdates() {
  if (!updateDialog.open) updateDialog.showModal();
  showUpdate('checking');
  try {
    const response = await fetch('/api/update', { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok) return showUpdate('check-error', result);
    byId('update-dot').hidden = !result.available;
    showUpdate(result.available ? 'available' : 'current', result);
  } catch {
    showUpdate('check-error', {});
  }
}
async function runUpdate() {
  updateBusy = true;
  showUpdate('updating');
  try {
    const response = await fetch('/api/update', { method: 'POST', headers: { Accept: 'application/json', 'X-Duobrain-Action': 'update' } });
    const result = await response.json();
    if (!response.ok) return showUpdate('update-error', result);
    byId('update-dot').hidden = true;
    showUpdate('done', result);
  } catch {
    showUpdate('update-error', {});
  } finally {
    updateBusy = false;
  }
}
// An update in progress cannot be cancelled halfway, so Escape does not close the modal then.
updateDialog.addEventListener('cancel', (event) => { if (updateBusy) event.preventDefault(); });
updateDialog.addEventListener('click', (event) => { if (event.target === updateDialog && !updateBusy) updateDialog.close(); });

// ---------- render and load ----------
function renderPeople() {
  renderSidebarPeople();
  renderParticipants();
  renderAttention();
  renderTickets();
  renderLatestLanes();
  renderFlow();
}
function render(snapshot) {
  state.sample = snapshot.sample === true;
  byId('sample-banner').hidden = !state.sample;
  state.tickets = Array.isArray(snapshot.tickets) ? snapshot.tickets : [];
  state.sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  state.conflicts = Array.isArray(snapshot.conflicts) ? snapshot.conflicts : [];
  state.participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
  state.profiles = Array.isArray(snapshot.profiles) ? snapshot.profiles : [];
  state.identity = typeof snapshot.viewer === 'string' && state.participants.includes(snapshot.viewer) ? snapshot.viewer : null;
  state.goals = snapshot.goals ?? {};
  state.plan = snapshot.plan;
  renderProfile();
  renderGoals();
  fillFilters();
  renderPeople();
  renderSync(snapshot.sync);
  loadWikiList();
}

const refreshChoices = ['0', '30', '60', '300'];
let refreshSeconds = Number(refreshChoices.includes(storage.get(keys.refresh)) ? storage.get(keys.refresh) : '30');
let refreshTimer = null;
function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = refreshSeconds > 0 ? setInterval(() => { if (document.visibilityState === 'visible') load(); }, refreshSeconds * 1000) : null;
  for (const button of document.querySelectorAll('[data-refresh]')) button.setAttribute('aria-checked', String(Number(button.dataset.refresh) === refreshSeconds));
}
async function loadVersion() {
  try {
    const { version } = await (await fetch('/api/meta', { headers: { Accept: 'application/json' } })).json();
    byId('app-version').textContent = version ? format('versionLine', { version }) : t('versionUnknown');
  } catch {
    byId('app-version').textContent = t('versionUnknown');
  }
}
let lastSnapshotBody = null;
let lastLoadedAt = null;
function renderUpdated() {
  byId('refresh-label').textContent = lastLoadedAt ? format('updatedRelative', { time: relativeTime(new Date(lastLoadedAt).toISOString()) }) : t('refresh');
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

function selectSection(section) {
  state.section = section;
  for (const name of sections) {
    const selected = name === section;
    const button = byId(`nav-${name}`);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    byId(`panel-${name}`).hidden = !selected;
  }
  byId('workspace').scrollTop = 0;
  history.replaceState(null, '', `#${section}`);
}

// ---------- events ----------
byId('retry').addEventListener('click', load);
byId('refresh').addEventListener('click', load);
byId('update-button').addEventListener('click', checkForUpdates);
byId('sidebar-toggle').addEventListener('click', () => setSidebar(byId('app-shell').dataset.sidebar !== 'collapsed'));
byId('brand-home').addEventListener('click', () => selectSection('current'));
for (const section of sections) byId(`nav-${section}`).addEventListener('click', () => selectSection(section));
for (const button of document.querySelectorAll('[data-go]')) button.addEventListener('click', () => selectSection(button.dataset.go === 'requests' ? 'requests' : 'records'));
for (const button of document.querySelectorAll('[data-locale]')) button.addEventListener('click', () => switchLocale(button.dataset.locale));
byId('viewer').addEventListener('change', (event) => {
  state.viewer = event.target.value;
  storage.set(keys.viewer, state.viewer);
  renderProfile();
  renderGoals();
  renderPeople();
});
byId('inbox-tab').addEventListener('click', () => selectTab('inbox'));
byId('history-tab').addEventListener('click', () => selectTab('history'));
byId('ticket-search').addEventListener('input', (event) => { state.query = event.target.value; renderTickets(); });
for (const key of ['status', 'kind', 'peer']) byId(`${key}-filter`).addEventListener('change', (event) => { state[key] = event.target.value; renderTickets(); });
byId('session-period').addEventListener('change', (event) => { state.period = event.target.value; renderFlow(); });
byId('wiki-all-tab').addEventListener('click', () => selectWikiTab('all'));
byId('wiki-search-tab').addEventListener('click', () => selectWikiTab('search'));
byId('wiki-refinement-tab').addEventListener('click', () => selectWikiTab('refinement'));
byId('wiki-search-form').addEventListener('submit', searchWiki);
document.addEventListener('keydown', (event) => {
  if (state.section !== 'requests' || !['j', 'k'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest?.('input, select, textarea')) return;
  const tickets = visibleTickets();
  const index = tickets.findIndex((ticket) => ticket.id === state.selectedTicketId);
  const next = tickets[index + (event.key === 'j' ? 1 : -1)];
  if (!next) return;
  state.selectedTicketId = next.id;
  renderTickets();
  byId('tickets').querySelector('.ask.selected')?.scrollIntoView({ block: 'nearest' });
});
document.addEventListener('visibilitychange', () => {
  if (refreshSeconds > 0 && document.visibilityState === 'visible' && (!lastLoadedAt || Date.now() - lastLoadedAt > refreshSeconds * 1000)) load();
});
for (const button of document.querySelectorAll('[data-refresh]')) button.addEventListener('click', () => {
  refreshSeconds = Number(button.dataset.refresh);
  storage.set(keys.refresh, button.dataset.refresh);
  scheduleRefresh();
});
for (const button of document.querySelectorAll('[data-sidebar-mode]')) button.addEventListener('click', () => setSidebar(button.dataset.sidebarMode === 'collapsed'));
byId('settings-update').addEventListener('click', checkForUpdates);
window.addEventListener('hashchange', () => {
  const section = location.hash.slice(1);
  if (sections.includes(section) && section !== state.section) selectSection(section);
});

applyStaticUi();
setSidebar(storage.get(keys.sidebar) === 'collapsed');
scheduleRefresh();
loadVersion();
const initialSection = location.hash.slice(1);
if (sections.includes(initialSection)) selectSection(initialSection);
load();
