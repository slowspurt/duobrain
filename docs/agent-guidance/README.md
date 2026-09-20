# AI 협업 지침 사용법

[`guides/duobrain-ai.md`](../../guides/duobrain-ai.md)는 사용자가 각자의 AI에 제공하는 실행 절차다. 두 참여자의 AI가 같은 문서를 읽을 수 있지만, 별도 상주 AI 서비스나 자동 후크를 설치하지 않는다.

## 적용 방법

1. 두 사람은 공유된 기획·위키·티켓 기록을 먼저 동기화한다. 동기화 실패나 미확인 상태는 숨기지 않는다.
2. 각자 자신의 AI 대화에 지침 파일과 현재 질문을 제공한다.
3. AI는 [프로토콜 v1](../protocol.md)의 이벤트·티켓 규칙 안에서 사실, 추론, 미확인을 구분해 행동을 제안한다.
4. 구현된 CLI의 실제 결과가 있을 때만 기록 생성, 커밋, push 결과를 보고한다. CLI는 세션 명령과 티켓·위키 명령을 지원한다.

## 초기 흐름

| 시점 | AI가 확인·정리할 것 | 사람 또는 실제 도구가 필요한 것 |
| --- | --- | --- |
| 첫 실행 | 기존 목표·합의·단계별 계획, 빈칸과 근거 | 기획이 없으면 현재 상황·회의록 제공 |
| 두 번째 참여 | 기존 계획, 공유된 최근 상태, 열린 티켓 | 참여자별 범위와 실제 동기화 확인 |
| 작업 시작 | 목표·범위·의존성·미처리 티켓·다음 한 단계 | `start`와 `sync`의 실제 JSON 결과 필요 |
| 정보 요청 | 필요한 주장, 근거, 완료 조건 | 사전 허용된 요청은 `ticket-create`; 응답은 위키 근거와 `ticket-respond` 필요 |
| 직접 피드백 | 선택지·영향·AI 추천을 사람 판단과 분리 | 상대 사람의 응답; AI가 대신 종료 불가 |
| 인계·마무리 | 결과·검증·미공유 작업·막힘·다음 단계 | `end`, `status`, `sync`의 실제 결과 필요 |

## 지원되는 세션 명령

현재 도움말 기준 실행 명령과 옵션은 다음과 같다. 실행 전에는 `node bin/duobrain.js <command> --help`로 다시 확인할 수 있다.

```sh
node bin/duobrain.js init --participants alice,bob --participant alice
node bin/duobrain.js start --title "작업 제목" --scope src/example --goal "목표" --branch feature/example --base-commit <sha> --actor human
node bin/duobrain.js status
node bin/duobrain.js end --session <uuid> --summary "결과" --blockers "막힘" --next "다음 단계" --actor human
node bin/duobrain.js sync
```

`start`와 `end`는 로컬 이벤트 커밋 뒤 동기화를 시도한다. push가 실패하면 JSON은 `pending`을 보이고 명령은 종료 코드 2가 될 수 있다. 이는 상대가 아직 볼 수 없다는 뜻이며 `sync`로 재시도한다.

## 지원되는 티켓·위키 명령

```sh
node bin/duobrain.js ticket-create --kind information --title "질문" --body "필요한 사실" --assignee bob --goal "현재 목표" --actor ai
node bin/duobrain.js ticket-ack --ticket <ticket-uuid> --actor ai
node bin/duobrain.js note-add --file ./source-note.md
node bin/duobrain.js ticket-respond --ticket <ticket-uuid> --body "근거 있는 응답" --evidence wiki/<note-uuid>.md --actor ai
node bin/duobrain.js ticket-needs-information --ticket <ticket-uuid> --body "부족한 자료" --actor ai
node bin/duobrain.js ticket-resolve --ticket <ticket-uuid> --body "완료 조건 충족" --actor ai
node bin/duobrain.js ticket-close --ticket <ticket-uuid> --reason duplicate --body "기존 티켓으로 처리"
node bin/duobrain.js ticket-reopen --ticket <ticket-uuid> --body "새 근거가 필요함" --actor ai
```

`ticket-respond`의 정보 응답은 존재하는 `wiki/<uuid>.md` 근거가 필요하다. feedback 티켓은 `ticket-create --kind feedback`으로 만들며 assignee의 응답은 반드시 `--actor human`이다. requester만 `ticket-resolve`, `ticket-close`, `ticket-reopen`을 실행할 수 있다. `note-add`는 검증한 note를 불변 경로에 추가하고, legacy Markdown에는 `--id <uuid>`가 필요하다. requester clarification·티켓 relation·진행 중 scope 변경은 v1 지원으로 문서화하지 않는다.

## 일상 대화 적용

[대화-기능 맵](../scenarios/conversation-to-capability-map.md)은 15개 일상 질문을 조회 근거, 자동 처리 경계, 사람 판단 경계로 연결한다. [everyday-flow fixture](../../examples/scenarios/everyday-flow.json)는 이 연결을 검토하는 익명화된 시나리오 데이터이며 런타임 입력이 아니다. 지침은 이 자료의 근거 우선, 최소 공개, 부분 해결 보존, 사람 판단 분리 원칙을 실행 절차로 옮긴다.
