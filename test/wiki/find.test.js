import assert from "node:assert/strict";
import test from "node:test";

import {findRecords} from "../../src/wiki/index.js";
import {tokenize} from "../../src/wiki/find.js";

const id = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const path = (n) => `wiki/${id(n)}.md`;

function note(n, overrides = {}, body = "Body.") {
  const metadata = {
    schemaVersion: 1,
    id: id(n),
    recordType: "source-note",
    title: `Note ${n}`,
    author: {participant: "bob", kind: "ai"},
    observedAt: `2026-10-0${Math.min(n, 9)}T00:00:00.000Z`,
    workContext: {promptRef: null, harnessRef: null},
    status: "proposed",
    sources: [{kind: "observation", ref: "manual:test"}],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
    ...overrides,
  };
  return {path: path(n), markdown: `\`\`\`duobrain-wiki\n${JSON.stringify(metadata)}\n\`\`\`\n\n${body}\n`};
}

const filler = Array.from({length: 8}, (_, index) => note(20 + index, {title: `Unrelated topic ${index}`}, `Dashboard colors and layout ${index}.`));

test("splits Hangul into bigrams so particles still match", () => {
  assert.deepEqual(tokenize("티켓을 Export!"), ["티켓", "켓을", "export"]);
  assert.deepEqual(tokenize("a 김"), ["a", "김"]);
});

test("finds an English note from a Korean question through its keywords", () => {
  const target = note(1, {
    title: "Why the prompt changed",
    abstract: "Bob shortened the review prompt to cut false positives.",
    keywords: ["프롬프트 변경 이유", "review prompt", "prompts/review.md"],
  }, "The long checklist produced noise, so the prompt now lists three checks.");
  const bare = findRecords({notes: [target, ...filler], query: {question: "프롬프트를 왜 바꿨지?"}});
  assert.equal(bare.results[0].ref, target.path);
  assert.equal(bare.match, "weak", "different wording alone stays weak");
  assert.equal(JSON.stringify(bare).includes("long checklist"), false, "bodies are not returned");

  const result = findRecords({
    notes: [target, ...filler],
    query: {question: "프롬프트를 왜 바꿨지?", expand: ["변경 이유", "review prompt"]},
  });
  assert.equal(result.match, "strong");
  assert.equal(result.results[0].ref, target.path);
  assert.equal(result.results[0].abstract, "Bob shortened the review prompt to cut false positives.");
  assert.equal(result.results[0].open, `wiki-get --path ${target.path}`);
  assert.equal(result.results[0].snippet, "The long checklist produced noise, so the prompt now lists three checks.");
});

test("says none instead of filling results when nothing matches", () => {
  const result = findRecords({notes: filler, query: {question: "deployment rollback policy"}});

  assert.equal(result.match, "none");
  assert.deepEqual(result.results, []);
  assert.equal(result.recall.candidates, 0);
});

test("weighs the user's question above expansion terms", () => {
  const asked = note(1, {title: "Export fixtures"}, "Export fixture notes.");
  const expanded = note(2, {title: "Serializer fixtures"}, "Serializer fixture notes.");
  const result = findRecords({
    notes: [asked, expanded, ...filler],
    query: {question: "export", expand: ["serializer"], limit: 5},
  });

  assert.equal(result.results[0].ref, asked.path);
  const onlyExpanded = findRecords({notes: [expanded, ...filler], query: {question: "export", expand: ["serializer"]}});
  assert.equal(onlyExpanded.results[0].ref, expanded.path);
  assert.equal(onlyExpanded.match, "weak");
});

test("demotes a superseded note and surfaces its replacement", () => {
  const old = note(1, {title: "CSV export policy", status: "personal"}, "Use commas.");
  const replacement = note(2, {
    title: "Delimiter decision",
    status: "superseded",
    supersedes: [path(1)],
  }, "Retired.");
  const current = note(3, {title: "CSV export policy v2", supersedes: [path(1)]}, "Use semicolons.");
  const result = findRecords({notes: [old, replacement, current, ...filler], query: {question: "csv export policy", limit: 5}});

  assert.equal(result.results[0].ref, current.path);
  const demoted = result.results.find(({ref}) => ref === old.path);
  if (demoted) {
    assert.deepEqual(demoted.links.supersededBy.sort(), [path(2), path(3)].sort());
    assert.ok(demoted.hit.reasons.includes("superseded"));
  }
});

test("matches an exact entity and links tickets to their evidence notes", () => {
  const evidence = note(1, {title: "SRT fixture result"}, "Multiline SRT still fails.");
  const ticket = {
    id: "40000000-0000-4000-8000-000000000001",
    kind: "information",
    title: "Which fixtures pass?",
    body: "Record the export fixture results.",
    status: "answered",
    requester: "alice",
    assignee: "bob",
    evidence: [evidence.path],
    history: [
      {type: "ticket.created", at: "2026-10-01T00:00:00.000Z", data: {}},
      {type: "ticket.responded", at: "2026-10-02T00:00:00.000Z", data: {body: "CSV passes."}},
    ],
  };
  const result = findRecords({
    notes: [evidence, ...filler],
    tickets: [ticket],
    query: {question: "fixture", entities: [`ticket:${ticket.id}`], limit: 5},
  });
  const ticketCard = result.results.find(({kind}) => kind === "ticket");
  const noteCard = result.results.find(({kind}) => kind === "wiki");

  assert.equal(result.match, "strong");
  assert.equal(result.results[0].ref, `ticket:${ticket.id}`);
  assert.deepEqual(ticketCard.hit.entities, [`ticket:${ticket.id}`]);
  assert.deepEqual(ticketCard.links.evidence, [evidence.path]);
  assert.equal(ticketCard.open, `ticket --id ${ticket.id}`);
  assert.deepEqual(noteCard.links.evidenceFor, [`ticket:${ticket.id}`]);
  assert.ok(noteCard.hit.reasons.includes("evidence for an open ticket"));
});

test("collapses a summary and the sources it summarizes into one card", () => {
  const sourceA = note(1, {title: "Parser timing run A"});
  const sourceB = note(2, {title: "Parser timing run B"});
  const summary = note(3, {
    recordType: "summary",
    title: "Parser timing summary",
    summarizes: [path(1), path(2)],
  });
  const result = findRecords({notes: [sourceA, sourceB, summary, ...filler], query: {question: "parser timing", limit: 5}});

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].ref, summary.path);
  assert.deepEqual(result.results[0].links.members.sort(), [path(1), path(2)]);
});

test("keeps the output small, reports the rest, and honours kinds and exclude", () => {
  const notes = Array.from({length: 12}, (_, index) => note(index + 1, {title: `Export run ${index}`}, "Export."));
  const session = {
    id: "50000000-0000-4000-8000-000000000001",
    participant: "alice",
    title: "Export cleanup",
    status: "ended",
    scope: ["src/export.js"],
    goal: "Tidy export",
    summary: "Removed the old writer.",
    next: "Check SRT.",
    startedAt: "2026-10-01T00:00:00.000Z",
    endedAt: "2026-10-01T02:00:00.000Z",
  };
  const all = findRecords({notes, sessions: [session], query: {question: "export"}});

  assert.equal(all.results.length, 3);
  assert.equal(all.recall.candidates, 13);
  assert.equal(all.more, 10);

  const sessionsOnly = findRecords({notes, sessions: [session], query: {question: "export", kinds: ["session"]}});
  assert.deepEqual(sessionsOnly.results.map(({kind}) => kind), ["session"]);
  assert.equal(sessionsOnly.results[0].next, "Check SRT.");

  const excluded = findRecords({notes, sessions: [session], query: {question: "export", exclude: ["cleanup"], kinds: ["session"]}});
  assert.equal(excluded.match, "none");
});

test("rejects an unusable query", () => {
  assert.throws(() => findRecords({query: {question: " "}}), TypeError);
  assert.throws(() => findRecords({query: {question: "x", kinds: ["mail"]}}), TypeError);
  assert.throws(() => findRecords({query: {question: "x", limit: 11}}), TypeError);
});
