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
- `renderWikiNote(metadata, body)` renders a structured candidate and performs no I/O.
- `prepareTicketSupplement({ticket, context, notes})` validates and prepares an immutable source note, refreshed summary, and protocol-shaped ticket response candidate. It never writes files or invokes Git.
- `searchWikiNotes({notes, query, filters})` searches only the supplied note text and metadata.
- `traceWikiLineage({notes, roots})` returns reachable note nodes, typed reference edges, and explicit missing/cycle issues.
- `compareKnowledgeMethods({notes, left, right, artifacts})` compares two recorded work contexts and may return an uncreated information-ticket candidate.

See `examples/wiki/` for original observations, explicit agreement evidence, all four knowledge statuses, an agreed summary, and a legacy supplement.

## Ticket supplement planning

`prepareTicketSupplement` accepts a projected ticket, a caller-supplied context, and the complete set of existing notes relevant to the supplement. `examples/scenarios/everyday-flow.json` is useful for constructing these values in tests and adapters, but it is scenario data rather than a runtime input schema.

The ticket object has `id`, `kind`, `title`, `body`, `requester`, and `assignee`. Context has:

- `responseBody`: the proposed ticket response.
- `sourceNote`: caller-generated `id`, title, body, author, observation time, work context, status, and source descriptors. Its author must be the assignee. A non-ticket source is mandatory because the question itself is not evidence.
- `summary`: caller-generated `id`, title, body, status, the existing notes it `summarizes`, optional `previousSummary`, decision evidence, and supersession targets.

The caller supplies IDs and timestamps; the function does not use clocks or randomness. A successful result has `outcome: "prepared"`, `ready: true`, two Markdown candidates, and a `ticketResponse`. The response is only a candidate: its evidence note must be persisted and shared before an engine records `ticket.responded`.

Every candidate carries a deterministic `ticketSupplement` fingerprint. Reprocessing the same logical input with both records present returns `outcome: "duplicate"` and reuses the original evidence path. A partial retry reuses an existing source candidate and prepares the missing summary. Different content at the same UUID path is `PATH_COLLISION`.

The planner traverses only the candidate-reachable note graph. Missing wiki sources, other missing relations, self-reference, and longer cycles are reported separately. It never edits input notes, and `preservedStatuses` reports the statuses (or `unknown` for legacy text) of existing summarized records. A refreshed proposed summary therefore does not rewrite or promote a prior personal or agreed record.

An `agreed` candidate still requires `decisionEvidence`; W2 also requires each cited agreement note to be structured and human-authored. A feedback ticket authored by AI returns `HUMAN_FEEDBACK_REQUIRED`, no response candidate, and `satisfiesTicket: false`. This matches protocol v1: AI can prepare context, but it cannot impersonate the requested human judgment.

## Method search and comparison

W3 accepts in-memory data supplied by its caller. It does not read arbitrary files, contact the web, create tickets, or mutate Git. A comparison side is `{label, participant, workRef?, noteRefs}`. Every note entry is `{path, markdown}`. Captured materials use `{ref, kind, version, text?}`, where kind is `prompt`, `harness`, or `source`; omitting `text` means the artifact content was not captured.

Search results keep `proposed`, `personal`, `agreed`, and `superseded` distinct. They also expose `supersededBy` for explicit `supersedes` targets and prior summary revisions, so an older personal record or summary is not silently mixed into current evidence. Lineage follows wiki sources, summary inputs, prior summaries, decision evidence, and supersession edges while reporting missing references and cycles.

Method comparison reports authors, observation times, active and superseded note paths, decision scope, prompt/harness refs, versions, and lineage. Decision scope is explicit: `individual` for `personal`, `joint` for `agreed`, and never promoted merely because another record is newer. Multiple active prompt or harness refs are a conflict, not an arbitrary choice.

A ref proves only identity. Version is known only when the matching artifact provides it. Text differences are available only when both sides explicitly provide captured `text`; the result is a bounded line-change summary rather than a semantic or causal claim. Even with captured differences, `causalConclusion.supported` remains false because prompt or harness differences alone do not prove a performance cause.

When participant B's note, current reference choice, version, or captured text is missing, the result contains a narrow `information` `ticketCandidate` naming only those fields. It is a proposal with no UUID and is not written or resolved by the wiki module. After a later explicit sync supplies new evidence, the caller can invoke the same pure comparison again; W3 does not wait in the background or resume an AI automatically. See `examples/wiki/method-comparison.json` for a reference-only example that intentionally produces version/text gaps.
