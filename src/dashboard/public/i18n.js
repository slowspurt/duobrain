export const supportedLocales = new Set(['ko', 'en']);

// English is the default. Korean is used only when explicitly requested (?lang=ko or a saved
// choice) or when the browser's first preferred language is Korean.
export function resolveLocale({ search = '', stored = null, languages = [] } = {}) {
  const requested = new URLSearchParams(search).get('lang')?.toLowerCase();
  if (supportedLocales.has(requested)) return requested;
  const saved = typeof stored === 'string' ? stored.toLowerCase() : null;
  if (supportedLocales.has(saved)) return saved;
  const primary = String(languages[0] ?? '').toLowerCase().split('-')[0];
  return primary === 'ko' ? 'ko' : 'en';
}

const en = {
  // shell
  dashboardTitle: 'Dashboard', brandHome: 'duobrain current view', navLabel: 'Dashboard areas', language: 'Language',
  current: 'Now', requests: 'Requests', records: 'Flow', wiki: 'Wiki',
  collapseSidebar: 'Collapse sidebar', expandSidebar: 'Expand sidebar', rightNow: 'Right now', you: 'you', youSuffix: '{person} (you)',
  iAm: 'I am', chooseMe: 'Choose who you are', whoAreYou: 'Who’s viewing?', whoAreYouDetail: 'Pick yourself to see your turn', profileDetail: '@{login}', thisIsYou: 'This is you',
  sample: 'Sample data', sampleDescription: 'This sample shows the product flow; it is not a real project or sync state.',
  loadFailed: 'Could not load the record.', loadFailedDetail: 'Check that the dashboard server is running and can read the snapshot.', retry: 'Try again',
  refresh: 'Refresh', justNow: 'just now', updatedRelative: 'Refreshed {time}', sharedRelative: 'Shared with partner · {time}',
  syncHelp: 'Whether your records reached your partner. Click to re-read the records now.',
  synced: 'Shared with partner', pending: 'Not shared yet', error: 'Sharing failed', syncUnknown: 'Sharing unknown',
  syncedCopy: 'Last remote sync succeeded', pendingCopy: 'Saved locally · not shared yet', errorCopy: 'Remote sharing failed', unknownCopy: 'Remote sharing status unknown',
  // now
  headedTo: 'Where we’re headed', onTheWay: 'On the way to', bigPicture: 'Big picture',
  project: 'Project goal', mediumTerm: 'Mid-term goal', currentPhase: 'Current goal', noGoal: 'No goal recorded yet.',
  planAgreed: 'Agreed by both', proposed: 'Proposed', planConflict: 'Plan conflict', planNone: 'No shared plan',
  planConflictNotice: 'The plan record conflicts, so no goal or owner is chosen.',
  planView: 'View shared plan', planHistory: 'Plan history and evidence', next: 'Next', noAssignments: 'No assigned area', noHistory: 'No plan history.', evidence: 'Evidence', noEvidence: 'No evidence yet.',
  people: 'What you’re both on', fromLatest: 'from the latest records',
  workingOn: 'Working on', upNext: 'Up next', stuckOn: 'Stuck on', noParticipants: 'No people recorded yet.', noRecentWork: 'No work recorded yet.',
  active: 'Working', paused: 'Paused', ended: 'Finished', noRecord: 'No record',
  attention: 'Waiting for an answer', openCount: '{count} open', allRequests: 'All requests →', noAttention: 'Nothing is waiting on anyone right now.',
  latestFlow: 'Latest in the flow', latestFlowNote: 'both lanes, as recorded', fullFlow: 'Full flow →',
  // asks
  askedBy: '{from} asked {to}', answeredBy: '{to} answered — does it settle it?', needsInfoBy: '{to} needs more information from {from}', readBy: '{to} read it',
  resolvedBy: '{from} confirmed it resolved', closedBy: 'Closed without resolution',
  yourTurn: 'Your turn', theirTurn: '{person}’s turn', waitingOn: 'Waiting on {person}', waitingOnOthers: 'Waiting on others', askedRelative: 'asked {time}',
  // requests
  requestView: 'Request view', inbox: 'Open', history: 'Done', search: 'Search', status: 'Status', kind: 'Type', all: 'All', peerFilter: 'Person',
  searchTickets: 'Title, body, goal, evidence', information: 'Question', feedback: 'Feedback',
  open: 'Not read', acknowledged: 'Read', needs_information: 'Needs more info', answered: 'Answered', resolved: 'Resolved', closed: 'Closed unresolved',
  'peer.unseen': 'Not read yet', 'peer.seen_unanswered': 'Read · no answer yet', 'peer.seen_needs_information': 'Read · asked for more info',
  'peer.answered_unresolved': 'Answered · waiting for confirmation', 'peer.resolved': 'Answered and confirmed', 'peer.closed_unresolved': 'Closed without resolution', 'peer.unknown': 'Unknown',
  inboxContext: '“Answered” means a reply arrived; the person who asked still confirms it.', historyContext: 'Resolved and closed requests.',
  noInbox: 'No open requests.', noHistoryRequests: 'No finished requests.', noRequest: 'Pick a request to see its timeline.',
  turn: 'Turn', progress: 'Progress', requestFlow: 'From → to', linkedGoal: 'Goal', details: 'Timeline', noDetails: 'No timeline recorded.',
  evidencePaths: 'Evidence', noEvidencePaths: 'No linked evidence.', keyboardHint: 'J / K to move between requests',
  // flow
  recordsDescription: 'Recorded time spans only — not working hours or productivity.', period: 'Period', days7: 'Last 7 days', days30: 'Last 30 days', allRecords: 'All time',
  timeSummary: 'Time', projectInterval: 'Total recorded', projectIntervalNote: 'finished work, overlaps counted once', unknownTime: 'Not counted', unknownTimeNote: 'unfinished or incomplete',
  scopeTime: 'By person and area', scopeTimeNote: 'Overlapping areas are not added together.', noScopeRecords: 'No area totals yet.', notCountedCount: '{count} not counted',
  flowTitle: 'Everything, in order', flowNote: 'each person in their own lane', noFlow: 'Nothing recorded in this period.',
  blockers: 'Blockers', noBlockers: 'No blockers recorded.', stuck: 'Stuck', workingNow: 'Working now', finishedIn: 'Finished · {duration}', wroteWiki: 'Wrote in the wiki',
  timeKnown: 'Counted', timeUnknown: 'Not counted', notCountedBecause: 'Not counted: {reason}', timeDetails: 'Time details', totalInterval: 'Start to finish', activeInterval: 'Excluding pauses',
  startUnknown: 'Start not recorded', endUnknown: 'End not recorded', startedRelative: 'started {time}', finishedRange: '{range} · {time}', minutes: 'm', hours: 'h', unknown: 'Unknown',
  'reason.conflict': 'conflicting records', 'reason.not_ended': 'still in progress', 'reason.time_order': 'times out of order', 'reason.no_activity_history': 'pause history missing',
  'reason.history_link': 'broken history link', 'reason.start_mismatch': 'start time mismatch', 'reason.scope_history': 'invalid area change', 'reason.history_order': 'history out of order', 'reason.end_mismatch': 'end time mismatch',
  // wiki
  wikiTitle: 'Wiki', wikiDescription: 'Evidence and notes shared during the work.', wikiView: 'Wiki view', searchResults: 'Results', dailyRefinement: 'Refined',
  searchWiki: 'Title, body, work context', participant: 'Person', recordType: 'Record type', includeSuperseded: 'Include replaced records', submitSearch: 'Search',
  personal: 'Personal', agreed: 'Agreed', superseded: 'Replaced', sourceNote: 'Source note', summary: 'Summary',
  wikiSampleNotice: 'The sample has no shared wiki. Start the dashboard with --repository <path> to explore a real one.',
  viewSource: 'View source', viewLineage: 'View links', noLineage: 'No linked wiki records.', legacyRecord: 'Older wiki record', noTitle: 'Untitled',
  noWiki: 'No shared records to show.', noMatchingWiki: 'No wiki records match these filters.', noRefinement: 'No refined summaries yet.',
  wikiLoading: 'Loading shared wiki…', wikiLoadFailed: 'Could not load the shared wiki.', wikiSearching: 'Searching…', wikiSearchFailed: 'Could not search the shared wiki.',
  lineageLoading: 'Loading linked records…', lineageFailed: 'Could not load linked records', countNodes: 'records', countLinks: 'links', noAuthor: 'Unknown author',
  // settings
  settings: 'Settings', settingsDescription: 'Saved in this browser only. Your project and shared records are not changed.',
  languageSetting: 'Language', languageHelp: 'Automatic follows your browser’s first language (now {language}).', automatic: 'Automatic',
  refreshSetting: 'Auto refresh', refreshHelp: 'How often the dashboard re-reads the records while it is open.', off: 'Off', seconds30: '30s', minute1: '1 min', minutes5: '5 min',
  sidebarSetting: 'Sidebar', sidebarHelp: 'Show labels, or keep only icons for more room.', sidebarOpen: 'Labels', sidebarIcons: 'Icons only',
  updatesSetting: 'duobrain version', versionLine: 'You’re running v{version}.', versionUnknown: 'Version unknown.',
  // update
  checkUpdates: 'Check for updates', updateTitle: 'duobrain update', updateChecking: 'Checking for updates…', upToDate: 'You’re up to date',
  upToDateDetail: '{version} is the latest version.', updateAvailable: 'A new version is available', updateChanges: 'What’s new',
  updateAsk: 'Update duobrain now? Your project files and shared records are not changed.', updateNow: 'Update', notNow: 'Not now', close: 'Close',
  updating: 'Updating duobrain…', updatingNote: 'Keep this window open until it finishes.', updatedTo: 'Updated to {version}',
  restartNeeded: 'Restart the dashboard to load the new version.', commitAfterUpdate: 'Commit the updated .duobrain folder and AGENTS.md so your partner runs the same version.',
  updateCheckFailed: 'Could not check for updates', updateFailed: 'Could not update',
  'updateError.UPDATE_DIRTY': 'The duobrain folder has uncommitted changes. Commit or stash them first.',
  'updateError.UPDATE_DIVERGED': 'This duobrain copy has local commits that are not published. Update it by hand.',
  'updateError.UPDATE_NO_UPSTREAM': 'This duobrain copy has no source to update from.',
  'updateError.UPDATE_NOT_GIT': 'This duobrain copy is not a Git checkout. Download the new release instead.',
  'updateError.UPDATE_INSIDE_PROJECT': 'This duobrain copy sits inside another repository. Run install to switch to the .duobrain folder first.',
  'updateError.UPDATE_NO_RELEASE': 'No published release was found.',
  'updateError.update_unavailable': 'Updates are not available from this dashboard.', 'updateError.update_in_progress': 'An update is already running.',
  'updateError.default': 'Something went wrong. Run `duobrain update` in a terminal to see the details.',
  // evidence
  loadEvidence: 'Loading evidence…', evidenceMissing: 'Evidence missing', tooLarge: 'Too large to show', requestFailed: 'Could not load', sampleEvidence: 'Sample evidence',
  validated: 'Validated', validationWarning: 'Validated with warnings', validationFailed: 'Validation failed', noIssueDetail: 'No details',
  'apiError.invalid_wiki_path': 'This is not a valid wiki evidence path.', 'apiError.wiki_note_not_found': 'The evidence note was not found.',
  'apiError.wiki_note_too_large': 'The evidence note is too large to display.', 'apiError.wiki_note_unavailable': 'The evidence note could not be loaded.',
  'apiError.wiki_tools_unavailable': 'Shared wiki is not available.', 'apiError.invalid_wiki_query': 'The search filters are not valid.',
  // events
  eventUnknown: 'Event', noPlanDetail: 'No plan description.', noConflictDetail: 'No conflict details.', viaAi: '{person} (via AI)',
  'event.ticket.created': 'Asked', 'event.ticket.acknowledged': 'Read', 'event.ticket.needs_information': 'Asked for more info', 'event.ticket.clarified': 'Added info',
  'event.ticket.responded': 'Answered', 'event.ticket.resolved': 'Confirmed resolved', 'event.ticket.closed': 'Closed', 'event.ticket.reopened': 'Reopened',
  'event.plan.created': 'Plan proposed', 'event.plan.updated': 'Plan updated',
};

const ko = {
  // shell
  dashboardTitle: '대시보드', brandHome: 'duobrain 현재 화면', navLabel: '대시보드 영역', language: '언어',
  current: '현재', requests: '요청', records: '흐름', wiki: '위키',
  collapseSidebar: '사이드바 접기', expandSidebar: '사이드바 펼치기', rightNow: '지금', you: '나', youSuffix: '{person} (나)',
  iAm: '나는', chooseMe: '내가 누구인지 고르기', whoAreYou: '누가 보고 있나요?', whoAreYouDetail: '나를 고르면 내 차례가 보입니다', profileDetail: '@{login}', thisIsYou: '나',
  sample: '예시 데이터', sampleDescription: '제품 흐름을 보여 주는 샘플이며 실제 프로젝트나 동기화 상태가 아닙니다.',
  loadFailed: '기록을 불러오지 못했습니다.', loadFailedDetail: '대시보드 서버가 실행 중이고 스냅샷을 읽을 수 있는지 확인해 주세요.', retry: '다시 불러오기',
  refresh: '새로고침', justNow: '방금', updatedRelative: '{time} 새로 읽음', sharedRelative: '상대와 공유됨 · {time}',
  syncHelp: '내 기록이 상대에게 전달됐는지 보여 줍니다. 누르면 기록을 바로 다시 읽습니다.',
  synced: '상대와 공유됨', pending: '아직 공유 안 됨', error: '공유 실패', syncUnknown: '공유 상태 모름',
  syncedCopy: '마지막 원격 동기화 성공', pendingCopy: '로컬에 저장됨 · 아직 공유 전', errorCopy: '원격 공유 실패', unknownCopy: '원격 공유 상태 미확인',
  // now
  headedTo: '지금 향하는 곳', onTheWay: '그다음 목표', bigPicture: '큰 그림',
  project: '전체 목표', mediumTerm: '중기 목표', currentPhase: '지금 목표', noGoal: '아직 기록된 목표가 없습니다.',
  planAgreed: '두 사람 합의', proposed: '제안', planConflict: '계획 충돌', planNone: '공유 계획 없음',
  planConflictNotice: '계획 기록이 충돌해 목표와 담당을 고르지 않습니다.',
  planView: '공유 계획 보기', planHistory: '계획 이력과 근거', next: '다음', noAssignments: '담당 영역 없음', noHistory: '계획 이력이 없습니다.', evidence: '근거', noEvidence: '아직 근거가 없습니다.',
  people: '두 사람이 하고 있는 일', fromLatest: '최근 기록 기준',
  workingOn: '하는 일', upNext: '다음', stuckOn: '막힌 점', noParticipants: '아직 기록된 사람이 없습니다.', noRecentWork: '아직 작업 기록이 없습니다.',
  active: '작업 중', paused: '일시 정지', ended: '종료', noRecord: '기록 없음',
  attention: '답을 기다리는 요청', openCount: '{count}건 진행 중', allRequests: '요청 전체 →', noAttention: '지금 서로 기다리는 요청이 없습니다.',
  latestFlow: '최근 흐름', latestFlowNote: '두 사람의 기록 순서대로', fullFlow: '흐름 전체 →',
  // asks
  askedBy: '{from} → {to} 질문', answeredBy: '{to}의 답변 도착 — 해결됐나요?', needsInfoBy: '{to}가 {from}에게 추가 정보 요청', readBy: '{to}가 읽음',
  resolvedBy: '{from}가 해결 확인', closedBy: '해결 없이 종료',
  yourTurn: '내 차례', theirTurn: '{person} 차례', waitingOn: '{person} 차례', waitingOnOthers: '상대 차례', askedRelative: '{time} 요청',
  // requests
  requestView: '요청 보기', inbox: '진행 중', history: '완료', search: '검색', status: '상태', kind: '종류', all: '전체', peerFilter: '사람',
  searchTickets: '제목, 내용, 목표, 근거', information: '질문', feedback: '피드백',
  open: '안 읽음', acknowledged: '읽음', needs_information: '추가 정보 필요', answered: '답변 도착', resolved: '해결됨', closed: '해결 없이 종료',
  'peer.unseen': '아직 안 읽음', 'peer.seen_unanswered': '읽음 · 답변 전', 'peer.seen_needs_information': '읽음 · 추가 정보 요청',
  'peer.answered_unresolved': '답변 도착 · 확인 대기', 'peer.resolved': '답변과 해결 확인 완료', 'peer.closed_unresolved': '해결 없이 종료', 'peer.unknown': '미확인',
  inboxContext: '‘답변 도착’은 답이 왔다는 뜻이고, 해결 확인은 요청한 사람이 합니다.', historyContext: '해결되었거나 종료된 요청입니다.',
  noInbox: '진행 중인 요청이 없습니다.', noHistoryRequests: '완료된 요청이 없습니다.', noRequest: '요청을 고르면 진행 기록이 보입니다.',
  turn: '차례', progress: '진행', requestFlow: '요청 → 받는 사람', linkedGoal: '목표', details: '진행 기록', noDetails: '진행 기록이 없습니다.',
  evidencePaths: '근거', noEvidencePaths: '연결된 근거가 없습니다.', keyboardHint: 'J / K로 요청 사이를 이동',
  // flow
  recordsDescription: '기록된 시간 구간일 뿐, 근무 시간이나 생산성이 아닙니다.', period: '기간', days7: '최근 7일', days30: '최근 30일', allRecords: '전체 기간',
  timeSummary: '시간', projectInterval: '전체 기록 시간', projectIntervalNote: '끝난 작업 기준, 겹치는 시간은 한 번만', unknownTime: '집계 제외', unknownTimeNote: '진행 중이거나 불완전한 기록',
  scopeTime: '사람·영역별', scopeTimeNote: '겹치는 영역은 서로 더하지 않습니다.', noScopeRecords: '아직 영역별 집계가 없습니다.', notCountedCount: '{count}건 집계 제외',
  flowTitle: '기록 순서대로', flowNote: '사람마다 자기 줄에', noFlow: '이 기간에 기록된 것이 없습니다.',
  blockers: '막힌 점', noBlockers: '기록된 막힌 점이 없습니다.', stuck: '막힘', workingNow: '작업 중', finishedIn: '종료 · {duration}', wroteWiki: '위키 작성',
  timeKnown: '집계됨', timeUnknown: '집계 제외', notCountedBecause: '집계 제외: {reason}', timeDetails: '시간 상세', totalInterval: '시작부터 끝까지', activeInterval: '일시 정지 제외',
  startUnknown: '시작 기록 없음', endUnknown: '종료 기록 없음', startedRelative: '{time} 시작', finishedRange: '{range} · {time}', minutes: '분', hours: '시간', unknown: '미확인',
  'reason.conflict': '기록 충돌', 'reason.not_ended': '아직 진행 중', 'reason.time_order': '시간 순서 오류', 'reason.no_activity_history': '일시 정지 이력 없음',
  'reason.history_link': '이력 연결 오류', 'reason.start_mismatch': '시작 시각 불일치', 'reason.scope_history': '영역 변경 오류', 'reason.history_order': '이력 순서 오류', 'reason.end_mismatch': '종료 시각 불일치',
  // wiki
  wikiTitle: '위키', wikiDescription: '작업 중 공유된 근거와 노트입니다.', wikiView: '위키 보기', searchResults: '검색 결과', dailyRefinement: '정리본',
  searchWiki: '제목, 본문, 작업 맥락', participant: '사람', recordType: '기록 종류', includeSuperseded: '대체된 기록 포함', submitSearch: '검색',
  personal: '개인', agreed: '합의', superseded: '대체됨', sourceNote: '소스 노트', summary: '요약',
  wikiSampleNotice: '예시 데이터에는 공유 위키가 없습니다. --repository <경로>로 대시보드를 실행하면 실제 위키를 탐색할 수 있습니다.',
  viewSource: '원문 보기', viewLineage: '연결 보기', noLineage: '연결된 위키 기록이 없습니다.', legacyRecord: '이전 형식 위키 기록', noTitle: '제목 없음',
  noWiki: '표시할 공유 기록이 없습니다.', noMatchingWiki: '조건에 맞는 위키 기록이 없습니다.', noRefinement: '아직 정리본이 없습니다.',
  wikiLoading: '공유 위키를 불러오는 중…', wikiLoadFailed: '공유 위키를 불러오지 못했습니다.', wikiSearching: '검색 중…', wikiSearchFailed: '공유 위키를 검색하지 못했습니다.',
  lineageLoading: '연결된 기록을 불러오는 중…', lineageFailed: '연결된 기록을 불러오지 못했습니다', countNodes: '개 기록', countLinks: '개 연결', noAuthor: '작성자 미확인',
  // settings
  settings: '설정', settingsDescription: '이 브라우저에만 저장됩니다. 프로젝트와 공유 기록은 바뀌지 않습니다.',
  languageSetting: '언어', languageHelp: '자동은 브라우저의 첫 번째 언어를 따릅니다(지금 {language}).', automatic: '자동',
  refreshSetting: '자동 새로고침', refreshHelp: '대시보드를 열어 둔 동안 기록을 다시 읽는 간격입니다.', off: '끄기', seconds30: '30초', minute1: '1분', minutes5: '5분',
  sidebarSetting: '사이드바', sidebarHelp: '이름을 함께 보이거나, 공간을 위해 아이콘만 남깁니다.', sidebarOpen: '이름 표시', sidebarIcons: '아이콘만',
  updatesSetting: 'duobrain 버전', versionLine: '지금 v{version}을 쓰고 있습니다.', versionUnknown: '버전을 알 수 없습니다.',
  // update
  checkUpdates: '업데이트 확인', updateTitle: 'duobrain 업데이트', updateChecking: '업데이트를 확인하는 중…', upToDate: '최신 버전입니다',
  upToDateDetail: '{version}이 최신 버전입니다.', updateAvailable: '새 버전이 있습니다', updateChanges: '바뀐 점',
  updateAsk: '지금 duobrain을 업데이트할까요? 프로젝트 파일과 공유 기록은 바뀌지 않습니다.', updateNow: '업데이트', notNow: '나중에', close: '닫기',
  updating: 'duobrain을 업데이트하는 중…', updatingNote: '끝날 때까지 이 창을 열어 두세요.', updatedTo: '{version}으로 업데이트했습니다',
  restartNeeded: '새 버전을 쓰려면 대시보드를 다시 실행해 주세요.', commitAfterUpdate: '상대도 같은 버전을 쓰도록 업데이트된 .duobrain 폴더와 AGENTS.md를 커밋해 주세요.',
  updateCheckFailed: '업데이트를 확인하지 못했습니다', updateFailed: '업데이트하지 못했습니다',
  'updateError.UPDATE_DIRTY': 'duobrain 폴더에 커밋하지 않은 변경이 있습니다. 먼저 커밋하거나 stash 해 주세요.',
  'updateError.UPDATE_DIVERGED': '이 duobrain에 아직 올리지 않은 로컬 커밋이 있습니다. 직접 업데이트해 주세요.',
  'updateError.UPDATE_NO_UPSTREAM': '이 duobrain에는 업데이트를 받아올 원본이 없습니다.',
  'updateError.UPDATE_NOT_GIT': '이 duobrain은 Git 체크아웃이 아닙니다. 새 릴리스를 내려받아 주세요.',
  'updateError.UPDATE_INSIDE_PROJECT': '이 duobrain이 다른 저장소 안에 있습니다. 먼저 install로 .duobrain 폴더 방식으로 바꿔 주세요.',
  'updateError.UPDATE_NO_RELEASE': '공개된 릴리스를 찾지 못했습니다.',
  'updateError.update_unavailable': '이 대시보드에서는 업데이트를 할 수 없습니다.', 'updateError.update_in_progress': '이미 업데이트가 진행 중입니다.',
  'updateError.default': '문제가 생겼습니다. 터미널에서 `duobrain update`를 실행해 자세한 내용을 확인해 주세요.',
  // evidence
  loadEvidence: '근거를 불러오는 중…', evidenceMissing: '근거 없음', tooLarge: '표시하기에 너무 큼', requestFailed: '불러오지 못함', sampleEvidence: '예시 근거',
  validated: '검증 통과', validationWarning: '검증 경고', validationFailed: '검증 실패', noIssueDetail: '세부 내용 없음',
  'apiError.invalid_wiki_path': '올바른 위키 근거 경로가 아닙니다.', 'apiError.wiki_note_not_found': '근거 노트를 찾을 수 없습니다.',
  'apiError.wiki_note_too_large': '근거 노트가 표시하기에 너무 큽니다.', 'apiError.wiki_note_unavailable': '근거 노트를 불러오지 못했습니다.',
  'apiError.wiki_tools_unavailable': '공유 위키를 사용할 수 없습니다.', 'apiError.invalid_wiki_query': '검색 필터가 올바르지 않습니다.',
  // events
  eventUnknown: '이벤트', noPlanDetail: '계획 설명이 없습니다.', noConflictDetail: '충돌 세부 내용이 없습니다.', viaAi: '{person} (AI 경유)',
  'event.ticket.created': '요청함', 'event.ticket.acknowledged': '읽음', 'event.ticket.needs_information': '추가 정보 요청', 'event.ticket.clarified': '정보 보충',
  'event.ticket.responded': '답변함', 'event.ticket.resolved': '해결 확인', 'event.ticket.closed': '종료함', 'event.ticket.reopened': '다시 열림',
  'event.plan.created': '계획 제안', 'event.plan.updated': '계획 수정',
};

export const dictionaries = { ko, en };
export function translator(locale) {
  const dictionary = dictionaries[locale] ?? dictionaries.en;
  return (key) => dictionary[key] ?? dictionaries.en[key] ?? key;
}
