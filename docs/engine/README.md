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
node bin/duobrain.js status
node bin/duobrain.js end --session <uuid> --summary "Connected and verified"
node bin/duobrain.js sync
```

Use `duobrain --help` or `duobrain <command> --help` for the complete option list.
Commands print JSON. `start` and `end` first create an immutable event and commit it
locally in the isolated checkout, then attempt sync. A transport or push failure is
reported as `pending` with exit code 2; rerun `sync`. Validation or history conflicts
are errors with exit code 1. No force push is used.

`goal`, `branch`, `baseCommit`, `blockers`, and `next` are recorded only when supplied;
unknown snapshot goals remain `null`. Open sessions have `endedAt` and `elapsedMs` set
to `null`; elapsed time is derived only after a recorded end event.

## Read API

The dashboard can pass its product repository path explicitly:

```js
import { getSnapshot } from './src/engine/index.js';

const snapshot = await getSnapshot({ repository: '/path/to/product/clone' });
```

`repository` defaults to the current directory and may be any path inside the product
Git worktree. The result matches the shared snapshot interface: `sample` is `false`,
project goals are `null` in E1, tickets are empty until E2, and concurrent entity
histories are listed in `conflicts`. `getEngineStatus({repository})` additionally
returns the local participant, isolated-store path, and shared-store commit.

## Synchronization guarantees

Sync fetches and merges append-only histories, so concurrent events with different
UUID paths survive. A modified/deleted shared path, incompatible participant config,
remote history rewrite, or same-path content conflict is rejected. If another writer
wins a push race, the local commit remains intact and a later `sync` fetches, merges,
and retries it. The remote state branch used by tests is always a temporary bare Git
repository, never the public development remote.
