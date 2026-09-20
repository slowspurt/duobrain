# Dashboard

로컬 읽기 전용 대시보드는 목표, 두 참여자의 최근 작업 기록과 범위, 기록된 병목, 요청함과 처리 이력을 보여준다. 옵션 없이 실행하면 `examples/shared/snapshot.json` 공통 예시를 사용하며, 예시 화면은 실제 프로젝트 상태나 실제 동기화 성공을 뜻하지 않는다.

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
  port: 4173,
});
```

`GET /api/snapshot`은 getter의 JSON 직렬화 가능한 객체를 반환한다. 읽기 실패나 객체가 아닌 결과는 세부 내부 오류를 노출하지 않고 HTTP 503 `snapshot_unavailable`로 응답한다. UI는 빈 배열과 누락 필드를 빈 상태 또는 `미확인`으로 표시한다.

`GET /api/wiki?path=wiki/<uuid>.md`는 선택적 `getWikiNote`가 반환한 `{path, markdown, validation}`만 전달한다. 경로 형식 오류는 400, 누락은 404, 1 MiB 초과는 413, 안전하지 않은 파일·reader 부재·내부 실패는 세부 경로를 숨긴 503으로 응답한다. 다른 파일 경로나 파일 목록 API는 제공하지 않는다. `--repository` 실행은 엔진의 `getWikiNote({repository,path})`를 이 getter로 연결한다.

스냅샷 문자열은 정적 HTML에 삽입하지 않고 API에서 읽은 뒤 DOM `textContent`로만 표시한다. 미종료 세션은 종료와 최종 경과 시간이 미확정이라고 표시하며, 기록이 없는 참여자의 활동을 추정하지 않는다. `sync.status`의 `unknown`, `pending`, `error`, `synced`도 서로 구분한다.

요청함에는 `open`, `acknowledged`, `needs_information`, `answered`가 남고 처리 이력에는 `resolved`, `closed`가 표시된다. 따라서 응답 도착과 요청자의 해결 확인, 해결 없이 닫힘이 서로 합쳐지지 않는다. 상태·종류·상대 필터와 제목·내용·목표·근거 경로 검색을 제공한다. 상세 영역은 이벤트 시각·행위자·본문과 중복 제거된 근거 경로를 보여준다.

원격 전송은 snapshot의 전역 `sync` 상태로, 상대 확인은 티켓 상태로 각각 표시한다. 현재 protocol snapshot에는 로컬 참여자 ID와 티켓별 push/fetch 영수증이 없으므로 요청함은 “내 요청”이 아닌 전체 미종결 요청이다.

근거 경로 버튼은 위의 제한된 API로 원문과 검증 결과를 읽는다. 통과·경고·실패·누락을 구분하고, 예시 snapshot에서 연 근거에만 `예시 근거`를 표시한다. Markdown은 HTML로 변환하지 않고 `<pre>`의 `textContent`로 표시하므로 포함된 HTML이나 스크립트를 실행하지 않는다.

## 검증

```sh
node --test test/dashboard/*.test.js
```

테스트는 동기·비동기 getter, HTTP 읽기 전용 동작, 빈 스냅샷, 읽기 실패, 로컬 바인딩, 정적 셸의 악성 문자열 비삽입과 CSP를 확인한다. 또한 protocol 형태의 티켓 fixture로 탭·필터·검색·근거·상태 구분을 검사한다. 실제 통합 테스트는 임시 원격과 두 클론에서 정보 요청, 확인, 위키 노트 공유, 응답, 해결을 수행한 뒤 실행 중인 dashboard API가 snapshot과 검증된 원문을 그대로 전달하는지 확인한다.
