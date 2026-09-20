# Conversation-to-capability map

Status: S2 mapping for protocol v1. This document does not change the shared protocol or claim that every action is implemented.

The map starts from the user's everyday question. “Records” means the minimum shared facts the AI should inspect. “Action” describes useful behavior under prior authorization. “Gap handling” distinguishes routine information requests from new human judgment. The four role columns describe consumers of the scenario, not ownership changes.

## Shared evidence vocabulary

The scenarios reuse protocol v1 rather than adding states.

| Concern | Protocol v1 record or field | What it proves | What it does not prove |
| --- | --- | --- | --- |
| B's work scope | session entity: `title`, `scope`, `goal`, optional `branch`, `baseCommit` | what B recorded as intended work | live presence, completion, or unpushed changes |
| Work progress | session history and optional `session.ended` `summary`, `blockers`, `next` | recorded lifecycle and stated handoff | measured focus time or facts absent from evidence |
| Request | ticket `kind`, `title`, `body`, `assignee`, `goal` | the question and who should respond | acknowledgment, answer, or completion |
| Information answer | `ticket.responded` by B or B's AI with an existing `wiki/<uuid>.md` evidence path | a shared answer with a source note | requester acceptance or resolution |
| Human feedback | `ticket.responded` with `actor.kind: "human"` | B personally responded | implementation of the feedback |
| Completion | `ticket.resolved` by the requester after `answered` | A accepted the response as sufficient | that every linked follow-up is complete |
| Non-resolution close | `ticket.closed` with `cancelled` or `duplicate` | why the request ended without resolution | a successful answer |
| Synchronization | snapshot `sync.status`, `lastSyncedAt`, `message` plus observed push/fetch result | last observed delivery state | B actually read the record |
| Conflict | visible competing event histories | shared histories diverged | which branch is correct |
| Decision evidence | source-linked wiki note, using the wiki role's validated status vocabulary | the source and recorded decision status | authority beyond the source or an inferred agreement |

The wiki format is owned by the wiki role. Scenario examples refer only to protocol evidence paths and expected meaning; they do not define a second wiki schema.

## Action boundary under prior authorization

| Situation | AI behavior |
| --- | --- |
| A asks a factual question, the missing fields are clear, and routine information tickets are pre-authorized | Create or reuse a narrow `information` ticket, attempt to share it, and report both delivery and read/ack status separately. |
| An information ticket already covers the same artifact and completion need | Reuse it when possible; if protocol v1 cannot append requester context, show the existing ticket rather than inventing an event. Create a separate follow-up only when the question is materially new; relating tickets is a proposed later capability because v1 has no relation field. |
| The next step needs B's preference, approval, prioritization, or review | Prepare the decision context and ask for direct human feedback. B's AI cannot provide the feedback response. |
| A asks to share material outside the configured boundary | Stop and request explicit approval for the expanded sharing scope. |
| A's intended task or the object of “this” is ambiguous | Ask A to identify the task or artifact before creating a misleading request. |
| Local commit or event write succeeds but push fails | Report local success and remote failure. Do not say the peer can see it. |

## Fifteen-question mapping

“I” means the current user A and “B” means the other collaborator. All example identifiers are fictional.

| ID | Everyday question | Required records and evidence | AI action and useful outcome | Gap handling | Role consumers |
| --- | --- | --- | --- | --- | --- |
| Q01 | “이거 B는 어떻게 했어? 내 방식과 뭐가 달라?” | Both session/result references; source notes for prompt or method; same input/eval revision; human intervention | Compare only source-backed dimensions, separate observed result from causal inference, propose one controlled next comparison | If run dimensions are absent, auto-create/reuse an `information` ticket for only those fields | Engine: ticket/history; Wiki: source status; Guidance: comparison wording; Dashboard: side-by-side evidence |
| Q02 | “B 지금 어디까지 했어?” | B session lifecycle, last shared revision, ended summary/blockers/next, sync state, visible conflicts | Lead with last confirmed milestone and explicitly say whether the end is unknown; offer safe implications for A | For an unclosed or vague session, auto-create a handoff-shaped `information` ticket; never claim live presence | Engine: derived session and sync; Wiki: handoff evidence; Guidance: stale-record caution; Dashboard: last update and unknown end |
| Q03 | “그럼 나는 뭐 하면 돼?” | Current goal, both scopes, dependencies, open tickets, A's session | Split work into available now, blocked, and awaiting decision; recommend the smallest independent next scope | If no goal or dependency is recorded, ask A for the intended outcome; do not assign work from guesswork | Engine: sessions/tickets; Wiki: plans/decisions; Guidance: task selection; Dashboard: next actions |
| Q04 | “지금 시작해도 B랑 안 겹쳐?” | Proposed A scope, B's latest scope/base revision, path and interface dependencies, sync age, conflicts | Check file and semantic overlap, state the revision used, and offer a reduced safe scope | If B's interface impact is unknown, auto-create/reuse a narrow `information` ticket and describe the assessment as incomplete | Engine: overlap inputs/conflicts; Wiki: interface evidence; Guidance: overlap explanation; Dashboard: scopes and uncertainty |
| Q05 | “좋아, 그 범위로 시작해줘.” | Agreed scope, A's current session, base commit/branch if available, latest sync | Restate exact included/excluded scope, perform the supported start procedure, then report local write, push, and peer-read status separately | If A already has an active session or scope is ambiguous, ask for pause/end/scope choice; if push fails, keep remote visibility false | Engine: session event/delivery; Wiki: none required; Guidance: start procedure; Dashboard: A session and sync |
| Q06 | “B가 하던 거 내가 이어받아도 돼?” | B end/handoff record, base commit, completed and failed validation, local-only work statement | Decide only from an explicit handoff or sufficient shared evidence; identify the exact resume point and what not to repeat | If any handoff fact is absent, auto-create/reuse an `information` ticket; stale unclosed work is not permission | Engine: session/ticket; Wiki: handoff source; Guidance: takeover checks; Dashboard: owner, blockers, next |
| Q07 | “여기 막혔는데 B 의견 받아줘.” | Decision question, options, impact, agreed constraints, ownership, existing feedback ticket | Prepare a concise brief and create a `feedback` ticket only after the user's request for B's judgment; continue reversible work when possible | B's human response is required; B's AI may prepare context but cannot answer | Engine: feedback lifecycle; Wiki: constraints/decision source; Guidance: feedback brief; Dashboard: waiting for human |
| Q08 | “이건 둘의 합의야, B가 해본 거야?” | Source author, decision status, scope, date, superseding source, explicit agreement evidence | Name the current recorded status and avoid promotion by recency or repetition | If an agreement may exist in allowed B records, auto-create/reuse an `information` ticket; if no decision was made, ask for human decision | Engine: request/conflict; Wiki: decision/source status; Guidance: status language; Dashboard: proposal/personal/agreed distinction |
| Q09 | “왜 이렇게 결정했어?” | Current decision note, alternatives/constraints, source revision, superseding record | Explain only recorded rationale and link the source; clearly label hypotheses | Auto-request the smallest rationale excerpt if pre-authorized; if no evidence exists, keep rationale unknown or start a new human decision | Engine: information request; Wiki: rationale provenance; Guidance: fact vs hypothesis; Dashboard: decision history |
| Q10 | “B 변경 중 내 작업에 영향 있는 것만 알려줘.” | A scope, B events since A's last sync, interface/data/config changes, linked tickets and conflicts | Filter to changes that alter A's work, then return impact and concrete action rather than the whole history | If a likely change lacks shared evidence, auto-create/reuse a narrow information request and mark the briefing incomplete | Engine: change window/sync; Wiki: source notes; Guidance: relevance filter; Dashboard: change briefing |
| Q11 | “내가 놓친 요청이나 B 답변 있어?” | Tickets by requester/assignee, full status/history, last sync, conflicts | Separate open, acknowledged, answered-awaiting-A, resolved, and closed; say when the list may be stale | On sync error, report an incomplete inbox instead of zero; no new ticket is needed just to inspect | Engine: ticket projection/sync; Wiki: response evidence; Guidance: status explanation; Dashboard: inbox/history |
| Q12 | “이 답으로 티켓 해결해도 돼?” | Original ticket question, kind, response body, evidence paths, contradictions, responder kind | Check original need against response and evidence; resolve only as requester if sufficient | Keep an insufficient answer unresolved. Protocol v1 allows B to add a corrected response; create a new ticket only for a materially new question | Engine: lifecycle validation; Wiki: evidence existence; Guidance: completion check; Dashboard: answer vs resolution |
| Q13 | “B가 공유했다는데 왜 내 쪽에는 안 보여?” | B local commit/push result if reported, remote state, A sync result, artifact path, participant/config conflict | Explain the last observed local→remote→A chain and identify the exact failed boundary | Reuse the same artifact on retry; never force-push or create duplicate evidence to hide the failure | Engine: isolated store/sync/idempotency; Wiki: expected evidence path; Guidance: delivery explanation; Dashboard: pending/error message |
| Q14 | “내가 어제 어디까지 했지? 오늘 뭐부터 하지?” | A's last session, ended summary/blockers/next, linked evidence, new B events after last sync, current goal | Reconstruct confirmed completion and today's first decision; separate an unclosed session from completed work | If A's end is missing, ask A whether to recover/end it and label local-only work unknown; do not invent elapsed focus | Engine: session history; Wiki: output evidence; Guidance: resume briefing; Dashboard: yesterday/today card |
| Q15 | “이거 전에 물어본 거랑 같은 요청 아니야?” | Open and historical tickets, artifact/scope/completion need, close/reopen history, evidence revision | Identify same request vs true follow-up and preserve both original questions | Show the likely canonical ticket. Because protocol v1 has no generic requester-comment or ticket-relation field, do not invent one; separate only when the new need is material | Engine: ticket search/history; Wiki: artifact identity; Guidance: duplicate judgment; Dashboard: proposed related-request display |

## Central flow mapping

The core flow joins Q02 → Q03 → Q04 → Q05. The anonymized JSON fixture at [examples/scenarios/everyday-flow.json](../../examples/scenarios/everyday-flow.json) records the exact example data.

| Step | User need | Evidence read | AI behavior | User-visible result |
| --- | --- | --- | --- | --- |
| 1. B status | “B 지금 어디까지 했어?” | B's unclosed session, old last event, base commit, sync result | Report last confirmed scope and unknown end; under prior authorization create a narrow information ticket for validation, blockers, next, and local-only work | “마지막 공유는 parser 시작입니다. 16시간 전 기록이라 현재 작업 중이라고 단정할 수 없습니다. 필요한 정보 요청을 보냈고 B의 읽음은 아직 확인되지 않았습니다.” |
| 2. My next work | “그럼 나는 뭐 하면 돼?” | Current goal, A/B scope, ticket dependency | Separate independent UI work from parser-dependent integration | “Empty-state copy is available now; parser changes wait for B's answer.” |
| 3. Overlap | “정말 안 겹쳐?” | File paths plus empty-result interface note | Detect semantic dependency despite different files; reduce scope | “문구와 표시 상태만 시작하고 parser return shape는 가정하지 않습니다.” |
| 4. Start | “그 범위로 시작해줘.” | Agreed scope, A active-session check, base revision | Attempt `session.started`; report local/remote result without claiming B read it | “시작 기록은 원격에 공유됐지만 B가 읽었다는 기록은 없습니다.” |
| 5. Continue after B answer | “이제 SRT도 이어받아도 돼?” | B's information response and evidence, A current session | Finish or pause A's current scope, requester verifies the ticket, then start a separate SRT scope | “CSV pass and SRT multiline failure are confirmed; close the current scope before takeover.” |

## Minimum branch examples

### Normal

The information ticket is pushed, B later synchronizes and acknowledges it, B or B's AI publishes an allowed wiki evidence note and responds, A synchronizes, verifies the response, and resolves. Each transition remains distinct.

### Information missing

If B cannot identify which run or artifact A means, B sets `needs_information` with a precise question. A clarifies in ordinary conversation; because protocol v1 has no generic requester clarification event, agent guidance must use an available supported operation or propose a follow-up rather than fabricate an event. This gap is documented for later coordinator review.

### Peer session unclosed

An old `session.started` with no `session.ended` remains active in derived state but is described as “종료 미확인.” The AI reports the last update time and does not claim B is currently present or working. It can request handoff facts within the pre-authorized information scope.

### Push failure

A's event file and local commit may exist while `sync.status` is `error`. The AI says B cannot see the start/request yet. A retry uses the same immutable file; only an observed remote push changes delivery. Even after push, B read or acknowledgment remains separate.

### Human feedback

A explicitly asks for B's opinion. The AI creates a `feedback` ticket with options and impact. B's AI may prepare context, but only an event with B's participant and `actor.kind: "human"` can be a valid feedback response. A resolves only after checking the response; applying the feedback is a separate work result.

## Role handoff summary

- Engine consumes event and delivery expectations: immutable event identity, valid ticket/session transitions, sync and conflict visibility, and separation of commit/push/acknowledgment/resolution.
- Wiki consumes evidence expectations: source-linked notes, decision status, rationale provenance, and no silent promotion or overwrite. Exact note format remains wiki-owned.
- Agent guidance consumes conversational procedure: infer the short follow-up from context, act automatically only within prior authorization, ask for new judgment or sharing expansion, and report observed outcomes.
- Dashboard consumes user-visible distinctions: last confirmed B state, unknown end, safe next work, overlap uncertainty, ticket answer vs resolution, and sync pending/error vs peer acknowledgment.

## S2 boundaries and follow-ups

- Protocol v1 has no requester comment/clarification event on a nonterminal ticket and no first-class conditional approval state. These are documented gaps, not locally added fields or states.
- Protocol v1 session scope is set at `session.started`; changing scope during a session has no shared event. Guidance should re-check overlap before expansion and must not pretend it recorded an unsupported scope change.
- Automatic worktree allocation and live peer presence are explicitly outside the initial implementation.
- The JSON fixture is scenario data for cross-role discussion. It is not the engine's runtime input schema and does not modify `examples/shared/snapshot.json`.
