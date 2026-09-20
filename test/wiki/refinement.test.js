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
        {path: ROUTINE_PATH, score: 0.1, reason: "Routine daily log", evidenceRef: "policy:daily-log"},
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

function entry(plan, path) {
  return plan.entries.find((item) => item.path === path);
}

function wikiPath(id) {
  return `wiki/${id}.md`;
}
