# Wiki

Reference for [the duobrain AI guide](../duobrain-ai.md). Note format and statuses are described in [knowledge records](../../docs/wiki/knowledge-records.md).

## Finding records

`find` looks through wiki notes, tickets and session handoffs along two channels at once, and you judge both:

- **search** (`results`): words are matched and scored, candidates are judged by rule, and at most a few cards come back.
- **browse** (`browse.items`): every other record as one short line (title, status, date, short abstract), newest first, at most 100. Scan it for records that answer the question in different words; the search cannot see meaning, you can.

No bodies are included in either.

- Give it more than the question. `--query` is the user's own words and weighs most. Add `--intent` (one line on what you are looking for), `--expand` (synonyms and the other language's terms), `--entities` (file paths, `ticket:<id>`, `wiki/<id>.md`) and, when useful, `--exclude`, `--kinds` or `--limit`. `--file <json>` takes the same fields.
- Read `match` for the search channel: `strong` (an entity matched, or the note's title, keywords or abstract cover the query), `weak` (only the body or the expansions matched, so check before relying on it) or `none` (no word matched). `none` alone does not mean the record lacks it: check the browse lines first.
- Pick from both channels, then open at most two: `wiki-get --path wiki/<id>.md` or `ticket-get --ticket <id>`. Each card's `open` field has the command. `recall.candidates` and `more` say how much was left out.
- Cards carry `links`: `evidenceFor` (tickets that cite the note), `evidence` (notes a ticket cites), `supersededBy` and `members` (sources folded into a summary). A superseded note is ranked low and marked `superseded` in browse; prefer what replaced it. `--no-browse` drops the browse channel when the store is too large to scan.
- `wiki-list` lists every note as a card; `--full` returns full text. `wiki-trace --roots wiki/<a>.md,wiki/<b>.md` shows sources and lineage. `wiki-search` remains for exact filters.
- Summaries never replace their sources. Cite the source note when the claim matters.

## Writing findable notes

Every new note gets an `abstract` and `keywords` in its metadata; `note-add` names them in `searchMetadata.missing` when they are absent.

- `abstract`: one or two sentences, conclusion first, at most 300 characters.
- `keywords`: at most 12, each at most 60 characters. Include the terms both people would use in Korean and English, entities such as file paths and ticket ids, and one or two questions this note answers, written the way someone would ask them.
- Cite related notes and tickets in `sources`, so `find` and `wiki-trace` can follow the links.

## Method comparison

"Does my partner's harness differ from mine?" is answered with `method-compare --file <manifest.json> --actor ai`. It compares the explicit left and right note refs and the captured artifacts only. The manifest format is in [the engine guide](../../docs/engine/README.md#shared-wiki-discovery-and-method-comparison).

- An artifact ref is an identifier, not a file path. Only the version or text that the manifest supplies is compared.
- Different refs show only that the captured references differ. If the version or text is missing, the content difference and any performance cause are unknown. Never conclude that a newer-looking version performed better.
- `ticketCandidate` with `missingRequest.action: "proposed"` has not been recorded yet. Add `--request-missing` to create a narrow information ticket or reuse an open one. After the partner answers and you `sync`, rerun the same comparison.

## Manual refinement

`wiki-refine --file <config.json>` runs only when someone asks for it, and either participant may run it. The config holds an IANA `timezone` and a `policy`. It writes a new summary index and preserves every source note and ticket event. Running it again with the same date, timezone, sources and policy returns `no-new-input`. `pending` means the push has not happened yet; rerun it or run `sync`.
