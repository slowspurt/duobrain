# Implementation status

Verified on 2026-09-20. This is the executable implementation status; the original roadmap describes the broader intended product.

## First integration

G1's automated transport and dashboard flow passes using two independent local clones and a temporary bare Git remote: information request, assignee acknowledgment, immutable structured wiki evidence, response, requester resolution, and dashboard HTTP snapshot/history. Answered requests stay in the inbox; resolution and cancellation remain distinct. This is not yet a two-machine user acceptance test or proof that an AI automatically performs the workflow.

The integrated engine, wiki and dashboard suite now has 47 passing tests. Wiki supplements preserve source lineage and prompt/harness references across retries. The dashboard can read validated evidence bodies. Agent guidance documents the actual CLI, repository onboarding and everyday request procedures.

E3 adds pause/resume, full session handoff context, path-overlap assessment and explicit isolated product-worktree preparation. W3 adds pure source search, lineage tracing and captured-method comparison; it proposes missing-information tickets but does not create them. These operations do not establish live peer presence, semantic independence or causal performance differences.

## Next role milestones

| Role | Next delivery | Boundary |
| --- | --- | --- |
| Engine E4 | Shared goals/plans, scope changes and requester clarification | Implement the approved [extension contract](protocol-extensions.md); preserve history and expose conflicts. |
| Wiki W4 | Pure daily refinement plan with separate importance and recency | Preserve originals, agreements and unresolved-ticket evidence; engine scheduling remains a later integration. |
| Guidance A4 | E3 workflow recipes and W3 API guidance | Describe the actual interface; do not invent comparison CLI commands. |
| Dashboard D3 | Recent recorded intervals and explicit blockers | Separate wall-clock, recorded activity, pauses and unknowns; prevent overlapping-session double counts. |
| Scenarios S4/G2 | Executable concurrent-work and method-comparison acceptance flow | Use temporary local clones; do not claim actual two-machine or autonomous-AI acceptance. |

The coordinator owns shared contracts and integration. Session snapshot additions approved for E3 are nullable `summary`, `branch`, `baseCommit`, plus `data` and `previous` on history entries. Existing fields remain compatible. A paused session's final elapsed time remains unknown until ended; active intervals and wall-clock elapsed must be distinguished if interval totals are added.

## Remaining product gaps

- Shared project/medium-term/current-phase goals and evolving work plans still need write operations; current live snapshot goals are unknown.
- Scope updates and peer-change tracking remain incomplete; explicit worktree preparation and path assessment are implemented, with cross-module G2 verification assigned.
- Comparison is available as a pure API; a complete live CLI/dashboard adapter remains integration work. Time/bottleneck analysis and daily source-preserving refinement are in progress.
- CLI instructions are available, but automatic AI integration and a fresh-environment/two-machine acceptance run are not yet verified.
- Release packaging and an explicit license decision remain separate release work. No package publication or deployment has been performed by this implementation track.

The independent website and competition demo are separate projects; their deployment is not a completion check for the open-source runtime.
