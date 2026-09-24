---
name: duobrain-commit
description: Commit staged work in a duobrain project and record how and why it was done. Use whenever you are about to run git commit in a repository that uses duobrain.
---

# duobrain commit

Every commit leaves a work record for the partner's AI: the method, the requests, the decisions and their reasons, failed attempts, and verification. A cheap subagent writes the record from the conversation, so you only have to stage the work.

Set `DUO` to the duobrain checkout and run every command from the product repository.

## Steps

1. Stage the change as usual. Stop if nothing is staged.
2. Bundle the summarizer instructions, the conversation since the last recorded commit, and the staged diff (capped at 40KB) into one file:

   ```sh
   node "$DUO/bin/duobrain.js" capture-extract --repository . --bundle --out "$TMP/bundle.txt" > "$TMP/capture.json"
   ```

3. Start a subagent on the cheapest model (Claude Code: `model: haiku`). Tell it to read `$TMP/bundle.txt` once, follow the instructions at its top, and write only the JSON object to `$TMP/summary.json`, using no other tools. Pass the path; do not paste the bundle into the prompt.
4. Add the `capture` object from `$TMP/capture.json` to `$TMP/summary.json` as a `"capture"` field. This advances the capture marker, so the next commit starts where this one ended.
5. Record the note and commit with the returned message:

   ```sh
   node "$DUO/bin/duobrain.js" commit-note --repository . --file "$TMP/summary.json" --message-out "$TMP/message.txt"
   git commit -F "$TMP/message.txt"
   ```

   The message has a short subject, a `Why:` line and a `Duobrain-Record: wiki/<id>.md` trailer. The detailed record lives on the `duobrain/state` branch, not in product history.

## Rules

- Check the summary before step 5. Fix or delete anything the diff does not support.
- If `commit-note` returns `sync.status: pending`, commit anyway and run `sync` later. Never block the commit on delivery.
- Without a subagent, write `summary.json` yourself in the same format, keeping it short.
- If `capture-extract` finds no transcript (`TRANSCRIPT_NOT_FOUND`), write the summary from what you know and omit `capture`.
- Use `--dry-run` on `commit-note` to preview the note without storing it.
