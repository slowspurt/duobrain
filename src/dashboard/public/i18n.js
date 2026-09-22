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
};

const dictionaries = { ko, en };
export function translator(locale) {
  const dictionary = dictionaries[locale] ?? dictionaries.en;
  return (key) => dictionary[key] ?? dictionaries.en[key] ?? key;
}
