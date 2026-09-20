# Implementation status

Verified on 2026-09-20. This is the executable implementation status; the original roadmap describes the broader intended product.

## First integration

G1's automated transport and dashboard flow passes using two independent local clones and a temporary bare Git remote: information request, assignee acknowledgment, immutable structured wiki evidence, response, requester resolution, and dashboard HTTP snapshot/history. Answered requests stay in the inbox; resolution and cancellation remain distinct. This is not yet a two-machine user acceptance test or proof that an AI automatically performs the workflow.

The integrated engine, wiki and dashboard suite now has 64 passing tests. Wiki supplements preserve source lineage and prompt/harness references across retries. The dashboard can read validated evidence bodies. Agent guidance documents the actual CLI, repository onboarding and everyday request procedures.

E3 adds pause/resume, full session handoff context, path-overlap assessment and explicit isolated product-worktree preparation. W3 adds pure source search, lineage tracing and captured-method comparison; it proposes missing-information tickets but does not create them. These operations do not establish live peer presence, semantic independence or causal performance differences.

The executable G2 scenario verifies the two-local-clone worktree and handoff connection. E4 adds shared plans/goals, scope changes and requester clarification. D3 adds recorded interval and blocker analysis. W4 produces daily refinement candidates without scheduling or persisting them; the engine adapter is next. Scope changes currently require a D4 time-analysis compatibility update, and plan status/assignment presentation is also assigned to D4.

## Next role milestones

| Role | Next delivery | Boundary |
| --- | --- | --- |
| Engine E5 | Live wiki search/comparison and scheduled daily refinement | Explicit permitted inputs, delivery-aware retries, one scheduled runner and stable source fingerprints. |
| Wiki W4 follow-up | Refinement lineage and prior-run validation | Missing/cyclic evidence stays visible; a missing output is not a successful duplicate. |
| Guidance A5 | E4 planning and clarification workflows | Actual command examples and preserved existing user authorization. |
| Dashboard D4 | Plan status/assignments and scope-aware time analysis | Respect explicit cleared values and avoid attributing old work to the final scope. |
| Scenarios S5/G3 | Executable plan, clarification and refinement flow | Temporary local clones; distinguish pure refinement planning from scheduled execution. |

The coordinator owns shared contracts and integration. Session snapshot additions approved for E3 are nullable `summary`, `branch`, `baseCommit`, plus `data` and `previous` on history entries. Existing fields remain compatible. A paused session's final elapsed time remains unknown until ended; active intervals and wall-clock elapsed must be distinguished if interval totals are added.

## Remaining product gaps

- Shared goals and scope writes now exist; complete dashboard integration and automated peer-change briefings remain pending.
- Comparison is available as a pure API; live adapters and scheduled daily source-preserving refinement are in progress.
- CLI instructions are available, but automatic AI integration and a fresh-environment/two-machine acceptance run are not yet verified.
- Release packaging and an explicit license decision remain separate release work. No package publication or deployment has been performed by this implementation track.

The independent website and competition demo are separate projects; their deployment is not a completion check for the open-source runtime.
