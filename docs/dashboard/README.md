# Dashboard

로컬 읽기 전용 대시보드는 목표, 두 참여자의 최근 작업 기록과 범위, 기록된 병목, 요청함과 처리 이력을 보여준다. 옵션 없이 실행하면 `examples/shared/snapshot.json` 공통 예시를 사용하며, 예시 화면은 실제 프로젝트 상태나 실제 동기화 성공을 뜻하지 않는다.

화면 전체는 브라우저 높이에 고정되며 페이지 자체를 세로로 스크롤하지 않는다. 상단의 `현재`, `요청`, `기록`, `위키` 탭으로 작업 맥락을 전환한다. 현재 탭은 목표·두 사람의 다음 행동·확인할 일·전송 상태를 한 화면에 배치한다. 넓은 화면에서 요청과 위키는 목록과 상세를 함께 보여주고, 기록은 최근 작업·명시된 병목·시간 요약 순으로 나란히 보여준다. 데이터가 한 영역을 넘을 때는 해당 목록이나 상세 영역 안에서만 스크롤한다.

900px 이하에서는 정보를 숨기거나 가로 스크롤을 만들지 않고 내부 탭으로 바꾼다. 요청과 위키는 `목록`, `상세`, `필터`를 전환하며 목록에서 항목을 고르면 상세로 이동한다. 기록은 `작업`, `병목`, `시간`을 전환한다. 시간 화면은 두 참여자를 항상 함께 표시하되 기록이 없는 사람은 `기록 없음`으로 남긴다. 브랜치, 기준 커밋, 상세 시간 구간은 각 작업의 `시간·개발자 정보`에서 확인한다.

예시 화면의 참여자 이름은 A/B로 익명화한다. 실제 저장소를 연결하면 기록된 참여자 ID를 그대로 표시한다. 모든 탐색과 필터는 읽기 전용이며 대시보드에서 티켓 상태, 위키, 세션이나 동기화 상태를 변경하지 않는다.

화면의 탭, 버튼, 상태명, 안내 문구와 날짜·시간 형식은 기본적으로 영어이며, 브라우저의 첫 번째 선호 언어가 한국어일 때만 한국어로 표시한다. 상단의 `EN / 한국어` 전환은 선택을 브라우저에 저장해 자동 감지보다 우선하고, 재현 가능한 데모와 검토에는 주소 뒤에 `?lang=ko` 또는 `?lang=en`을 붙여 언어를 고정할 수 있다(우선순위: 주소 > 저장된 선택 > 브라우저 언어). 예시 모드는 `examples/shared/snapshot.json`(영어)과 `snapshot.ko.json`(한국어) 중 화면 언어에 맞는 샘플을 사용한다. API 오류 메시지는 영어로 고정하고 화면은 오류 코드를 현재 언어로 번역한다. 티켓 본문, 목표, 병목, 위키 원문처럼 저장소에 기록된 내용은 번역하지 않는다.

## 실행

Node.js 22 이상에서 저장소 루트를 기준으로 실행한다.

```sh
node src/dashboard/run.js
```

기본 주소는 `http://127.0.0.1:4173`이다. 다른 포트는 `DUOBRAIN_DASHBOARD_PORT=4200 node src/dashboard/run.js`처럼 지정한다. 서버는 외부 인터페이스가 아닌 `127.0.0.1`에만 바인딩된다.

실제 엔진의 격리 저장소를 읽으려면 제품 Git worktree 안의 경로를 명시한다. 이 옵션은 동기화를 실행하거나 저장소를 변경하지 않는다.

```sh
node src/dashboard/run.js --repository /path/to/product/clone
node src/dashboard/run.js --repository /path/to/product/clone --port 4200
```

## 연결 인터페이스

`src/dashboard/index.js`는 다음 인터페이스를 내보낸다.

```js
import { startDashboard } from './src/dashboard/index.js';

const server = startDashboard({
  getSnapshot: () => snapshot, // 동기 함수 또는 Promise 반환 함수
  getWikiNote: ({ path }) => note, // 선택 사항; 동기 함수 또는 Promise 반환 함수
  listWikiNotes: () => notes, // 선택 사항; 공유 위키 목록
  searchSharedWiki: ({ query, filters }) => searchResult, // 선택 사항
  traceSharedWiki: ({ roots }) => lineage, // 선택 사항
  port: 4173,
});
```

`GET /api/snapshot`은 getter의 JSON 직렬화 가능한 객체를 반환한다. 읽기 실패나 객체가 아닌 결과는 세부 내부 오류를 노출하지 않고 HTTP 503 `snapshot_unavailable`로 응답한다. UI는 빈 배열과 누락 필드를 빈 상태 또는 `미확인`으로 표시한다.

`GET /api/wiki?path=wiki/<uuid>.md`는 선택적 `getWikiNote`가 반환한 `{path, markdown, validation}`만 전달한다. 경로 형식 오류는 400, 누락은 404, 1 MiB 초과는 413, 안전하지 않은 파일·reader 부재·내부 실패는 세부 경로를 숨긴 503으로 응답한다. `--repository` 실행은 엔진의 `getWikiNote({repository,path})`를 이 getter로 연결한다.

실제 저장소 실행에서는 E5 읽기 API도 주입한다. `GET /api/wiki/notes`는 `listWikiNotes`, `GET /api/wiki/search`는 `searchSharedWiki`, `GET /api/wiki/lineage?root=wiki/<uuid>.md`는 `traceSharedWiki` 결과를 전달한다. 검색은 최대 500자의 단일 검색어와 participant/status/recordType/includeSuperseded 필터만 허용하고, 계보 루트는 최대 20개의 위키 UUID 경로로 제한한다. 이 경계는 제품 파일이나 임의 경로를 읽지 않으며 모든 내부 실패 세부를 숨긴다. 예시 모드에서는 실제 위키가 연결되지 않았음을 별도로 표시한다.

공유 위키 영역은 전체 목록, 서버 검색 결과, 검증된 `dailyRefinement` 메타데이터가 있는 일일 정제 인덱스를 독립적으로 탐색한다. 각 기록에서 원문과 계보를 펼칠 수 있고 검증 실패와 lineage의 누락 참조를 서로 구분한다. source-note에 기록된 `promptRef`와 `harnessRef` 차이는 식별자 그대로만 나열하며 인과나 성과 차이를 추론하지 않는다. artifact manifest는 브라우저에 주입하지 않고 실제 비교는 `duobrain method-compare --file comparison.json` CLI 안내만 제공한다.

스냅샷 문자열은 정적 HTML에 삽입하지 않고 API에서 읽은 뒤 DOM `textContent`로만 표시한다. 미종료 세션은 종료와 최종 경과 시간이 미확정이라고 표시하며, 기록이 없는 참여자의 활동을 추정하지 않는다. `sync.status`의 `unknown`, `pending`, `error`, `synced`도 서로 구분한다.

`snapshot.plan`은 목표 카드와 함께 상태를 표시한다. `proposed`는 `제안`, 검증된 `agreed`는 `공동 합의`, plan이 없고 계획 충돌도 없으면 `계획 없음`이다. plan이 null이면서 plan entity 충돌이 있으면 `충돌`로 표시하고 임의 후보를 선택하지 않는다. 두 참여자의 assignment scope·next, plan body, 전체 revision history와 evidence 경로를 읽기 전용으로 탐색할 수 있다. 합의 근거 원문은 티켓 근거와 같은 제한된 위키 API를 사용한다.

요청함에는 `open`, `acknowledged`, `needs_information`, `answered`가 남고 처리 이력에는 `resolved`, `closed`가 표시된다. 따라서 응답 도착과 요청자의 해결 확인, 해결 없이 닫힘이 서로 합쳐지지 않는다. 상태·종류·상대 필터와 제목·내용·목표·근거 경로 검색을 제공한다. 상세 영역은 이벤트 시각·행위자·본문과 중복 제거된 근거 경로를 보여준다.

원격 전송은 snapshot의 전역 `sync` 상태로, 상대 확인은 티켓 상태로 각각 표시한다. 현재 protocol snapshot에는 로컬 참여자 ID와 티켓별 push/fetch 영수증이 없으므로 요청함은 “내 요청”이 아닌 전체 미종결 요청이다.

근거 경로 버튼은 위의 제한된 API로 원문과 검증 결과를 읽는다. 통과·경고·실패·누락을 구분하고, 예시 snapshot에서 연 근거에만 `예시 근거`를 표시한다. Markdown은 HTML로 변환하지 않고 `<pre>`의 `textContent`로 표시하므로 포함된 HTML이나 스크립트를 실행하지 않는다.

## 기록 시간 집계

최근 7일·30일·전체 기간을 선택해 종료된 세션의 두 시간 값을 분리해 표시한다.

- `프로젝트 벽시계 구간`: 기간 경계로 자른 종료 세션 구간들의 합집합이다. 여러 사람이 동시에 기록한 시간을 중복 합산하지 않는다.
- `사람별 기록상 활동 구간`: `session.paused`부터 `session.resumed`까지를 제외한 이벤트 구간의 사람별 합집합이다. 같은 사람의 겹치는 세션도 중복 합산하지 않는다.
- `사람·범위별 기록 구간`: 각 사람과 명시된 scope 조합의 구간이다. 한 세션이 여러 범위를 가질 수 있어 행끼리 합산하지 않는다.

미종료 세션, 역전되거나 잘못 연결된 시간 이력, 충돌 세션은 시간 미확인으로 남고 총계에서 제외된다. 종료 시각은 있으나 이벤트 history가 없는 호환 snapshot은 벽시계 구간만 표시하고 pause 제외 구간은 미확인으로 둔다. `summary`, `branch`, `baseCommit`, history의 `data`와 `previous`가 없으면 추정하지 않는다. 병목 목록은 `blockers` 또는 종료 이벤트에 명시된 문자열만 사용한다. 모든 수치는 기록 시각의 구간이며 실제 근무·집중 시간이나 성과·생산성 판단이 아니다.

`session.scope_updated`는 active/paused 상태를 바꾸지 않는 범위 경계로 처리한다. active 중 변경은 그 시각에서 기록상 활동 구간을 나누고, paused 중 변경은 다음 resume부터 새 scope를 적용한다. 시작 history에 scope가 없는 legacy 구간은 최종 projection scope로 소급하지 않고 `귀속 미확인`으로 표시한다. 변경 reason과 이전 event 연결은 세션 기록에 보존한다. projection이 `branch: null` 또는 `baseCommit: null`을 명시하면 그 clear를 존중하며, 해당 필드 자체가 없는 legacy snapshot만 시작 event 값을 fallback으로 사용한다.

## 검증

```sh
node --test test/dashboard/*.test.js
```

테스트는 동기·비동기 getter, HTTP 읽기 전용 동작, 빈 스냅샷, 읽기 실패, 로컬 바인딩, 정적 셸의 악성 문자열 비삽입과 CSP를 확인한다. 또한 protocol 형태의 티켓 fixture로 탭·필터·검색·근거·상태 구분을 검사한다. 실제 통합 테스트는 임시 원격과 두 클론에서 정보 요청, 확인, 위키 노트 공유, 응답, 해결을 수행한 뒤 실행 중인 dashboard API가 snapshot과 검증된 원문을 그대로 전달하는지 확인한다. E5 통합 테스트는 실제 공유 위키에 source-note와 일일 정제 결과를 만든 뒤 목록·필터 검색·계보·원문 API를 관통하고 제품 파일 내용이 노출되지 않는지 확인한다. 세션 순수 집계 테스트는 빈 데이터, pause, 기간 양끝 경계, 같은 사람의 겹치는 세션, 여러 참여자, 미종료·시간 오류·충돌·history 누락을 검증한다. E4 연결 테스트는 실제 엔진으로 plan 설정과 start/pause/scope-update/resume/end를 수행하고 실행 중 API snapshot을 plan·scope 집계 모델에 전달한다.
