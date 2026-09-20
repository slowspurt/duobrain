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
