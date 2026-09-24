# Wiki

Reference for [the duobrain AI guide](../duobrain-ai.md). Note format and statuses are described in [knowledge records](../../docs/wiki/knowledge-records.md).

## Search and lineage

- `wiki-list` lists all notes. `wiki-search --query <text> [--filters <json>]` finds notes. `wiki-trace --roots wiki/<a>.md,wiki/<b>.md` shows sources and lineage.
- Summaries never replace their sources. Cite the source note when the claim matters.

## Method comparison

"Does my partner's harness differ from mine?" is answered with `method-compare --file <manifest.json> --actor ai`. It compares the explicit left and right note refs and the captured artifacts only. The manifest format is in [the engine guide](../../docs/engine/README.md#shared-wiki-discovery-and-method-comparison).

- An artifact ref is an identifier, not a file path. Only the version or text that the manifest supplies is compared.
- Different refs show only that the captured references differ. If the version or text is missing, the content difference and any performance cause are unknown. Never conclude that a newer-looking version performed better.
- `ticketCandidate` with `missingRequest.action: "proposed"` has not been recorded yet. Add `--request-missing` to create a narrow information ticket or reuse an open one. After the partner answers and you `sync`, rerun the same comparison.

## Manual refinement

`wiki-refine --file <config.json>` runs only when someone asks for it, and either participant may run it. The config holds an IANA `timezone` and a `policy`. It writes a new summary index and preserves every source note and ticket event. Running it again with the same date, timezone, sources and policy returns `no-new-input`. `pending` means the push has not happened yet; rerun it or run `sync`.
