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

/** Search caller-provided notes without reading the shared store. */
export function searchWikiNotes({notes = [], query = "", filters = {}} = {}) {
  if (!Array.isArray(notes) || typeof query !== "string" || !isObject(filters)) {
    throw new TypeError("notes must be an array, query a string, and filters an object");
  }
  const issues = [];
  const existing = loadExistingNotes(notes, issues);
  const supersededBy = buildSupersededBy(existing);
  const terms = normalizeText(query).toLocaleLowerCase().split(" ").filter(Boolean);
  const results = [...existing.values()]
    .map((record) => publicNoteRecord(record, supersededBy))
    .filter((record) => matchesNoteFilters(record, filters))
    .filter((record) => terms.every((term) => searchableNoteText(record).includes(term)))
    .sort((left, right) => {
      const byTime = (right.observedAt ?? "").localeCompare(left.observedAt ?? "");
      return byTime || left.path.localeCompare(right.path);
    });
  return {results, issues: uniqueIssues(issues)};
}

/** Trace wiki-to-wiki provenance from caller-selected roots. */
export function traceWikiLineage({notes = [], roots = []} = {}) {
  if (!Array.isArray(notes) || !Array.isArray(roots)) {
    throw new TypeError("notes and roots must be arrays");
  }
  const issues = [];
  const existing = loadExistingNotes(notes, issues);
  return traceLoadedLineage(existing, roots, issues);
}

/**
 * Compare two participants' recorded methods. Reference strings are compared
 * as identifiers; content is compared only when artifacts include text.
 */
export function compareKnowledgeMethods({notes = [], left, right, artifacts = []} = {}) {
  if (!Array.isArray(notes) || !isObject(left) || !isObject(right) || !Array.isArray(artifacts)) {
    throw new TypeError("notes and artifacts must be arrays, and left/right must be objects");
  }
  const issues = [];
  const existing = loadExistingNotes(notes, issues);
  const artifactIndex = loadArtifacts(artifacts, issues);
  const supersededBy = buildSupersededBy(existing);
  const leftSummary = summarizeComparisonSide("left", left, existing, supersededBy, issues);
  const rightSummary = summarizeComparisonSide("right", right, existing, supersededBy, issues);
  const prompt = compareCapturedReference("prompt", leftSummary, rightSummary, artifactIndex, issues);
  const harness = compareCapturedReference("harness", leftSummary, rightSummary, artifactIndex, issues);
  const lineage = traceLoadedLineage(
    existing,
    uniqueStrings([...leftSummary.noteRefs, ...rightSummary.noteRefs]),
    issues,
  );
  const rightLineage = traceLoadedLineage(existing, rightSummary.noteRefs, []);
  const requestedFields = rightInformationGaps(
    rightSummary,
    prompt,
    harness,
    issues,
    rightLineage.issues,
  );
  const ticketCandidate = requestedFields.length === 0 ? null : {
    kind: "information",
    requester: leftSummary.participant,
    assignee: rightSummary.participant,
    title: `Evidence needed to compare ${rightSummary.label}`,
    body: `Please provide ${requestedFields.join(", ")} for ${rightSummary.workRef ?? rightSummary.label}.`,
    requestedFields,
    relatedNoteRefs: rightSummary.noteRefs,
  };
  const allIssues = uniqueIssues([...issues, ...lineage.issues]);
  return {
    complete: allIssues.length === 0,
    left: leftSummary,
    right: rightSummary,
    comparisons: {
      status: compareDecisionScope(leftSummary, rightSummary),
      author: compareAuthors(leftSummary, rightSummary),
      observedAt: compareObservationTimes(leftSummary, rightSummary),
      prompt,
      harness,
    },
    lineage: {nodes: lineage.nodes, edges: lineage.edges},
    issues: allIssues,
    ticketCandidate,
    causalConclusion: {
      supported: false,
      reason: "Recorded prompt or harness differences do not establish a performance cause.",
    },
  };
}

/**
 * Plan one immutable daily refinement index from caller-provided state. The
 * function is deterministic and never reads a clock, filesystem, Git, or a
 * scheduler.
 */
export function planDailyWikiRefinement({
  notes = [],
  tickets = [],
  now,
  date,
  timezone,
  sourceRevision,
  policy,
  priorRun = null,
  candidate,
} = {}) {
  if (!Array.isArray(notes) || !Array.isArray(tickets)) {
    throw new TypeError("notes and tickets must be arrays");
  }
  const issues = [];
  const existing = loadExistingNotes(notes, issues);
  const nowMs = validateRefinementTime(now, date, timezone, issues);
  if (typeof sourceRevision !== "string" || sourceRevision.trim() === "") {
    issues.push(refinementIssue("INVALID_SOURCE_REVISION", "sourceRevision", "sourceRevision must be a non-empty string."));
  }
  const ticketState = collectRefinementTickets(tickets, existing, issues);
  const resolvedPolicy = validateRefinementPolicy(policy, existing, ticketState.allIds, issues);
  const policyFingerprint = createHash("sha256")
    .update(stableStringify(refinementPolicyFingerprintInput(resolvedPolicy)))
    .digest("hex");
  const runKey = createHash("sha256").update(stableStringify({
    date,
    timezone,
    sourceRevision,
    policyFingerprint,
  })).digest("hex");
  const run = {date, timezone, sourceRevision, policyFingerprint, runKey};
  const supersededBy = buildSupersededBy(existing);
  const sourceRecords = [...existing.values()]
    .filter(({parsed}) => parsed.format !== "structured" || !isObject(parsed.metadata.dailyRefinement))
    .sort((left, right) => left.path.localeCompare(right.path));
  let refinementLineage = addRefinementLineageIssues(
    existing,
    sourceRecords.map(({path}) => path),
    issues,
  );
  const entries = sourceRecords.map((record) => refinementEntry({
    record,
    signal: resolvedPolicy.importanceSignals.find(({path}) => path === record.path),
    unresolvedTicketIds: ticketState.byEvidence.get(record.path) ?? [],
    nowMs,
    policy: resolvedPolicy,
    supersededBy,
    issues,
  }));
  const sameKeyExisting = [...existing.values()].find(({parsed}) => (
    parsed.format === "structured"
    && parsed.metadata.recordType === "summary"
    && parsed.metadata.dailyRefinement?.runKey === runKey
  ));
  const matchingExisting = sameKeyExisting && refinementMetadataMatchesRun(
    sameKeyExisting.parsed.metadata.dailyRefinement,
    run,
  ) ? sameKeyExisting : null;
  if (sameKeyExisting && !matchingExisting) {
    issues.push(refinementIssue(
      "REFINEMENT_RUN_METADATA_MISMATCH",
      sameKeyExisting.path,
      "An existing daily summary has the run key but inconsistent run metadata.",
    ));
  }
  const priorClaimsCurrentRun = priorRunMatches(priorRun, run);
  const priorSummary = refinementSummaryRecord(priorRun?.summaryPath, existing);
  const matchingPrior = priorClaimsCurrentRun && priorSummary
    && refinementMetadataMatchesRun(priorSummary.parsed.metadata.dailyRefinement, run)
    ? priorSummary
    : null;
  if (priorClaimsCurrentRun && !matchingPrior) {
    issues.push(refinementIssue(
      "PRIOR_RUN_SUMMARY_NOT_PERSISTED",
      "priorRun.summaryPath",
      "The matching prior run has no persisted summary with matching dailyRefinement metadata; planning will recover with a new candidate.",
      "warning",
    ));
  }
  const errors = () => issues.filter(({severity}) => severity !== "warning");

  if (matchingExisting || matchingPrior) {
    const duplicateRecord = matchingExisting ?? matchingPrior;
    refinementLineage = addRefinementLineageIssues(existing, [duplicateRecord.path], issues);
    return {
      outcome: errors().length === 0 ? "duplicate" : "insufficient",
      ready: errors().length === 0,
      run,
      entries,
      lineage: refinementLineage,
      unresolvedTickets: ticketState.unresolved,
      issues: uniqueRefinementIssues(issues),
      candidate: null,
      duplicateOf: duplicateRecord.path,
    };
  }

  if (!isObject(candidate)) {
    issues.push(refinementIssue("INVALID_CANDIDATE", "candidate", "candidate must provide an id, author, observedAt, and workContext."));
  }
  const previousSummary = !priorClaimsCurrentRun && isObject(priorRun) && typeof priorRun.summaryPath === "string"
    ? priorRun.summaryPath
    : null;
  if (previousSummary !== null && (!WIKI_PATH_PATTERN.test(previousSummary) || !existing.has(previousSummary))) {
    issues.push(refinementIssue(
      "MISSING_PREVIOUS_REFINEMENT",
      "priorRun.summaryPath",
      "The previous refinement summary must be included in notes as wiki/<uuid>.md.",
    ));
  } else if (previousSummary !== null && !priorSummaryMatchesDeclaration(priorRun, existing.get(previousSummary))) {
    issues.push(refinementIssue(
      "PRIOR_RUN_METADATA_MISMATCH",
      "priorRun.summaryPath",
      "The previous refinement summary does not match the declared priorRun metadata.",
    ));
  }
  if (sourceRecords.length === 0) {
    issues.push(refinementIssue("NO_SOURCE_NOTES", "notes", "At least one non-refinement note is required."));
  }

  let plannedCandidate = null;
  if (isObject(candidate)) {
    const candidatePath = wikiPath(candidate.id);
    const summarizedPaths = sourceRecords.map(({path}) => path);
    const metadata = {
      schemaVersion: 1,
      id: candidate.id,
      recordType: "summary",
      title: typeof candidate.title === "string" && candidate.title.trim()
        ? candidate.title
        : `Daily wiki refinement index — ${date}`,
      author: candidate.author,
      observedAt: candidate.observedAt,
      workContext: candidate.workContext,
      status: "proposed",
      sources: [
        ...summarizedPaths.map((ref) => ({kind: "wiki", ref})),
        ...ticketState.unresolved.map(({id}) => ({kind: "ticket", ref: `ticket:${id}`})),
      ],
      summarizes: summarizedPaths,
      previousSummary,
      decisionEvidence: [],
      supersedes: previousSummary === null ? [] : [previousSummary],
      dailyRefinement: run,
    };
    const body = renderRefinementBody({run, entries, tickets: ticketState.unresolved});
    plannedCandidate = makeCandidate(candidatePath, metadata, body);
    addRefinementCandidateValidation(plannedCandidate, issues);
    checkPathCollision(existing, plannedCandidate, issues);
    const graph = new Map(existing);
    graph.set(plannedCandidate.path, graphRecord(plannedCandidate));
    refinementLineage = addRefinementLineageIssues(graph, [plannedCandidate.path], issues);
  }

  const ready = errors().length === 0;
  return {
    outcome: ready ? "planned" : "insufficient",
    ready,
    run,
    entries,
    lineage: refinementLineage,
    unresolvedTickets: ticketState.unresolved,
    issues: uniqueRefinementIssues(issues),
    candidate: ready ? plannedCandidate : null,
    duplicateOf: null,
  };
}

function validateRefinementTime(now, date, timezone, issues) {
  const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  const timestamp = typeof now === "string" && isoTimestamp.test(now) ? Date.parse(now) : Number.NaN;
  if (!Number.isFinite(timestamp)) {
    issues.push(refinementIssue("INVALID_NOW", "now", "now must be an explicit ISO 8601 timestamp."));
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    issues.push(refinementIssue("INVALID_DATE", "date", "date must use YYYY-MM-DD."));
  }
  let localDate = null;
  try {
    if (typeof timezone !== "string" || timezone.trim() === "") throw new RangeError("missing timezone");
    if (Number.isFinite(timestamp)) localDate = dateInTimezone(timestamp, timezone);
    else new Intl.DateTimeFormat("en-US", {timeZone: timezone}).format(0);
  } catch {
    issues.push(refinementIssue("INVALID_TIMEZONE", "timezone", "timezone must be a valid IANA timezone."));
  }
  if (localDate !== null && typeof date === "string" && localDate !== date) {
    issues.push(refinementIssue(
      "DATE_TIMEZONE_MISMATCH",
      "date",
      `The supplied now is ${localDate} in ${timezone}, not ${date}.`,
    ));
  }
  return Number.isFinite(timestamp) ? timestamp : null;
}

function dateInTimezone(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({type, value}) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validateRefinementPolicy(policy, existing, ticketIds, issues) {
  const fallback = {
    id: null,
    version: null,
    staleAfterDays: null,
    recencyWindowDays: null,
    lowImportanceThreshold: null,
    highImportanceThreshold: null,
    unknownImportanceExposure: null,
    importanceSignals: [],
  };
  if (!isObject(policy)) {
    issues.push(refinementIssue("INVALID_POLICY", "policy", "policy must be an object."));
    return fallback;
  }
  for (const field of ["id", "version"]) {
    if (typeof policy[field] !== "string" || policy[field].trim() === "") {
      issues.push(refinementIssue("INVALID_POLICY", `policy.${field}`, `${field} must be a non-empty string.`));
    }
  }
  for (const field of ["staleAfterDays", "recencyWindowDays"]) {
    if (!Number.isFinite(policy[field]) || policy[field] <= 0) {
      issues.push(refinementIssue("INVALID_POLICY", `policy.${field}`, `${field} must be a positive number.`));
    }
  }
  for (const field of ["lowImportanceThreshold", "highImportanceThreshold"]) {
    if (!isUnitScore(policy[field])) {
      issues.push(refinementIssue("INVALID_POLICY", `policy.${field}`, `${field} must be between 0 and 1.`));
    }
  }
  if (Number.isFinite(policy.lowImportanceThreshold) && Number.isFinite(policy.highImportanceThreshold)
      && policy.lowImportanceThreshold > policy.highImportanceThreshold) {
    issues.push(refinementIssue(
      "INVALID_POLICY",
      "policy.lowImportanceThreshold",
      "lowImportanceThreshold cannot exceed highImportanceThreshold.",
    ));
  }
  if (!["normal", "low"].includes(policy.unknownImportanceExposure)) {
    issues.push(refinementIssue(
      "INVALID_POLICY",
      "policy.unknownImportanceExposure",
      "unknownImportanceExposure must be normal or low.",
    ));
  }
  const signals = [];
  const paths = new Set();
  if (!Array.isArray(policy.importanceSignals)) {
    issues.push(refinementIssue("INVALID_POLICY", "policy.importanceSignals", "importanceSignals must be an array."));
  } else {
    policy.importanceSignals.forEach((signal, index) => {
      const field = `policy.importanceSignals[${index}]`;
      if (!isObject(signal) || !WIKI_PATH_PATTERN.test(signal.path ?? "") || !isUnitScore(signal.score)
          || typeof signal.reason !== "string" || signal.reason.trim() === ""
          || typeof signal.evidenceRef !== "string" || signal.evidenceRef.trim() === "") {
        issues.push(refinementIssue(
          "INVALID_IMPORTANCE_SIGNAL",
          field,
          "Importance signals require wiki path, 0..1 score, reason, and evidenceRef.",
        ));
        return;
      }
      if (paths.has(signal.path)) {
        issues.push(refinementIssue("CONFLICTING_IMPORTANCE_SIGNAL", field, `Duplicate importance signal: ${signal.path}`));
        return;
      }
      paths.add(signal.path);
      const normalized = {
        path: signal.path,
        score: signal.score,
        reason: signal.reason.trim(),
        evidenceRef: signal.evidenceRef.trim(),
        evidence: classifyImportanceEvidence(signal.evidenceRef.trim(), existing, ticketIds, field, issues),
      };
      signals.push(normalized);
      if (!existing.has(signal.path)) {
        issues.push(refinementIssue(
          "IMPORTANCE_TARGET_MISSING",
          field,
          `Importance target is not present in notes: ${signal.path}`,
          "warning",
        ));
      }
    });
  }
  return {
    id: typeof policy.id === "string" ? policy.id.trim() : null,
    version: typeof policy.version === "string" ? policy.version.trim() : null,
    staleAfterDays: policy.staleAfterDays,
    recencyWindowDays: policy.recencyWindowDays,
    lowImportanceThreshold: policy.lowImportanceThreshold,
    highImportanceThreshold: policy.highImportanceThreshold,
    unknownImportanceExposure: policy.unknownImportanceExposure,
    importanceSignals: signals.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function refinementPolicyFingerprintInput(policy) {
  return {
    ...policy,
    importanceSignals: policy.importanceSignals.map(({evidence, ...signal}) => signal),
  };
}

function classifyImportanceEvidence(ref, existing, ticketIds, field, issues) {
  const wikiRef = normalizeImportanceWikiRef(ref);
  if (wikiRef !== null) {
    const verification = existing.has(wikiRef) ? "verified" : "missing";
    if (verification === "missing") {
      issues.push(refinementIssue(
        "IMPORTANCE_WIKI_EVIDENCE_MISSING",
        `${field}.evidenceRef`,
        `Importance wiki evidence is not present in notes: ${wikiRef}`,
        "warning",
      ));
    }
    return {kind: "wiki", verification, resolvedRef: wikiRef};
  }
  if (ref.startsWith("wiki:")) {
    issues.push(refinementIssue(
      "INVALID_IMPORTANCE_WIKI_EVIDENCE_REF",
      `${field}.evidenceRef`,
      `Importance wiki evidence must identify wiki/<uuid>.md or wiki:<uuid>: ${ref}`,
      "warning",
    ));
    return {kind: "wiki", verification: "invalid", resolvedRef: null};
  }
  const ticketId = ref.startsWith("ticket:") ? ref.slice("ticket:".length) : ref;
  if (ref.startsWith("ticket:") || ticketIds.has(ref) || UUID_PATTERN.test(ref)) {
    const verification = ticketIds.has(ticketId) ? "verified" : "missing";
    if (verification === "missing") {
      issues.push(refinementIssue(
        "IMPORTANCE_TICKET_EVIDENCE_MISSING",
        `${field}.evidenceRef`,
        `Importance ticket evidence is not present in tickets: ${ticketId}`,
        "warning",
      ));
    }
    return {kind: "ticket", verification, resolvedRef: ticketId};
  }
  issues.push(refinementIssue(
    "UNVERIFIED_EXTERNAL_IMPORTANCE_EVIDENCE",
    `${field}.evidenceRef`,
    `External importance evidence is an unverified caller claim: ${ref}`,
    "warning",
  ));
  return {kind: "external", verification: "caller-claim", resolvedRef: ref};
}

function normalizeImportanceWikiRef(ref) {
  if (WIKI_PATH_PATTERN.test(ref)) return ref;
  if (!ref.startsWith("wiki:")) return null;
  const value = ref.slice("wiki:".length);
  if (WIKI_PATH_PATTERN.test(value)) return value;
  if (UUID_PATTERN.test(value)) return wikiPath(value);
  return null;
}

function collectRefinementTickets(tickets, existing, issues) {
  const byEvidence = new Map();
  const unresolved = [];
  const allIds = new Set();
  const statuses = new Set(["open", "acknowledged", "needs_information", "answered", "resolved", "closed"]);
  tickets.forEach((ticket, index) => {
    const field = `tickets[${index}]`;
    if (!isObject(ticket) || typeof ticket.id !== "string" || ticket.id.trim() === ""
        || !statuses.has(ticket.status) || !Array.isArray(ticket.evidence)
        || ticket.evidence.some((path) => typeof path !== "string")) {
      issues.push(refinementIssue(
        "INVALID_TICKET_INPUT",
        field,
        "Tickets require non-empty id and status strings plus an evidence array.",
      ));
      return;
    }
    allIds.add(ticket.id);
    if (["resolved", "closed"].includes(ticket.status)) return;
    const evidence = uniqueStrings(ticket.evidence);
    const projected = {
      id: ticket.id,
      kind: typeof ticket.kind === "string" ? ticket.kind : null,
      status: ticket.status,
      title: typeof ticket.title === "string" ? ticket.title : null,
      evidence,
    };
    unresolved.push(projected);
    if (evidence.length === 0) {
      issues.push(refinementIssue(
        "UNRESOLVED_TICKET_WITHOUT_EVIDENCE",
        `${field}.evidence`,
        `Unresolved ticket ${ticket.id} has no wiki evidence yet.`,
        "warning",
      ));
    }
    for (const path of evidence) {
      if (!WIKI_PATH_PATTERN.test(path) || !existing.has(path)) {
        issues.push(refinementIssue(
          "TICKET_EVIDENCE_MISSING",
          `${field}.evidence`,
          `Ticket evidence is not present in notes: ${path}`,
          "warning",
        ));
        continue;
      }
      const ids = byEvidence.get(path) ?? [];
      ids.push(ticket.id);
      byEvidence.set(path, ids.sort());
    }
  });
  return {byEvidence, unresolved: unresolved.sort((left, right) => left.id.localeCompare(right.id)), allIds};
}

function refinementEntry({record, signal, unresolvedTicketIds, nowMs, policy, supersededBy, issues}) {
  const publicRecord = publicNoteRecord(record, supersededBy);
  const metadata = record.parsed.format === "structured" ? record.parsed.metadata : null;
  const importance = signal && signal.evidence.verification === "verified" ? {
    state: "known",
    score: signal.score,
    reason: signal.reason,
    evidenceRef: signal.evidenceRef,
    evidence: signal.evidence,
    defaultApplied: false,
  } : signal ? {
    state: signal.evidence.verification === "caller-claim" ? "caller-claim" : "unverified",
    score: signal.score,
    reason: signal.reason,
    evidenceRef: signal.evidenceRef,
    evidence: signal.evidence,
    defaultApplied: true,
  } : {
    state: "unknown",
    score: null,
    reason: "No caller-provided business-importance evidence.",
    evidenceRef: null,
    evidence: null,
    defaultApplied: true,
  };
  const recency = refinementRecency(publicRecord, nowMs, policy, issues);
  const preservationReasons = [];
  if (publicRecord.status === "agreed") preservationReasons.push("agreement");
  if (unresolvedTicketIds.length > 0) preservationReasons.push("unresolved-ticket-evidence");
  if (publicRecord.sources.length > 0) preservationReasons.push("source-lineage");
  if (publicRecord.supersededBy.length > 0 || (metadata?.supersedes?.length ?? 0) > 0) {
    preservationReasons.push("supersession-lineage");
  }
  const exposure = refinementExposure({
    importance,
    recency,
    status: publicRecord.status,
    unresolvedTicketIds,
    policy,
  });
  return {
    path: record.path,
    format: publicRecord.format,
    title: publicRecord.title,
    status: publicRecord.status,
    author: publicRecord.author,
    observedAt: publicRecord.observedAt,
    sources: publicRecord.sources,
    lineage: {
      previousSummary: metadata?.previousSummary ?? null,
      decisionEvidence: metadata?.decisionEvidence ?? [],
      supersedes: metadata?.supersedes ?? [],
      supersededBy: publicRecord.supersededBy,
    },
    importance,
    recency,
    exposure,
    preservationReasons,
    unresolvedTicketIds,
  };
}

function refinementRecency(record, nowMs, policy, issues) {
  if (record.observedAt === null || nowMs === null || !Number.isFinite(policy.recencyWindowDays)) {
    return {state: "unknown", score: null, ageDays: null, reason: "Observation time or recency policy is unavailable."};
  }
  const observedMs = Date.parse(record.observedAt);
  const rawAgeDays = (nowMs - observedMs) / 86_400_000;
  if (rawAgeDays < 0) {
    issues.push(refinementIssue(
      "FUTURE_OBSERVATION",
      `${record.path}:observedAt`,
      "The note observation time is after the supplied now; age is clamped to zero.",
      "warning",
    ));
  }
  const ageDays = roundScore(Math.max(0, rawAgeDays));
  const score = roundScore(Math.max(0, 1 - ageDays / policy.recencyWindowDays));
  return {
    state: "known",
    score,
    ageDays,
    reason: `Observed ${ageDays} days before the supplied now; ${policy.recencyWindowDays}-day recency window.`,
  };
}

function refinementExposure({importance, recency, status, unresolvedTicketIds, policy}) {
  if (unresolvedTicketIds.length > 0) {
    return {level: "action-required", reason: `Evidence for unresolved ticket(s): ${unresolvedTicketIds.join(", ")}.`};
  }
  if (importance.state === "known" && importance.score >= policy.highImportanceThreshold) {
    return {level: "high", reason: "Caller-provided importance meets the high threshold."};
  }
  if (status === "agreed") {
    return {level: "protected", reason: "Agreement status is preserved independently of recency."};
  }
  if (importance.state === "known" && importance.score <= policy.lowImportanceThreshold
      && recency.state === "known" && recency.ageDays >= policy.staleAfterDays) {
    return {level: "low", reason: "Caller-evidenced low importance and stale age lower index exposure."};
  }
  if (importance.state !== "known") {
    return {
      level: policy.unknownImportanceExposure,
      reason: `${importance.state === "unknown" ? "No importance evidence" : "Importance evidence is not locally verified"}; policy default ${policy.unknownImportanceExposure} applied.`,
    };
  }
  return {level: "normal", reason: "No policy rule raises or lowers this record's exposure."};
}

function renderRefinementBody({run, entries, tickets}) {
  const order = new Map([
    ["action-required", 0],
    ["high", 1],
    ["protected", 2],
    ["normal", 3],
    ["low", 4],
  ]);
  const sorted = [...entries].sort((left, right) => (
    order.get(left.exposure.level) - order.get(right.exposure.level) || left.path.localeCompare(right.path)
  ));
  const lines = [
    `# Daily wiki refinement index — ${markdownInline(run.date)}`,
    "",
    `Source revision: \`${markdownInline(run.sourceRevision)}\``,
    `Timezone: \`${markdownInline(run.timezone)}\``,
  ];
  for (const level of ["action-required", "high", "protected", "normal", "low"]) {
    const group = sorted.filter((entry) => entry.exposure.level === level);
    if (group.length === 0) continue;
    lines.push("", `## ${level}`);
    for (const entry of group) {
      const importance = entry.importance.state === "known"
        ? `${entry.importance.score} — ${entry.importance.reason}`
        : `${entry.importance.state}${entry.importance.score === null ? "" : ` (${entry.importance.score} not applied)`} — ${entry.importance.reason}`;
      const recency = entry.recency.state === "known"
        ? `${entry.recency.score} — ${entry.recency.reason}`
        : `unknown — ${entry.recency.reason}`;
      lines.push(
        `- \`${markdownInline(entry.path)}\` — status: ${markdownInline(entry.status)}; importance: ${markdownInline(importance)}; recency: ${markdownInline(recency)}; exposure: ${markdownInline(entry.exposure.reason)}; preserves: ${markdownInline(entry.preservationReasons.join(", ") || "original")}`,
      );
    }
  }
  lines.push("", "## Unresolved tickets");
  if (tickets.length === 0) {
    lines.push("- None in the caller-provided projection.");
  } else {
    for (const ticket of tickets) {
      const evidence = ticket.evidence.length > 0 ? ticket.evidence.join(", ") : "evidence not yet recorded";
      lines.push(`- \`${markdownInline(ticket.id)}\` (${markdownInline(ticket.status)}) — ${markdownInline(evidence)}`);
    }
  }
  lines.push("", "This index changes display exposure only. Original notes, sources, and decision states remain immutable.");
  return lines.join("\n");
}

function addRefinementCandidateValidation(candidate, issues) {
  const validation = validateWikiNote(candidate.markdown, {path: candidate.path});
  for (const error of validation.errors) {
    issues.push(refinementIssue(error.code, `${candidate.path}:${error.field}`, error.message));
  }
}

function addRefinementLineageIssues(existing, roots, issues) {
  const lineage = traceLoadedLineage(existing, roots, []);
  for (const entry of lineage.issues) {
    issues.push(refinementIssue(entry.code, entry.field, entry.message));
  }
  return {nodes: lineage.nodes, edges: lineage.edges};
}

function refinementSummaryRecord(path, existing) {
  if (typeof path !== "string") return null;
  const record = existing.get(path);
  if (!record || record.parsed.format !== "structured"
      || record.parsed.metadata.recordType !== "summary"
      || !isObject(record.parsed.metadata.dailyRefinement)) {
    return null;
  }
  return record;
}

function refinementMetadataMatchesRun(metadata, run) {
  return isObject(metadata)
    && metadata.date === run.date
    && metadata.timezone === run.timezone
    && metadata.sourceRevision === run.sourceRevision
    && metadata.policyFingerprint === run.policyFingerprint
    && metadata.runKey === run.runKey;
}

function priorSummaryMatchesDeclaration(priorRun, record) {
  if (!isObject(priorRun) || !record || record.parsed.format !== "structured"
      || record.parsed.metadata.recordType !== "summary") {
    return false;
  }
  const metadata = record.parsed.metadata.dailyRefinement;
  if (!isObject(metadata)) return false;
  const declared = ["date", "timezone", "sourceRevision", "policyFingerprint", "runKey"]
    .filter((field) => priorRun[field] !== undefined);
  return declared.every((field) => metadata[field] === priorRun[field]);
}

function priorRunMatches(priorRun, run) {
  if (!isObject(priorRun)) return false;
  if (priorRun.runKey === run.runKey) return true;
  return priorRun.date === run.date
    && priorRun.timezone === run.timezone
    && priorRun.sourceRevision === run.sourceRevision
    && priorRun.policyFingerprint === run.policyFingerprint;
}

function isUnitScore(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function roundScore(value) {
  return Math.round(value * 10_000) / 10_000;
}

function markdownInline(value) {
  return String(value).replace(/[\r\n]+/g, " ").replace(/`/g, "\\`");
}

function refinementIssue(code, field, message, severity = "error") {
  return {code, field, message, severity};
}

function uniqueRefinementIssues(issues) {
  const seen = new Set();
  return issues.filter((entry) => {
    const key = `${entry.code}\0${entry.field}\0${entry.message}\0${entry.severity ?? "error"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function publicNoteRecord(record, supersededBy) {
  const {path, parsed} = record;
  if (parsed.format === "legacy") {
    return {
      path,
      format: "legacy",
      title: null,
      recordType: null,
      status: "unknown",
      author: null,
      observedAt: null,
      workContext: {promptRef: null, harnessRef: null},
      sources: [],
      body: parsed.body,
      supersededBy: supersededBy.get(path) ?? [],
    };
  }
  const metadata = parsed.metadata;
  return {
    path,
    format: "structured",
    title: metadata.title,
    recordType: metadata.recordType,
    status: metadata.status,
    author: metadata.author,
    observedAt: metadata.observedAt,
    workContext: metadata.workContext,
    sources: metadata.sources,
    body: parsed.body,
    supersededBy: supersededBy.get(path) ?? [],
  };
}

function matchesNoteFilters(record, filters) {
  if (filters.participant !== undefined && record.author?.participant !== filters.participant) return false;
  if (filters.status !== undefined && record.status !== filters.status) return false;
  if (filters.recordType !== undefined && record.recordType !== filters.recordType) return false;
  if (filters.includeSuperseded === false && (record.status === "superseded" || record.supersededBy.length > 0)) return false;
  return true;
}

function searchableNoteText(record) {
  return normalizeText([
    record.path,
    record.title,
    record.status,
    record.author?.participant,
    record.author?.kind,
    record.observedAt,
    record.workContext?.promptRef,
    record.workContext?.harnessRef,
    record.body,
    ...record.sources.map((source) => source.ref),
  ].filter(Boolean).join(" ")).toLocaleLowerCase();
}

function buildSupersededBy(existing) {
  const result = new Map();
  for (const record of existing.values()) {
    if (record.parsed.format !== "structured") continue;
    const metadata = record.parsed.metadata;
    const targets = [
      ...(metadata.supersedes ?? []),
      ...(metadata.recordType === "summary" && typeof metadata.previousSummary === "string"
        ? [metadata.previousSummary]
        : []),
    ];
    for (const target of uniqueStrings(targets)) {
      const replacements = result.get(target) ?? [];
      replacements.push(record.path);
      result.set(target, replacements.sort());
    }
  }
  return result;
}

function traceLoadedLineage(existing, roots, initialIssues = []) {
  const issues = [...initialIssues];
  const supersededBy = buildSupersededBy(existing);
  const nodes = new Map();
  const edges = [];
  const visited = new Set();
  const active = new Set();
  const stack = [];

  function visit(path) {
    if (active.has(path)) {
      const start = stack.indexOf(path);
      const cycle = [...stack.slice(start), path];
      issues.push(issue(
        cycle.length === 2 ? "SELF_REFERENCE" : "REFERENCE_CYCLE",
        path,
        `Wiki reference cycle: ${cycle.join(" -> ")}`,
      ));
      return;
    }
    if (visited.has(path)) return;
    const record = existing.get(path);
    if (!record) {
      issues.push(issue("MISSING_NOTE", path, `Comparison note does not exist: ${path}`));
      return;
    }
    visited.add(path);
    active.add(path);
    stack.push(path);
    nodes.set(path, publicNoteRecord(record, supersededBy));
    for (const edge of wikiEdges(record.parsed)) {
      edges.push({from: path, to: edge.ref, relation: edge.field});
      if (!existing.has(edge.ref)) {
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

  for (const root of uniqueStrings(roots)) visit(root);
  return {
    nodes: [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path)),
    edges,
    issues: uniqueIssues(issues),
  };
}

function summarizeComparisonSide(sideName, side, existing, supersededBy, issues) {
  const label = typeof side.label === "string" && side.label.trim() ? side.label.trim() : sideName;
  const participant = typeof side.participant === "string" && side.participant.trim()
    ? side.participant.trim()
    : null;
  if (participant === null) {
    issues.push(issue("MISSING_FIELD", `${sideName}.participant`, `${sideName}.participant is required.`));
  }
  const noteRefs = uniqueStrings(side.noteRefs);
  if (noteRefs.length === 0) {
    issues.push(issue("MISSING_NOTE", `${sideName}.noteRefs`, `${label} has no note references.`));
  }
  const records = [];
  for (const path of noteRefs) {
    const record = existing.get(path);
    if (!record) {
      issues.push(issue("MISSING_NOTE", `${sideName}.noteRefs`, `Comparison note does not exist: ${path}`));
      continue;
    }
    records.push(publicNoteRecord(record, supersededBy));
  }
  const activeRecords = records.filter((record) => record.status !== "superseded" && record.supersededBy.length === 0);
  if (records.length > 0 && activeRecords.length === 0) {
    issues.push(issue("NO_ACTIVE_RECORD", `${sideName}.noteRefs`, `${label} has only superseded records.`));
  }
  const structured = activeRecords.filter((record) => record.format === "structured");
  for (const record of activeRecords.filter((item) => item.format === "legacy")) {
    issues.push(issue("MISSING_WORK_CONTEXT", `${sideName}:${record.path}`, "Legacy notes do not identify prompt or harness context."));
  }
  const promptRefs = uniqueStrings(structured.map((record) => record.workContext.promptRef));
  const harnessRefs = uniqueStrings(structured.map((record) => record.workContext.harnessRef));
  const missingFields = [];
  for (const record of structured) {
    if (participant !== null && record.author.participant !== participant) {
      issues.push(issue(
        "AUTHOR_MISMATCH",
        `${sideName}.participant:${record.path}`,
        `${record.path} is authored for ${record.author.participant}, not ${participant}.`,
      ));
    }
  }
  recordMissingContext(sideName, label, structured, "promptRef", missingFields, issues);
  recordMissingContext(sideName, label, structured, "harnessRef", missingFields, issues);
  recordReferenceConflict(sideName, label, "prompt", promptRefs, issues);
  recordReferenceConflict(sideName, label, "harness", harnessRefs, issues);
  const statuses = [...new Set(activeRecords.map((record) => record.status))].sort();
  return {
    label,
    participant,
    workRef: typeof side.workRef === "string" && side.workRef.trim() ? side.workRef.trim() : null,
    noteRefs,
    records,
    activeNoteRefs: activeRecords.map((record) => record.path),
    supersededNoteRefs: records.filter((record) => (
      record.status === "superseded" || record.supersededBy.length > 0
    )).map((record) => record.path),
    authors: structured.map((record) => ({path: record.path, ...record.author})),
    observedAt: structured.map((record) => ({path: record.path, at: record.observedAt})),
    statuses,
    decisionScope: activeRecords.length === 0 && records.length > 0 ? "retired" : decisionScope(statuses),
    missingFields,
    promptRefs,
    harnessRefs,
    promptRef: promptRefs.length === 1 ? promptRefs[0] : null,
    harnessRef: harnessRefs.length === 1 ? harnessRefs[0] : null,
  };
}

function recordMissingContext(sideName, label, records, field, missingFields, issues) {
  for (const record of records) {
    if (record.workContext[field] !== null) continue;
    const requested = field === "promptRef" ? "prompt reference" : "harness reference";
    missingFields.push({field, path: record.path});
    issues.push(issue(
      "MISSING_REFERENCE",
      `${sideName}.${field}:${record.path}`,
      `${label} is missing its ${requested}.`,
    ));
  }
}

function recordReferenceConflict(sideName, label, kind, references, issues) {
  if (references.length <= 1) return;
  issues.push(issue(
    "CONFLICTING_REFERENCE",
    `${sideName}.${kind}Refs`,
    `${label} has multiple active ${kind} references: ${references.join(", ")}`,
  ));
}

function decisionScope(statuses) {
  if (statuses.length === 0 || statuses.includes("unknown")) return "unknown";
  if (statuses.length > 1) return "mixed";
  return {
    agreed: "joint",
    personal: "individual",
    proposed: "proposed",
    superseded: "retired",
  }[statuses[0]] ?? "unknown";
}

function compareDecisionScope(left, right) {
  const relation = left.decisionScope === right.decisionScope ? "same-scope" : "different-scope";
  const individualAndJoint = new Set([left.decisionScope, right.decisionScope]);
  return {
    relation,
    left: {statuses: left.statuses, scope: left.decisionScope},
    right: {statuses: right.statuses, scope: right.decisionScope},
    caution: individualAndJoint.has("individual") && individualAndJoint.has("joint")
      ? "A personal choice is not a joint agreement."
      : null,
  };
}

function compareAuthors(left, right) {
  const leftValues = uniqueStrings(left.authors.map(({participant, kind}) => `${participant}:${kind}`));
  const rightValues = uniqueStrings(right.authors.map(({participant, kind}) => `${participant}:${kind}`));
  return {
    relation: leftValues.length === 1 && rightValues.length === 1
      ? (leftValues[0] === rightValues[0] ? "same" : "different")
      : "unknown-or-multiple",
    left: left.authors,
    right: right.authors,
  };
}

function compareObservationTimes(left, right) {
  const leftTimes = uniqueStrings(left.observedAt.map(({at}) => at));
  const rightTimes = uniqueStrings(right.observedAt.map(({at}) => at));
  return {
    relation: leftTimes.length === 1 && rightTimes.length === 1
      ? (leftTimes[0] === rightTimes[0] ? "same" : "different")
      : "unknown-or-multiple",
    left: left.observedAt,
    right: right.observedAt,
  };
}

function loadArtifacts(artifacts, issues) {
  const byRef = new Map();
  const conflicts = new Set();
  artifacts.forEach((artifact, itemIndex) => {
    const field = `artifacts[${itemIndex}]`;
    if (!isObject(artifact) || typeof artifact.ref !== "string" || artifact.ref.trim() === ""
        || !["prompt", "harness", "source"].includes(artifact.kind)) {
      issues.push(issue("INVALID_ARTIFACT", field, "Artifacts require a ref and prompt, harness, or source kind."));
      return;
    }
    if (artifact.version !== null && artifact.version !== undefined
        && (typeof artifact.version !== "string" || artifact.version.trim() === "")) {
      issues.push(issue("INVALID_ARTIFACT", `${field}.version`, "Artifact version must be a non-empty string or null."));
      return;
    }
    if (artifact.text !== undefined && typeof artifact.text !== "string") {
      issues.push(issue("INVALID_ARTIFACT", `${field}.text`, "Captured artifact text must be a string."));
      return;
    }
    if (byRef.has(artifact.ref)) {
      const prior = byRef.get(artifact.ref);
      if (stableStringify(prior) !== stableStringify(artifact)) {
        conflicts.add(artifact.ref);
        issues.push(issue("CONFLICTING_ARTIFACT", field, `Conflicting captures use the same ref: ${artifact.ref}`));
      }
      return;
    }
    byRef.set(artifact.ref, {...artifact});
  });
  return {byRef, conflicts};
}

function compareCapturedReference(kind, left, right, artifacts, issues) {
  const leftState = capturedReferenceState("left", kind, left, artifacts, issues);
  const rightState = capturedReferenceState("right", kind, right, artifacts, issues);
  let relation = "missing";
  if (leftState.ref !== null && rightState.ref !== null) {
    relation = leftState.ref === rightState.ref ? "same-reference" : "different-reference";
  } else if (left[`${kind}Refs`].length > 1 || right[`${kind}Refs`].length > 1) {
    relation = "ambiguous";
  }
  const canCompareText = leftState.textCaptured && rightState.textCaptured;
  return {
    relation,
    left: leftState,
    right: rightState,
    textComparison: canCompareText
      ? summarizeTextDifference(leftState.text, rightState.text)
      : {available: false, reason: "Both artifact texts must be explicitly captured."},
  };
}

function capturedReferenceState(sideName, kind, side, artifacts, issues) {
  const ref = side[`${kind}Ref`];
  const state = {
    ref,
    version: null,
    versionKnown: false,
    text: null,
    textCaptured: false,
    gaps: [],
  };
  if (ref === null) {
    if (side[`${kind}Refs`].length === 0) state.gaps.push(`${kind}Ref`);
    else state.gaps.push(`${kind}ReferenceChoice`);
    return state;
  }
  if (artifacts.conflicts.has(ref)) {
    state.gaps.push(`${kind}ArtifactConflict`);
    return state;
  }
  const artifact = artifacts.byRef.get(ref);
  if (!artifact) {
    state.gaps.push(`${kind}Artifact`);
    issues.push(issue("MISSING_ARTIFACT", `${sideName}.${kind}`, `No captured artifact was provided for ${ref}.`));
    return state;
  }
  if (artifact.kind !== kind) {
    state.gaps.push(`${kind}Artifact`);
    issues.push(issue("ARTIFACT_KIND_MISMATCH", `${sideName}.${kind}`, `${ref} is captured as ${artifact.kind}, not ${kind}.`));
    return state;
  }
  if (typeof artifact.version === "string") {
    state.version = artifact.version;
    state.versionKnown = true;
  } else {
    state.gaps.push(`${kind}Version`);
    issues.push(issue("UNKNOWN_ARTIFACT_VERSION", `${sideName}.${kind}`, `The captured ${kind} version is unknown for ${ref}.`));
  }
  if (typeof artifact.text === "string") {
    state.text = artifact.text;
    state.textCaptured = true;
  } else {
    state.gaps.push(`${kind}Text`);
    issues.push(issue("MISSING_ARTIFACT_TEXT", `${sideName}.${kind}`, `The ${kind} ref exists but its text was not captured: ${ref}.`));
  }
  return state;
}

function summarizeTextDifference(leftText, rightText) {
  const normalizedLeft = leftText.replace(/\r\n/g, "\n");
  const normalizedRight = rightText.replace(/\r\n/g, "\n");
  const leftLines = normalizedLeft.split("\n");
  const rightLines = normalizedRight.split("\n");
  let prefix = 0;
  while (prefix < leftLines.length && prefix < rightLines.length && leftLines[prefix] === rightLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (suffix < leftLines.length - prefix && suffix < rightLines.length - prefix
      && leftLines[leftLines.length - 1 - suffix] === rightLines[rightLines.length - 1 - suffix]) {
    suffix += 1;
  }
  const leftChanged = leftLines.slice(prefix, leftLines.length - suffix);
  const rightChanged = rightLines.slice(prefix, rightLines.length - suffix);
  return {
    available: true,
    equal: normalizedLeft === normalizedRight,
    commonPrefixLines: prefix,
    commonSuffixLines: suffix,
    leftChangedLineCount: leftChanged.length,
    rightChangedLineCount: rightChanged.length,
    leftChangedExcerpt: leftChanged.slice(0, 5).map((line) => line.slice(0, 240)),
    rightChangedExcerpt: rightChanged.slice(0, 5).map((line) => line.slice(0, 240)),
    truncated: leftChanged.length > 5 || rightChanged.length > 5
      || leftChanged.some((line) => line.length > 240)
      || rightChanged.some((line) => line.length > 240),
  };
}

function rightInformationGaps(right, prompt, harness, issues, lineageIssues) {
  const gaps = [];
  if (right.noteRefs.length === 0 || issues.some(({code, field}) => (
    code === "MISSING_NOTE" && field.startsWith("right.")
  ))) gaps.push("method note and evidence path");
  if (issues.some(({code, field}) => code === "NO_ACTIVE_RECORD" && field.startsWith("right."))) {
    gaps.push("current non-superseded method note");
  }
  if (issues.some(({code, field}) => code === "AUTHOR_MISMATCH" && field.startsWith("right."))) {
    gaps.push("note ownership and participant attribution");
  }
  if (lineageIssues.some(({code}) => ["MISSING_SOURCE_REFERENCE", "MISSING_NOTE_REFERENCE"].includes(code))) {
    gaps.push("missing source note");
  }
  for (const {field} of right.missingFields) gaps.push(field);
  gaps.push(...prompt.right.gaps, ...harness.right.gaps);
  return uniqueStrings(gaps);
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
