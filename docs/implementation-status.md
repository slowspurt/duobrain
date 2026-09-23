# Implementation status

Verified on 2026-09-23. The local alpha implementation is integrated; release and actual two-person acceptance remain open. Start with [Getting started](../GETTING_STARTED.md). The original roadmap describes the intended product; this document describes executable behavior.

## Integrated capabilities

| Area | Available behavior |
| --- | --- |
| Shared engine | Exactly two participants; isolated `duobrain/state` Git branch; immutable records; pending delivery and retry; visible causal conflicts. |
| Planning and sessions | Proposed/agreed goals and both assignments, plan revision history, start/pause/resume/end, scope updates, overlap assessment and explicit product-worktree preparation. |
| Requests | Information and human feedback tickets; acknowledgment, clarification, missing information, evidence-backed answers, requester resolution, cancellation and reopening. |
| Wiki | Structured source notes and summaries; knowledge status and lineage; live shared-store search; captured prompt/harness comparison; optional missing-information ticket creation and reuse. |
| Daily refinement | Evidence-based importance and recency, preserved sources and decisions, immutable summary indexes, one designated scheduled participant, timezone and once-per-date guards, delivery-aware retries. Manual refresh detects policy/timezone changes too. |
| Dashboard | Live local records, goals/assignments and conflicts, scope-aware recorded intervals, declared blockers, ticket inbox/history/detail, evidence bodies, wiki search/lineage and daily indexes. |
| AI guidance | Existing-repository intake, missing planning inputs, start briefings, information supplementation, direct human feedback, comparison, concurrent work and handoff procedures for the user's existing AI. |
| AI-led onboarding | One startup instruction; pre-init inspection; evidence-backed new/existing/join classification by the user's AI; local resumable checkpoints; authenticated GitHub CLI lookup with explicit fallback; immutable participant profiles and nickname changes. |
| Local preferences | Dashboard locale is stored as `system` by default and stays local to each clone. Language controls, translated UI text and nickname rendering remain dashboard follow-up work. |

The engine, wiki and dashboard suite passes **87 tests** on the integrated runtime. This includes ten onboarding tests for evidence-neutral inspection, resumable stages, interrupted-init recovery, shared nickname history, local dashboard locale, second-participant joining, authenticated-account detection, direct CLI routing, review invalidation after plan changes, and inspection before the first Git commit. Tests use temporary repositories; they do not write collaboration records to this project's public remote.

## Connected acceptance evidence

- **G1:** two independent local clones and a temporary bare remote exchange an information ticket, acknowledgment, immutable evidence, answer and requester resolution; the live dashboard exposes history and evidence.
- **G2:** the later participant explicitly syncs, assesses overlap, prepares an isolated product worktree while preserving dirty source files, and shares session handoff context. Captured-method comparison distinguishes evidence gaps from supported differences.
- **G3:** shared plan revisions, requester clarification and source-preserving refinement planning connect. Scope changes are attributed to the recorded intervals rather than applied retroactively.
- **G4:** a missing-method request is proposed, created, reused, answered and compared again. Scheduled refinement skips the non-owner and early invocation, pushes a due summary, avoids a same-day duplicate and links the next day's summary. The peer sees records after sync. A successful comparison does not itself resolve the ticket.
- **Clean checkout:** a new local clone containing only tracked files runs CLI/dashboard help and G4 without installed dependencies, private files or the separate web demo. This verifies checkout completeness on the current machine, not a new operating system or two-machine setup.

Run the suite and executable scenarios using the commands in [Getting started](../GETTING_STARTED.md#검증-실행).

## Runtime boundaries

AI execution uses the user's existing AI tool and the supplied guidance. There is no installed background AI service or automatic wake-up. Daily execution uses an external scheduler invoking `wiki-refine --if-due`; [the cron recipe](engine/README.md#external-cron-setup) is provided, but no OS job was installed during development.

The dashboard is read-only and binds to `127.0.0.1`. It reads locally synchronized state; old session starts do not prove live presence. Recorded time is not measured focus or productivity. Artifact references alone cannot establish prompt contents, performance causes or semantic independence of work scopes. Human attribution is cooperative metadata, not authentication.

## Remaining release and user acceptance work

1. MIT is selected and v0.1.0 release metadata, notes, and draft-release automation are prepared. Publication and hosted CI results must be verified separately. `package.json` remains private; distribution uses GitHub source archives and Git checkout. See [release procedure](releases/README.md).
2. On two actual machines, each person connects their product clone and existing AI using the [AI onboarding entry](../guides/duobrain-onboarding.md). Verify a missing-plan intake, a shared plan and start briefing, an information request answered on the peer's next AI invocation, human feedback, profile display and dashboard history after sync.
3. On the designated participant's machine, configure the desired external daily schedule and confirm a real invocation and log. Development validated the runner using controlled timestamps; it did not install a scheduler on either person's behalf.

The separate website and competition demo have independent deployment and acceptance. Their successful demonstration does not substitute for the runtime checks above.
