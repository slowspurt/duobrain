export const supportedLocales = new Set(['ko', 'en']);

export function resolveLocale({ search = '', languages = [] } = {}) {
  const requested = new URLSearchParams(search).get('lang')?.toLowerCase();
  if (supportedLocales.has(requested)) return requested;
  for (const language of languages) {
    const locale = String(language).toLowerCase().split('-')[0];
    if (supportedLocales.has(locale)) return locale;
  }
  return 'en';
}

const ko = {
  dashboardTitle: '협업 대시보드', dashboardDescription: '두 사람의 작업 정보와 결정 근거를 확인합니다.',
  brandHome: 'duobrain 현재 화면', source: '실제 엔진 기록', syncing: '동기화 확인 중',
  navLabel: '대시보드 영역', current: '현재', requests: '요청', records: '기록', wiki: '위키',
  sample: '예시 데이터', sampleDescription: '제품 흐름을 확인하기 위한 샘플이며 실제 프로젝트나 동기화 상태가 아닙니다.',
  loadFailed: '기록을 불러오지 못했습니다.', retry: '다시 불러오기',
  goals: '지금 향하는 곳', people: '두 사람의 다음 행동', attention: '지금 확인할 일',
  noInference: '기록되지 않은 활동은 추정하지 않습니다.', delivery: '원격 전송', peer: '상대 확인', peerHint: '요청 상태에서 확인',
  requestView: '요청 보기', inbox: '요청함', history: '처리 이력', search: '검색', status: '상태', kind: '종류', all: '전체',
  information: '정보 보충', feedback: '직접 피드백', peerFilter: '상대', searchTickets: '제목, 내용, 목표, 근거',
  recordedWork: '기록된 작업', recordsDescription: '기록 시각의 구간이며 실제 근무·집중 시간이나 생산성 평가가 아닙니다.', period: '표시 기간', days7: '최근 7일', days30: '최근 30일', allRecords: '전체 기록',
  recentWork: '최근 작업', blockers: '기록된 병목', timeSummary: '시간 요약', participantTime: '사람별 기록 시간', scopeTime: '사람·작업 범위별 기록',
  wikiTitle: '공유 위키', wikiDescription: '작업 안에서 공유된 근거와 연결된 기록을 탐색합니다.', wikiView: '공유 위키 보기', searchResults: '검색 결과', dailyRefinement: '일일 정제',
  searchWiki: '제목, 본문, 작업 맥락', participant: '참여자', recordType: '기록 종류', includeSuperseded: '대체 기록 포함', submitSearch: '검색',
  list: '목록', detail: '상세', filters: '필터', work: '작업', time: '시간', compactRequests: '좁은 화면 요청 보기', compactRecords: '좁은 화면 기록 보기', compactWiki: '좁은 화면 위키 보기',
  project: '전체 목표', mediumTerm: '중기 목표', currentPhase: '현 단계 목표', active: '미종료 기록', paused: '일시 정지 기록', ended: '종료 기록',
  synced: '동기화됨', pending: '공유 대기', error: '동기화 오류', unknown: '동기화 미확인',
  open: '미확인', acknowledged: '읽음', needs_information: '추가 정보 필요', answered: '응답 도착', resolved: '요청자가 해결 확인', closed: '해결 없이 종료',
  personal: '개인', proposed: '제안', agreed: '합의', superseded: '대체됨', sourceNote: '소스 노트', summary: '요약',
  planChecking: '계획 확인 중', planAgreed: '공동 합의', planConflict: '충돌', planNone: '계획 없음', planConflictNotice: '계획 기록이 충돌해 목표와 담당을 선택하지 않습니다.', planMissingNotice: '공유 계획 기록이 없어 목표와 담당을 추정하지 않습니다.', planView: '공유 계획 보기', planHistory: '계획 이력과 근거', next: '다음', noAssignments: '할당 범위 없음', noHistory: '계획 이력이 없습니다.', evidence: '근거', noEvidence: '근거가 없습니다.',
  unknown: '미확인', noRecord: '기록 없음', roleScope: '담당 범위', nextAction: '다음 행동', noParticipants: '참여자 기록이 없습니다.', noRecentWork: '최근 작업 기록이 없어 현재 활동과 범위를 확인할 수 없습니다.', noScope: '범위 미확인',
  recordedRange: '기록 구간', startUnknown: '시작 기록 미확인', endUnknown: '종료 시각 미확인', unfinished: '종료 미확인 · 최종 경과 시간 미확정', minutes: '분', hours: '시간',
  projectInterval: '함께 기록된 전체 구간', projectIntervalNote: '종료가 확인된 작업 구간의 합집합', unknownTime: '시간을 계산할 수 없는 기록', unknownTimeNote: '미종료·시간 오류·충돌·활동 이력 누락', noTimeRecords: '집계할 참여자 기록이 없습니다.', noScopeRecords: '집계 가능한 범위 기록이 없습니다.', noSessions: '세션 기록이 없습니다.', timeKnown: '시간 확인', timeUnknown: '시간 미확인', timeDetails: '시간 정보', totalInterval: '전체 기록 구간', activeInterval: '중지 시간을 뺀 기록 구간', noBlockers: '명시적으로 기록된 병목이 없습니다.',
  details: '상세 기록', noDetails: '상세 이력이 기록되지 않았습니다.', evidencePaths: '근거', noEvidencePaths: '연결된 근거가 없습니다.', loadEvidence: '근거 원문을 불러오는 중입니다.', evidenceMissing: '근거 누락', tooLarge: '크기 초과', requestFailed: '조회 실패', sampleEvidence: '예시 근거', lineageLoading: '연결 관계를 불러오는 중입니다.', lineageFailed: '연결 관계 조회 실패', viewSource: '원문 보기', viewLineage: '연결 관계 보기', noLineage: '연결된 위키 기록이 없습니다.', legacyRecord: '이전 형식 위키 기록', noTitle: '제목 미확인', noWiki: '표시할 공유 기록이 없습니다.', noMatchingWiki: '조건에 맞는 공유 위키 기록이 없습니다.', noRefinement: '유효한 일일 정제 결과가 없습니다.', wikiLoading: '공유 위키 목록을 불러오는 중입니다.', wikiLoadFailed: '공유 위키 목록을 불러오지 못했습니다.', wikiSearching: '공유 위키를 검색하는 중입니다.', wikiSearchFailed: '공유 위키 검색 결과를 불러오지 못했습니다.',
  noRequest: '표시할 요청이 없습니다.', requestFlow: '요청 흐름', linkedGoal: '연결 목표', inboxContext: '진행 중인 요청입니다. 응답 도착과 해결 확인은 서로 다릅니다.', historyContext: '해결 확인과 해결 없이 종료된 기록을 구분합니다.', noInbox: '조건에 맞는 진행 중 요청이 없습니다.', noHistoryRequests: '조건에 맞는 처리 이력이 없습니다.', nothingToCheck: '확인할 항목 없음', noAttention: '현재 기록에서 확인할 요청이나 병목이 없습니다.', syncedCopy: '마지막 원격 동기화 성공', pendingCopy: '로컬 기록 있음 · 원격 공유 미확인', errorCopy: '원격 공유 실패', unknownCopy: '원격 공유 상태 미확인',
  noActor: '주체 미확인', eventUnknown: '이벤트 유형 미확인', noPlanDetail: '계획 근거 설명 미확인', noConflictDetail: '계획 충돌 세부 내용 미확인', noEvidenceNote: '근거 노트를 불러오지 못했습니다.', noIssueDetail: '세부 내용 없음', noAuthor: '작성자 미확인', countNodes: '노드', countLinks: '연결',
};

const en = {
  dashboardTitle: 'Collaboration dashboard', dashboardDescription: 'Review the work record and decision evidence for two people.',
  brandHome: 'duobrain current view', source: 'Live engine record', syncing: 'Checking sync',
  navLabel: 'Dashboard areas', current: 'Now', requests: 'Requests', records: 'Records', wiki: 'Wiki',
  sample: 'Sample data', sampleDescription: 'This sample shows the product flow; it is not a real project or sync state.',
  loadFailed: 'Could not load the record.', retry: 'Try again',
  goals: 'Where we are heading', people: 'Each person’s next action', attention: 'Needs attention now',
  noInference: 'Activities without a record are not inferred.', delivery: 'Remote delivery', peer: 'Peer confirmation', peerHint: 'See request status',
  requestView: 'Request view', inbox: 'Inbox', history: 'History', search: 'Search', status: 'Status', kind: 'Type', all: 'All',
  information: 'Information', feedback: 'Direct feedback', peerFilter: 'Peer', searchTickets: 'Title, body, goal, evidence',
  recordedWork: 'Recorded work', recordsDescription: 'These are recorded intervals, not actual work, focus, or productivity time.', period: 'Period', days7: 'Last 7 days', days30: 'Last 30 days', allRecords: 'All records',
  recentWork: 'Recent work', blockers: 'Recorded blockers', timeSummary: 'Time summary', participantTime: 'Recorded time by person', scopeTime: 'Recorded time by person and scope',
  wikiTitle: 'Shared wiki', wikiDescription: 'Browse evidence and related records shared in the work.', wikiView: 'Shared wiki view', searchResults: 'Search results', dailyRefinement: 'Daily refinement',
  searchWiki: 'Title, body, work context', participant: 'Participant', recordType: 'Record type', includeSuperseded: 'Include superseded records', submitSearch: 'Search',
  list: 'List', detail: 'Details', filters: 'Filters', work: 'Work', time: 'Time', compactRequests: 'Request view on narrow screens', compactRecords: 'Records view on narrow screens', compactWiki: 'Wiki view on narrow screens',
  project: 'Project goal', mediumTerm: 'Mid-term goal', currentPhase: 'Current phase goal', active: 'Open record', paused: 'Paused record', ended: 'Ended record',
  synced: 'Synced', pending: 'Pending share', error: 'Sync error', unknown: 'Sync unknown',
  open: 'Unseen', acknowledged: 'Acknowledged', needs_information: 'More information needed', answered: 'Answer received', resolved: 'Resolved by requester', closed: 'Closed unresolved',
  personal: 'Personal', proposed: 'Proposed', agreed: 'Agreed', superseded: 'Superseded', sourceNote: 'Source note', summary: 'Summary',
  planChecking: 'Checking plan', planAgreed: 'Agreed together', planConflict: 'Conflict', planNone: 'No plan', planConflictNotice: 'The plan record conflicts, so no goal or owner is selected.', planMissingNotice: 'There is no shared plan record, so goals and ownership are not inferred.', planView: 'View shared plan', planHistory: 'Plan history and evidence', next: 'Next', noAssignments: 'No assigned scope', noHistory: 'There is no plan history.', evidence: 'Evidence', noEvidence: 'No evidence is available.',
  unknown: 'Unknown', noRecord: 'No record', roleScope: 'Scope', nextAction: 'Next action', noParticipants: 'There are no participant records.', noRecentWork: 'There is no recent work record to confirm current activity or scope.', noScope: 'Scope unknown',
  recordedRange: 'Recorded interval', startUnknown: 'Start record unknown', endUnknown: 'End time unknown', unfinished: 'Not ended · final elapsed time unknown', minutes: 'm', hours: 'h',
  projectInterval: 'Combined recorded interval', projectIntervalNote: 'Union of work intervals with a confirmed end', unknownTime: 'Records with unknown time', unknownTimeNote: 'Not ended, invalid time, conflict, or missing activity history', noTimeRecords: 'There are no participant records to total.', noScopeRecords: 'There are no scoped records to total.', noSessions: 'There are no session records.', timeKnown: 'Time confirmed', timeUnknown: 'Time unknown', timeDetails: 'Time details', totalInterval: 'Full recorded interval', activeInterval: 'Recorded interval excluding pauses', noBlockers: 'There are no explicitly recorded blockers.',
  details: 'Details', noDetails: 'There is no detailed history.', evidencePaths: 'Evidence', noEvidencePaths: 'There are no linked evidence records.', loadEvidence: 'Loading source evidence.', evidenceMissing: 'Evidence missing', tooLarge: 'Too large', requestFailed: 'Request failed', sampleEvidence: 'Sample evidence', lineageLoading: 'Loading linked records.', lineageFailed: 'Could not load linked records', viewSource: 'View source', viewLineage: 'View links', noLineage: 'There are no linked wiki records.', legacyRecord: 'Legacy wiki record', noTitle: 'Title unknown', noWiki: 'There is no shared record to show.', noMatchingWiki: 'No shared wiki records match these filters.', noRefinement: 'There are no valid daily refinements.', wikiLoading: 'Loading shared wiki records.', wikiLoadFailed: 'Could not load shared wiki records.', wikiSearching: 'Searching shared wiki records.', wikiSearchFailed: 'Could not search shared wiki records.',
  noRequest: 'There is no request to show.', requestFlow: 'Request flow', linkedGoal: 'Linked goal', inboxContext: 'These requests are still in progress. An answer and resolution confirmation are distinct.', historyContext: 'This history distinguishes resolution confirmation from closure without resolution.', noInbox: 'No open requests match these filters.', noHistoryRequests: 'No completed requests match these filters.', nothingToCheck: 'Nothing to check', noAttention: 'There are no requests or blockers to check in the current record.', syncedCopy: 'Last remote sync succeeded', pendingCopy: 'Local record exists · remote sharing unknown', errorCopy: 'Remote sharing failed', unknownCopy: 'Remote sharing status unknown',
  noActor: 'Actor unknown', eventUnknown: 'Event type unknown', noPlanDetail: 'Plan detail unknown', noConflictDetail: 'Plan conflict detail unknown', noEvidenceNote: 'Could not load the evidence note.', noIssueDetail: 'No details', noAuthor: 'Author unknown', countNodes: 'nodes', countLinks: 'links',
};

const dictionaries = { ko, en };
export function translator(locale) {
  const dictionary = dictionaries[locale] ?? dictionaries.en;
  return (key) => dictionary[key] ?? dictionaries.en[key] ?? key;
}
