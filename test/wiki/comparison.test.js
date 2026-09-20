import assert from "node:assert/strict";
import test from "node:test";

import {
  compareKnowledgeMethods,
  renderWikiNote,
  searchWikiNotes,
  traceWikiLineage,
} from "../../src/wiki/index.js";

const LEFT_ID = "40000000-0000-4000-8000-000000000001";
const RIGHT_ID = "40000000-0000-4000-8000-000000000002";
const DECISION_ID = "40000000-0000-4000-8000-000000000003";
const LEFT_PATH = `wiki/${LEFT_ID}.md`;
const RIGHT_PATH = `wiki/${RIGHT_ID}.md`;
const DECISION_PATH = `wiki/${DECISION_ID}.md`;

test("compares sufficient captured evidence without inferring a performance cause", () => {
  const comparison = compareKnowledgeMethods(completeInput());

  assert.equal(comparison.complete, true);
  assert.equal(comparison.ticketCandidate, null);
  assert.equal(comparison.comparisons.prompt.relation, "different-reference");
  assert.equal(comparison.comparisons.prompt.textComparison.available, true);
  assert.deepEqual(comparison.comparisons.prompt.textComparison.leftChangedExcerpt, ["Return CSV rows."]);
  assert.deepEqual(comparison.comparisons.prompt.textComparison.rightChangedExcerpt, ["Preserve multiline SRT cues."]);
  assert.equal(comparison.comparisons.harness.relation, "different-reference");
  assert.equal(comparison.comparisons.harness.textComparison.available, true);
  assert.equal(comparison.comparisons.status.left.scope, "individual");
  assert.equal(comparison.comparisons.status.right.scope, "joint");
  assert.match(comparison.comparisons.status.caution, /personal choice/i);
  assert.equal(comparison.comparisons.author.relation, "different");
  assert.equal(comparison.comparisons.observedAt.relation, "same");
  assert.equal(comparison.causalConclusion.supported, false);
});

test("returns a narrow information candidate when the other side is absent", () => {
  const input = completeInput();
  input.right.noteRefs = ["wiki/40000000-0000-4000-8000-000000000099.md"];

  const comparison = compareKnowledgeMethods(input);

  assert.equal(comparison.complete, false);
  assert.equal(comparison.issues.some(({code}) => code === "MISSING_NOTE"), true);
  assert.equal(comparison.ticketCandidate.kind, "information");
  assert.equal(comparison.ticketCandidate.assignee, "participant-b");
  assert.equal(comparison.ticketCandidate.requestedFields.includes("method note and evidence path"), true);
});

test("does not claim content differences when ref version and text are not captured", () => {
  const input = completeInput();
  input.artifacts = input.artifacts.map((artifact) => artifact.ref === "prompt:b"
    ? {ref: artifact.ref, kind: artifact.kind, version: null}
    : artifact);

  const comparison = compareKnowledgeMethods(input);

  assert.equal(comparison.complete, false);
  assert.equal(comparison.comparisons.prompt.relation, "different-reference");
  assert.equal(comparison.comparisons.prompt.right.versionKnown, false);
  assert.equal(comparison.comparisons.prompt.textComparison.available, false);
  assert.equal(comparison.issues.some(({code}) => code === "UNKNOWN_ARTIFACT_VERSION"), true);
  assert.equal(comparison.issues.some(({code}) => code === "MISSING_ARTIFACT_TEXT"), true);
  assert.equal(comparison.ticketCandidate.requestedFields.includes("promptVersion"), true);
  assert.equal(comparison.ticketCandidate.requestedFields.includes("promptText"), true);
  assert.equal(comparison.causalConclusion.supported, false);
});

test("treats a null prompt reference as unknown rather than equal or different", () => {
  const input = completeInput();
  input.notes = input.notes.map((entry) => entry.path === RIGHT_PATH
    ? makeNote({
      id: RIGHT_ID,
      participant: "participant-b",
      status: "agreed",
      promptRef: null,
      harnessRef: "harness:b",
      decisionEvidence: [DECISION_PATH],
      title: "Participant B export method",
    })
    : entry);

  const comparison = compareKnowledgeMethods(input);

  assert.equal(comparison.comparisons.prompt.relation, "missing");
  assert.equal(comparison.comparisons.prompt.right.ref, null);
  assert.equal(comparison.ticketCandidate.requestedFields.includes("promptRef"), true);
});

test("distinguishes conflicting active references and requests only the choice", () => {
  const input = completeInput();
  const conflict = makeNote({
    id: "40000000-0000-4000-8000-000000000004",
    participant: "participant-b",
    status: "agreed",
    promptRef: "prompt:b",
    harnessRef: "harness:b-v2",
    decisionEvidence: [DECISION_PATH],
    title: "Conflicting active harness record",
  });
  input.notes.push(conflict);
  input.right.noteRefs.push(conflict.path);

  const comparison = compareKnowledgeMethods(input);

  assert.equal(comparison.complete, false);
  assert.equal(comparison.issues.some(({code, field}) => (
    code === "CONFLICTING_REFERENCE" && field === "right.harnessRefs"
  )), true);
  assert.equal(comparison.comparisons.harness.relation, "ambiguous");
  assert.equal(comparison.ticketCandidate.requestedFields.includes("harnessReferenceChoice"), true);
});

test("search and lineage expose superseded records instead of mixing them with current evidence", () => {
  const old = makeNote({
    id: "40000000-0000-4000-8000-000000000005",
    participant: "participant-b",
    status: "personal",
    promptRef: "prompt:old",
    harnessRef: "harness:old",
    title: "Old parser method",
  });
  const retirement = makeNote({
    id: "40000000-0000-4000-8000-000000000006",
    participant: "participant-b",
    status: "superseded",
    promptRef: "prompt:new",
    harnessRef: "harness:new",
    title: "Retire old parser method",
    supersedes: [old.path],
  });
  const notes = [old, retirement];

  const search = searchWikiNotes({notes, query: "parser", filters: {participant: "participant-b"}});
  const oldResult = search.results.find(({path}) => path === old.path);
  assert.deepEqual(oldResult.supersededBy, [retirement.path]);
  assert.equal(search.results.find(({path}) => path === retirement.path).status, "superseded");

  const currentOnly = searchWikiNotes({notes, query: "parser", filters: {includeSuperseded: false}});
  assert.deepEqual(currentOnly.results, []);

  const lineage = traceWikiLineage({notes, roots: [retirement.path]});
  assert.equal(lineage.nodes.length, 2);
  assert.equal(lineage.edges.some(({from, to, relation}) => (
    from === retirement.path && to === old.path && relation === "supersedes[0]"
  )), true);
});

function completeInput() {
  const decision = makeNote({
    id: DECISION_ID,
    participant: "participant-b",
    status: "proposed",
    promptRef: "prompt:decision",
    harnessRef: "harness:decision",
    title: "Both participants confirmed the method",
    kind: "human",
  });
  const left = makeNote({
    id: LEFT_ID,
    participant: "participant-a",
    status: "personal",
    promptRef: "prompt:a",
    harnessRef: "harness:a",
    title: "Participant A export method",
  });
  const right = makeNote({
    id: RIGHT_ID,
    participant: "participant-b",
    status: "agreed",
    promptRef: "prompt:b",
    harnessRef: "harness:b",
    decisionEvidence: [DECISION_PATH],
    title: "Participant B export method",
  });
  return {
    notes: [left, right, decision],
    left: {
      label: "my export method",
      participant: "participant-a",
      workRef: "session:a-export",
      noteRefs: [LEFT_PATH],
    },
    right: {
      label: "B export method",
      participant: "participant-b",
      workRef: "session:b-export",
      noteRefs: [RIGHT_PATH],
    },
    artifacts: [
      {ref: "prompt:a", kind: "prompt", version: "a1", text: "Return CSV rows."},
      {ref: "prompt:b", kind: "prompt", version: "b3", text: "Preserve multiline SRT cues."},
      {ref: "harness:a", kind: "harness", version: "1.0", text: "fixture: csv-only"},
      {ref: "harness:b", kind: "harness", version: "2.1", text: "fixture: csv-and-srt"},
    ],
  };
}

function makeNote({
  id,
  participant,
  status,
  promptRef,
  harnessRef,
  title,
  kind = "ai",
  decisionEvidence = [],
  supersedes = [],
}) {
  const path = `wiki/${id}.md`;
  const metadata = {
    schemaVersion: 1,
    id,
    recordType: "source-note",
    title,
    author: {participant, kind},
    observedAt: "2026-01-15T10:05:00Z",
    workContext: {promptRef, harnessRef},
    status,
    sources: [{kind: "observation", ref: `${participant}:${id}`}],
    summarizes: [],
    previousSummary: null,
    decisionEvidence,
    supersedes,
  };
  return {path, markdown: renderWikiNote(metadata, `# ${title}\n\nCaptured method evidence.`)};
}
