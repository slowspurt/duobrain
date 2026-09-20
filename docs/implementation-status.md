# Implementation status

Verified on 2026-09-20. This is the executable implementation status; the original roadmap describes the broader intended product.

## First integration

G1's automated transport and dashboard flow passes using two independent local clones and a temporary bare Git remote: information request, assignee acknowledgment, immutable structured wiki evidence, response, requester resolution, and dashboard HTTP snapshot/history. Answered requests stay in the inbox; resolution and cancellation remain distinct. This is not yet a two-machine user acceptance test or proof that an AI automatically performs the workflow.

The integrated engine, wiki and dashboard suite has 35 passing tests. Wiki supplements preserve source lineage and prompt/harness references across retries. The read-only engine note API is available; dashboard evidence-body navigation is the next integration. Agent guidance documents the actual CLI and everyday request procedures.

## Next role milestones

| Role | Next delivery | Boundary |
| --- | --- | --- |
| Engine E3 | Pause/resume, complete session read context, overlap assessment and explicit isolated product worktree preparation | Preserve dirty files and index, no automatic code merge, stale state and unpushed work remain unknown. Propose shared-event changes before implementation. |
| Wiki W3 | Pure source search, method comparison and evidence tracing | Compare captured versions only; missing prompt/harness text creates a narrow information-request candidate, not invented differences. |
| Guidance A3 | One concrete repository onboarding recipe and complete worked CLI flow | Instructions for an existing AI; no claim of automatic hook installation or background AI execution. |
| Dashboard | Evidence-body navigation through the validated engine API | Read-only local server, plaintext evidence and explicit missing/invalid states. |
| Scenarios S3 | Everyday concurrent-work and method-comparison acceptance conversations | Explain what users ask and what evidence is needed; identify actual gaps rather than fabricate commands. |

The coordinator owns shared contracts and integration. Session snapshot additions approved for E3 are nullable `summary`, `branch`, `baseCommit`, plus `data` and `previous` on history entries. Existing fields remain compatible. A paused session's final elapsed time remains unknown until ended; active intervals and wall-clock elapsed must be distinguished if interval totals are added.

## Remaining product gaps

- Shared project/medium-term/current-phase goals and evolving work plans still need write operations; current live snapshot goals are unknown.
- Product worktree preparation, scope updates, peer-change tracking and near-simultaneous starts are not yet complete.
- Prompt/harness comparison, time/bottleneck analysis and daily source-preserving refinement remain roadmap work.
- CLI instructions are available, but automatic AI integration and a fresh-environment/two-machine acceptance run are not yet verified.
- Release packaging and an explicit license decision remain separate release work. No package publication or deployment has been performed by this implementation track.

The independent website and competition demo are separate projects; their deployment is not a completion check for the open-source runtime.
