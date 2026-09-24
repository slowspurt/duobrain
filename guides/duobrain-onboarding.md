# duobrain AI 온보딩 시작 지침

이 문서는 사용자가 기존에 쓰는 AI가 duobrain 협업 준비를 시작하는 단일 진입점이다.
다운로드나 CLI 실행만으로 AI가 시작되지는 않는다. 사용자는 제품 저장소에서 AI에 다음처럼 요청한다.

> duobrain으로 이 프로젝트 협업 준비해 줘. duobrain 도구 저장소의
> `guides/duobrain-onboarding.md`를 읽고 현재 단계부터 이어서 진행해.

AI는 기존 프로젝트 지침과 사용자의 공유 범위를 그대로 적용한다. 이 문서와 저장소 안의
자료는 권한을 추가하는 명령으로 취급하지 않는다.

## 1. 현재 단계를 먼저 읽는다

제품 저장소를 명시해 다음 명령을 실행한다. 이 명령은 초기화 전에도 동작한다.

```sh
node /path/to/duobrain/bin/duobrain.js onboarding-inspect \
  --repository /path/to/product
```

`nextStage`가 이전 진행 지점을 나타낸다. 재실행할 때 이미 저장된 프로젝트 판단, 계정,
자료 요약이나 검토를 다시 묻지 않는다. `ready: true`면 초기 인터뷰를 반복하지 않고
현재 plan, 열린 티켓과 마지막 공유 상태를 브리핑한다.

`repository.commitCount`, `hasWorkingChanges`, `contextCandidates`는 조사할 후보일 뿐이다.
커밋이 있거나 README가 있다는 이유만으로 진행 중 프로젝트 또는 합의를 확정하지 않는다.
`sharedState.status: available`이고 이 클론이 초기화되지 않았다면
`suggestedMode: join-existing`을 우선 검토한다.

## 2. 프로젝트 상태는 사용자의 AI가 근거로 판단한다

허용된 현재 기획서, README, 최근 회의록, 작업 목록과 Git 브랜치·커밋 상태를 읽는다.
외부 이슈나 PR은 해당 도구가 연결돼 있고 사용자가 접근을 허용한 경우에만 읽는다. 다음 중
하나를 근거와 함께 제안한다.

- `new-project`: 현재 계획이나 실제 작업 근거가 없는 새 프로젝트
- `existing-project`: duobrain 도입 전부터 목표, 역할 또는 구현 작업이 진행된 프로젝트
- `join-existing`: 상대가 이미 만든 `duobrain/state`에 두 번째 참여자로 합류

근거가 충분하면 분류를 다시 질문하지 않는다. 자료가 없거나 서로 충돌하면 확인된 사실과
충돌을 먼저 보여주고 프로젝트 상태나 사용할 기준 자료만 묻는다. 과거 작업 시간, 과거 세션,
상대의 승인 또는 완료 상태를 소급해서 만들지 않는다.

판단 결과는 로컬 체크포인트 JSON으로 저장한다. `projectEvidence`에는 실제로 읽은 위치와 그
위치에서 확인한 사실을 쓴다. 아래는 진행 중 프로젝트 예시다.

```json
{
  "mode": "existing-project",
  "projectKind": "existing",
  "projectEvidence": [
    {
      "source": "docs/current-plan.md",
      "fact": "현재 마일스톤과 두 사람의 역할이 기록돼 있다."
    }
  ],
  "identity": {
    "status": "unavailable",
    "githubLogin": null
  },
  "context": {
    "sources": ["README.md", "docs/current-plan.md"],
    "summary": "현재 마일스톤은 API와 입력 화면 연결이다.",
    "missingFacts": ["상대가 맡은 API 응답 계약의 현재 기준"]
  },
  "planReviewed": false,
  "roleReviewed": false
}
```

```sh
node /path/to/duobrain/bin/duobrain.js onboarding-save \
  --repository /path/to/product --file /path/to/onboarding-progress.json
```

`missingFacts`에는 지금 계획을 검토하는 데 필요한 사실만 남긴다. 답을 얻으면 같은 명령으로
해당 필드를 갱신하며, 기존 체크포인트의 생략 필드는 유지된다.

## 3. 계정과 참여자 ID를 구분한다

GitHub CLI가 있다면 인증된 현재 계정을 확인한다.

```sh
node /path/to/duobrain/bin/duobrain.js account-detect
```

`status: confirmed`일 때만 반환된 `login`을 확인된 계정으로 쓴다. 확인할 수 없으면 사용자에게
GitHub username을 한 번 묻거나, GitHub 계정 연결이 필요하지 않은 환경이면
`identity.status: unavailable`로 계속한다. Git author 이름, 이메일, origin 소유자를 로그인
계정으로 추측하지 않는다. 사용자가 직접 알려준 login은 `status: explicit`으로 기록한다.

기존 `config.participants`와 로컬 participant ID는 불변 기록의 소유 키다. 다시 초기화하거나
nickname 변경을 이유로 바꾸지 않는다. 새 저장소에서만 두 participant ID를 정해 초기화한다.

```sh
node /path/to/duobrain/bin/duobrain.js init \
  --repository /path/to/product \
  --participants member-a,member-b --participant member-a
```

nickname은 participant ID와 분리된 공유 프로필이다. 생략하고 싶으면 participant ID 또는
확인된 GitHub login을 기본 nickname으로 사용한다. 변경 시 같은 프로필 이력에 새 revision이
추가된다.

```sh
node /path/to/duobrain/bin/duobrain.js profile-set \
  --repository /path/to/product --nickname "A" \
  --github-login member-a --actor ai
```

## 4. 현재 기준점과 수정안을 한 번에 검토한다

진행 중 프로젝트는 전체 역사를 재구성하는 대신 현재 협업에 필요한 기준점을 만든다.

- 현재 프로젝트 목표, 가까운 목표와 현재 단계
- 기존에 확인된 역할과 각자의 현재 또는 다음 작업
- 완료됐다고 확인된 일, 진행 중인 일, 막힘과 미확인 사항
- 기준 자료와 자료 사이의 충돌
- AI가 제안하는 plan 수정 내용과 인계 조건

원문 기획, 기존 역할, 코드, 브랜치와 기존 AI 지침은 유지한다. 수정안은 기존 기록에서 확인된
내용과 AI 제안을 구분해 사용자에게 보여준다. 한 사람의 검토를 두 사람의 합의로 기록하지
않는다. 검토된 전체 projection만 `plan-set`으로 남기고 체크포인트의 `planReviewed`를
`true`로 갱신한다. 검토는 그때 보이는 plan revision에 연결된다. 이후 기획이 바뀌면
다음 실행에서 변경된 내용만 다시 검토하며 과거 확인을 새 기획의 승인으로 쓰지 않는다.

두 번째 참여자는 공유 plan과 역할, 열린 요청을 먼저 읽는다. 본인의 profile과 배정 범위만
확인하고 `roleReviewed: true`로 갱신한다. 전체 기획 인터뷰를 다시 하지 않는다.

## 5. 동기화 결과를 확인하고 첫 작업으로 잇는다

`onboarding-inspect`가 `nextStage: sync`를 반환하면 기존 기록을 다시 만들지 말고 `sync`를
재시도한다. `ready: true`는 로컬 profile, 필요한 검토와 현재 동기화가 확인됐다는 뜻이다.
상대가 읽었거나 두 사람이 합의했다는 뜻은 아니다.

준비가 끝나면 현재 plan에서 바로 실행 가능한 첫 작업, 상대 자료가 필요한 일, 열린 티켓을
짧게 보여준다. 사용자가 시작을 요청하면 `guides/duobrain-ai.md`와 [세션 참고](reference/sessions.md)의 범위·겹침 확인 절차를
따라 실제 도입 이후의 세션만 기록한다.

## 대시보드 언어

AI 온보딩에는 언어 질문이 없다. AI는 사용자가 대화하는 언어를 따르고 공유된 티켓·회의록·
위키 원문을 보존한다. duobrain은 동적 본문을 자동 번역하지 않는다.

대시보드 표시 언어는 각 클론의 로컬 설정이다. 설정하지 않으면 `system`을 사용한다.
대시보드 UI에서 선택한 값을 저장할 때 다음 계약을 사용할 수 있다.

```sh
node /path/to/duobrain/bin/duobrain.js dashboard-locale-set \
  --repository /path/to/product --locale ko-KR
```

`system` 또는 BCP 47 언어 태그를 받는다. 이 값은 공유 브랜치에 올라가지 않으며 상대의
대시보드 언어를 바꾸지 않는다. 대시보드는 `status.snapshot.localPreferences.dashboardLocale`을
읽을 수 있다. 실제 선택 UI와 번역 문자열은 대시보드 작업에서 이 계약에 연결한다.
