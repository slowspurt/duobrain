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

`goal`, `branch`, `baseCommit`, `blockers`, and `next` are recorded only when supplied;
unknown snapshot goals remain `null`. Open sessions have `endedAt` and `elapsedMs` set
to `null`; paused time is not presented as completed elapsed work. Only the session
owner may pause, resume, or end, and the valid transitions are active → paused → active
and active/paused → ended.

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
project goals are `null`, ticket records include their event `history`, and concurrent
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

## Synchronization guarantees

Sync fetches and merges append-only histories, so concurrent events with different
UUID paths survive. A modified/deleted shared path, incompatible participant config,
remote history rewrite, or same-path content conflict is rejected. If another writer
wins a push race, the local commit remains intact and a later `sync` fetches, merges,
and retries it. Local mutations and sync operations acquire a common-store lock so
concurrent CLI processes do not stage each other's event files in one commit. The
remote state branch used by tests is always a temporary bare Git repository, never the
public development remote.
