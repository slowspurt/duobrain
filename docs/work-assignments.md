# First parallel implementation

This is a public development contract. Private planning, competition materials, and the independent website are outside this repository's implementation commits.

## Baseline

Use [protocol v1](protocol.md), Node.js 22+, Git, ESM, and Node's built-in test runner. The initial runtime should not require a paid API, database server, or third-party runtime package. `package.json` is private only to prevent accidental registry publication; the project is intended for open-source distribution. Licensing and release packaging remain separate release work.

Each worker uses its existing isolated worktree and creates its role branch. The scenario worker must first obtain its own worktree. Apply the coordinator's G0 commit before editing. Existing uncommitted changes in the original checkout are not yours to stage or revert.

## Ownership and first milestones

| Role | Owned paths | First milestone |
| --- | --- | --- |
| Engine | `src/engine/`, `bin/`, `test/engine/`, `docs/engine/` | E1: isolated shared store, sync, session start/end, two-clone tests preserving code changes. E2 later adds ticket lifecycle and recovery. |
| Wiki | `src/wiki/`, `test/wiki/`, `docs/wiki/`, `examples/wiki/` | W1: source-linked note format, parser/validation, personal/proposed/agreed/superseded status, examples and validation. W2 later applies ticket supplements. |
| Agent guidance | `guides/`, `docs/agent-guidance/` | A1: planning intake and start/brief/handoff/end instructions, tied to existing scenario research. Unavailable commands must be identified as proposed. |
| Dashboard | `src/dashboard/`, `test/dashboard/`, `docs/dashboard/` | D1: local read-only UI using the shared snapshot fixture, goals, sessions, blockers and active tickets. D2 later adds full history and live engine wiring. |
| Everyday scenarios | `docs/scenarios/`, `examples/scenarios/` | S1: 10–15 everyday user questions and natural follow-up conversations. S2 later maps context, evidence, actions and gaps to the other roles. |
| Coordinator | root config, README, shared protocol, shared fixtures, integration | G0: baseline. G1: integrate role commits and verify one complete real two-clone flow. |

Workers propose common-file changes rather than independently altering root configuration or protocol. No worker modifies `duobrain-web/`, `.private/`, submission material, or another role's files. No nested delegation or new tasks without a coordinator request.

## Shared snapshot interface

The engine will expose a JSON-serializable snapshot for the dashboard. D1 builds against `examples/shared/snapshot.json` without waiting for E1. The fixture is explicitly sample data, never real project status. Fields may be extended additively after coordination.

- `schemaVersion`: 1; `sample`: boolean.
- `participants`: two participant IDs.
- `goals`: `{project, mediumTerm, currentPhase}`, each string or null. Null means unknown, not inferred success.
- `sessions`: `{id, participant, title, scope: string[], goal, status, startedAt, endedAt, elapsedMs, blockers: string[], next, history: []}`. Open sessions have `elapsedMs: null` for final elapsed time.
- `tickets`: `{id, kind, title, body, requester, assignee, status, goal, evidence: string[], history: []}`. Lifecycle meaning follows protocol v1. Terminal statuses: resolved or closed; these outcomes must remain distinct.
- `sync`: `{status: "unknown" | "synced" | "pending" | "error", lastSyncedAt: string | null, message: string | null}`.
- `conflicts`: visible conflict entries; no silent last-writer-wins closure.

The dashboard exports `startDashboard({getSnapshot, port})` from `src/dashboard/index.js`, where `getSnapshot` may be asynchronous; it returns a listening HTTP server and binds only to `127.0.0.1`. Its module is usable independently of the engine. The engine exposes its read function from `src/engine/index.js`; final argument and CLI details are reported by E1 before integration. Wiki parsers/validators are pure functions exported from `src/wiki/index.js`, without Git mutations. Common API changes are coordinator decisions.

## Commit and handoff

Role branches: `duobrain/engine`, `duobrain/wiki`, `duobrain/guides`, `duobrain/dashboard`, `duobrain/scenarios`. Commit each validated milestone with its relevant tests and docs; stage only owned paths. Push only the role branch. The coordinator alone integrates selected commits and pushes main. Never force push or rewrite another role's history.

Report only: milestone and SHA, verification, blockers or required decision, next suggested action. Complete the first milestone and report; do not automatically absorb later milestones. If blocked, continue independent work and report the exact missing contract or input. No repeated empty progress messages.

Existing research at `docs/scenario-research/` in the original checkout is read-only input. Everyday scenarios describe what a person asks and what useful help looks like; agent guidance translates those scenarios into execution procedures. Reuse the research instead of duplicating it. Web adaptations can consume the public protocol and examples without requiring or claiming live Git integration.
