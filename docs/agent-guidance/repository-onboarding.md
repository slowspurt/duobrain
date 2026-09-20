# Existing repository onboarding recipe

This recipe adds duobrain records to an existing two-person Git project. It does not install a hook, start a server, schedule work, or run either person's AI in the background. Each person chooses when to give the companion guidance to their existing AI.

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

## 2. Share the starting plan as an allowed source note

Project, medium-term, and current-phase goals are currently read-only snapshot fields; the CLI has no shared-goals write command. Put the existing plan or approved meeting-note excerpt in a source note instead. First decide that this material is allowed to be shared and remove content outside that boundary. Preserve where the statement came from instead of turning a proposal or personal choice into an agreement.

Create a structured source note using the [knowledge-record format](../wiki/knowledge-records.md), then add it from the product clone. The input Markdown file can live anywhere local; its validated immutable copy is stored as `wiki/<uuid>.md` in the shared store.

```sh
node /Users/alice/tools/duobrain/bin/duobrain.js note-add \
  --repository /Users/alice/work/reading-app \
  --file /Users/alice/work/meeting-notes/reading-app-plan.md

node /Users/bob/tools/duobrain/bin/duobrain.js sync \
  --repository /Users/bob/work/reading-app
```

The note's `status` and sources state what is actually known. Its push result is not proof that Bob read it; Bob's successful `sync` is the first local observation that it arrived.

## 3. Add the guidance to each existing AI manually

Append this short instruction to each person's existing AI guidance file or first task prompt. It is an addition, not a replacement for repository-specific rules:

> For two-person collaboration, read `guides/duobrain-ai.md` from the duobrain checkout and follow its evidence and ticket rules. Preserve the existing project instructions. Follow the user's existing authorization for routine session briefings, synchronization, and information tickets; ask only for missing task facts, new human decisions, or expanded sharing scope. When using the CLI, pass the product repository with `--repository` and report local commit, sync, peer acknowledgment, and resolution as separate facts.

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

Every mutating command records locally and then attempts sync. A `pending` result or exit code 2 means the record has not been shared successfully; run `sync` again from the same product repository. Reuse the same immutable ticket or note on retry; do not force-push or create a duplicate record merely to hide a delivery failure. `status` shows the locally observed sync state, not peer presence or acknowledgment.

## 5. Keep direct human feedback attributable

For approval, prioritization, taste, or review, create `ticket-create --kind feedback` with the decision question, options, impact, constraints, and relevant sources. An AI may prepare that context but must not invent, revise, or attribute its own recommendation as a person's feedback. `--actor human` is valid only when the response body was actually written or explicitly confirmed by the assignee person. That person may enter the command directly, or ask the AI to transcribe the exact confirmed response; the latter records a human's provided content, not an AI's judgment.

```sh
node /Users/bob/tools/duobrain/bin/duobrain.js ticket-respond \
  --repository /Users/bob/work/reading-app --ticket <feedback-ticket-uuid> \
  --body "I approve option A for the stated scope." --actor human
```

The AI should preserve the person's wording and identify any separate AI summary or recommendation as AI-authored. Alice may resolve only after checking that human response. Resolution records that the request was sufficiently answered; it does not claim that every resulting product change is complete. `ticket-close --reason cancelled|duplicate` is not a resolution.

## 6. Start, hand off, and end without inventing blockers

When a user asks the AI to begin an agreed, non-overlapping scope, it can record a session with `start`. Use `--actor ai` when the AI writes the record; do not label it human merely because a user asked the AI to do it. On handoff, separate verified work, failed checks, unshared work, unknowns, and the next completion condition. End the session with `end`; omit `--blockers` when there is no actual blocker because every supplied item is counted as one.

Pause/resume, scope changes, overlap assessment, isolated product-worktree preparation, and shared-goal writes are E3 or later work. Do not invent options or claim those records now exist.
