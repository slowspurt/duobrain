# G3 plan, clarification, and refinement connection

Status: executable S5/G3 scenario check against main `34b3d24`.

Run:

```sh
./examples/scenarios/verify-plan-refinement-flow.mjs
```

The example creates and removes its own temporary bare Git remote and two independent local clones. Every shared-state success is checked from an actual engine result and an explicit peer sync; the example never uses the repository's configured public remote.

| User conversation | Connected behavior | Answer boundary |
| --- | --- | --- |
| “기획서 바뀌었어. 나는 뭐부터 해?” | A records a complete `setPlan` revision. B still sees the prior goals until explicit sync, then reads the revised top-level goals and B assignment `next`. | A successful push is delivery, not proof that B has fetched or read the revision. A proposed plan is not joint agreement. |
| “내 범위 바꿨어.” | B records `session.scope_updated`; the projected scope changes while the original scope and reason remain in session history. | Product code and branch are untouched. Integrated D4 accepts the scope-change event and preserves the recorded timing. |
| “어떤 작업 정보가 더 필요해?” | B requests the plan revision, source commit, and harness. A's `ticket.clarified` supplies them while status remains `needs_information` locally and after B's explicit sync. | Clarification is not acknowledgment, response, resolution, or a new ticket. A later explicit response is a separate transition. |
| “오래된 기록은 이제 어떻게 보여?” | W4 raises old evidence linked to an unresolved answered ticket to `action-required`, protects an `agreed` record, includes every original path, and returns an unpersisted proposed summary candidate. | Recency never deletes or rewrites source notes and does not override agreement. Importance comes only from caller evidence. |

The same run now calls integrated D4 aggregation: the scope-updated session has known recorded timing. D4's dedicated tests verify division at scope-change timestamps. This example still calls W4 only as a pure planner: that call leaves the shared-store HEAD and every source Markdown byte unchanged, and its candidate is not present in Git afterward.

Actual scheduled execution, persistence of an accepted refinement candidate, and automatic conversation continuation are follow-up E5 connection work. This check is not a two-machine acceptance test and does not claim automatic AI execution.
