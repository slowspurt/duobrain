import assert from "node:assert/strict";
import test from "node:test";

import {planDailyWikiRefinement, renderWikiNote, validateWikiNote} from "../../src/wiki/index.js";

const ROUTINE_ID = "60000000-0000-4000-8000-000000000001";
const DECISION_ID = "60000000-0000-4000-8000-000000000002";
const AGREED_ID = "60000000-0000-4000-8000-000000000003";
const RECENT_ID = "60000000-0000-4000-8000-000000000004";
const PREVIOUS_ID = "60000000-0000-4000-8000-000000000005";
const CANDIDATE_ID = "60000000-0000-4000-8000-000000000006";
const ROUTINE_PATH = wikiPath(ROUTINE_ID);
const DECISION_PATH = wikiPath(DECISION_ID);
const AGREED_PATH = wikiPath(AGREED_ID);
const RECENT_PATH = wikiPath(RECENT_ID);
const PREVIOUS_PATH = wikiPath(PREVIOUS_ID);

test("lowers an old caller-identified routine record while preserving an important agreement", () => {
  const input = baseInput();
  const originalNotes = structuredClone(input.notes);

  const plan = planDailyWikiRefinement(input);

  assert.equal(plan.outcome, "planned");
  assert.equal(plan.ready, true);
  assert.equal(entry(plan, ROUTINE_PATH).exposure.level, "low");
  assert.equal(entry(plan, ROUTINE_PATH).importance.score, 0.1);
  assert.equal(entry(plan, ROUTINE_PATH).recency.score < 0.1, true);
  assert.equal(entry(plan, AGREED_PATH).exposure.level, "high");
  assert.equal(entry(plan, AGREED_PATH).status, "agreed");
  assert.deepEqual(entry(plan, AGREED_PATH).lineage.decisionEvidence, [DECISION_PATH]);
  assert.equal(entry(plan, RECENT_PATH).importance.state, "unknown");
  assert.equal(entry(plan, RECENT_PATH).importance.defaultApplied, true);
  assert.equal(entry(plan, RECENT_PATH).exposure.level, "normal");

  assert.equal(plan.candidate.metadata.status, "proposed");
  assert.equal(plan.candidate.metadata.previousSummary, PREVIOUS_PATH);
  assert.deepEqual(plan.candidate.metadata.supersedes, [PREVIOUS_PATH]);
  assert.equal(plan.candidate.metadata.supersedes.includes(AGREED_PATH), false);
  assert.equal(plan.candidate.metadata.summarizes.includes(PREVIOUS_PATH), false);
  assert.equal(plan.candidate.metadata.summarizes.includes(AGREED_PATH), true);
  assert.equal(plan.lineage.edges.some(({from, to}) => from === AGREED_PATH && to === DECISION_PATH), true);
  assert.equal(validateWikiNote(plan.candidate.markdown, {path: plan.candidate.path}).valid, true);
  assert.deepEqual(input.notes, originalNotes, "planning must not mutate original notes");
});

test("keeps old evidence prominent while its ticket is unresolved", () => {
  const input = baseInput();
  input.tickets = [{
    id: "ticket-open",
    kind: "information",
    status: "answered",
    title: "Confirm the old daily observation",
    evidence: [ROUTINE_PATH],
  }];

  const plan = planDailyWikiRefinement(input);
  const routine = entry(plan, ROUTINE_PATH);

  assert.equal(routine.exposure.level, "action-required");
  assert.deepEqual(routine.unresolvedTicketIds, ["ticket-open"]);
  assert.equal(routine.preservationReasons.includes("unresolved-ticket-evidence"), true);
  assert.equal(plan.candidate.metadata.sources.some(({kind, ref}) => (
    kind === "ticket" && ref === "ticket:ticket-open"
  )), true);
});

test("same date, source revision, timezone, and policy produce no duplicate candidate", () => {
  const firstInput = baseInput();
  firstInput.priorRun = null;
  const first = planDailyWikiRefinement(firstInput);
  const retryInput = baseInput();
  retryInput.notes.push({path: first.candidate.path, markdown: first.candidate.markdown});
  retryInput.priorRun = {...first.run, summaryPath: first.candidate.path};
  retryInput.candidate = {
    ...retryInput.candidate,
    id: "60000000-0000-4000-8000-000000000007",
    observedAt: "2026-09-20T10:00:00+09:00",
  };

  const retry = planDailyWikiRefinement(retryInput);

  assert.equal(retry.outcome, "duplicate");
  assert.equal(retry.ready, true);
  assert.equal(retry.candidate, null);
  assert.equal(retry.duplicateOf, first.candidate.path);
  assert.equal(retry.run.runKey, first.run.runKey);
});

test("a matching prior run without its persisted summary is replanned for recovery", () => {
  const initialInput = baseInput();
  initialInput.priorRun = null;
  const initial = planDailyWikiRefinement(initialInput);
  const recoveryInput = baseInput();
  recoveryInput.priorRun = {...initial.run, summaryPath: initial.candidate.path};
  recoveryInput.candidate = {
    ...recoveryInput.candidate,
    id: "60000000-0000-4000-8000-000000000007",
  };

  const recovery = planDailyWikiRefinement(recoveryInput);

  assert.equal(recovery.outcome, "planned");
  assert.equal(recovery.ready, true);
  assert.equal(recovery.duplicateOf, null);
  assert.equal(recovery.candidate.metadata.previousSummary, null);
  assert.equal(recovery.issues.some(({code, severity}) => (
    code === "PRIOR_RUN_SUMMARY_NOT_PERSISTED" && severity === "warning"
  )), true);
});

test("marks missing importance and unresolved-ticket evidence explicitly without inventing it", () => {
  const input = baseInput();
  input.policy.importanceSignals = [];
  input.tickets = [{
    id: "ticket-needs-evidence",
    kind: "information",
    status: "open",
    title: "Need source",
    evidence: [],
  }];

  const plan = planDailyWikiRefinement(input);

  assert.equal(plan.ready, true);
  assert.equal(plan.entries.every(({importance}) => importance.state === "unknown"), true);
  assert.equal(plan.entries.every(({importance}) => importance.score === null), true);
  assert.equal(entry(plan, AGREED_PATH).exposure.level, "protected");
  assert.equal(plan.issues.some(({code, severity}) => (
    code === "UNRESOLVED_TICKET_WITHOUT_EVIDENCE" && severity === "warning"
  )), true);
  assert.match(plan.candidate.body, /evidence not yet recorded/);
});

test("verifies wiki and ticket importance evidence and labels unsupported claims", () => {
  const input = baseInput();
  input.tickets = [{
    id: "priority-ticket",
    kind: "information",
    status: "resolved",
    title: "Priority decision",
    evidence: [],
  }];
  input.policy.importanceSignals = [
    {path: ROUTINE_PATH, score: 0.1, reason: "Wiki-backed routine classification", evidenceRef: `wiki:${DECISION_ID}`},
    {path: AGREED_PATH, score: 0.9, reason: "Ticket-backed priority", evidenceRef: "priority-ticket"},
    {path: RECENT_PATH, score: 0.95, reason: "Missing local wiki evidence", evidenceRef: "wiki:69999999-0000-4000-8000-000000000001"},
    {path: DECISION_PATH, score: 0.95, reason: "External board claim", evidenceRef: "external:priority-board"},
    {path: PREVIOUS_PATH, score: 0.5, reason: "Missing ticket claim", evidenceRef: "ticket:missing-ticket"},
  ];

  const plan = planDailyWikiRefinement(input);

  assert.equal(plan.ready, true);
  assert.equal(entry(plan, ROUTINE_PATH).importance.evidence.verification, "verified");
  assert.equal(entry(plan, AGREED_PATH).importance.evidence.kind, "ticket");
  assert.equal(entry(plan, AGREED_PATH).importance.state, "known");
  assert.equal(entry(plan, RECENT_PATH).importance.state, "unverified");
  assert.equal(entry(plan, RECENT_PATH).exposure.level, "normal");
  assert.equal(entry(plan, DECISION_PATH).importance.state, "caller-claim");
  assert.equal(entry(plan, DECISION_PATH).exposure.level, "normal");
  assert.equal(plan.issues.some(({code}) => code === "IMPORTANCE_WIKI_EVIDENCE_MISSING"), true);
  assert.equal(plan.issues.some(({code}) => code === "IMPORTANCE_TICKET_EVIDENCE_MISSING"), true);
  assert.equal(plan.issues.some(({code}) => code === "UNVERIFIED_EXTERNAL_IMPORTANCE_EVIDENCE"), true);
});

test("rejects a refinement candidate when included source graphs are incomplete or cyclic", () => {
  const missingSource = baseInput();
  missingSource.notes = missingSource.notes.map((note) => note.path === RECENT_PATH
    ? makeSourceNote({
      id: RECENT_ID,
      title: "Recent proposal",
      participant: "bob",
      observedAt: "2026-09-19T09:00:00+09:00",
      status: "proposed",
      sources: [{kind: "wiki", ref: "wiki/69999999-0000-4000-8000-000000000002.md"}],
    })
    : note);
  assertInsufficientGraph(missingSource, "MISSING_SOURCE_REFERENCE");

  const missingDecision = baseInput();
  missingDecision.notes = missingDecision.notes.map((note) => note.path === AGREED_PATH
    ? makeSourceNote({
      id: AGREED_ID,
      title: "Important shared API decision",
      participant: "alice",
      kind: "human",
      observedAt: "2026-02-02T09:00:00+09:00",
      status: "agreed",
      decisionEvidence: ["wiki/69999999-0000-4000-8000-000000000003.md"],
    })
    : note);
  assertInsufficientGraph(missingDecision, "MISSING_NOTE_REFERENCE");

  const missingPrevious = baseInput();
  missingPrevious.notes.push(makeKnowledgeSummary({
    id: "60000000-0000-4000-8000-000000000008",
    previousSummary: "wiki/69999999-0000-4000-8000-000000000004.md",
  }));
  assertInsufficientGraph(missingPrevious, "MISSING_NOTE_REFERENCE");

  const cycle = baseInput();
  cycle.notes = cycle.notes.map((note) => {
    if (note.path === ROUTINE_PATH) return makeSourceNote({
      id: ROUTINE_ID,
      title: "Old routine standup note",
      participant: "alice",
      observedAt: "2026-01-01T09:00:00+09:00",
      status: "proposed",
      sources: [{kind: "wiki", ref: DECISION_PATH}],
    });
    if (note.path === DECISION_PATH) return makeSourceNote({
      id: DECISION_ID,
      title: "Human agreement evidence",
      participant: "bob",
      kind: "human",
      observedAt: "2026-02-01T09:00:00+09:00",
      status: "proposed",
      sources: [{kind: "wiki", ref: ROUTINE_PATH}],
    });
    return note;
  });
  assertInsufficientGraph(cycle, "REFERENCE_CYCLE");
});

function baseInput() {
  const routine = makeSourceNote({
    id: ROUTINE_ID,
    title: "Old routine standup note",
    participant: "alice",
    observedAt: "2026-01-01T09:00:00+09:00",
    status: "proposed",
  });
  const decision = makeSourceNote({
    id: DECISION_ID,
    title: "Human agreement evidence",
    participant: "bob",
    kind: "human",
    observedAt: "2026-02-01T09:00:00+09:00",
    status: "proposed",
  });
  const agreed = makeSourceNote({
    id: AGREED_ID,
    title: "Important shared API decision",
    participant: "alice",
    kind: "human",
    observedAt: "2026-02-02T09:00:00+09:00",
    status: "agreed",
    sources: [{kind: "wiki", ref: DECISION_PATH}],
    decisionEvidence: [DECISION_PATH],
  });
  const recent = makeSourceNote({
    id: RECENT_ID,
    title: "Recent proposal",
    participant: "bob",
    observedAt: "2026-09-19T09:00:00+09:00",
    status: "proposed",
  });
  const previous = makePreviousRefinement();
  return {
    notes: [routine, decision, agreed, recent, previous],
    tickets: [],
    now: "2026-09-20T09:00:00+09:00",
    date: "2026-09-20",
    timezone: "Asia/Seoul",
    sourceRevision: "shared-state-revision-2",
    policy: {
      id: "daily-index",
      version: "1",
      staleAfterDays: 30,
      recencyWindowDays: 90,
      lowImportanceThreshold: 0.3,
      highImportanceThreshold: 0.7,
      unknownImportanceExposure: "normal",
      importanceSignals: [
        {path: ROUTINE_PATH, score: 0.1, reason: "Routine daily log", evidenceRef: DECISION_PATH},
        {path: AGREED_PATH, score: 0.9, reason: "Current shared API contract", evidenceRef: DECISION_PATH},
      ],
    },
    priorRun: {
      date: "2026-09-19",
      timezone: "Asia/Seoul",
      sourceRevision: "shared-state-revision-1",
      policyFingerprint: "previous-policy-fingerprint",
      runKey: "previous-run-key",
      summaryPath: PREVIOUS_PATH,
    },
    candidate: {
      id: CANDIDATE_ID,
      author: {participant: "alice", kind: "ai"},
      observedAt: "2026-09-20T09:00:00+09:00",
      workContext: {promptRef: "daily-refinement:v1", harnessRef: "duobrain:manual-run"},
    },
  };
}

function makeSourceNote({
  id,
  title,
  participant,
  kind = "ai",
  observedAt,
  status,
  sources = [{kind: "observation", ref: `observation:${id}`}],
  decisionEvidence = [],
}) {
  const path = wikiPath(id);
  const metadata = {
    schemaVersion: 1,
    id,
    recordType: "source-note",
    title,
    author: {participant, kind},
    observedAt,
    workContext: {promptRef: null, harnessRef: null},
    status,
    sources,
    summarizes: [],
    previousSummary: null,
    decisionEvidence,
    supersedes: [],
  };
  return {path, markdown: renderWikiNote(metadata, `# ${title}\n\nOriginal immutable content.`)};
}

function makePreviousRefinement() {
  const metadata = {
    schemaVersion: 1,
    id: PREVIOUS_ID,
    recordType: "summary",
    title: "Previous daily refinement",
    author: {participant: "alice", kind: "ai"},
    observedAt: "2026-09-19T09:00:00+09:00",
    workContext: {promptRef: "daily-refinement:v1", harnessRef: "duobrain:manual-run"},
    status: "proposed",
    sources: [{kind: "wiki", ref: ROUTINE_PATH}],
    summarizes: [ROUTINE_PATH],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
    dailyRefinement: {
      date: "2026-09-19",
      timezone: "Asia/Seoul",
      sourceRevision: "shared-state-revision-1",
      policyFingerprint: "previous-policy-fingerprint",
      runKey: "previous-run-key"
    },
  };
  return {path: PREVIOUS_PATH, markdown: renderWikiNote(metadata, "# Previous daily refinement\n")};
}

function makeKnowledgeSummary({id, previousSummary}) {
  const path = wikiPath(id);
  const metadata = {
    schemaVersion: 1,
    id,
    recordType: "summary",
    title: "Knowledge summary with prior lineage",
    author: {participant: "alice", kind: "ai"},
    observedAt: "2026-09-18T09:00:00+09:00",
    workContext: {promptRef: null, harnessRef: null},
    status: "proposed",
    sources: [{kind: "wiki", ref: ROUTINE_PATH}],
    summarizes: [ROUTINE_PATH],
    previousSummary,
    decisionEvidence: [],
    supersedes: [],
  };
  return {path, markdown: renderWikiNote(metadata, "# Knowledge summary\n")};
}

function assertInsufficientGraph(input, code) {
  const plan = planDailyWikiRefinement(input);
  assert.equal(plan.outcome, "insufficient");
  assert.equal(plan.ready, false);
  assert.equal(plan.candidate, null);
  assert.equal(plan.issues.some((entry) => entry.code === code && entry.severity === "error"), true);
}

function entry(plan, path) {
  return plan.entries.find((item) => item.path === path);
}

function wikiPath(id) {
  return `wiki/${id}.md`;
}
