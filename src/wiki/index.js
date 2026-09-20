const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WIKI_PATH_PATTERN = /^wiki\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.md$/i;
const HEADER_PATTERN = /^```duobrain-wiki[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\r?\n|$)/;

const RECORD_TYPES = new Set(["source-note", "summary"]);
const STATUSES = new Set(["proposed", "personal", "agreed", "superseded"]);
const ACTOR_KINDS = new Set(["human", "ai"]);
const SOURCE_KINDS = new Set(["wiki", "file", "url", "ticket", "observation"]);

export class WikiParseError extends Error {
  constructor(message, cause) {
    super(message, cause ? {cause} : undefined);
    this.name = "WikiParseError";
  }
}

/**
 * Parse a wiki Markdown file without reading files or invoking Git.
 * Metadata-bearing notes begin with a `duobrain-wiki` fenced JSON block.
 * Plain Markdown is preserved as a legacy note for compatibility.
 */
export function parseWikiNote(markdown) {
  if (typeof markdown !== "string") {
    throw new TypeError("markdown must be a string");
  }

  const header = markdown.match(HEADER_PATTERN);
  if (!header) {
    if (markdown.startsWith("```duobrain-wiki")) {
      throw new WikiParseError("duobrain-wiki metadata block is not complete");
    }
    return {
      format: "legacy",
      metadata: null,
      body: markdown,
    };
  }

  let metadata;
  try {
    metadata = JSON.parse(header[1]);
  } catch (error) {
    throw new WikiParseError("duobrain-wiki metadata must be valid JSON", error);
  }

  if (!isObject(metadata)) {
    throw new WikiParseError("duobrain-wiki metadata must be a JSON object");
  }

  return {
    format: "structured",
    metadata,
    body: markdown.slice(header[0].length),
  };
}

/**
 * Validate parsed or raw wiki content. The result keeps missing sources and an
 * unsupported agreed promotion as separate error codes for callers and UIs.
 */
export function validateWikiNote(noteOrMarkdown, options = {}) {
  let note;
  try {
    note = typeof noteOrMarkdown === "string"
      ? parseWikiNote(noteOrMarkdown)
      : noteOrMarkdown;
  } catch (error) {
    if (!(error instanceof WikiParseError)) {
      throw error;
    }
    return result(null, [{code: "INVALID_METADATA_JSON", field: "metadata", message: error.message}], []);
  }

  if (!isObject(note) || !["legacy", "structured"].includes(note.format)) {
    throw new TypeError("note must be Markdown or the result of parseWikiNote");
  }

  const pathError = validatePath(options.path, note.format === "structured" ? note.metadata?.id : null);

  if (note.format === "legacy") {
    const errors = pathError ? [pathError] : [];
    if (typeof note.body !== "string" || note.body.trim() === "") {
      errors.push({code: "EMPTY_BODY", field: "body", message: "A wiki note requires Markdown content."});
    }
    return result(note, errors, [{
      code: "LEGACY_UNSTRUCTURED_NOTE",
      field: "metadata",
      message: "Plain Markdown is preserved as evidence with unknown knowledge status; it cannot establish an agreed decision.",
    }]);
  }

  const errors = [];
  const warnings = [];
  const metadata = note.metadata;

  requireEqual(errors, metadata.schemaVersion, 1, "schemaVersion", "UNSUPPORTED_SCHEMA_VERSION");
  requireUuid(errors, metadata.id, "id");
  requireEnum(errors, metadata.recordType, RECORD_TYPES, "recordType");
  requireString(errors, metadata.title, "title");
  requireEnum(errors, metadata.status, STATUSES, "status");
  requireIsoDate(errors, metadata.observedAt, "observedAt");
  validateAuthor(errors, metadata.author);
  validateWorkContext(errors, metadata.workContext);

  if (!Array.isArray(metadata.sources) || metadata.sources.length === 0) {
    errors.push({
      code: "MISSING_SOURCES",
      field: "sources",
      message: "Structured notes require at least one source.",
    });
  } else {
    metadata.sources.forEach((source, index) => validateSource(errors, source, index));
  }

  validateWikiReferences(errors, metadata.summarizes, "summarizes", metadata.recordType === "summary");
  validatePreviousSummary(errors, metadata.previousSummary);
  validateWikiReferences(errors, metadata.decisionEvidence, "decisionEvidence", false);
  validateWikiReferences(errors, metadata.supersedes, "supersedes", false);

  if (metadata.recordType === "source-note" && metadata.previousSummary != null) {
    errors.push({
      code: "SOURCE_NOTE_HAS_PREVIOUS_SUMMARY",
      field: "previousSummary",
      message: "An immutable source note cannot be a summary revision.",
    });
  }

  if (metadata.status === "agreed" && (!Array.isArray(metadata.decisionEvidence) || metadata.decisionEvidence.length === 0)) {
    errors.push({
      code: "AGREED_WITHOUT_DECISION_EVIDENCE",
      field: "decisionEvidence",
      message: "Agreed knowledge requires at least one shared wiki decision reference.",
    });
  }

  if (metadata.status === "superseded" && (!Array.isArray(metadata.supersedes) || metadata.supersedes.length === 0)) {
    errors.push({
      code: "SUPERSESSION_WITHOUT_TARGET",
      field: "supersedes",
      message: "A supersession record must identify the records it replaces or retires.",
    });
  }

  if (pathError) {
    errors.push(pathError);
  }

  if (typeof note.body !== "string" || note.body.trim() === "") {
    errors.push({code: "EMPTY_BODY", field: "body", message: "A wiki note requires Markdown content."});
  }

  return result(note, errors, warnings);
}

/** Render a structured record candidate without writing it anywhere. */
export function renderWikiNote(metadata, body) {
  if (!isObject(metadata)) {
    throw new TypeError("metadata must be an object");
  }
  if (typeof body !== "string") {
    throw new TypeError("body must be a string");
  }
  return `\`\`\`duobrain-wiki\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\n${body.trim()}\n`;
}

/**
 * Prepare immutable note candidates for a ticket supplement. This function is
 * deterministic and performs no file or Git operations. IDs and timestamps are
 * supplied by the caller so a retry can reproduce the same plan.
 */
export function prepareTicketSupplement({ticket, context, notes = []} = {}) {
  if (!isObject(ticket) || !isObject(context) || !Array.isArray(notes)) {
    throw new TypeError("ticket and context must be objects, and notes must be an array");
  }

  const issues = [];
  const existing = loadExistingNotes(notes, issues);
  const sourceSpec = isObject(context.sourceNote) ? context.sourceNote : {};
  const summarySpec = isObject(context.summary) ? context.summary : {};
  const responseBody = context.responseBody;

  validateTicketInput(ticket, sourceSpec, responseBody, issues);
  validateSupplementContent(sourceSpec, summarySpec, responseBody, issues);

  const fingerprint = supplementFingerprint(ticket, sourceSpec, summarySpec, responseBody);
  const sourcePath = wikiPath(sourceSpec.id);
  const requestedSummaryPath = wikiPath(summarySpec.id);
  const matches = [...existing.values()].filter(({parsed}) => (
    parsed.format === "structured"
    && parsed.metadata.ticketSupplement?.fingerprint === fingerprint
    && parsed.metadata.ticketSupplement?.ticketId === ticket.id
  ));
  const existingSource = matches.find(({parsed}) => parsed.metadata.recordType === "source-note");
  const existingSummary = matches.find(({parsed}) => parsed.metadata.recordType === "summary");

  if (existingSource && existingSummary) {
    validateReachableGraph(existing, [existingSource.path, existingSummary.path], issues);
    validateAgreementEvidence(existing, [
      {path: existingSource.path, metadata: existingSource.parsed.metadata},
      {path: existingSummary.path, metadata: existingSummary.parsed.metadata},
    ], issues);
    const ready = issues.length === 0;
    return supplementResult({
      outcome: ready ? "duplicate" : "insufficient",
      ready,
      issues,
      fingerprint,
      duplicateOf: {source: existingSource.path, summary: existingSummary.path},
      response: ready
        ? responseCandidate(ticket, sourceSpec.author, responseBody, existingSource.path)
        : null,
      preservedStatuses: collectPreservedStatuses(existing, [
        ...(existingSummary.parsed.metadata.summarizes ?? []),
        existingSummary.parsed.metadata.previousSummary,
      ]),
      ticket,
    });
  }

  const actualSourcePath = existingSource?.path ?? sourcePath;
  const ticketSource = {kind: "ticket", ref: `ticket:${ticket.id}`};
  const sourceMetadata = existingSource?.parsed.metadata ?? {
    schemaVersion: 1,
    id: sourceSpec.id,
    recordType: "source-note",
    title: sourceSpec.title,
    author: sourceSpec.author,
    observedAt: sourceSpec.observedAt,
    workContext: sourceSpec.workContext,
    status: sourceSpec.status ?? "proposed",
    sources: deduplicateSources([...(Array.isArray(sourceSpec.sources) ? sourceSpec.sources : []), ticketSource]),
    summarizes: [],
    previousSummary: null,
    decisionEvidence: sourceSpec.decisionEvidence ?? [],
    supersedes: sourceSpec.supersedes ?? [],
    ticketSupplement: {ticketId: ticket.id, fingerprint},
  };
  const summaryReferences = uniqueStrings([
    ...(Array.isArray(summarySpec.summarizes) ? summarySpec.summarizes : []),
    actualSourcePath,
  ]);
  const summaryMetadata = {
    schemaVersion: 1,
    id: summarySpec.id,
    recordType: "summary",
    title: summarySpec.title,
    author: sourceSpec.author,
    observedAt: sourceSpec.observedAt,
    workContext: sourceSpec.workContext,
    status: summarySpec.status ?? "proposed",
    sources: summaryReferences.map((ref) => ({kind: "wiki", ref})),
    summarizes: summaryReferences,
    previousSummary: summarySpec.previousSummary ?? null,
    decisionEvidence: summarySpec.decisionEvidence ?? [],
    supersedes: summarySpec.supersedes ?? [],
    ticketSupplement: {ticketId: ticket.id, fingerprint},
  };

  const sourceCandidate = existingSource ? null : makeCandidate(sourcePath, sourceMetadata, sourceSpec.body);
  const summaryCandidate = makeCandidate(requestedSummaryPath, summaryMetadata, summarySpec.body);
  if (sourceCandidate) addCandidateValidation(sourceCandidate, issues);
  addCandidateValidation(summaryCandidate, issues);

  checkPathCollision(existing, sourceCandidate, issues);
  checkPathCollision(existing, summaryCandidate, issues);

  const graph = new Map(existing);
  if (sourceCandidate) graph.set(sourceCandidate.path, graphRecord(sourceCandidate));
  graph.set(summaryCandidate.path, graphRecord(summaryCandidate));
  const roots = [sourceCandidate?.path ?? actualSourcePath, summaryCandidate.path];
  validateReachableGraph(graph, roots, issues);
  validateAgreementEvidence(graph, [sourceCandidate, summaryCandidate], issues);

  const ready = issues.length === 0;
  const candidates = ready ? {
    sourceNote: sourceCandidate,
    summary: summaryCandidate,
  } : null;
  return supplementResult({
    outcome: ready ? "prepared" : "insufficient",
    ready,
    issues,
    fingerprint,
    candidates,
    response: ready ? responseCandidate(ticket, sourceSpec.author, responseBody, actualSourcePath) : null,
    preservedStatuses: collectPreservedStatuses(existing, [...summaryReferences, summaryMetadata.previousSummary]),
    ticket,
  });
}

function supplementResult({
  outcome = "insufficient",
  ready = false,
  issues,
  fingerprint,
  candidates = null,
  duplicateOf = null,
  response = null,
  preservedStatuses,
  ticket,
}) {
  return {
    outcome,
    ready,
    satisfiesTicket: ready && (ticket.kind === "information" || ticket.kind === "feedback"),
    issues: uniqueIssues(issues),
    fingerprint,
    candidates,
    duplicateOf,
    ticketResponse: response,
    preservedStatuses,
  };
}

function validateTicketInput(ticket, sourceSpec, responseBody, issues) {
  if (!UUID_PATTERN.test(ticket.id ?? "")) {
    issues.push(issue("INVALID_TICKET", "ticket.id", "ticket.id must be a UUID."));
  }
  if (!["information", "feedback"].includes(ticket.kind)) {
    issues.push(issue("INVALID_TICKET", "ticket.kind", "ticket.kind must be information or feedback."));
  }
  for (const field of ["title", "body", "requester", "assignee"]) {
    if (typeof ticket[field] !== "string" || ticket[field].trim() === "") {
      issues.push(issue("INVALID_TICKET", `ticket.${field}`, `${field} must be a non-empty string.`));
    }
  }
  if (sourceSpec.author?.participant !== ticket.assignee) {
    issues.push(issue("WRONG_RESPONDER", "context.sourceNote.author.participant", "The supplement author must be the ticket assignee."));
  }
  if (ticket.kind === "feedback" && sourceSpec.author?.kind !== "human") {
    issues.push(issue(
      "HUMAN_FEEDBACK_REQUIRED",
      "context.sourceNote.author.kind",
      "AI-authored material cannot satisfy a feedback ticket; a human response is required.",
    ));
  }
  if (typeof responseBody !== "string" || responseBody.trim() === "") {
    issues.push(issue("INSUFFICIENT_CONTENT", "context.responseBody", "A non-empty ticket response is required."));
  }
}

function validateSupplementContent(sourceSpec, summarySpec, responseBody, issues) {
  if (typeof sourceSpec.body !== "string" || sourceSpec.body.trim() === "") {
    issues.push(issue("INSUFFICIENT_CONTENT", "context.sourceNote.body", "The source note body is empty."));
  }
  if (typeof summarySpec.body !== "string" || summarySpec.body.trim() === "") {
    issues.push(issue("INSUFFICIENT_CONTENT", "context.summary.body", "The summary body is empty."));
  }
  const sources = Array.isArray(sourceSpec.sources) ? sourceSpec.sources : [];
  if (!sources.some((source) => isObject(source) && source.kind !== "ticket")) {
    issues.push(issue(
      "INSUFFICIENT_EVIDENCE",
      "context.sourceNote.sources",
      "The ticket question itself is not evidence; provide at least one non-ticket source.",
    ));
  }
  if (typeof responseBody === "string" && typeof sourceSpec.body === "string"
      && normalizeText(responseBody) === "" && normalizeText(sourceSpec.body) === "") {
    issues.push(issue("INSUFFICIENT_CONTENT", "context", "The supplement contains no meaningful text."));
  }
}

function loadExistingNotes(notes, issues) {
  const existing = new Map();
  notes.forEach((entry, index) => {
    if (!isObject(entry) || typeof entry.path !== "string" || typeof entry.markdown !== "string") {
      issues.push(issue("INVALID_EXISTING_NOTE", `notes[${index}]`, "Each note needs path and markdown strings."));
      return;
    }
    if (existing.has(entry.path)) {
      issues.push(issue("DUPLICATE_NOTE_PATH", `notes[${index}].path`, `Duplicate note path: ${entry.path}`));
      return;
    }
    const validation = validateWikiNote(entry.markdown, {path: entry.path});
    if (!validation.valid) {
      issues.push(issue(
        "INVALID_EXISTING_NOTE",
        `notes[${index}]`,
        `${entry.path} is invalid: ${validation.errors.map(({code}) => code).join(", ")}`,
      ));
      return;
    }
    existing.set(entry.path, {path: entry.path, markdown: entry.markdown, parsed: validation.note});
  });
  return existing;
}

function makeCandidate(path, metadata, body) {
  const markdown = renderWikiNote(metadata, typeof body === "string" ? body : "");
  return {path, markdown, metadata, body: typeof body === "string" ? body.trim() : ""};
}

function addCandidateValidation(candidate, issues) {
  const validation = validateWikiNote(candidate.markdown, {path: candidate.path});
  for (const error of validation.errors) {
    issues.push(issue(error.code, `${candidate.path}:${error.field}`, error.message));
  }
}

function checkPathCollision(existing, candidate, issues) {
  if (!candidate || !existing.has(candidate.path)) return;
  const prior = existing.get(candidate.path);
  if (prior.markdown !== candidate.markdown) {
    issues.push(issue("PATH_COLLISION", candidate.path, "An immutable note already exists at this path with different content."));
  }
}

function graphRecord(candidate) {
  return {
    path: candidate.path,
    markdown: candidate.markdown,
    parsed: {format: "structured", metadata: candidate.metadata, body: candidate.body},
  };
}

function validateReachableGraph(graph, roots, issues) {
  const visited = new Set();
  const active = new Set();
  const stack = [];

  function visit(path) {
    if (active.has(path)) {
      const start = stack.indexOf(path);
      const cycle = [...stack.slice(start), path];
      const code = cycle.length === 2 ? "SELF_REFERENCE" : "REFERENCE_CYCLE";
      issues.push(issue(code, path, `Wiki reference cycle: ${cycle.join(" -> ")}`));
      return;
    }
    if (visited.has(path)) return;
    const record = graph.get(path);
    if (!record) return;
    visited.add(path);
    active.add(path);
    stack.push(path);
    for (const edge of wikiEdges(record.parsed)) {
      if (!graph.has(edge.ref)) {
        issues.push(issue(
          edge.kind === "source" ? "MISSING_SOURCE_REFERENCE" : "MISSING_NOTE_REFERENCE",
          `${path}:${edge.field}`,
          `Referenced note does not exist: ${edge.ref}`,
        ));
      } else {
        visit(edge.ref);
      }
    }
    stack.pop();
    active.delete(path);
  }

  roots.forEach(visit);
}

function wikiEdges(parsed) {
  if (parsed.format !== "structured") return [];
  const metadata = parsed.metadata;
  const edges = [];
  (metadata.sources ?? []).forEach((source, index) => {
    if (source?.kind === "wiki" && typeof source.ref === "string") {
      edges.push({ref: source.ref, kind: "source", field: `sources[${index}].ref`});
    }
  });
  for (const field of ["summarizes", "decisionEvidence", "supersedes"]) {
    (metadata[field] ?? []).forEach((ref, index) => edges.push({ref, kind: "relation", field: `${field}[${index}]`}));
  }
  if (typeof metadata.previousSummary === "string") {
    edges.push({ref: metadata.previousSummary, kind: "relation", field: "previousSummary"});
  }
  return edges;
}

function validateAgreementEvidence(graph, candidates, issues) {
  for (const candidate of candidates.filter(Boolean)) {
    if (candidate.metadata.status !== "agreed") continue;
    for (const ref of candidate.metadata.decisionEvidence ?? []) {
      const evidence = graph.get(ref);
      if (!evidence) continue;
      if (evidence.parsed.format !== "structured" || evidence.parsed.metadata.author?.kind !== "human") {
        issues.push(issue(
          "AGREEMENT_EVIDENCE_NOT_HUMAN",
          `${candidate.path}:decisionEvidence`,
          `Agreement evidence must be a structured human-authored note: ${ref}`,
        ));
      }
    }
  }
}

function collectPreservedStatuses(existing, references) {
  return uniqueStrings(references).filter((path) => existing.has(path)).map((path) => {
    const record = existing.get(path);
    return {
      path,
      status: record?.parsed.format === "structured" ? record.parsed.metadata.status : "unknown",
    };
  });
}

function responseCandidate(ticket, author, body, evidencePath) {
  return {
    ticketId: ticket.id,
    actor: author,
    body: body.trim(),
    evidence: ticket.kind === "information" ? [evidencePath] : [],
  };
}

function supplementFingerprint(ticket, sourceSpec, summarySpec, responseBody) {
  const stableInput = {
    ticketId: ticket.id,
    ticketKind: ticket.kind,
    author: sourceSpec.author,
    workContext: sourceSpec.workContext,
    sourceBody: normalizeText(sourceSpec.body),
    sourceStatus: sourceSpec.status ?? "proposed",
    sources: [...(Array.isArray(sourceSpec.sources) ? sourceSpec.sources : [])]
      .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right))),
    sourceDecisionEvidence: [...(
      Array.isArray(sourceSpec.decisionEvidence) ? sourceSpec.decisionEvidence : []
    )].sort(),
    sourceSupersedes: [...(Array.isArray(sourceSpec.supersedes) ? sourceSpec.supersedes : [])].sort(),
    responseBody: normalizeText(responseBody),
    summaryBody: normalizeText(summarySpec.body),
    summaryStatus: summarySpec.status ?? "proposed",
    summarizes: [...(Array.isArray(summarySpec.summarizes) ? summarySpec.summarizes : [])].sort(),
    previousSummary: summarySpec.previousSummary ?? null,
    decisionEvidence: [...(Array.isArray(summarySpec.decisionEvidence) ? summarySpec.decisionEvidence : [])].sort(),
    summarySupersedes: [...(Array.isArray(summarySpec.supersedes) ? summarySpec.supersedes : [])].sort(),
  };
  return createHash("sha256").update(stableStringify(stableInput)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function wikiPath(id) {
  return `wiki/${id}.md`;
}

function deduplicateSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = stableStringify(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string"))];
}

function uniqueIssues(issues) {
  const seen = new Set();
  return issues.filter((entry) => {
    const key = `${entry.code}\0${entry.field}\0${entry.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function issue(code, field, message) {
  return {code, field, message};
}

function result(note, errors, warnings) {
  return {valid: errors.length === 0, errors, warnings, note};
}

function validatePath(path, id) {
  if (path === undefined) {
    return null;
  }
  if (typeof path !== "string" || !WIKI_PATH_PATTERN.test(path)) {
    return {code: "INVALID_WIKI_PATH", field: "path", message: "Notes must use wiki/<uuid>.md paths."};
  }
  const pathId = path.match(WIKI_PATH_PATTERN)[1];
  if (typeof id === "string" && pathId.toLowerCase() !== id.toLowerCase()) {
    return {code: "PATH_ID_MISMATCH", field: "path", message: "The filename UUID must match metadata.id."};
  }
  return null;
}

function validateAuthor(errors, author) {
  if (!isObject(author)) {
    errors.push({code: "INVALID_AUTHOR", field: "author", message: "author must be an object."});
    return;
  }
  requireString(errors, author.participant, "author.participant");
  requireEnum(errors, author.kind, ACTOR_KINDS, "author.kind");
}

function validateWorkContext(errors, context) {
  if (!isObject(context)) {
    errors.push({code: "INVALID_WORK_CONTEXT", field: "workContext", message: "workContext must be an object."});
    return;
  }
  requireNullableString(errors, context.promptRef, "workContext.promptRef");
  requireNullableString(errors, context.harnessRef, "workContext.harnessRef");
}

function validateSource(errors, source, index) {
  const field = `sources[${index}]`;
  if (!isObject(source)) {
    errors.push({code: "INVALID_SOURCE", field, message: "Each source must be an object."});
    return;
  }
  requireEnum(errors, source.kind, SOURCE_KINDS, `${field}.kind`);
  requireString(errors, source.ref, `${field}.ref`);
  if (source.observedAt !== undefined) {
    requireIsoDate(errors, source.observedAt, `${field}.observedAt`);
  }
  if (source.kind === "wiki" && typeof source.ref === "string" && !WIKI_PATH_PATTERN.test(source.ref)) {
    errors.push({code: "INVALID_WIKI_REFERENCE", field: `${field}.ref`, message: "Wiki sources must use wiki/<uuid>.md paths."});
  }
}

function validateWikiReferences(errors, references, field, required) {
  if (!Array.isArray(references)) {
    errors.push({code: "INVALID_REFERENCE_LIST", field, message: `${field} must be an array of wiki paths.`});
    return;
  }
  if (required && references.length === 0) {
    errors.push({code: "MISSING_SUMMARY_SOURCES", field, message: "Summary records must identify the notes they summarize."});
  }
  references.forEach((reference, index) => {
    if (typeof reference !== "string" || !WIKI_PATH_PATTERN.test(reference)) {
      errors.push({code: "INVALID_WIKI_REFERENCE", field: `${field}[${index}]`, message: "References must use wiki/<uuid>.md paths."});
    }
  });
}

function validatePreviousSummary(errors, reference) {
  if (reference === null) {
    return;
  }
  if (typeof reference !== "string" || !WIKI_PATH_PATTERN.test(reference)) {
    errors.push({
      code: "INVALID_PREVIOUS_SUMMARY",
      field: "previousSummary",
      message: "previousSummary must be null or one wiki/<uuid>.md path.",
    });
  }
}

function requireEqual(errors, value, expected, field, code) {
  if (value !== expected) {
    errors.push({code, field, message: `${field} must be ${JSON.stringify(expected)}.`});
  }
}

function requireUuid(errors, value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    errors.push({code: "INVALID_UUID", field, message: `${field} must be a UUID.`});
  }
}

function requireString(errors, value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({code: "MISSING_STRING", field, message: `${field} must be a non-empty string.`});
  }
}

function requireNullableString(errors, value, field) {
  if (value !== null && (typeof value !== "string" || value.trim() === "")) {
    errors.push({code: "INVALID_NULLABLE_REFERENCE", field, message: `${field} must be a non-empty string or null.`});
  }
}

function requireEnum(errors, value, allowed, field) {
  if (!allowed.has(value)) {
    errors.push({code: "INVALID_ENUM_VALUE", field, message: `${field} must be one of: ${[...allowed].join(", ")}.`});
  }
}

function requireIsoDate(errors, value, field) {
  const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof value !== "string" || !isoTimestamp.test(value) || !Number.isFinite(Date.parse(value))) {
    errors.push({code: "INVALID_TIMESTAMP", field, message: `${field} must be an ISO 8601 timestamp.`});
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
import {createHash} from "node:crypto";
