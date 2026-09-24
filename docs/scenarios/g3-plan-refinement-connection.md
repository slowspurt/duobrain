# G3 plan, clarification, and refinement connection

Status: executable S5/G3 scenario check updated against main `604b7d0`.

Run:

```sh
./examples/scenarios/verify-plan-refinement-flow.mjs
```

The example creates and removes its own temporary bare Git remote and two independent local clones. Every shared-state success is checked from an actual engine result and an explicit peer sync; the example never uses the repository's configured public remote.

| User conversation | Connected behavior | Answer boundary |
| --- | --- | --- |
| “기획서 바뀌었어. 나는 뭐부터 해?” | A records a complete `setPlan` revision. B still sees the prior goals until explicit sync, then reads the revised top-level goals and B assignment `next`. | A successful push is delivery, not proof that B has fetched or read the revision. A proposed plan is not joint agreement. |
| “내 범위 바꿨어.” | B records `session.scope_updated`; the projected scope changes while the original scope and reason remain in session history. D4 reports known active time separately before and after the boundary. | Product code and branch are untouched. The totals describe recorded event intervals, not actual effort or productivity. |
| “어떤 작업 정보가 더 필요해?” | B requests the plan revision, source commit, and harness. A's `ticket.clarified` supplies them while status remains `needs_information` locally and after B's explicit sync. | Clarification is not acknowledgment, response, resolution, or a new ticket. A later explicit response is a separate transition. |
| “오래된 기록은 이제 어떻게 보여?” | W4 raises old evidence linked to an unresolved answered ticket to `action-required`, protects an `agreed` record, includes every original path, and returns an unpersisted proposed summary candidate. | Recency never deletes or rewrites source notes and does not override agreement. Importance comes only from caller evidence. |

The same run calls D4 aggregation and requires `timeStatus: "known"` plus nonzero attribution to both the original and updated scopes. W4 remains a pure planner in this example. Its importance signal cites the actual shared ticket, so the evidence is locally `verified` rather than an unsupported external `caller-claim`. The call leaves the shared-store HEAD and every source Markdown byte unchanged, and its candidate is not present in Git afterward.

Persisted refinement execution is exercised separately by the G4 final connection example. Neither example claims automatic conversation continuation, a two-machine acceptance test, or automatic AI execution.
