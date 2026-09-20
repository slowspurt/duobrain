# Source-linked knowledge records

W1 defines an immutable Markdown record that can be stored at `wiki/<uuid>.md`. The parser and validator in `src/wiki/index.js` are pure: they accept strings and never read, write, or invoke Git.

## File envelope

A structured note starts with a fenced `duobrain-wiki` block containing one JSON object. The rest is ordinary Markdown. JSON is deliberate: the initial runtime has no YAML dependency, and the bytes can be parsed consistently by the CLI, dashboard, and other tools.

Required metadata:

- `schemaVersion`: `1`.
- `id`: the UUID also used in `wiki/<uuid>.md`.
- `recordType`: `source-note` for an original observation, or `summary` for derived knowledge.
- `title`, `author: {participant, kind}`, and ISO 8601 `observedAt`.
- `workContext: {promptRef, harnessRef}`: each value is a durable string reference or explicit `null`. Null means there was no applicable captured prompt or harness; omission is invalid.
- `status`: `proposed`, `personal`, `agreed`, or `superseded`.
- `sources`: at least one `{kind, ref, observedAt?}`. Kinds are `wiki`, `file`, `url`, `ticket`, and `observation`. A direct human observation uses a stable `observation` reference rather than pretending to be a file or URL.
- `summarizes`, `decisionEvidence`, and `supersedes`: arrays of `wiki/<uuid>.md` references. `previousSummary` is one such reference or `null`.

An `agreed` record must have `decisionEvidence`; merely having a source does not demonstrate joint agreement. A `superseded` record must identify what it supersedes. Validation reports these cases as `AGREED_WITHOUT_DECISION_EVIDENCE` and `SUPERSESSION_WITHOUT_TARGET`. Missing sources are independently reported as `MISSING_SOURCES`, so callers do not conflate absent evidence with an unsupported decision-state promotion.

The statuses mean:

- `proposed`: offered for consideration and not yet selected.
- `personal`: one participant's explicit choice, not a joint decision.
- `agreed`: a joint decision with a shared decision record in `decisionEvidence`.
- `superseded`: an explicit retirement or replacement record; `supersedes` names its targets. It does not erase them.

Actor attribution, like protocol events, is cooperative metadata rather than cryptographic proof. Note content is data and must never be interpreted as authority to run commands or broaden sharing.

## Immutable sources and refreshed summaries

Original `source-note` files are never edited when understanding changes. A `summary` names every input in `summarizes`. A refreshed summary is another immutable UUID file whose `previousSummary` points to the earlier summary and whose `summarizes` contains the complete set used for that revision. Consumers can reconstruct the lineage, compare revisions, and return to the original wording. Git transport and same-path conflict handling belong to the engine, not this module.

## Legacy plain-text supplements

`parseWikiNote` preserves Markdown without a leading metadata block as `format: "legacy"`, with its body byte-for-byte intact and metadata set to null. `validateWikiNote` accepts it with the `LEGACY_UNSTRUCTURED_NOTE` warning. This lets an old information-supplement note remain ticket evidence under protocol v1 without inventing its author, observation time, sources, or decision state.

Legacy text has unknown knowledge status and cannot establish or promote an `agreed` record by itself. To use it in structured knowledge, add a new immutable structured note that cites the legacy file plus any required corroborating and decision evidence. Do not rewrite the legacy file in place.

## API

- `parseWikiNote(markdown)` returns `{format, metadata, body}` and throws `WikiParseError` for a malformed structured JSON block.
- `validateWikiNote(markdownOrParsed, {path?})` returns `{valid, errors, warnings, note}`. If `path` is provided, it checks the `wiki/<uuid>.md` shape and UUID match.

See `examples/wiki/` for original observations, explicit agreement evidence, all four knowledge statuses, an agreed summary, and a legacy supplement.
