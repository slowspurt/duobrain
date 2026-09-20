# Everyday collaboration conversations

Status: S1 conversation design, based on protocol v1.

Audience: agent guidance, engine, wiki, dashboard, and future demo authors.

Scope: exactly two collaborators, A and B, each working with their own local AI.

The examples below use fictional feature names, commits, and records. They show useful conversation outcomes, not current implementation claims.

## What a good answer does

An everyday answer should lead with the decision the person can make now. It should then separate:

1. what the shared record confirms;
2. what is unknown because B has not shared or ended work;
3. what A can do without waiting;
4. what request should be sent to B, if any.

The AI should not make the user translate protocol states into a work decision. “B has an active session” is less useful than “B recorded work on the export parser, so you can start the independent empty-state copy but should wait before changing the parser.” Protocol details remain available as evidence, not as the opening sentence.

Answers must also preserve these boundaries:

- A shared start record is not live presence. An old unclosed session means the end is unknown.
- A local commit is not shared until push succeeds and the other side can fetch it.
- A response is not resolution. The requester resolves an answered ticket after checking that it satisfies the question.
- An AI may prepare a feedback request, but only B as a human can answer a feedback ticket.
- A personal choice or experiment is not a joint agreement.
- Missing evidence stays missing. The AI can narrow the question or create an information ticket; it cannot invent B's reasoning.

### When to act and when to ask

If the collaborators have already allowed routine information requests and automatic sharing within a defined scope, the AI should create the narrow information ticket and report what it did. It should not stop at “요청을 남길까요?” every time.

The AI should pause for a person when the next step needs a new judgment, expands the approved sharing boundary, or asks B for direct human feedback. It should also ask when the user's intended task or scope is too ambiguous to create a safe request. This distinction keeps routine coordination moving without turning prior consent into permission for new decisions or broader disclosure.

## Detailed flow: “B 어디까지 했어? 그럼 나는 뭐 하면 돼?”

This is the main continuous conversation. It connects status, next work, overlap, and an explicit start instead of treating them as four unrelated commands.

### Fictional shared situation

- Project goal: finish the caption export flow.
- B has an unclosed session titled “SRT export parser” with scope `src/export/srt.ts` and `test/export/srt.test.ts`.
- B's last shared commit is `8f31c2a`, recorded 16 hours ago.
- The shared session has no end event, blocker, or next action.
- A has not started a session yet.
- The “empty export state” copy in `src/export/empty-state.tsx` is not in B's recorded scope.

### Conversation

**A**

> B 지금 어디까지 했어?

**A's AI**

> 마지막으로 공유된 내용은 `8f31c2a`에서 B가 SRT parser와 그 테스트를 작업하기 시작했다는 것까지입니다. 종료 기록이 없어서 완료 여부와 지금도 작업 중인지는 확인할 수 없습니다. 마지막 갱신은 16시간 전입니다.
>
> 이어받거나 같은 파일을 고치기 전에 필요한 “통과한 테스트, 남은 실패, 미공유 작업” 정보 요청을 사전 허용된 범위에서 B에게 남겼습니다. 아직 B가 읽었다는 기록은 없습니다.

The answer says “end unknown,” not “B is working.” It also makes the uncertainty actionable.

**A**

> 그럼 답 올 때까지 나는 뭐 하면 돼?

**A's AI**

> B의 기록된 범위와 겹치지 않는 `empty export state` 문구와 화면 상태는 지금 시작할 수 있습니다. SRT parser와 테스트는 B의 답을 받을 때까지 건드리지 않는 편이 안전합니다.
>
> B에게는 통과/실패 테스트와 인계 가능 여부를 묻는 정보 요청을 만들고, 당신 작업은 `src/export/empty-state.tsx`로 제한해 시작할 수 있습니다.

**A**

> empty state도 export 쪽인데 정말 안 겹쳐?

**A's AI**

> 파일 경로는 겹치지 않습니다. 다만 둘 다 “내보낼 항목이 0개일 때”의 동작을 바꿀 수 있어 기능 수준 영향 가능성은 있습니다. 현재 공유 기록만으로는 B가 빈 목록 반환 규칙을 바꾸는지 알 수 없습니다.
>
> 화면 작업은 시작하되, 문구와 표시 상태만 바꾸고 parser의 반환 형식은 가정하지 않겠습니다. B 요청에 “빈 목록 계약 변경 여부”도 추가하겠습니다.

This follow-up catches semantic overlap instead of checking only whether filenames differ.

**A**

> 좋아. 그 범위로 시작해줘.

**A's AI**

> 작업 범위를 `src/export/empty-state.tsx`의 문구와 표시 상태로 기록해 시작하겠습니다. 기준 commit과 branch를 시작 기록에 남기고 공유를 시도합니다.
>
> B의 parser 반환 형식은 바꾸지 않고, B의 답이 도착하면 시작 전에 세운 가정을 다시 확인하겠습니다.

At this point the user has made an explicit start decision. The eventual agent procedure can create a `session.started` event, but the conversation does not pretend the write or push succeeded before observing the result.

**A's AI after the start operation**

> 시작 기록은 로컬에 저장됐고 원격 공유도 확인됐습니다. B에게 보낸 정보 요청은 `open`입니다. 지금은 empty state 문구와 표시 상태만 진행하면 됩니다.

If push failed, the correct answer would instead be:

> 시작 기록은 로컬에 저장됐지만 원격 공유는 실패했습니다. 현재 B는 당신의 시작을 볼 수 없습니다. 작업 범위는 그대로 유지하고, 공유를 재시도하기 전에는 겹침 방지가 완료됐다고 보지 않겠습니다.

### B's later response and the resumed conversation

Assume B shares an evidence note stating that CSV export passes, the SRT multiline fixture still fails, and no local-only changes remain. The information ticket becomes `answered`.

**A's AI**

> B의 답이 도착했습니다. `8f31c2a`에서 CSV export는 통과했고 SRT multiline fixture가 남아 있습니다. B는 미공유 변경이 없다고 답했습니다.
>
> 당신의 empty state 작업과 직접 겹치지는 않습니다. 이 답은 아직 티켓의 `answered` 상태이며, 원래 질문을 충족한다고 확인하면 해결 처리할 수 있습니다.

**A**

> 그럼 empty state 끝내고 내가 SRT도 이어받아도 돼?

**A's AI**

> 가능합니다. 다만 두 작업을 한 세션으로 섞기보다 empty state를 먼저 마무리한 뒤, `8f31c2a`를 기준으로 SRT 인계를 새 작업 범위로 시작하는 편이 기록과 검증이 명확합니다.
>
> 먼저 현재 작업을 마무리하고, B의 답이 “완료된 것·남은 실패·미공유 작업”을 모두 충족하는지 확인해 티켓을 해결한 다음 SRT 작업을 시작하겠습니다.

## Representative question 1: “이거 B는 어떻게 했어?”

**User utterance**

> 이거 B는 어떻게 했어? 내 방식이랑 뭐가 달라?

**Needed context**

- what “this” refers to: task, output, or decision;
- A and B's goal, prompt or method, tools, validation, and result;
- whether both runs used the same input or evaluation revision;
- any recorded human intervention.

**Records to check**

- shared session summaries and result commits;
- source-linked wiki notes about the method;
- prompt or harness identifiers when available;
- related information tickets and their evidence.

**Useful answer and next action**

> B는 schema validation과 1회 retry를 켠 방식으로 작업했고, 당신은 retry 없이 한 번만 실행했습니다. 같은 평가 입력을 썼다는 기록은 있지만 모델 설정은 B 쪽에 없습니다. 지금 확인되는 차이는 validation과 retry이고, 결과 차이의 원인이라고 단정할 수는 없습니다. 모델 설정을 보충받으면 한 변수씩 바꾸는 비교를 잡겠습니다.

**If information is missing**

Create or reuse one information ticket asking only for the missing run dimensions. Do not ask B to retell the entire task and do not call the higher score proof that B's prompt was better.

**Natural follow-ups**

- “그 방식 그대로 써도 돼?” → distinguish reusable agreed guidance from one person's experiment.
- “그럼 뭘 먼저 비교해?” → suggest the smallest controlled next run.
- “B한테 설정만 받아줘.” → narrow the existing information request rather than creating a duplicate.

## Representative question 2: “B 지금 어디까지 했어?”

**User utterance**

> B 지금 어디까지 했어?

**Needed context**

- B's latest shared session history and its last update;
- linked commits or evidence notes;
- explicit blockers, next action, and unshared-work statement if present;
- synchronization status.

**Records to check**

- `session.started`, `session.paused`, `session.resumed`, and `session.ended` history;
- shared commits named by the session;
- open tickets assigned to or created by B;
- visible conflicts and the last successful sync.

**Useful answer and next action**

> B가 마지막으로 공유한 것은 검색 필터 API 구현 시작과 테스트 3개 추가입니다. 세션 종료 기록은 없고 마지막 갱신은 어제 18:20이라, 완료나 현재 작업 중 여부는 확인할 수 없습니다. 당신이 같은 API를 만질 계획이면 인계 확인이 필요하고, 독립된 문서 작업은 바로 시작할 수 있습니다.

**If information is missing**

Ask B for a concise handoff: base commit, completed validation, blockers, next step, and whether local-only changes exist. Keep the session's end and elapsed focus time unknown.

**Natural follow-ups**

- “왜 막혔대?” → answer only from explicit blockers; otherwise request the cause.
- “언제 끝나?” → do not invent an estimate; surface an agreed date if one exists.
- “방금도 작업 중인 거야?” → repeat that a shared Git record is not live presence.

## Representative question 3: “그럼 나는 뭐 하면 돼?”

**User utterance**

> B가 거기까지 했으면 나는 뭐 하면 돼?

**Needed context**

- current project and phase goal;
- A and B's recorded scopes;
- dependencies between remaining tasks;
- open blockers and decisions;
- A's current or most recent session.

**Records to check**

- project/current-phase goals in the shared snapshot;
- both participants' session scope and next fields;
- tickets that block or unblock work;
- shared plans and decision notes.

**Useful answer and next action**

> B의 parser 결과가 필요한 통합 테스트는 기다려야 합니다. 그와 독립적인 empty state 화면과 오류 문구는 지금 시작할 수 있습니다. 먼저 화면 범위로 시작 기록을 남기고, parser 반환 형식은 가정하지 않는 것이 가장 안전합니다.

**If information is missing**

Offer only work that is independent under the confirmed record. If no safe next task is known, ask the user for the intended goal or create an information request about the dependency instead of assigning work arbitrarily.

**Natural follow-ups**

- “둘 중 뭐가 더 급해?” → use recorded priority or state that priority is unagreed.
- “기다리는 동안 할 수 있는 것만 골라줘.” → return a bounded list with dependency reasons.
- “그걸로 시작하자.” → proceed to the explicit overlap check and start confirmation.

## Representative question 4: “지금 시작해도 겹치지 않아?”

**User utterance**

> 이 작업 지금 시작해도 B랑 안 겹쳐?

**Needed context**

- A's proposed scope, files, interface, and goal;
- B's latest shared scope and base revision;
- semantic dependencies, not only path intersections;
- age and sync status of B's record.

**Records to check**

- both participants' session scopes;
- shared interface and decision notes;
- visible conflicts;
- last synchronization result.

**Useful answer and next action**

> 파일은 겹치지 않지만 두 작업 모두 `empty results` 계약에 영향을 줄 수 있습니다. 화면 문구와 표시 상태만 제한하면 지금 시작할 수 있고, 반환 형식 변경은 B 확인 전 보류해야 합니다. 그 범위를 시작 기록에 명시하겠습니다.

**If information is missing**

If B's scope is old or vague, say the overlap assessment is based on the last shared revision. Add a narrow information request for the uncertain interface or handoff; do not promise conflict-free work.

**Natural follow-ups**

- “파일이 다른데 왜 겹친다는 거야?” → explain the shared interface or behavior dependency.
- “겹치는 부분만 빼고 시작해.” → propose an exact reduced scope.
- “그냥 둘 다 해도 되지 않아?” → explain the merge/integration risk without presenting worktree separation as a perfect lock.

## Representative question 5: “그 범위로 시작해줘.”

**User utterance**

> 좋아, 겹치지 않는 범위로 시작해줘.

**Needed context**

- the scope just agreed in conversation;
- current branch and base commit when available;
- current goal and known dependency;
- whether A already has an active session.

**Records to check**

- A's open session history;
- proposed start data;
- latest sync result and peer scope.

**Useful answer and next action**

Before execution:

> `src/export/empty-state.tsx`의 문구와 표시 상태만 작업 범위로 잡겠습니다. parser 반환 형식과 B의 테스트 파일은 제외합니다.

After observed execution:

> 시작 기록을 공유했습니다. 기준 commit은 `31bd920`이고 B의 parser 작업은 의존 관계로만 추적합니다. 지금 할 일은 empty state 구현과 해당 화면 검증입니다.

**If information is missing or delivery fails**

If branch/base information is unavailable, record it as unknown rather than guessing. If push fails, say the session is only local and B cannot see it yet. If A already has an active session, ask whether to end, pause, or extend that scope according to the available operation; do not silently create overlapping personal sessions.

**Natural follow-ups**

- “B 답 오면 알려줘.” → explain that it will appear at the next explicit sync; do not promise background monitoring.
- “범위 좀 더 넓혀도 돼?” → rerun overlap and dependency checks before changing the recorded scope.
- “잠깐 멈출게.” → pause the session when supported and report the sharing result.

## Representative question 6: “B가 하던 거 이어받아도 돼?”

**User utterance**

> B가 하던 SRT 작업 내가 이어받아도 돼?

**Needed context**

- B's ownership or active scope;
- explicit handoff or session end;
- base commit, passing and failing validation;
- local-only changes and next action.

**Records to check**

- B's session and handoff evidence;
- linked commit and test result note;
- information ticket response;
- current conflicts and sync state.

**Useful answer and next action**

> B는 `8f31c2a`에서 작업을 넘길 수 있다고 답했고 미공유 변경은 없다고 기록했습니다. CSV는 통과하고 SRT multiline fixture가 남아 있으므로 그 실패부터 이어받을 수 있습니다. 현재 A 작업을 먼저 마무리한 뒤 새 범위로 시작하는 것이 안전합니다.

**If information is missing**

Ask for the handoff facts rather than a vague “okay?”: base commit, completed work, failed attempts, next step, and unshared changes. An unclosed stale session alone is not permission to take over.

**Natural follow-ups**

- “지금 바로 가져와.” → first handle A's existing active session and confirm the base revision.
- “B가 해본 실패는 뭐야?” → list only source-backed attempts.
- “인계됐으면 B 티켓 닫아.” → requester verifies the response before resolution.

## Representative question 7: “여기 막혔는데 B 의견 받아줘.”

**User utterance**

> 온보딩 문구 둘 중에 못 고르겠어. B 의견 받아줘.

**Needed context**

- the decision to make and why B's judgment is needed;
- options, constraints, impact, and desired response format;
- whether B is the decision owner or simply a reviewer;
- relevant deadline if one is already agreed.

**Records to check**

- ownership or project plan;
- prior joint constraints;
- current drafts and affected files;
- existing feedback tickets to avoid duplication.

**Useful answer and next action**

> B에게 두 문구의 차이, 첫 실행 화면에 미치는 영향, “A/B 선택 + 수정 조건” 형식으로 직접 피드백을 요청하겠습니다. B의 AI가 요약을 준비할 수는 있지만, B 본인의 응답 전에는 선택이 확정되지 않습니다. 기다리는 동안 레이아웃 작업은 진행할 수 있습니다.

**If information is missing**

Ask A to identify the actual decision and options if they are not inferable. Keep the feedback ticket open or acknowledged until a human B responds. Do not replace the human response with B's AI recommendation.

**Natural follow-ups**

- “B가 전에 라임 좋아했으니까 그걸로 하자.” → past preference is evidence, not current approval.
- “B 답 오기 전엔 뭘 할 수 있어?” → separate reversible implementation from the pending decision.
- “B가 조건부로 승인했어.” → keep follow-up work visible until the condition is applied and verified.

## Representative question 8: “이건 둘의 합의야, B가 해본 거야?”

**User utterance**

> 30일 보존은 우리 둘이 합의한 거야, 아니면 B가 해본 설정이야?

**Needed context**

- source authorship and decision status;
- scope and date of the record;
- any later decision that supersedes it;
- explicit evidence of both people's agreement.

**Records to check**

- source-linked wiki notes;
- agreement or proposal metadata supported by the wiki format;
- tickets or session notes that produced the record;
- visible conflicting notes.

**Useful answer and next action**

> 지금 확인되는 30일 기록은 B의 개인 선택입니다. 둘의 합의로 표시된 근거는 없습니다. 90일 제안도 별도로 남아 있어, 배포 값은 아직 확정됐다고 볼 수 없습니다. B에게 합의 기록이 있는지 요청하거나 둘이 지금 결정해야 합니다.

**If information is missing**

Create an information ticket if an existing agreement record may be in B's allowed notes. If the choice itself has never been made, create or suggest a human feedback decision instead. Recency and repetition do not promote a personal choice to agreement.

**Natural follow-ups**

- “최근 문서가 30일인데 그걸 쓰면 안 돼?” → explain status beats timestamp for authority.
- “그럼 B 기록을 합의로 바꿔줘.” → require explicit human agreement evidence.
- “일단 내 실험에서도 30일 쓸게.” → record it as A's personal choice, not project policy.

## Representative question 9: “왜 이렇게 결정했어?”

**User utterance**

> 왜 로그인 세션을 이 방식으로 정했어?

**Needed context**

- the decision record and its current status;
- alternatives considered and constraints;
- source revision from the time of the decision;
- later superseding decisions.

**Records to check**

- agreed/proposed/superseded wiki notes;
- linked ticket evidence and session commit;
- conflict entries.

**Useful answer and next action**

> 공유된 결정은 magic link와 secure cookie를 선택했다고만 말하고 이유는 남기지 않았습니다. 운영 비용 때문이라고 추측할 수는 있지만 근거가 아닙니다. B에게 당시 대안과 선택 이유가 있는 기록을 요청하겠습니다. 그 전에는 현재 결정을 설명할 수 없다고 표시하는 것이 맞습니다.

**If information is missing**

Ask for the smallest rationale excerpt and source. If no evidence exists, close only as cancelled or keep information needed according to the user's choice; never manufacture a retrospective rationale.

**Natural follow-ups**

- “대충 추정해봐.” → offer a clearly labeled hypothesis, never write it into shared decision history as fact.
- “근거 없으면 새로 정리하자.” → prepare a new decision discussion without rewriting history.
- “예전 결정이면 무시해도 돼?” → check whether it was superseded, not merely old.

## Representative question 10: “B 변경 중 내 작업에 영향 있는 것만 알려줘.”

**User utterance**

> B가 바꾼 것 중에서 내 결제 화면에 영향 있는 것만 알려줘.

**Needed context**

- A's current scope and dependencies;
- B's shared commits, session scope, and decision changes since A's last sync;
- changed interfaces, data shapes, and common configuration;
- unresolved conflicts.

**Records to check**

- last successful sync marker;
- B's new shared session events and evidence notes;
- commit references when recorded;
- tickets tied to A's goal.

**Useful answer and next action**

> 결제 화면에 직접 영향 있는 공유 변경은 두 가지입니다: 성공 응답의 `receiptId` 추가와 오류 코드 `PAYMENT_RETRY` 신설입니다. B의 내부 리팩터링 기록은 화면 계약을 바꾸지 않아 제외했습니다. `receiptId`는 추가 필드라 지금 구현을 막지 않고, 새 오류 문구는 반영이 필요합니다.

**If information is missing**

Say which time range and sync revision were checked. If B's scope names a likely interface change but no shared evidence exists, create a narrow information request and mark the briefing incomplete.

**Natural follow-ups**

- “코드 전체 말고 내가 할 일만.” → return concrete actions and blockers, retaining source links behind them.
- “이전에도 비슷한 변경 있었어?” → search history without presenting old behavior as current.
- “그중 합의 필요한 건?” → separate additive implementation from human decision.

## Representative question 11: “내가 놓친 요청이나 답 있어?”

**User utterance**

> 내가 안 본 요청이나 B 답변 있어?

**Needed context**

- tickets requested by or assigned to A;
- status and history, not merely read state;
- new responses since A's last confirmed sync;
- conflicts or sync errors that may make the list incomplete.

**Records to check**

- ticket histories and evidence links;
- last synchronization result;
- requester/assignee fields;
- terminal distinction between resolved and closed.

**Useful answer and next action**

> 새로 확인할 것은 두 건입니다. B가 API 필드 요청에 근거를 붙여 답했고, 카피 피드백 요청은 아직 B의 사람 응답이 없습니다. API 건은 당신이 답이 충분한지 확인하면 해결할 수 있고, 카피 건은 계속 기다려야 합니다.

**If information is missing**

If sync is pending or failed, say the inbox may be stale. Do not call an acknowledged ticket answered, or an answered ticket resolved.

**Natural follow-ups**

- “API 답 보여줘.” → summarize answer, evidence, and remaining gaps.
- “읽었으니까 둘 다 치워.” → explain why read state does not close work.
- “오래된 건 취소해.” → requester may close with a cancellation reason, distinct from resolution.

## Representative question 12: “이 답으로 티켓 닫아도 돼?”

**User utterance**

> B가 답했네. 이걸로 요청 해결해도 돼?

**Needed context**

- the original ticket body and intended question;
- response body and shared evidence;
- whether the ticket is information or feedback;
- any remaining gap or contradiction.

**Records to check**

- complete ticket history;
- evidence paths that exist in the shared store;
- relevant source note status and conflicts.

**Useful answer and next action**

> 네. 원래 요청한 현재 필드, 제거 여부, 공유 근거가 모두 답에 포함돼 있고 `wiki/...` 근거도 확인됩니다. 제거 시점은 “미정”으로 명시돼 있어 질문 범위 안에서는 충분합니다. 당신이 해결 처리하면 됩니다.

Or, when insufficient:

> 아직 해결하면 안 됩니다. 현재 필드는 답했지만 제거 시점과 근거 revision이 없습니다. 받은 내용은 보존하고 부족한 두 항목을 같은 티켓에서 다시 요청하겠습니다.

**If information is missing**

For information tickets, require existing shared evidence. For feedback, require a human B response. Only the requester resolves; the assignee's response alone is not completion. Protocol v1 has no requester-side “ask for more on this answered ticket” event, so keep it unresolved and let B add a corrected response when the original completion criteria are clear. If the missing item is a genuinely new question, create a separate information ticket rather than inventing a transition.

**Natural follow-ups**

- “부족한 것만 다시 물어봐.” → keep the original unanswered criteria visible; use a corrected response or a separate ticket according to protocol v1 rather than inventing a status.
- “그 질문은 이제 필요 없어.” → close as cancelled, not resolved.
- “해결했는데 답이 틀렸어.” → reopen and preserve prior history.

## Representative question 13: “공유됐다고 했는데 왜 안 보여?”

**User utterance**

> B가 공유했다는데 내 쪽에는 왜 안 보여?

**Needed context**

- B's local commit and push result;
- remote state and A's fetch/sync result;
- artifact ID or path;
- participant configuration conflicts.

**Records to check**

- sync status and error message;
- shared-store revision or pending local event;
- duplicate or conflicting immutable files.

**Useful answer and next action**

> B 쪽에는 로컬 commit이 있지만 push 성공 기록이 없습니다. 그래서 아직 A가 읽을 수 있는 공유 상태가 아닙니다. B가 같은 기록의 push를 재시도해야 하고, 성공 뒤 A가 다시 동기화하면 확인할 수 있습니다.

**If information is missing**

Do not assume which side failed. Report the last observed local, remote, and A-sync results separately. If the remote rejects a conflict or rewritten file, surface it rather than retrying with force.

**Natural follow-ups**

- “그럼 B한테 다시 보내라고 해.” → request retry of the same artifact, not a duplicate document.
- “내가 직접 가져오면 돼?” → sync explicitly and report success or error.
- “로컬에 있으면 공유된 거랑 같은 거 아냐?” → explain the commit/push/fetch boundary in plain language.

## Representative question 14: “어제 어디까지 했고 오늘 뭐부터 하지?”

**User utterance**

> 내가 어제 어디까지 했지? 오늘 뭐부터 하면 돼?

**Needed context**

- A's most recent ended or unclosed session;
- completed summary, blockers, and next action;
- results that were actually shared;
- B changes and ticket responses since A's last sync.

**Records to check**

- A session history;
- linked evidence and commits;
- new B events since the last successful sync;
- current goal and active tickets.

**Useful answer and next action**

> 어제 A는 empty state 화면을 완료하고 visual check를 남겼습니다. 다음 행동은 SRT 인계 확인이었고, 그 사이 B가 multiline fixture 실패와 미공유 변경 없음으로 답했습니다. 오늘은 그 답을 검토해 티켓을 해결한 뒤 `8f31c2a`에서 실패 fixture를 재현하는 순서가 가장 자연스럽습니다.

**If information is missing**

If A's prior session is unclosed, do not invent “yesterday's completion.” Separate committed evidence from unknown local work and ask A whether to recover or close the session.

**Natural follow-ups**

- “바로 시작해.” → confirm scope/base and record a new start.
- “B 변경 먼저 더 자세히.” → show the relevant briefing, not the whole wiki.
- “어제 몇 시간 했어?” → display recorded intervals and unknown end honestly, not inferred focus.

## Representative question 15: “이거 전에 물어본 거랑 같은 요청 아니야?”

**User utterance**

> old field 삭제 시점, 전에 물어본 거랑 같은 요청 아니야?

**Needed context**

- open and historical tickets about the same artifact and completion condition;
- exact original questions and scope;
- whether the earlier ticket was resolved, closed, or reopened;
- new facts that make this a distinct follow-up.

**Records to check**

- ticket titles, bodies, goal, evidence, and full histories;
- duplicate closure reasons;
- related source revisions.

**Useful answer and next action**

> 같은 요청입니다. 기존 `REQ-API-17`에도 old field 제거 시점이 완료 조건으로 남아 있고 아직 답이 없습니다. 새 티켓을 만들지 않고 이번 질문을 기존 티켓 맥락에 추가하겠습니다.

Or, for a true follow-up:

> 이전 요청은 “현재 사용할 필드”를 해결했고, 이번 질문은 합의된 제거 날짜를 새로 묻습니다. 별도 후속 요청으로 분리하는 편이 명확합니다. Protocol v1에는 티켓 관계 필드가 없으므로 둘의 연결 표시는 후속 제안으로 남깁니다.

**If information is missing**

If equivalence is uncertain, show the likely matching ticket and ask the user whether the goal is the same. Do not close one as duplicate while losing its unique completion criterion.

**Natural follow-ups**

- “같은 거면 합쳐.” → preserve both original utterances under the canonical request.
- “예전 건 해결됐는데 왜 또 나와?” → inspect whether new evidence invalidated it and reopen if needed.
- “별개 질문으로 남겨.” → create a separate request; cross-ticket relation is a proposed later capability, not a v1 field.

## Reusable follow-up patterns

Users rarely ask a complete structured question. The AI should preserve continuity across short follow-ups.

| Short follow-up | Meaning inherited from the conversation | Useful response shape |
| --- | --- | --- |
| “그럼 나는?” | choose A's safe next work given B's confirmed state | available now / blocked / why / proposed scope |
| “지금 해도 돼?” | check overlap and dependencies before starting | confirmed overlap / uncertain overlap / reduced safe scope |
| “그걸로 시작해.” | commit to the most recently proposed scope | restate exact scope, then report observed start/share result |
| “B한테 물어봐.” | request missing information or human judgment | choose information vs feedback, avoid duplicate, state completion need |
| “답 왔어?” | inspect ticket history after explicit sync | answered / acknowledged / still open / sync may be stale |
| “이제 끝난 거지?” | verify completion, not just activity | response + evidence + requester resolution, or remaining gap |
| “왜?” | explain the immediately preceding recommendation | cite dependency, scope, state, or missing evidence |
| “그냥 추정해.” | permit a hypothesis, not a fact | label hypothesis, keep shared state unchanged, propose validation |

## Protocol v1 mapping for earlier research language

Earlier scenario research used exploratory labels. S1 does not add them to protocol v1.

| Earlier research label | Protocol v1 representation used here | Conversation wording |
| --- | --- | --- |
| `ticket_open` | ticket status `open` | “요청을 보냈고 아직 답이 없습니다.” |
| `partial` | ticket remains `answered` but unresolved; B may add a corrected response. `needs_information` is only for the assignee asking the requester for more input. | “확인된 부분과 아직 필요한 부분이 있습니다.” |
| `needs_human` | feedback ticket remains `open` or `acknowledged` until human `ticket.responded` | “B 본인의 응답이 필요합니다.” |
| `awaiting_push` | sync `pending` or `error`; not a ticket status | “로컬에는 있지만 아직 상대가 읽을 수 없습니다.” |
| `conflict_detected` | visible event/entity conflict; mutation blocked by protocol | “기록이 충돌해 어느 쪽도 자동 확정하지 않습니다.” |
| `stale_detected` | derived view of an active session with old last update and no end event | “종료 미확인입니다. 현재 작업 중이라고 단정할 수 없습니다.” |
| `reopened` | `ticket.reopened`, resulting ticket status `open` | “이전 이력을 보존하고 다시 확인 중입니다.” |
| `closed_unresolved` | protocol v1 has only `closed` reasons `cancelled` or `duplicate` | No invented status; explain the actual close reason or keep information needed. |

Potential future distinctions such as conditional approval or partial completion belong in a coordinator-approved protocol revision. Until then, user-facing conversation should express the remaining gap without inventing shared states.

## Acceptance checks for S1 conversation quality

- There are fifteen representative everyday questions, not fifteen renamed test cases.
- Every question connects the utterance to needed context, records, a useful answer, a next action, and a missing-information path.
- The detailed flow reaches an explicit work start through status → next task → overlap → start.
- Answers never infer live presence, focused time, push success, agreement, or resolution from weaker evidence.
- Information and feedback requests remain distinct.
- Examples are fictional and contain no competition or private-project material.
- Protocol v1 names are authoritative; exploratory research labels appear only in the mapping table.
