# Concurrent-work and comparison follow-ups

Status: S3 acceptance conversations against main `9f51205`.

These six fictional conversations refine questions that occur after both people have already started using the shared records. They distinguish G1 behavior that has been executed from E3/W3 behavior that is planned or in progress.

## Verified baseline and limits

G1 verified the following in two independent local clones connected to a temporary bare Git remote:

- explicit shared-store synchronization;
- session start/end records;
- information ticket creation, acknowledgment, evidence-backed response, and requester resolution;
- immutable structured wiki evidence and source lineage;
- dashboard HTTP snapshot/history and model behavior;
- 35 integrated engine, wiki, and dashboard tests.

This is not evidence that:

- B is currently present just because B has an active shared session;
- the same flow has passed on two separate machines;
- either person's AI runs automatically or waits in the background;
- product branches are merged, rebased, or put in a worktree automatically;
- scope overlap or peer-change impact is already calculated by the engine;
- prompt or harness contents can be recovered when only a missing or opaque reference was captured.

The current CLI can explicitly record and synchronize supported events. E3 is responsible for pause/resume, complete session read context, overlap assessment, and explicit isolated product-worktree preparation. W3 is responsible for pure source search, method comparison, and evidence tracing. The conversations below describe expected help while keeping those capabilities marked as planned until integrated and verified.

## F01 — “B 지금 하는 중인데 나도 시작해도 돼?”

### Short conversation

**A**

> B 지금 하는 중인데 나도 시작해도 돼?

**A's AI**

> 마지막 동기화에서 B의 세션은 `active`이고 범위는 export parser로 기록돼 있습니다. 다만 이 기록은 12분 전 공유 상태일 뿐, B가 지금 키보드 앞에서 작업 중이라는 뜻은 아닙니다.
>
> 현재 G1은 B의 기록된 범위를 읽을 수 있지만 자동 겹침 판단과 제품 worktree 준비는 아직 없습니다. 당신이 시작할 범위를 알려주면 공유 기록 기준으로 직접 비교하고, 불확실한 의존성은 정보 요청으로 확인하겠습니다.

**A**

> 나는 export empty state 화면만 할게.

**A's AI**

> 파일 경로는 B의 parser 범위와 다릅니다. 하지만 empty-result 계약을 함께 쓸 수 있어 기능 영향은 아직 미확인입니다. 사전 허용된 범위에서 B에게 반환 계약 변경 여부를 묻는 정보 티켓을 공유하겠습니다. 답을 기다리는 동안 문구와 표시 상태로만 범위를 제한하면 시작할 수 있습니다.

### Acceptance

- Say what B recorded and when it was last synchronized; never translate `active` into live presence.
- Do not claim an automatic overlap result or worktree exists.
- A reduced scope may be suggested from known evidence. Unknown interface impact becomes a narrow information ticket.
- Starting still requires the supported explicit start operation and an observed push result.

## F02 — “다른 파일인데 왜 겹쳐?”

### Short conversation

**A**

> 난 UI 파일이고 B는 parser 파일인데 왜 겹친다는 거야?

**A's AI**

> 겹침 후보는 파일명이 아니라 공유된 `empty result` 계약 때문입니다. B의 세션 목표는 parser가 빈 목록을 반환하는 방식을 다루고, 당신 화면은 그 반환값으로 표시 상태를 정합니다.
>
> 지금 확인되는 근거는 두 범위가 같은 계약을 소비한다는 것까지입니다. B가 계약 자체를 바꾸는지는 기록에 없어서, “겹친다”고 확정하지 않고 영향 가능성으로 표시했습니다. 그 항목은 기존 정보 티켓에서 확인 중입니다.

**A**

> 근거 문서가 없었으면?

**A's AI**

> 파일 경로가 다르다는 사실만 답하고 기능 겹침은 알 수 없다고 해야 합니다. B의 작업 내용을 상상하지 않고, 계약 변경 여부를 묻는 정보 요청을 만들겠습니다.

### Acceptance

- Semantic overlap requires an explicit session goal, interface note, ticket evidence, or equivalent shared source.
- Different paths do not prove independence; similar feature names do not prove overlap.
- Current G1 can carry the information ticket and evidence. Automated E3 overlap assessment remains planned.

## F03 — “B 변경 들어왔는데 내 작업 어떻게 이어?”

### Short conversation

**A**

> B 변경 들어왔는데 내 작업 어떻게 이어?

**A's AI**

> 방금 명시적으로 동기화한 공유 기록에서 B는 export 결과에 `warnings` 필드를 추가했다고 남겼습니다. 당신의 현재 세션 기준 commit은 `31bd920`이고, 화면은 아직 이전 결과 모양을 전제로 합니다.
>
> duobrain은 현재 제품 브랜치를 자동 병합하거나 rebase하지 않습니다. 먼저 B가 공유한 commit과 위키 근거를 직접 검토하고, 화면이 `warnings`를 무시해도 되는지 확인해야 합니다. 계속 진행한다면 현재 범위를 마무리하고 새 기준으로 별도 세션을 시작하는 방식이 G1 기록과 맞습니다.

**A**

> 지금 세션 범위만 바꾸면 안 돼?

**A's AI**

> Protocol v1에는 진행 중 session의 scope를 바꾸는 공유 이벤트가 없습니다. E3의 context·pause/resume 범위가 통합되기 전에는 변경했다고 가장하지 않겠습니다. 현재 가능한 기록 방식은 기존 세션을 끝내고 새 base commit과 scope로 시작하는 것입니다.

### Acceptance

- Name the explicit sync observation and the evidence for B's change.
- Do not claim the product worktree or branch was modified by a shared-state sync.
- Do not invent a session-scope update event. Current workaround is end/new start; E3 behavior stays planned.
- If the B change is only rumored or not shared, create an information ticket instead of describing its content.

## F04 — “B 하네스랑 내가 쓴 버전이 달라?”

### Short conversation

**A**

> B 하네스랑 내가 쓴 버전이 달라?

**A's AI**

> 공유된 두 source note의 `workContext`를 보면 당신은 `harness/export@1.8`, B는 `harness/export@2.1`을 참조했습니다. 캡처된 참조 문자열은 다릅니다.
>
> 현재 구현으로 확정할 수 있는 것은 버전 참조가 다르다는 사실뿐입니다. 두 버전의 설정·도구·retry 차이를 자동으로 찾아 비교하는 W3 기능은 아직 진행 중이므로, 어느 차이가 결과에 영향을 줬다고는 말할 수 없습니다.

**A**

> 그럼 B가 더 최신이라 잘된 거네?

**A's AI**

> 더 높은 버전 번호와 더 좋은 결과 사이의 인과는 근거가 아닙니다. 같은 입력·prompt·model·검증 조건인지 확인한 뒤 한 변수를 분리해야 합니다.

### Acceptance

- Compare exact captured `promptRef`/`harnessRef` values and cite their notes.
- A different reference supports “different captured version,” not content difference or causal effect.
- `null`, legacy metadata, missing note, and opaque reference must be described as unknown, not equal or different.
- W3 search/comparison is planned; S3 does not invent its output.

## F05 — “비교 자료 없으면 요청하고 답 오면 이어서 설명해줘.”

### Short conversation

**A**

> 비교 자료 없으면 B한테 요청하고, 답 오면 이어서 설명해줘.

**A's AI**

> B 기록에는 harness 참조가 있지만 prompt와 평가 입력 revision이 없습니다. 사전 허용된 정보 요청으로 그 두 항목과 사람 개입 여부만 묻는 티켓을 공유했습니다. Push는 성공했지만 B가 읽거나 답했다는 기록은 아직 없습니다.
>
> 현재 duobrain은 AI가 백그라운드에서 계속 기다렸다가 자동 재개하는 기능을 검증하지 않았습니다. 다음에 명시적으로 동기화할 때 답변 상태와 근거를 확인하고, 도착했다면 이 질문부터 이어서 비교하겠습니다.

**A, after a later explicit sync**

> 답 왔어. 이어서 설명해줘.

**A's AI**

> B의 정보 티켓은 `answered`이고 source note도 읽을 수 있습니다. 같은 평가 revision을 썼고 B만 retry 1회를 사용했다는 사실이 확인됩니다. 따라서 점수 차이는 관찰할 수 있지만 harness 버전만 원인이라고 결론 내릴 수 없습니다. Prompt를 고정하고 retry만 바꾸는 비교가 다음 단계입니다. 이 답이 원래 요청을 충족한다고 확인하면 티켓을 해결할 수 있습니다.

### Acceptance

- Ask only for missing comparison dimensions and distinguish push from B read/acknowledgment.
- No background AI or automatic wake-up claim. Continuation begins after an explicit later sync or user invocation.
- An information response needs shared wiki evidence; `answered` remains distinct from requester `resolved`.
- Compare observed controls and confounds; do not turn correlation into cause.

## F06 — “두 clone에서 됐으면 우리 둘 컴퓨터에서도 AI가 알아서 되는 거지?”

### Short conversation

**A**

> 두 clone 테스트 통과했으면 우리 둘 컴퓨터에서도 각자 AI가 알아서 이어주는 거지?

**A's AI**

> 아직 그렇게 말할 수 없습니다. G1은 한 검증 환경의 두 독립 로컬 clone과 임시 bare Git remote에서 정보 요청→위키 근거→응답→해결, 그리고 dashboard HTTP/model 흐름을 확인했고 통합 테스트 35개가 통과했습니다.
>
> 실제 두 머신 사용자 수용 테스트와 AI 자동 실행·백그라운드 재개는 아직 검증되지 않았습니다. 현재는 각 환경에서 명시적으로 CLI와 sync를 실행하고 기존 AI가 지침을 따라야 합니다.

**A**

> 그럼 지금 확실히 쓸 수 있는 건 뭐야?

**A's AI**

> 같은 Git 원격을 쓰는 독립 clone에서 명시적 명령으로 세션과 티켓을 공유하고, source note를 근거로 답한 뒤 요청자가 해결하며, 로컬 dashboard에서 상태와 이력을 읽는 흐름입니다. 두 머신과 자동 AI 연결은 다음 검증 범위입니다.

### Acceptance

- State the exact G1 environment and verified flow.
- Keep test success separate from two-machine acceptance and automatic AI execution.
- Do not use the independent website or static demo as runtime verification.
- Describe current use as explicit CLI/sync plus instructions for the user's existing AI.

## Acceptance map

| ID | User decision enabled | Required evidence | Verified G1 response | Must remain unknown or explicit | Planned dependency |
| --- | --- | --- | --- | --- | --- |
| F01 | whether A can start a reduced scope while B has an unclosed session | last sync, B session status/scope/age, A proposed scope, interface evidence | read shared scope; create/sync information ticket; explicitly start A session | B live presence, unpushed changes, automatic overlap/worktree | E3 overlap assessment and worktree preparation |
| F02 | why separate files may still interact | shared session goal or source note naming a common interface/behavior | explain only the explicit dependency; request missing contract evidence | semantic overlap without a source | E3 overlap assessment; W3 source search |
| F03 | how to continue after a newly shared B change | explicit sync result, B change source/commit, A base commit and scope | show shared state and source; end/start supported sessions; leave product branch untouched | automatic merge/rebase, scope mutation, unseen B code | E3 context, pause/resume, peer-change and worktree flow |
| F04 | whether captured harness references differ | two valid structured notes with `workContext`, source revisions | compare exact references and their provenance | harness content/behavior or causal effect when uncaptured | W3 method comparison and evidence tracing |
| F05 | how comparison resumes after missing evidence arrives | information ticket history, shared evidence note, explicit later sync | create narrow ticket, inspect `answered`, read evidence, requester resolves if sufficient | background waiting, automatic AI wake-up, unsupported cause | W3 missing-evidence candidate and comparison; later AI integration |
| F06 | what the integrated alpha can honestly claim | `docs/implementation-status.md`, G1 test/environment record | two local clones, temporary remote, explicit ticket/wiki/dashboard flow, 35 tests | actual two-machine acceptance, automatic AI execution, deployment | fresh-environment/two-machine acceptance and AI integration |

## Cross-conversation acceptance rules

1. `active` means no terminal session event, not “B is online now.” Always include the last observed sync or update time when recency matters.
2. Different file paths are only one overlap signal. A semantic overlap claim needs a shared interface, goal, decision, or other explicit source.
3. Shared-state sync does not edit, merge, or rebase product code. Product-worktree actions remain explicit and unverified until E3 integration.
4. A captured prompt/harness reference can prove reference equality or difference. It cannot reveal missing contents or prove causal impact.
5. Under prior authorization, clear factual gaps produce narrow information tickets without repeatedly asking permission. New judgment, direct feedback, or expanded sharing still requires a person.
6. Push success means the remote accepted the shared record. B read/acknowledgment and later AI continuation are separate observations.
7. G1's two local clones and dashboard API/model checks must never be described as a completed two-machine or autonomous-AI acceptance run.
