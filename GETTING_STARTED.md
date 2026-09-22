# duobrain 시작하기

두 사람의 기존 Git 프로젝트에 작업 기록, 정보 요청, 위키와 로컬 대시보드를 연결하는 알파 버전이다. Node.js 22 이상과 Git이 필요하며 별도 런타임 패키지 설치는 필요하지 않다. 현재 검증 범위와 남은 배포 항목은 [구현 현황](docs/implementation-status.md)을 참고한다.

## 먼저 화면 보기

```sh
git clone https://github.com/slowspurt/duobrain.git
cd duobrain
node src/dashboard/run.js
```

브라우저에서 `http://127.0.0.1:4173`을 연다. 이 실행은 예시 데이터 화면이다. 종료는 터미널에서 Ctrl+C를 누른다.

## 실제 프로젝트 연결

각자 같은 제품 저장소를 클론하고 duobrain은 도구용 별도 폴더에 둔다. 아래 절대 경로는 자신의 경로로 바꾼다. 두 사람 모두 같은 순서의 참여자 쌍을 사용하고 자신의 ID만 다르게 설정한다.

```sh
# Alice의 컴퓨터
node /path/to/duobrain/bin/duobrain.js init \
  --repository /path/to/product --participants alice,bob --participant alice

# Bob의 컴퓨터
node /path/to/duobrain/bin/duobrain.js init \
  --repository /path/to/product --participants alice,bob --participant bob
```

제품 저장소의 `origin`에 두 사람 모두 읽기·쓰기 권한이 있어야 한다. 공유 기록은 그 원격의 `duobrain/state` 브랜치와 로컬 Git 내부의 격리 저장소에 저장된다. 코드 변경과 공유 기록은 별도 커밋이다. 명령 결과가 `pending`이거나 종료 코드가 2이면 전달 완료가 아니므로 같은 제품 저장소에서 `sync`로 재시도한다.

```sh
node /path/to/duobrain/bin/duobrain.js sync --repository /path/to/product
node /path/to/duobrain/bin/duobrain.js status --repository /path/to/product
node /path/to/duobrain/src/dashboard/run.js --repository /path/to/product
```

실제 대시보드는 로컬에 동기화된 기록을 읽는다. 상대의 새 기록을 가져오려면 `sync`를 실행한다.

## 기존 AI에게 첫 작업 맡기기

제품 저장소에서 기존 AI에 다음 요청을 전달한다. duobrain 경로를 실제 값으로 바꾼다.

> duobrain으로 이 프로젝트 협업 준비해 줘. `/path/to/duobrain/guides/duobrain-onboarding.md`를 읽고 현재 단계부터 이어서 진행해.

AI는 `onboarding-inspect`로 이전 진행 단계를 확인하고, 허용된 기획·회의록·코드와 Git 상태를
읽어 새 프로젝트인지 진행 중 프로젝트인지 근거와 함께 제안한다. 확인할 수 없는 사실만
질문한다. 두 번째 참여자는 기존 plan과 본인 역할부터 확인한다. 자세한 상태 전이와 실제
명령은 [AI 온보딩 시작 지침](guides/duobrain-onboarding.md)에 있다.

준비 후에는 “B는 이 작업을 어떻게 했어?”, “B 어디까지 했어? 나는 뭐 하면 돼?”처럼 질문한다. AI가 근거를 찾고 부족하면 요청 티켓을 남기는 절차와 실제 명령은 [상세 저장소 안내](docs/agent-guidance/repository-onboarding.md)에 있다. AI는 사용 중인 도구에서 실행하며 duobrain이 별도 AI 서버를 띄우지는 않는다.

## 하루 정제 설정

첫 번째 참여자가 [예약 실행 안내](docs/engine/README.md#daily-wiki-refinement-execution)에 따라 시간대·시간·중요도 정책을 담은 JSON을 준비하고 외부 스케줄러에서 `wiki-refine --file /path/to/schedule.json --if-due --repository /path/to/product`를 호출한다. 실제 실행에는 위와 동일한 Node와 CLI 절대 경로를 사용한다. 같은 날짜의 성공한 정제는 중복 실행하지 않으며, 원문을 보존한 요약 인덱스를 공유한다. 설치만으로 OS 예약 작업이 등록되지는 않는다.

## 검증 실행

```sh
node --test test/engine/*.test.js test/wiki/*.test.js test/dashboard/*.test.js
node examples/scenarios/verify-concurrent-flow.mjs
node examples/scenarios/verify-plan-refinement-flow.mjs
node examples/scenarios/verify-method-refinement-schedule-flow.mjs
```

자동 검증은 임시 로컬 원격과 클론을 사용한다. 실제 두 컴퓨터에서 각자의 AI와 Git 인증을 사용하는 인수 검증은 별도로 진행한다.
