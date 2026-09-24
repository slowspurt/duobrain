# Sessions, plans and handoffs

Reference for [the duobrain AI guide](../duobrain-ai.md). Its core rules still apply.

## First run and the second participant

- Read the stage with `onboarding-inspect` and follow [the onboarding guide](../duobrain-onboarding.md). A commit count or README alone does not prove a project is in progress.
- If there is no plan, ask for the current state, recent meeting notes or existing results. Do not fill gaps with invention. Until they arrive, leave only the minimum start questions: what to build or decide, the state so far, how the two people split the work, and what to check next.
- The second participant does not rebuild the plan. Read `plan` and `sessions` from `status --brief` and brief from them.
- `plan: null` means the goals are unknown. Check `conflicts` first; if a plan conflict exists, show the cause and candidate records instead of writing a new plan over it. Otherwise record the kickoff material as a source note and create a `proposed` plan with both assignments. `agreed` needs structured human decision evidence from both people.

## Starting work

1. Run `sync`, `status --brief`, then `overlap --scope <paths> --base-commit <ref> --brief`.
2. `verdict: overlap` means name the overlapping session and scope, then agree on a split or a sequence first. `no_overlap` is about paths only; check the recorded goals for interface or contract impact. `unknown` means sync, conflicts or pattern scopes blocked the comparison, and the `unknowns` field says which.
3. Record the start: `start --title <t> --scope <paths> [--goal] [--branch] [--base-commit] --actor ai`. Report `sync.status`; `pending` means your partner cannot see it yet.
4. When changing an active or paused session's scope, goal, branch or base, use `scope-update --session <id> --file <json>`, then run `overlap` again. Omitted fields keep their value and `null` clears one. It changes no product code and does not resume a paused session.

## Separate worktree

`worktree-prepare --directory <new-path> --branch <new-branch> --base-commit <ref>` creates an isolated product worktree. It keeps the original checkout, index and dirty files, copies no uncommitted changes, and never merges, rebases, syncs or starts a session. Check the returned `directory`, `branch` and `baseCommit`, then `start --branch <returned> --base-commit <returned>`. It refuses existing directories and branches.

## Handoff card

When pausing or ending, fill only what was observed or provided:

- base commit, branch or worktree
- finished results, with the checks that passed and failed
- attempts that failed and what was observed
- what is shared versus local only
- open tickets, unknowns and blockers
- the partner's exact next step and how to know it is done

End with `end --session <id> --summary <t> [--blockers <a,b>] [--next <t>] --actor ai`, then `sync`. Omit `--blockers` when there are none. Do not estimate end time or focus, and never mark an unfinished session as ended.
