# G4 method request and refinement connection

Status: executable S6 final connection check against main `604b7d0`.

Run:

```sh
./examples/scenarios/verify-method-refinement-flow.mjs
```

The example creates and removes one temporary bare Git remote and two independent local clones. It performs real shared-store commits, pushes, and explicit peer syncs; it never contacts the repository's configured public remote.

## Missing method evidence

The first comparison sees a missing B note and returns a dry ticket proposal without writing. Repeating with `requestMissing: true` creates and pushes one information ticket. A second identical request reuses that nonterminal ticket instead of creating another. B explicitly syncs, adds the requested structured wiki note, and answers with that note as evidence. After A explicitly syncs, comparison completes with captured text while still refusing a causal conclusion. The ticket remains `answered`, not requester-verified `resolved`.

## On-demand refinement

The same run calls `runWikiRefinement({config, now})`, the engine path behind CLI `wiki-refine`:

1. the `09:05` call commits and pushes one summary;
2. B cannot see that summary before explicit sync and sees it afterward;
3. a later same-date call with no new input is skipped as `no-new-input`;
4. a next-date call creates a second summary linked through `previousSummary`, and B sees both after another sync.

The policy's importance signal cites an actually supplied `wiki:<uuid>` record. The planner therefore reports locally `verified` evidence; an arbitrary external policy ref would remain an unapplied `caller-claim`. Included note graphs are complete, and the next summary supersedes only the prior summary, never its source notes.

It verifies explicit invocations with deterministic timestamps, not background execution or automatic AI continuation.
