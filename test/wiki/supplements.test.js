import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {prepareTicketSupplement, validateWikiNote} from "../../src/wiki/index.js";

const SCENARIO_URL = new URL("../../examples/scenarios/everyday-flow.json", import.meta.url);

test("prepares immutable note and summary candidates from the normal information scenario", async () => {
  const {input, existingPath} = await normalInput();
  const plan = prepareTicketSupplement(input);

  assert.equal(plan.outcome, "prepared");
  assert.equal(plan.ready, true);
  assert.equal(plan.satisfiesTicket, true);
  assert.deepEqual(plan.ticketResponse.evidence, [plan.candidates.sourceNote.path]);
  assert.equal(plan.candidates.summary.metadata.summarizes.includes(existingPath), true);
  assert.equal(plan.candidates.summary.metadata.summarizes.includes(plan.candidates.sourceNote.path), true);
  assert.deepEqual(plan.preservedStatuses, [{path: existingPath, status: "unknown"}]);
  assert.equal(validateWikiNote(plan.candidates.sourceNote.markdown, {path: plan.candidates.sourceNote.path}).valid, true);
  assert.equal(validateWikiNote(plan.candidates.summary.markdown, {path: plan.candidates.summary.path}).valid, true);
});

test("returns explicit insufficiency for a missing wiki source", async () => {
  const {input} = await normalInput();
  input.context.sourceNote.sources = [{
    kind: "wiki",
    ref: "wiki/30000000-0000-4000-8000-000000000099.md",
  }];

  const plan = prepareTicketSupplement(input);

  assert.equal(plan.outcome, "insufficient");
  assert.equal(plan.ready, false);
  assert.equal(plan.ticketResponse, null);
  assert.equal(plan.issues.some(({code}) => code === "MISSING_SOURCE_REFERENCE"), true);
});

test("returns explicit insufficiency for empty supplement content", async () => {
  const {input} = await normalInput();
  input.context.sourceNote.body = "   ";

  const plan = prepareTicketSupplement(input);

  assert.equal(plan.ready, false);
  assert.equal(plan.issues.some(({code, field}) => (
    code === "INSUFFICIENT_CONTENT" && field === "context.sourceNote.body"
  )), true);
});

test("reprocessing the same request reuses its immutable records", async () => {
  const {input} = await normalInput();
  const first = prepareTicketSupplement(input);
  input.notes.push(
    {path: first.candidates.sourceNote.path, markdown: first.candidates.sourceNote.markdown},
    {path: first.candidates.summary.path, markdown: first.candidates.summary.markdown},
  );

  const retry = prepareTicketSupplement(input);

  assert.equal(retry.outcome, "duplicate");
  assert.equal(retry.ready, true);
  assert.equal(retry.candidates, null);
  assert.deepEqual(retry.duplicateOf, {
    source: first.candidates.sourceNote.path,
    summary: first.candidates.summary.path,
  });
  assert.deepEqual(retry.ticketResponse.evidence, [first.candidates.sourceNote.path]);
});

test("a partial retry reuses its source and prepares only the missing summary", async () => {
  const {input} = await normalInput();
  const first = prepareTicketSupplement(input);
  input.notes.push({path: first.candidates.sourceNote.path, markdown: first.candidates.sourceNote.markdown});

  const retry = prepareTicketSupplement(input);

  assert.equal(retry.outcome, "prepared");
  assert.equal(retry.ready, true);
  assert.equal(retry.candidates.sourceNote, null);
  assert.equal(retry.candidates.summary.path, first.candidates.summary.path);
  assert.deepEqual(retry.ticketResponse.evidence, [first.candidates.sourceNote.path]);
});

test("rejects self references and reachable reference cycles", async () => {
  const {input} = await normalInput();
  const sourcePath = `wiki/${input.context.sourceNote.id}.md`;
  input.context.sourceNote.sources = [{kind: "wiki", ref: sourcePath}];
  const self = prepareTicketSupplement(input);
  assert.equal(self.issues.some(({code}) => code === "SELF_REFERENCE"), true);

  const cycleInput = (await normalInput()).input;
  const cycleSourcePath = `wiki/${cycleInput.context.sourceNote.id}.md`;
  const linkedPath = cycleInput.notes[0].path;
  cycleInput.notes[0].markdown = structuredExisting({
    id: linkedPath.slice(5, -3),
    sources: [{kind: "wiki", ref: cycleSourcePath}],
  });
  cycleInput.context.sourceNote.sources = [{kind: "wiki", ref: linkedPath}];
  const cycle = prepareTicketSupplement(cycleInput);
  assert.equal(cycle.issues.some(({code}) => code === "REFERENCE_CYCLE"), true);
});

test("does not let AI-authored material satisfy a human feedback ticket", async () => {
  const scenario = JSON.parse(await readFile(SCENARIO_URL, "utf8"));
  const created = scenario.humanFeedback.events[0];
  const input = makeInput(created, [], {
    author: {participant: created.data.assignee, kind: "ai"},
  });

  const plan = prepareTicketSupplement(input);

  assert.equal(plan.ready, false);
  assert.equal(plan.satisfiesTicket, false);
  assert.equal(plan.ticketResponse, null);
  assert.equal(plan.issues.some(({code}) => code === "HUMAN_FEEDBACK_REQUIRED"), true);
});

test("blocks agreed promotion without decision evidence", async () => {
  const {input} = await normalInput();
  input.context.summary.status = "agreed";
  input.context.summary.decisionEvidence = [];

  const plan = prepareTicketSupplement(input);

  assert.equal(plan.ready, false);
  assert.equal(plan.issues.some(({code}) => code === "AGREED_WITHOUT_DECISION_EVIDENCE"), true);
});

async function normalInput() {
  const scenario = JSON.parse(await readFile(SCENARIO_URL, "utf8"));
  const created = scenario.normal.events.find(({type}) => type === "ticket.created");
  const evidence = scenario.evidenceFiles[0];
  const notes = [{path: evidence.path, markdown: `# ${evidence.title}\n\n${evidence.excerpt}\n`}];
  return {input: makeInput(created, notes), existingPath: evidence.path};
}

function makeInput(created, notes, overrides = {}) {
  const ticket = {
    id: created.entityId,
    kind: created.data.kind,
    title: created.data.title,
    body: created.data.body,
    requester: created.actor.participant,
    assignee: created.data.assignee,
    goal: created.data.goal,
  };
  return {
    ticket,
    notes,
    context: {
      responseBody: "CSV passes, SRT multiline still fails, and no local-only changes remain.",
      sourceNote: {
        id: "30000000-0000-4000-8000-000000000008",
        title: "Caption export handoff supplement",
        body: "At the recorded revision, CSV passes while the SRT multiline fixture fails. No local-only changes remain.",
        author: {participant: ticket.assignee, kind: "ai"},
        observedAt: "2026-01-15T10:05:00Z",
        workContext: {promptRef: "ticket:handoff", harnessRef: "codex:test"},
        status: "proposed",
        sources: [{kind: "wiki", ref: "wiki/30000000-0000-4000-8000-000000000001.md"}],
        ...overrides,
      },
      summary: {
        id: "30000000-0000-4000-8000-000000000009",
        title: "Caption export current handoff summary",
        body: "CSV is passing. SRT multiline remains the confirmed failure and should be minimized next.",
        status: "proposed",
        summarizes: ["wiki/30000000-0000-4000-8000-000000000001.md"],
        previousSummary: null,
        decisionEvidence: [],
        supersedes: [],
      },
    },
  };
}

function structuredExisting({id, sources}) {
  const metadata = {
    schemaVersion: 1,
    id,
    recordType: "source-note",
    title: "Existing evidence",
    author: {participant: "participant-b", kind: "human"},
    observedAt: "2026-01-15T09:00:00Z",
    workContext: {promptRef: null, harnessRef: null},
    status: "proposed",
    sources,
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
  };
  return `\`\`\`duobrain-wiki\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\n# Existing evidence\n`;
}
