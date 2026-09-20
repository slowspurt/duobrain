import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {parseWikiNote, validateWikiNote, WikiParseError} from "../../src/wiki/index.js";

const EXAMPLE_ROOT = new URL("../../examples/wiki/", import.meta.url);

test("parses and validates the source-note example", async () => {
  const markdown = await readFile(new URL("30000000-0000-4000-8000-000000000001.md", EXAMPLE_ROOT), "utf8");
  const parsed = parseWikiNote(markdown);
  const validation = validateWikiNote(parsed, {path: "wiki/30000000-0000-4000-8000-000000000001.md"});

  assert.equal(parsed.format, "structured");
  assert.equal(parsed.metadata.recordType, "source-note");
  assert.match(parsed.body, /실패 응답/);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.valid, true);
});

test("validates an agreed summary with source and decision evidence", async () => {
  const markdown = await readFile(new URL("30000000-0000-4000-8000-000000000003.md", EXAMPLE_ROOT), "utf8");
  const validation = validateWikiNote(markdown, {path: "wiki/30000000-0000-4000-8000-000000000003.md"});

  assert.equal(validation.valid, true);
  assert.equal(validation.note.metadata.status, "agreed");
  assert.equal(validation.note.metadata.previousSummary, null);
});

test("accepts examples for every knowledge status", async () => {
  const examples = [
    ["30000000-0000-4000-8000-000000000001.md", "proposed"],
    ["30000000-0000-4000-8000-000000000002.md", "agreed"],
    ["30000000-0000-4000-8000-000000000004.md", "personal"],
    ["30000000-0000-4000-8000-000000000005.md", "superseded"],
    ["30000000-0000-4000-8000-000000000007.md", "proposed"],
  ];

  for (const [filename, status] of examples) {
    const markdown = await readFile(new URL(filename, EXAMPLE_ROOT), "utf8");
    const validation = validateWikiNote(markdown, {path: `wiki/${filename}`});
    assert.equal(validation.valid, true, filename);
    assert.equal(validation.note.metadata.status, status);
  }
});

test("reports missing sources separately from unsupported agreed promotion", () => {
  const markdown = structured({
    status: "agreed",
    sources: [],
    decisionEvidence: [],
  });
  const validation = validateWikiNote(markdown);

  assert.equal(validation.valid, false);
  assert.deepEqual(
    validation.errors.map(({code}) => code).filter((code) => ["MISSING_SOURCES", "AGREED_WITHOUT_DECISION_EVIDENCE"].includes(code)),
    ["MISSING_SOURCES", "AGREED_WITHOUT_DECISION_EVIDENCE"],
  );
});

test("preserves legacy supplement text with unknown status", async () => {
  const filename = "30000000-0000-4000-8000-000000000006.md";
  const markdown = await readFile(new URL(filename, EXAMPLE_ROOT), "utf8");
  const parsed = parseWikiNote(markdown);
  const validation = validateWikiNote(parsed, {path: `wiki/${filename}`});

  assert.equal(parsed.format, "legacy");
  assert.equal(parsed.metadata, null);
  assert.equal(parsed.body, markdown);
  assert.equal(validation.valid, true);
  assert.equal(validation.warnings[0].code, "LEGACY_UNSTRUCTURED_NOTE");
});

test("rejects malformed structured metadata instead of treating it as legacy", () => {
  const markdown = "```duobrain-wiki\n{not json}\n```\nbody";
  assert.throws(() => parseWikiNote(markdown), WikiParseError);
  assert.equal(validateWikiNote(markdown).errors[0].code, "INVALID_METADATA_JSON");

  const unfinished = "```duobrain-wiki\n{}";
  assert.throws(() => parseWikiNote(unfinished), WikiParseError);
});

test("checks the path UUID against the immutable record UUID", () => {
  const validation = validateWikiNote(structured(), {
    path: "wiki/30000000-0000-4000-8000-000000000099.md",
  });
  assert.equal(validation.errors.some(({code}) => code === "PATH_ID_MISMATCH"), true);
});

function structured(overrides = {}) {
  const metadata = {
    schemaVersion: 1,
    id: "30000000-0000-4000-8000-000000000001",
    recordType: "source-note",
    title: "Example",
    author: {participant: "bob", kind: "human"},
    observedAt: "2026-09-20T00:00:00.000Z",
    workContext: {promptRef: null, harnessRef: null},
    status: "proposed",
    sources: [{kind: "observation", ref: "manual:test"}],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes: [],
    ...overrides,
  };
  return `\`\`\`duobrain-wiki\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\n# Example\n\nBody.\n`;
}
