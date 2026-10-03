# Dashboard

로컬 읽기 전용 대시보드는 목표, 두 참여자의 최근 작업 기록과 범위, 기록된 병목, 요청함과 처리 이력을 보여준다. 옵션 없이 실행하면 `examples/shared/snapshot.json` 공통 예시를 사용하며, 예시 화면은 실제 프로젝트 상태나 실제 동기화 성공을 뜻하지 않는다.

화면 전체는 브라우저 높이에 고정되고 오른쪽 작업 영역만 스크롤한다. 왼쪽 사이드바(차콜 + 라임의 Ink & Lime 테마)에서 `Now`, `Requests`, `Flow`, `Wiki`를 전환하고, 로고 바로 아래에는 내 기록이 상대에게 전달됐는지(`Shared with partner · 5m ago`, `Not shared yet`, `Sharing failed`, `Sharing unknown`)와 화면이 마지막으로 기록을 읽은 시각(`Refreshed …`)을 한 카드로 보여 주며, 누르면 바로 다시 읽는다. 탭 아래 `Right now`에는 두 사람의 최근 기록 상태(작업 중·일시 정지)를 늘 보여 주고, 맨 아래에는 내 프로필이 있다. 사이드바 머리의 버튼으로 아이콘만 남기도록 접을 수 있으며 선택은 브라우저에 저장된다. `Now`는 공동 목표와 계획 상태, 두 사람이 하는 일·다음 할 일·막힌 점 카드, 답을 기다리는 요청을 문장으로 보여 주고, 마지막에 두 레인 흐름의 최근 기록 6개를 둔다. `Requests`는 왼쪽 요청 카드와 오른쪽 상세·진행 기록·근거로 나뉘며 J/K로 이동한다. `Flow`는 기간별 기록 시간 요약과, 세션·요청 이벤트·위키 기록을 사람마다 자기 줄(왼쪽 첫 번째 참여자, 오른쪽 두 번째 참여자)에 시간순으로 놓은 두 레인 타임라인, 막힌 점과 영역별 시간을 보여 준다.

900px 이하에서는 사이드바가 아이콘만 남고, 640px 이하에서는 상단 한 줄 아이콘 내비게이션으로 바뀌며 카드와 두 레인 타임라인이 한 줄로 쌓인다. 정보를 숨기거나 가로 스크롤을 만들지 않는다.

예시 화면의 참여자 이름은 A/B로 익명화한다. 실제 저장소를 연결하면 기록된 참여자 ID를 그대로 표시한다. 모든 탐색과 필터는 읽기 전용이며 대시보드에서 티켓 상태, 위키, 세션이나 동기화 상태를 변경하지 않는다.

화면의 탭, 버튼, 상태명, 안내 문구와 날짜·시간 형식은 기본적으로 영어이며, 브라우저의 첫 번째 선호 언어가 한국어일 때만 한국어로 표시한다. 사이드바 아래 `Settings` 탭의 언어 설정(`Automatic` / `English` / `한국어`)에서 고른 언어는 브라우저에 저장되어 자동 감지보다 우선하며, `Automatic`을 고르면 저장된 선택을 지운다. 재현 가능한 데모와 검토에는 주소 뒤에 `?lang=ko` 또는 `?lang=en`을 붙여 언어를 고정할 수 있다(우선순위: 주소 > 저장된 선택 > 브라우저 언어). 예시 모드는 `examples/shared/snapshot.json`(영어)과 `snapshot.ko.json`(한국어) 중 화면 언어에 맞는 샘플을 사용한다. API 오류 메시지는 영어로 고정하고 화면은 오류 코드를 현재 언어로 번역한다. 티켓 본문, 목표, 병목, 위키 원문처럼 저장소에 기록된 내용은 번역하지 않는다.

`Settings` 탭에서는 언어, 자동 새로고침 간격(끄기·30초·1분·5분), 사이드바 표시(이름 표시·아이콘만)를 바꾸고 `GET /api/meta`가 알려 주는 duobrain 버전과 업데이트 확인을 볼 수 있다. 모든 설정은 이 브라우저에만 저장된다. 화면은 보이는 동안 기본 30초마다 `/api/snapshot`을 다시 읽고, 내용이 바뀐 경우에만 다시 그려 열어 둔 상세와 근거가 유지된다. 사이드바 아래의 동기화 줄(`Updated …`)을 눌러 즉시 새로 읽을 수 있으며, 서버 연결이 끊기면 마지막으로 읽은 기록을 유지한 채 오류 안내를 표시한다. `#current`, `#requests`, `#records`, `#wiki` 주소는 해당 탭을 바로 연다.

`--repository`로 실행하면 그 체크아웃의 로컬 신원(`duobrain init --participant`)을 snapshot의 `viewer`로 전달해 "나"를 자동으로 정하고, 프로필에 닉네임과 GitHub 로그인을 보여 준다. 다른 내부 상태(저장소 경로 등)는 전달하지 않는다. 신원이 없을 때만 프로필 칸에서 `I am`으로 나를 고르며(브라우저에 저장), 나로 정해진 참여자가 움직여야 할 요청을 `Your turn`으로 표시하고 맨 위로 올린다. 차례는 티켓 상태만으로 정한다: `open`·`acknowledged`는 받는 사람이 답할 차례, `needs_information`·`answered`는 요청한 사람이 보충하거나 해결을 확인할 차례이며, 종료된 요청은 누구의 차례도 아니다. 선택하지 않으면 각 요청에 `Waiting on <사람>`만 표시한다.

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

## duobrain 업데이트

대시보드는 프로젝트 기록에 대해서는 읽기 전용이며, 예외는 duobrain 도구 자체의 업데이트 하나다. 사이드바 아래 `Check for updates`를 누르면 `GET /api/update`가 이 체크아웃의 `duobrain update --check`를 실행해 현재·최신 버전과 바뀐 커밋을 보여 주고, 새 버전이 있으면 업데이트할지 묻는 모달을 띄운다. 사용자가 `Update`를 누를 때만 `POST /api/update`가 `duobrain update`를 실행하므로 CLI와 같은 안전 검사(커밋하지 않은 변경·갈라진 이력·다른 저장소 안의 복사본 거부, vendored 복사본은 공개 릴리스만 사용)를 그대로 따른다. 프로젝트 파일과 공유 기록은 바꾸지 않으며, 업데이트 후에는 대시보드를 다시 실행해야 새 코드가 적용된다. vendored 복사본이면 `.duobrain/`과 `AGENTS.md`를 커밋하라고 안내한다.

`POST /api/update`는 `X-Duobrain-Action: update` 헤더가 있고 `Host`가 `127.0.0.1` 또는 `localhost`이며 `Origin`이 같은 주소일 때만 받는다. 다른 웹사이트는 사용자 정의 헤더를 preflight 없이 보낼 수 없고 서버는 preflight에 응답하지 않으므로 교차 사이트 요청과 DNS rebinding을 막는다. 동시에 두 번 실행되지 않으며, 실패하면 경로가 담길 수 있는 메시지 대신 CLI 오류 코드(`UPDATE_DIRTY` 등)만 화면에 전달해 현재 언어로 안내한다.

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
