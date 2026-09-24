# Existing repository onboarding recipe

This recipe adds duobrain records to an existing two-person Git project. It does not install a hook, start a server, schedule work, or run either person's AI in the background. Each person chooses when to give the companion guidance to their existing AI.

For the resumable AI-led entry, start with
[`guides/duobrain-onboarding.md`](../../guides/duobrain-onboarding.md). The user's existing
AI inspects permitted project evidence and proposes whether this is a new project, an existing project,
or a second-participant join. Git history is a clue, not a decision by itself. This recipe remains the
detailed command and evidence reference after that classification.

## 1. Keep the product checkout and duobrain checkout separate

For example, Alice can keep the product at `/Users/alice/work/reading-app` and a checkout of this duobrain repository at `/Users/alice/tools/duobrain`. Bob uses his own clone of the same product remote and his own duobrain checkout. The product clones need the same `origin`; duobrain records use the product repository's isolated `duobrain/state` checkout and do not change product files, the product branch, index, or uncommitted changes.

Run the CLI by its absolute path and pass the **product** repository explicitly. Do not confuse the duobrain checkout (where `bin/duobrain.js` lives) with the current product checkout:

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js init \
  --repository /Users/alice/work/reading-app \
  --participants alice,bob --participant alice

node /Users/bob/tools/duobrain/bin/duobrain.js init \
  --repository /Users/bob/work/reading-app \
  --participants alice,bob --participant bob
```

The participant pair must have the same order in both clones; each `--participant` is local to that clone. Inspect the JSON result and run `status` with the same `--repository` path before assuming either side is shared.

## 2. Share and record the starting plan

First decide that the current plan or meeting-note excerpt is allowed to be shared and remove content outside that boundary. Preserve where each statement came from instead of turning a proposal or personal choice into an agreement. If no plan exists, request current situation and meeting notes; do not invent goals or assignments. Add permitted evidence as a source note before proposing the shared plan.

Create a structured source note using the [knowledge-record format](../wiki/knowledge-records.md), then add it from the product clone. The input Markdown file can live anywhere local; its validated immutable copy is stored as `wiki/<uuid>.md` in the shared store.

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js note-add \
  --repository /Users/alice/work/reading-app \
  --file /Users/alice/work/meeting-notes/reading-app-plan.md

node /Users/bob/tools/duobrain/bin/duobrain.js sync \
  --repository /Users/bob/work/reading-app
```

The note's `status` and sources state what is actually known. Its push result is not proof that Bob read it; Bob's successful `sync` is the first local observation that it arrived.

Prepare one complete plan JSON document. It must contain all three goals and exactly one assignment for each configured participant.

```json
{
  "goals": {
    "project": "A reading-app first flow",
    "mediumTerm": "Connect book registration and reading records",
    "currentPhase": "Connect the book API and input screen"
  },
  "assignments": [
    {"participant": "alice", "scope": ["src/ui/book-form"], "next": "Build the input state"},
    {"participant": "bob", "scope": ["src/api/books"], "next": "Share response evidence"}
  ],
  "status": "proposed",
  "evidence": ["wiki/<plan-note-uuid>.md"],
  "body": "Drafted from the shared kickoff note."
}
```

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js plan-set \
  --repository /Users/alice/work/reading-app --file /Users/alice/work/plans/kickoff-plan.json \
  --actor ai
node /Users/bob/tools/duobrain/bin/duobrain.js sync \
  --repository /Users/bob/work/reading-app
node /Users/bob/tools/duobrain/bin/duobrain.js status \
  --repository /Users/bob/work/reading-app
```

Bob's briefing reads `status` output's `snapshot.plan`, `snapshot.goals`, and `snapshot.plan.assignments` rather than rebuilding the plan. A null plan can also mean conflict: inspect `snapshot.conflicts` before proposing a first plan. After both people have checked the scope and goals, write a complete replacement JSON with `status: "agreed"` and the valid structured decision-evidence notes for **both** people, then run `plan-set` again. The engine validates the human-attributed evidence shape, not whether its prose actually means both people consented to this exact revision. Verify that semantic coverage before recording it; a passing command is not an authentication or consent proof.

## 3. Add the guidance to each existing AI

`init` already wrote a duobrain block into the product's `AGENTS.md` and an `@AGENTS.md` import into `CLAUDE.md`; commit both once. Tools that read `AGENTS.md` need nothing else. Only for a tool that reads neither file, append this instruction to its guidance file or first task prompt:

> For two-person collaboration, read `guides/duobrain-ai.md` from the duobrain checkout and follow its core rules, lookup limit and answer formats. Open `guides/reference/` only when a task needs it. Preserve the existing project instructions. Follow the user's existing authorization for routine session briefings, synchronization, and information tickets; ask only for missing task facts, new human decisions, or expanded sharing scope. When using the CLI, pass the product repository with `--repository` and report local commit, sync, peer acknowledgment, and resolution as separate facts.

The AI should then read the plan note, perform an authorized routine briefing or synchronization when it is needed for that work, and give the second participant a brief that distinguishes shared facts, open tickets, its safe scope, and unknowns. An old unclosed session is not proof that the other person is present. This is a manual instruction for the existing AI, not an installed hook or background execution service.

## 4. Work one complete information request

This uses an allowed factual request. Alice's existing AI may create it without another confirmation only when the requested facts and sharing scope were pre-authorized. The JSON from `ticket-create` contains `event.entityId`; use it as `<ticket-uuid>` below.

```sh
# Alice's product clone
node /Users/alice/tools/duobrain/bin/duobrain.js ticket-create \
  --repository /Users/alice/work/reading-app \
  --kind information --title "Book API handoff" \
  --body "Share the response fields, verified failures, and next action." --actor ai

# Bob's product clone
node /Users/bob/tools/duobrain/bin/duobrain.js sync \
  --repository /Users/bob/work/reading-app
node /Users/bob/tools/duobrain/bin/duobrain.js ticket-ack \
  --repository /Users/bob/work/reading-app --ticket <ticket-uuid> --actor ai
node /Users/bob/tools/duobrain/bin/duobrain.js note-add \
  --repository /Users/bob/work/reading-app --file /Users/bob/work/notes/book-api-handoff.md
node /Users/bob/tools/duobrain/bin/duobrain.js ticket-respond \
  --repository /Users/bob/work/reading-app --ticket <ticket-uuid> --actor ai \
  --body "The listed fields and failures are in the shared handoff note." \
  --evidence wiki/<note-uuid>.md

# Alice checks the delivered evidence before resolving
node /Users/alice/tools/duobrain/bin/duobrain.js sync \
  --repository /Users/alice/work/reading-app
node /Users/alice/tools/duobrain/bin/duobrain.js ticket-resolve \
  --repository /Users/alice/work/reading-app --ticket <ticket-uuid> --actor ai \
  --body "The evidence answers the request's completion conditions."
```

An information response requires an existing `wiki/<uuid>.md` evidence path. If Bob cannot find the permitted evidence, use `ticket-needs-information` with the specific missing material instead of responding from guesswork. If Alice finds the response insufficient after it was resolved, only Alice (the requester) can use `ticket-reopen`; the next resolution needs a new valid response.

If Alice realizes the original request omitted a run revision, artifact, or other context while the ticket is still nonterminal, append it without changing the status:

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js ticket-clarify \
  --repository /Users/alice/work/reading-app --ticket <ticket-uuid> \
  --body "Use evaluation revision 7 and the book API response artifact." --actor ai
```

`ticket-clarify` is requester-only. It preserves `open`, `acknowledged`, `needs_information`, or `answered` as applicable; it is neither an answer nor a resolution and does not create a related ticket. The assignee still needs an evidence-backed `ticket-respond`, and the requester still decides whether to resolve.

Every mutating command records locally and then attempts sync. A `pending` result or exit code 2 means the record has not been shared successfully; run `sync` again from the same product repository. Reuse the same immutable ticket or note on retry; do not force-push or create a duplicate record merely to hide a delivery failure. `status` shows the locally observed sync state, not peer presence or acknowledgment.

## 5. Keep direct human feedback attributable

For approval, prioritization, taste, or review, create `ticket-create --kind feedback` with the decision question, options, impact, constraints, and relevant sources. An AI may prepare that context but must not invent, revise, or attribute its own recommendation as a person's feedback. `--actor human` is valid only when the response body was actually written or explicitly confirmed by the assignee person. That person may enter the command directly, or ask the AI to transcribe the exact confirmed response; the latter records a human's provided content, not an AI's judgment.

```sh
node /Users/bob/tools/duobrain/bin/duobrain.js ticket-respond \
  --repository /Users/bob/work/reading-app --ticket <feedback-ticket-uuid> \
  --body "I approve option A for the stated scope." --actor human
```

The AI should preserve the person's wording and identify any separate AI summary or recommendation as AI-authored. Alice may resolve only after checking that human response. Resolution records that the request was sufficiently answered; it does not claim that every resulting product change is complete. `ticket-close --reason cancelled|duplicate` is not a resolution.

## 6. Start, pause, hand off, and end without inventing blockers

When a user asks the AI to begin an agreed, non-overlapping scope, it can record a session with `start`. Use `--actor ai` when the AI writes the record; do not label it human merely because a user asked the AI to do it. On handoff, separate verified work, failed checks, unshared work, unknowns, and the next completion condition. End the session with `end`; omit `--blockers` when there is no actual blocker because every supplied item is counted as one.

The session owner can record an explicit pause and resume; these do not create completed work time.

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js pause \
  --repository /Users/alice/work/reading-app --session <session-uuid> \
  --body "Waiting for the API handoff" --actor ai
node /Users/alice/tools/duobrain/bin/duobrain.js resume \
  --repository /Users/alice/work/reading-app --session <session-uuid> \
  --body "Shared evidence received" --actor ai
```

## 7. Check B's recorded work before parallel work

For “Where did B get to, then what can I do?”, first explicitly synchronize and inspect the returned state. An active B session is an unended shared record, not evidence that B is online. Its last event time and the local `lastSyncedAt` bound what can be said; B's unpushed product changes remain unknown.

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js sync \
  --repository /Users/alice/work/reading-app
node /Users/alice/tools/duobrain/bin/duobrain.js status \
  --repository /Users/alice/work/reading-app
node /Users/alice/tools/duobrain/bin/duobrain.js overlap \
  --repository /Users/alice/work/reading-app \
  --scope src/export/empty-state.tsx --base-commit HEAD
```

`pathAssessment.status: "no_overlap"` means only that the proposed repository-relative paths do not intersect B's recorded paths. It does not prove that an empty-result interface, data shape, or behavior is independent; `semanticAssessment` remains `unknown` until explicit session goals, tickets, or wiki evidence are inspected. Pending sync, conflicts, old or unclosed sessions, and local or peer unpushed changes are likewise limits shown in `unknowns`. If the shared evidence does not settle the interface impact, create a narrow pre-authorized information ticket and limit the scope to independent work while awaiting an answer.

## 8. Prepare an isolated product worktree explicitly

After choosing a confirmed base, create a new, nonexistent path outside the product checkout and its common Git directory. This command creates a new branch but does not merge, rebase, cherry-pick, sync shared state, or start a session.

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js worktree-prepare \
  --repository /Users/alice/work/reading-app \
  --directory ../reading-app-empty-state \
  --branch codex/empty-state --base-commit <confirmed-base>
```

Read `directory`, `branch`, and `baseCommit` from the JSON result. The original checkout's index, branch, and dirty changes stay untouched and are not copied. Only then record the separate work with the returned branch and base:

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js start \
  --repository /Users/alice/work/reading-app-empty-state \
  --title "Empty export state" --scope src/export/empty-state.tsx \
  --goal "Display empty result without changing parser contract" \
  --branch <returned-branch> --base-commit <returned-base> --actor ai
```

For an active or paused session, update the recorded scope with a JSON file, then reassess overlap against the new projection. Omitted optional fields keep their previous values; explicit `null` clears one. This event changes neither product code nor the Git branch and does not resume a paused session.

```json
{
  "scope": ["src/export/empty-state.tsx"],
  "reason": "Limit work to the independently testable UI boundary",
  "goal": "Display an empty result without parser changes",
  "baseCommit": "<confirmed-base>"
}
```

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js scope-update \
  --repository /Users/alice/work/reading-app --session <session-uuid> \
  --file /Users/alice/work/plans/empty-state-scope.json --actor ai
node /Users/alice/tools/duobrain/bin/duobrain.js overlap \
  --repository /Users/alice/work/reading-app \
  --scope src/export/empty-state.tsx --base-commit <confirmed-base>
```

`docs/protocol-extensions.md` now documents implemented E4 behavior; its remaining future sections must still be distinguished from executable commands.

## 9. Compare B's method with captured evidence

Use shared-store discovery before comparison. These commands search only validated `wiki/<uuid>.md` records in the isolated store; they do not search the product checkout or private directories.

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js wiki-list \
  --repository /Users/alice/work/reading-app
node /Users/alice/tools/duobrain/bin/duobrain.js wiki-search \
  --repository /Users/alice/work/reading-app --query "export harness" \
  --filters /Users/alice/work/plans/wiki-filters.json
node /Users/alice/tools/duobrain/bin/duobrain.js wiki-trace \
  --repository /Users/alice/work/reading-app \
  --roots wiki/<alice-method-note>.md,wiki/<bob-method-note>.md
```

Prepare a comparison manifest with `left`, `right`, and `artifacts`, following [the engine manifest example](../engine/README.md#shared-wiki-discovery-and-method-comparison). `left.participant` must be the local participant and `right.participant` the other participant. Artifact `ref` values are identifiers, not file paths: only manifest-supplied captured `version` and `text` are compared.

```sh
# First run is dry: it may return a proposed ticketCandidate.
node /Users/alice/tools/duobrain/bin/duobrain.js method-compare \
  --repository /Users/alice/work/reading-app \
  --file /Users/alice/work/plans/export-method-comparison.json --actor ai

# Use this only when the missing fields and sharing scope are already authorized.
node /Users/alice/tools/duobrain/bin/duobrain.js method-compare \
  --repository /Users/alice/work/reading-app \
  --file /Users/alice/work/plans/export-method-comparison.json \
  --request-missing --actor ai
```

The dry result's `ticketCandidate` and `missingRequest.action: "proposed"` do not yet create a ticket. With `--request-missing`, an identical nonterminal information request is reused instead of duplicated. Bob explicitly syncs, adds permitted evidence notes, and responds. Alice then explicitly syncs and reruns the same dry comparison to continue the original question. Missing or opaque refs/text remain unknown; different refs do not prove behavior or a causal result. This sequence does not make an AI wait in the background or wake automatically.

## 10. Refresh the wiki index on request

When a participant asks for an updated importance and recency index, prepare a config JSON with an IANA `timezone` and the documented refinement policy, then run:

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js wiki-refine \
  --repository /Users/alice/work/reading-app \
  --file /Users/alice/work/plans/refinement.json
```

Either participant may run it; duobrain never runs it on a schedule. Refinement preserves immutable source notes and ticket events, creating a new summary candidate instead of rewriting evidence. It is `completed` only after push succeeds. A `pending` push is not shared completion: a later explicit sync or rerun retries delivery of the same local summary. The same local date, timezone, source revision and normalized policy is skipped as `no-new-input`; a new date or a policy or timezone change can create a new summary. Policy validation still runs before this decision.
