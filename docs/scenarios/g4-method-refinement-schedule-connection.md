# G4 method request and scheduled refinement connection

Status: executable S6 final connection check against main `604b7d0`.

Run:

```sh
./examples/scenarios/verify-method-refinement-schedule-flow.mjs
```

The example creates and removes one temporary bare Git remote and two independent local clones. It performs real shared-store commits, pushes, and explicit peer syncs; it never contacts the repository's configured public remote.

## Missing method evidence

The first comparison sees a missing B note and returns a dry ticket proposal without writing. Repeating with `requestMissing: true` creates and pushes one information ticket. A second identical request reuses that nonterminal ticket instead of creating another. B explicitly syncs, adds the requested structured wiki note, and answers with that note as evidence. After A explicitly syncs, comparison completes with captured text while still refusing a causal conclusion. The ticket remains `answered`, not requester-verified `resolved`.

## Daily `ifDue` execution

The same run calls `runDailyWikiRefinement({ifDue: true, now})`, the deterministic engine path behind CLI `--if-due`:

1. participant-b is skipped as `not-scheduler-owner`;
2. participant-a is skipped at `08:59` as `not-due`;
3. the `09:05` call commits and pushes one summary;
4. B cannot see that summary before explicit sync and sees it afterward;
5. a later same-date call is skipped as `already-successful`;
6. the next-date due call creates a second summary linked through `previousSummary`, and B sees both after another sync.

The policy's importance signal cites an actually supplied `wiki:<uuid>` record. The planner therefore reports locally `verified` evidence; an arbitrary external policy ref would remain an unapplied `caller-claim`. Included note graphs are complete, and the next summary supersedes only the prior daily summary, never its source notes.

No operating-system scheduler job is installed by this example or by duobrain. It verifies explicit `ifDue` invocations with deterministic timestamps, not background execution or automatic AI continuation. Manual policy-only refresh is intentionally not claimed here and can be added after the pending engine patch is integrated.
