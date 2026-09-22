# Git collaboration engine

E1 stores collaboration records in an isolated checkout at
`<git-common-dir>/duobrain/state`. Product files, the current branch, the index, and
uncommitted product changes are not touched. The shared checkout pushes only to
`origin/duobrain/state`; participant identity and sync status stay local under
`<git-common-dir>/duobrain/`.

## CLI

Node.js 22+ and Git are required. Initialize both independent clones with the same
ordered pair of participant IDs and a different local identity in each clone:

```sh
node bin/duobrain.js init --participants alice,bob --participant alice
node bin/duobrain.js start --title "Connect the API" --scope src/api --goal "First flow"
node bin/duobrain.js pause --session <uuid> --body "Waiting for review"
node bin/duobrain.js resume --session <uuid> --body "Review received"
node bin/duobrain.js status
node bin/duobrain.js end --session <uuid> --summary "Connected and verified"
node bin/duobrain.js sync
```

Use `duobrain --help` or `duobrain <command> --help` for the complete option list.
Commands print JSON. Mutating commands first create an immutable record and commit it
locally in the isolated checkout, then attempt sync. A transport or push failure is
reported as `pending` with exit code 2; rerun `sync`. Validation or history conflicts
are errors with exit code 1. No force push is used.

### AI-led onboarding and local preferences

`onboarding-inspect` works before initialization and returns repository clues, remote shared-state
availability, any saved local checkpoint, and the next resumable stage. It never classifies a project as
new or existing from commit count alone. The user's existing AI reads permitted plans, meeting notes,
work lists, code and branch state, then saves its evidence-backed classification with
`onboarding-save --file <json>`. Existing projects require at least one `{source, fact}` evidence item.

The stages are `assess-project`, `initialize`, `profile`, `review-context`, `review-plan`,
`review-role`, `sync`, and `ready`. Saved checkpoint fields merge on update, so the AI can continue after
an interruption without duplicating initialized state or completed review. A second clone with a remote
`duobrain/state` receives `suggestedMode: "join-existing"`; joining still requires that person's role
review. See [`guides/duobrain-onboarding.md`](../../guides/duobrain-onboarding.md) for the complete AI
procedure.
If initialization created the isolated store but stopped before writing local identity, inspection returns
`identityAvailable: false` and stage `initialize`; rerunning `init` with the established participant pair
restores the local identity and resumes the flow.

`account-detect` queries the authenticated GitHub CLI session through `gh api user`. An unavailable
command or session returns `status: "unavailable"`; the engine does not inspect Git author identity or
infer an account from the remote owner.

`profile-set [--nickname <text>] [--github-login <login>]` appends a shared immutable profile revision for
the local participant. The participant ID remains the ownership key, so nickname changes keep history
attached to the same participant. A missing first nickname defaults to the GitHub login when supplied or
the participant ID; a later nickname-only update retains the existing login. Snapshot `profiles` exposes
current values and revision history.

`dashboard-locale-set --locale <system|language-tag>` writes a local preference under the Git common
directory. It is exposed as `snapshot.localPreferences.dashboardLocale`, defaults to `system`, and is
never committed to `duobrain/state`. Dashboard language is not an onboarding gate.

`goal`, `branch`, `baseCommit`, `blockers`, and `next` are recorded only when supplied;
unknown snapshot goals remain `null`. Open sessions have `endedAt` and `elapsedMs` set
to `null`; paused time is not presented as completed elapsed work. Only the session
owner may pause, resume, or end, and the valid transitions are active → paused → active
and active/paused → ended.

Use a JSON file when changing scope so omitted optional fields and explicit `null` stay
distinct:

```json
{
  "scope": ["src/export/empty-state"],
  "reason": "Move to the independently testable boundary",
  "goal": null,
  "baseCommit": "52ca11e"
}
```

```sh
duobrain scope-update --session <uuid> --file ./scope-change.json --actor ai
```

`updateSessionScope({repository, sessionId, scope, reason, ...})` is owner-only on an
active or paused session. Omitted `goal`, `branch`, or `baseCommit` retain their prior
projection; explicit null clears one. The event preserves the original start and every
prior value in history, does not resume a paused session, and does not modify product
code or its Git branch. Overlap assessment uses the latest valid projected scope.

### Two-clone information flow

After both clones run `init`, Alice creates a request and saves its returned
`event.entityId` as the ticket ID:

```sh
# Alice's clone
duobrain ticket-create --kind information --title "Export handoff" \
  --body "Share the passing tests, failures, and next action" --actor ai

# Bob's clone
duobrain sync
duobrain ticket-ack --ticket <ticket-uuid> --actor ai
duobrain note-add --file ./handoff-note.md
duobrain ticket-respond --ticket <ticket-uuid> --actor ai \
  --body "CSV passes; the SRT multiline fixture still fails." \
  --evidence wiki/<note-uuid>.md

# Alice's clone
duobrain sync
duobrain ticket-resolve --ticket <ticket-uuid> \
  --body "The response and evidence cover the handoff facts."
```

`handoff-note.md` may use the structured format documented in
`docs/wiki/knowledge-records.md`. `note-add` validates it through the wiki parser and
stores it immutably in the shared checkout. A legacy Markdown note needs an explicit
`--id <uuid>`. Retry an identical note ID and content safely; different content at the
same path is rejected.

Ticket commands are `ticket-create`, `ticket-ack`, `ticket-needs-information`,
`ticket-respond`, `ticket-resolve`, `ticket-close`, and `ticket-reopen`. Information
responses require one or more existing `wiki/<uuid>.md` paths. Feedback responses
require the assignee's `--actor human`. Only the requester can resolve, close, or
reopen. Reopening clears the projected evidence and requires a new response before
another resolution. `closed` remains distinct from `resolved`.

A requester can append missing context without changing completion state:

```sh
duobrain ticket-clarify --ticket <uuid> --body "Use run 42 and evaluation revision 7"
```

`clarifyTicket({repository, ticketId, body, actorKind})` is requester-only on a
nonterminal ticket. `ticket.clarified` stays in history while preserving the exact
current status; it is not acknowledgment, response, resolution, or a related ticket.
The assignee must still use `ticket-respond` under the existing evidence rules.

### Shared plan and goals

Prepare the complete replacement projection as JSON, then explicitly record it:

```sh
duobrain plan-set --file ./plan.json --actor human
```

`setPlan({repository, plan, actorKind})` creates the only plan root or appends a
`plan.updated` revision. Each JSON document must include all three nullable goals,
exactly one assignment for each configured participant, complete scopes and next
values, `body`, and optional `status`/`evidence`. Status defaults to `proposed`.
Snapshot `plan` contains the current projection and full history; top-level `goals`
mirrors it. With no plan or an ambiguous/invalid history, `plan` is `null` and goals
remain unknown.

An `agreed` plan requires existing valid structured wiki evidence whose cooperative
metadata attributes a human record to each participant. This validates provenance
shape only: the engine does not inspect prose to infer consent, certify identity, or
claim that the evidence semantically covers the exact revised plan. The person or AI
recording the revision must verify that coverage beforehand. Independent roots and
same-predecessor updates remain visible conflicts and block later plan mutation.

### Overlap assessment and product worktrees

```sh
duobrain overlap --scope src/export/empty-state.tsx --base-commit HEAD
duobrain worktree-prepare --directory ../empty-state-work
```

`overlap` compares the proposed repository-relative paths with the other participant's
recorded, unended session scopes. Its output keeps `pathAssessment` separate from
`semanticAssessment`: exact/ancestor path relations can be reported, but interface or
behavior overlap stays `unknown` until a person or AI inspects explicit goals, tickets,
or wiki evidence. A `no_overlap` path result does not mean the work is semantically
independent. Pattern scopes and conflicted or unsynchronized histories produce an
`unknown` path result.

The assessment also returns the resolved proposed base commit, current product branch
and HEAD, dirty state, upstream and unpushed-commit count when knowable, shared sync
status and `lastSyncedAt`, and each peer session's last event time. An unended peer
session is reported as `endKnown: false`; it does not claim live presence. Missing
upstream/base data, pending sync, uncommitted work, and semantic uncertainty appear in
`unknowns`. Peer live presence and unpushed product changes are always unknown from
shared records alone. Shared-state sync never inspects or merges unseen peer product
changes.

`worktree-prepare` explicitly creates a new product worktree and a new branch from the
selected commit. The default branch is a unique `codex/<directory>-<suffix>` name. The
destination must not exist and must be outside both the source product checkout and
the common Git directory. Existing local or known `origin` branches are rejected, so
the command never force-moves a branch already used elsewhere. It preserves the source
checkout's HEAD, branch, dirty files, and index; uncommitted files are not copied. It
does not merge, rebase, cherry-pick, start a session, or synchronize shared records.

The equivalent APIs are `assessOverlap({repository, scope, baseCommit})` and
`prepareProductWorktree({repository, directory, branch, baseCommit})`.

## Read API

The dashboard can pass its product repository path explicitly:

```js
import { getSnapshot, getWikiNote } from './src/engine/index.js';

const snapshot = await getSnapshot({ repository: '/path/to/product/clone' });

const note = await getWikiNote({
  repository: '/path/to/product/clone',
  path: 'wiki/00000000-0000-4000-8000-000000000001.md',
});
```

`repository` defaults to the current directory and may be any path inside the product
Git worktree. The result matches the shared snapshot interface: `sample` is `false`,
project goals are `null`, profiles include immutable nickname revisions, local preferences expose the
dashboard language, ticket records include their event `history`, and concurrent
entity histories are listed in `conflicts`. Session records include nullable `summary`,
`branch`, and `baseCommit`; each session history entry includes its original `data` and
`previous` link for handoff reconstruction. `getEngineStatus({repository})` additionally
returns the local participant, isolated-store path, and shared-store commit.

The E2 write API exports `createTicket`, `acknowledgeTicket`,
`requestTicketInformation`, `respondToTicket`, `resolveTicket`, `closeTicket`,
`reopenTicket`, and `addWikiNote`. Each accepts `{repository, ...}` and defaults
`repository` to the current directory. Event operations return `{event, commit, sync}`;
`addWikiNote` returns its shared `path`, commit when newly created, validation result,
and sync result.

`getWikiNote({repository, path})` is the read-only evidence-detail contract for the
dashboard. It accepts only `wiki/<uuid>.md` and returns
`{path, markdown, validation}`. `validation` is the result of `validateWikiNote`; an
invalid note remains inspectable as evidence with its validation errors. Missing notes
use error code `WIKI_NOTE_NOT_FOUND`, while malformed input paths use
`INVALID_WIKI_PATH`.

The reader opens only a single-link regular file inside the isolated shared checkout. It
rejects a symlinked wiki directory or note, multi-link files, a resolved path outside
the store, special files, and notes larger than 1 MiB. It never reads product-worktree
paths and does not convert or execute Markdown/HTML. Consumers must display `markdown`
as escaped text or pass it to
their own explicitly safe renderer; the API does not return trusted HTML.

## Shared wiki discovery and method comparison

The engine adapters `listWikiNotes`, `searchSharedWiki`, and `traceSharedWiki` connect
the pure wiki discovery functions to the isolated shared store. Listing enumerates
only `wiki/<uuid>.md` entries and reads each through `getWikiNote`, so discovery keeps
the same containment, regular-file, link, and size protections. It never searches the
product checkout or private directories.

The corresponding CLI commands are:

```text
duobrain wiki-list
duobrain wiki-search --query "multiline export" [--filters filters.json]
duobrain wiki-trace --roots wiki/<uuid>.md,wiki/<uuid>.md
duobrain method-compare --file comparison.json [--request-missing]
```

`filters.json` is passed to the pure search contract and may select `participant`,
`status`, `recordType`, or `includeSuperseded`. A comparison manifest has explicit
`left`, `right`, and `artifacts` fields:

```json
{
  "left": {
    "label": "My export method",
    "participant": "alice",
    "workRef": "session:alice-export",
    "noteRefs": ["wiki/00000000-0000-4000-8000-000000000001.md"]
  },
  "right": {
    "label": "Bob export method",
    "participant": "bob",
    "workRef": "session:bob-export",
    "noteRefs": ["wiki/00000000-0000-4000-8000-000000000002.md"]
  },
  "artifacts": [
    {"ref": "prompt:alice", "kind": "prompt", "version": "1", "text": "Captured prompt"}
  ]
}
```

`compareSharedMethods` loads the actual shared notes, but artifact `ref` values remain
identifiers: only manifest-provided `text` is compared, and no ref is treated as a
filesystem path. The left participant must be the local identity and the right
participant must be the other configured identity. Missing evidence returns a dry
`ticketCandidate` with `missingRequest.action: "proposed"`. Only
`--request-missing` (or `requestMissing: true`) writes an information ticket, and an
identical nonterminal request is reused instead of duplicated.

## Daily wiki refinement execution

`runDailyWikiRefinement({repository, schedule, ifDue, now})` connects the pure W4
planner to synchronized shared state. The matching CLI command is suitable for an
external scheduler; duobrain does not install an operating-system job:

```text
duobrain wiki-refine --file daily-refinement.json --if-due
```

The schedule file contains an IANA timezone, a 24-hour local time (default `09:00`),
and the W4 policy:

```json
{
  "timezone": "Asia/Seoul",
  "time": "09:00",
  "policy": {
    "id": "default-daily-index",
    "version": "1",
    "staleAfterDays": 30,
    "recencyWindowDays": 90,
    "lowImportanceThreshold": 0.3,
    "highImportanceThreshold": 0.7,
    "unknownImportanceExposure": "normal",
    "importanceSignals": []
  }
}
```

An external scheduler may invoke `--if-due` repeatedly. Only
`config.participants[0]` is the scheduler owner; the other participant returns
`reason: "not-scheduler-owner"`. Before the configured wall-clock time the result is
`not-due`, and a validated summary already shared for that local date returns
`already-successful`. Delayed invocations after the configured time still run. State
is reconstructed from the synchronized store on every invocation, so process restarts
do not lose the once-per-date guard.

Without `--if-due`, the command is a manual refresh. It skips only when the stable
source revision, planner-normalized policy fingerprint, and timezone all match the
newest real, validated refinement summary. A policy-only or timezone-only change can
therefore create a new plan even when the evidence data is unchanged. Policy
validation always runs before this decision, so a malformed policy cannot hide behind
an earlier successful summary. The revision is a SHA-256 hash of non-refinement wiki
note contents and immutable ticket events; refinement summaries are excluded,
preventing a run from scheduling itself. The planner's `priorRun` is populated only
from an existing validated summary, never from a local completion marker or
caller-supplied path.

Execution holds a dedicated daily-run lock and the common shared-store lock. It syncs
before planning, commits the immutable candidate, and reports `completed` only after a
successful push. A rejected push returns `pending`; the next invocation retries the
same local summary during its initial sync, then recognizes it as the successful run.
For deterministic testing or a one-off replay, `--now <ISO timestamp>` overrides the
clock used for due-date evaluation; normal scheduled use omits it.

### External cron setup

The safe cron pattern is to invoke `--if-due` repeatedly and let the engine apply the
IANA timezone, configured wall-clock time, owner, run lock, and once-per-date checks.
First resolve the absolute Node executable and create a private log directory:

```sh
command -v node
mkdir -p /absolute/path/to/private-duobrain-logs
chmod 700 /absolute/path/to/private-duobrain-logs
```

Then add the following line with `crontab -e`, replacing every placeholder with an
absolute path. This example checks every 15 minutes, so a sleeping machine runs at the
next cron interval after it wakes:

```cron
*/15 * * * * /absolute/path/to/node /absolute/path/to/duobrain/bin/duobrain.js wiki-refine --file /absolute/path/to/daily-refinement.json --if-due --repository /absolute/path/to/product >>/absolute/path/to/private-duobrain-logs/wiki-refine.log 2>&1
```

Do not add `--now` to the scheduled command. A pending push exits with status 2 and a
later invocation retries it. Repeated or overlapping invocations are safe because the
runner uses its dedicated refinement lock and derives successful completion from the
synchronized summary. Duobrain only provides this recipe; it does not modify the
user's crontab or install an OS job.

## Synchronization guarantees

Sync fetches and merges append-only histories, so concurrent events with different
UUID paths survive. A modified/deleted shared path, incompatible participant config,
remote history rewrite, or same-path content conflict is rejected. If another writer
wins a push race, the local commit remains intact and a later `sync` fetches, merges,
and retries it. Local mutations and sync operations acquire a common-store lock so
concurrent CLI processes do not stage each other's event files in one commit. The
remote state branch used by tests is always a temporary bare Git repository, never the
public development remote.
