import {parseWikiNote} from "./index.js";

const KINDS = ["wiki", "ticket", "session"];
const TERMINAL_TICKET_STATUSES = new Set(["resolved", "closed"]);

// BM25F field weights per record kind.
const FIELD_WEIGHTS = {
  wiki: {title: 3, keywords: 2.5, abstract: 2, body: 1, refs: 1},
  ticket: {title: 3, body: 1.5, responses: 1},
  session: {title: 3, text: 1.5, scope: 1},
};
const K1 = 1.2;
const B = 0.75;
const QUERY_WEIGHTS = {question: 1, intent: 0.6, expand: 0.4};
const RECALL_LIMIT = 30;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;
const EXACT_ENTITY_BONUS = 2;
const ENTITY_MENTION_BONUS = 0.5;
const SUPERSEDED_FACTOR = 0.3;
const LINKED_FACTOR = 0.9;
const OPEN_TICKET_EVIDENCE_FACTOR = 1.3;
const TOP_SCORE_FLOOR = 0.35;
const DROP_RATIO = 0.5;
const STRONG_COVERAGE = 0.5;
const EXCERPT_LENGTH = 160;
const BROWSE_LIMIT = 100;
const BROWSE_ABSTRACT_LENGTH = 80;

/**
 * Find wiki notes, tickets and sessions for a structured query without reading
 * the shared store. Two channels run side by side. Search: wide lexical BM25F
 * recall, a deterministic judgment pass, and a few scored cards. Browse: a short
 * listing of the other records, newest first, so the caller can also pick by
 * meaning what the words missed. Bodies are never included.
 */
export function findRecords({notes = [], tickets = [], sessions = [], query} = {}) {
  if (!Array.isArray(notes) || !Array.isArray(tickets) || !Array.isArray(sessions)) {
    throw new TypeError("notes, tickets and sessions must be arrays");
  }
  const normalized = normalizeQuery(query);
  const documents = [
    ...(normalized.kinds.has("wiki") ? notes.map(wikiDocument).filter(Boolean) : []),
    ...(normalized.kinds.has("ticket") ? tickets.map(ticketDocument) : []),
    ...(normalized.kinds.has("session") ? sessions.map(sessionDocument) : []),
  ].filter((document) => !isExcluded(document, normalized.exclude));

  linkRecords(documents, notes, tickets);
  const scored = scoreDocuments(documents, normalized);
  const recalled = scored
    .filter((entry) => entry.score > 0)
    .sort(compareEntries)
    .slice(0, RECALL_LIMIT);
  const judged = judge(recalled, scored);
  const kept = cutoff(judged, normalized.limit);

  return {
    match: matchStrength(kept[0]),
    recall: {candidates: recalled.length, byKind: countByKind(recalled)},
    results: kept.map((entry) => card(entry)),
    more: judged.length - kept.length,
    ...(normalized.browse ? {browse: browse(documents, kept)} : {}),
  };
}

/** The file-exploration channel: every record the search did not return, as one short line each. */
function browse(documents, kept) {
  const shown = new Set(kept.flatMap((entry) => [entry.document.ref, ...(entry.members ?? [])]));
  const rest = documents
    .filter((document) => !shown.has(document.ref))
    .sort((left, right) => (right.at ?? "").localeCompare(left.at ?? "") || left.ref.localeCompare(right.ref));
  return {
    total: rest.length,
    items: rest.slice(0, BROWSE_LIMIT).map((document) => {
      const summary = card({document, hitFields: [], hitTerms: [], exactEntities: [], reasons: []});
      const item = {ref: document.ref, title: summary.title, status: summary.status, at: summary.at};
      if (summary.abstract) item.abstract = clip(summary.abstract, BROWSE_ABSTRACT_LENGTH);
      if (document.superseded) item.superseded = true;
      return item;
    }),
  };
}

function normalizeQuery(query) {
  if (!isObject(query) || typeof query.question !== "string" || query.question.trim() === "") {
    throw new TypeError("query.question must be a non-empty string");
  }
  const strings = (value, field) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new TypeError(`query.${field} must be an array of strings`);
    }
    return value.map((item) => item.trim()).filter(Boolean);
  };
  if (query.intent !== undefined && typeof query.intent !== "string") {
    throw new TypeError("query.intent must be a string");
  }
  const kinds = query.kinds === undefined ? KINDS : strings(query.kinds, "kinds");
  if (kinds.length === 0 || kinds.some((kind) => !KINDS.includes(kind))) {
    throw new TypeError(`query.kinds must name ${KINDS.join(", ")}`);
  }
  const limit = query.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new TypeError(`query.limit must be an integer from 1 through ${MAX_LIMIT}`);
  }

  const weights = new Map();
  const addTerms = (text, weight) => {
    for (const term of tokenize(text)) {
      weights.set(term, Math.max(weights.get(term) ?? 0, weight));
    }
  };
  addTerms(query.question, QUERY_WEIGHTS.question);
  addTerms(query.intent ?? "", QUERY_WEIGHTS.intent);
  for (const expansion of strings(query.expand, "expand")) addTerms(expansion, QUERY_WEIGHTS.expand);

  const questionWords = words(query.question);
  return {
    weights,
    questionWords,
    queryWords: [...new Set([...questionWords, ...strings(query.expand, "expand").flatMap(words)])],
    entities: strings(query.entities, "entities").map(normalizeEntity),
    exclude: strings(query.exclude, "exclude").map((item) => fold(item)),
    kinds: new Set(kinds),
    limit,
    browse: query.browse !== false,
  };
}

function words(text) {
  return [...new Set([...fold(text).matchAll(/[\p{L}\p{N}]+/gu)].map(([word]) => word))];
}

/** Lower-cased words; Hangul runs become character bigrams so particles do not block a match. */
export function tokenize(text) {
  const terms = [];
  for (const [word] of fold(text).matchAll(/[\p{L}\p{N}]+/gu)) {
    for (const part of word.split(/(\p{Script=Hangul}+)/u).filter(Boolean)) {
      if (!/^\p{Script=Hangul}+$/u.test(part) || part.length < 2) {
        terms.push(/^[a-z]+$/.test(part) ? stem(part) : part);
        continue;
      }
      for (let index = 0; index < part.length - 1; index += 1) terms.push(part.slice(index, index + 2));
    }
  }
  return terms;
}

/** A light English stem applied to both sides, so fixtures, fixture and tested, tests meet. */
function stem(word) {
  let result = word;
  if (result.length > 4 && result.endsWith("ies")) result = `${result.slice(0, -3)}y`;
  else if (result.length > 3 && result.endsWith("s") && !result.endsWith("ss")) result = result.slice(0, -1);
  if (result.length > 5 && result.endsWith("ing")) result = result.slice(0, -3);
  else if (result.length > 4 && result.endsWith("ed")) result = result.slice(0, -2);
  if (result.length > 3 && result.endsWith("e")) result = result.slice(0, -1);
  return result;
}

function wikiDocument(note) {
  if (!isObject(note) || typeof note.path !== "string" || typeof note.markdown !== "string") return null;
  let parsed;
  try {
    parsed = parseWikiNote(note.markdown);
  } catch {
    return null;
  }
  const metadata = parsed.format === "structured" ? parsed.metadata : null;
  const id = note.path.replace(/^wiki\//, "").replace(/\.md$/, "");
  const keywords = Array.isArray(metadata?.keywords) ? metadata.keywords.filter((item) => typeof item === "string") : [];
  const sources = Array.isArray(metadata?.sources) ? metadata.sources.map((source) => source?.ref).filter(isString) : [];
  const workRefs = [metadata?.workContext?.promptRef, metadata?.workContext?.harnessRef].filter(isString);
  return {
    kind: "wiki",
    ref: note.path,
    at: metadata?.observedAt ?? null,
    record: {parsed, metadata},
    fields: {
      title: metadata?.title ?? firstHeading(parsed.body) ?? "",
      keywords: keywords.join(" \n "),
      abstract: isString(metadata?.abstract) ? metadata.abstract : "",
      body: parsed.body,
      refs: [...sources, ...workRefs].join(" "),
    },
    entities: new Set([note.path, `wiki:${id}`, `wiki:${note.path}`, ...sources, ...workRefs, ...keywords].map(normalizeEntity)),
    links: {evidenceFor: [], supersededBy: []},
  };
}

function ticketDocument(ticket) {
  const history = Array.isArray(ticket.history) ? ticket.history : [];
  return {
    kind: "ticket",
    ref: `ticket:${ticket.id}`,
    at: history.at(-1)?.at ?? null,
    record: ticket,
    fields: {
      title: ticket.title ?? "",
      body: ticket.body ?? "",
      responses: history.slice(1).map((event) => event.data?.body).filter(isString).join("\n"),
    },
    entities: new Set([ticket.id, `ticket:${ticket.id}`, ...(ticket.evidence ?? [])].filter(isString).map(normalizeEntity)),
    links: {evidence: [...(ticket.evidence ?? [])]},
  };
}

function sessionDocument(session) {
  const scope = Array.isArray(session.scope) ? session.scope : [];
  return {
    kind: "session",
    ref: `session:${session.id}`,
    at: session.endedAt ?? session.startedAt ?? null,
    record: session,
    fields: {
      title: session.title ?? "",
      text: [session.goal, session.summary, session.next, ...(session.blockers ?? [])].filter(isString).join("\n"),
      scope: scope.join(" "),
    },
    entities: new Set([session.id, `session:${session.id}`, ...scope, session.branch, session.baseCommit]
      .filter(isString).map(normalizeEntity)),
    links: {},
  };
}

/** Every wiki note as a card (no body), newest first, with backlinks and supersession. */
export function listWikiCards({notes = [], tickets = []} = {}) {
  const documents = notes.map(wikiDocument).filter(Boolean);
  linkRecords(documents, notes, tickets);
  return documents
    .map((document) => card({document, hitFields: [], hitTerms: [], exactEntities: [], reasons: []}))
    .map(({hit, open, ...rest}) => ({...rest, open}))
    .sort((left, right) => (right.at ?? "").localeCompare(left.at ?? "") || left.ref.localeCompare(right.ref));
}

function isExcluded(document, exclude) {
  if (exclude.length === 0) return false;
  const text = fold(`${document.fields.title} ${document.fields.keywords ?? ""}`);
  return exclude.some((phrase) => text.includes(phrase));
}

/** Backlinks and supersession are derived from the records on every call. */
function linkRecords(documents, notes, tickets) {
  const wiki = new Map(documents.filter((document) => document.kind === "wiki").map((document) => [document.ref, document]));
  for (const ticket of tickets) {
    for (const evidencePath of ticket.evidence ?? []) {
      const document = wiki.get(evidencePath);
      if (!document) continue;
      document.links.evidenceFor.push(`ticket:${ticket.id}`);
      if (!TERMINAL_TICKET_STATUSES.has(ticket.status)) document.openTicketEvidence = true;
    }
  }
  for (const document of wiki.values()) {
    const metadata = document.record.metadata;
    if (!metadata) continue;
    const targets = [...(Array.isArray(metadata.supersedes) ? metadata.supersedes : []), metadata.previousSummary];
    for (const target of targets.filter(isString)) wiki.get(target)?.links.supersededBy.push(document.ref);
  }
  for (const document of wiki.values()) {
    document.superseded = document.record.metadata?.status === "superseded" || document.links.supersededBy.length > 0;
  }
}

function scoreDocuments(documents, query) {
  const indexed = documents.map((document) => ({
    document,
    terms: Object.fromEntries(Object.entries(document.fields).map(([field, text]) => [field, countTerms(text)])),
  }));
  const averageLength = new Map();
  for (const {document, terms} of indexed) {
    for (const [field, counts] of Object.entries(terms)) {
      const key = `${document.kind}.${field}`;
      const total = averageLength.get(key) ?? {sum: 0, count: 0};
      total.sum += counts.length;
      total.count += 1;
      averageLength.set(key, total);
    }
  }
  const documentFrequency = new Map();
  for (const {terms} of indexed) {
    const seen = new Set(Object.values(terms).flatMap((counts) => [...counts.map.keys()]));
    for (const term of seen) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  return indexed.map(({document, terms}) => {
    let score = 0;
    const hitFields = new Set();
    const hitTerms = new Set();
    for (const [term, queryWeight] of query.weights) {
      let weightedFrequency = 0;
      for (const [field, counts] of Object.entries(terms)) {
        const frequency = counts.map.get(term) ?? 0;
        if (frequency === 0) continue;
        const average = averageLength.get(`${document.kind}.${field}`);
        const meanLength = average.sum / average.count || 1;
        weightedFrequency += FIELD_WEIGHTS[document.kind][field] * frequency / (1 - B + B * counts.length / meanLength);
        hitFields.add(field);
      }
      if (weightedFrequency === 0) continue;
      const frequency = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (indexed.length - frequency + 0.5) / (frequency + 0.5));
      score += queryWeight * idf * weightedFrequency / (K1 + weightedFrequency);
      hitTerms.add(term);
    }

    const exactEntities = query.entities.filter((entity) => document.entities.has(entity));
    const allText = fold(Object.values(document.fields).join("\n"));
    const mentioned = query.entities.filter((entity) => !exactEntities.includes(entity) && allText.includes(entity));
    score += exactEntities.length * EXACT_ENTITY_BONUS + mentioned.length * ENTITY_MENTION_BONUS;

    return {
      document,
      score,
      exactEntities,
      hitFields: [...hitFields],
      hitTerms: [...hitTerms],
      coverage: curatedCoverage(terms, document.kind, query),
    };
  });
}

function countTerms(text) {
  const terms = tokenize(text);
  const map = new Map();
  for (const term of terms) map.set(term, (map.get(term) ?? 0) + 1);
  return {map, length: terms.length};
}

/**
 * Share of query words found in the fields a writer curates (title, keywords,
 * abstract). Expansion words count only once a word of the question itself is
 * covered, so an expansion alone cannot make a match look strong.
 */
function curatedCoverage(terms, kind, query) {
  const curated = (kind === "wiki" ? ["title", "keywords", "abstract"] : ["title"]).map((field) => terms[field]);
  const covered = (word) => {
    const parts = tokenize(word);
    const found = parts.filter((part) => curated.some((counts) => counts?.map.has(part))).length;
    return parts.length > 0 && found * 2 >= parts.length;
  };
  if (!query.questionWords.some(covered)) return 0;
  return query.queryWords.filter(covered).length / query.queryWords.length;
}

function judge(recalled, scored) {
  const byRef = new Map(scored.map((entry) => [entry.document.ref, entry]));
  const entries = new Map(recalled.map((entry) => [entry.document.ref, {...entry, reasons: []}]));

  for (const entry of [...entries.values()]) {
    const {document} = entry;
    if (document.kind !== "wiki") continue;
    if (document.openTicketEvidence) {
      entry.score *= OPEN_TICKET_EVIDENCE_FACTOR;
      entry.reasons.push("evidence for an open ticket");
    }
    if (!document.superseded) continue;
    const original = entry.score;
    entry.score *= SUPERSEDED_FACTOR;
    entry.reasons.push("superseded");
    for (const replacementRef of document.links.supersededBy) {
      const replacement = entries.get(replacementRef) ?? byRef.get(replacementRef);
      if (!replacement || replacement.document.superseded) continue;
      const current = entries.get(replacementRef) ?? {...replacement, score: 0, reasons: []};
      if (current.score < original * LINKED_FACTOR) {
        current.score = original * LINKED_FACTOR;
        current.reasons.push(`replaces ${document.ref}`);
      }
      entries.set(replacementRef, current);
    }
  }

  // A ticket named exactly brings its evidence notes along.
  for (const entry of [...entries.values()]) {
    if (entry.document.kind !== "ticket" || entry.exactEntities.length === 0) continue;
    for (const evidencePath of entry.document.links.evidence) {
      const linked = entries.get(evidencePath) ?? byRef.get(evidencePath);
      if (!linked || linked.document.superseded) continue;
      const current = entries.get(evidencePath) ?? {...linked, score: 0, reasons: []};
      if (current.score < entry.score * LINKED_FACTOR) {
        current.score = entry.score * LINKED_FACTOR;
        current.reasons.push(`evidence of ${entry.document.ref}`);
      }
      entries.set(evidencePath, current);
    }
  }

  // A summary and the sources it summarizes collapse into one card.
  for (const entry of [...entries.values()]) {
    const metadata = entry.document.record.metadata;
    if (entry.document.kind !== "wiki" || metadata?.recordType !== "summary" || entry.document.superseded) continue;
    const members = (Array.isArray(metadata.summarizes) ? metadata.summarizes : []).filter((ref) => entries.has(ref));
    if (members.length === 0) continue;
    entry.members = members;
    entry.score = Math.max(entry.score, ...members.map((ref) => entries.get(ref).score));
    for (const ref of members) entries.delete(ref);
  }

  return [...entries.values()].sort(compareEntries);
}

function cutoff(entries, limit) {
  if (entries.length === 0) return [];
  const floor = entries[0].score * TOP_SCORE_FLOOR;
  const kept = [entries[0]];
  for (let index = 1; index < entries.length && kept.length < limit; index += 1) {
    const entry = entries[index];
    if (entry.score < floor || entry.score < entries[index - 1].score * DROP_RATIO) break;
    kept.push(entry);
  }
  return kept;
}

function matchStrength(top) {
  if (!top) return "none";
  return top.exactEntities.length > 0 || top.coverage >= STRONG_COVERAGE ? "strong" : "weak";
}

function card(entry) {
  const {document} = entry;
  const hit = {fields: entry.hitFields, terms: entry.hitTerms};
  if (entry.exactEntities.length > 0) hit.entities = entry.exactEntities;
  if (entry.reasons.length > 0) hit.reasons = entry.reasons;

  if (document.kind === "wiki") {
    const {metadata, parsed} = document.record;
    const result = {
      kind: "wiki",
      ref: document.ref,
      title: document.fields.title || null,
      status: metadata?.status ?? "unknown",
      recordType: metadata?.recordType ?? null,
      author: metadata?.author?.participant ?? null,
      at: document.at,
      abstract: isString(metadata?.abstract) ? metadata.abstract : excerpt(parsed.body),
      hit,
      links: compactLinks({
        evidenceFor: document.links.evidenceFor,
        supersededBy: document.links.supersededBy,
        members: entry.members ?? [],
      }),
      open: `wiki-get --path ${document.ref}`,
    };
    if (entry.hitFields.includes("body")) result.snippet = snippet(parsed.body, entry.hitTerms);
    return result;
  }

  if (document.kind === "ticket") {
    const ticket = document.record;
    return {
      kind: "ticket",
      ref: document.ref,
      title: ticket.title ?? null,
      status: ticket.status ?? null,
      ticketKind: ticket.kind ?? null,
      requester: ticket.requester ?? null,
      assignee: ticket.assignee ?? null,
      at: document.at,
      abstract: excerpt(ticket.body ?? ""),
      hit,
      links: compactLinks({evidence: document.links.evidence}),
      open: `ticket-get --ticket ${ticket.id}`,
    };
  }

  const session = document.record;
  return {
    kind: "session",
    ref: document.ref,
    title: session.title ?? null,
    status: session.status ?? null,
    participant: session.participant ?? null,
    at: document.at,
    abstract: excerpt(session.summary ?? session.goal ?? ""),
    next: session.next ?? null,
    hit,
  };
}

function compactLinks(links) {
  return Object.fromEntries(Object.entries(links).filter(([, value]) => value.length > 0));
}

function excerpt(body) {
  const paragraph = body
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .find((block) => block !== "" && !/^#{1,6}\s/.test(block) && !block.startsWith("```"));
  return clip((paragraph ?? "").replace(/\s+/g, " "));
}

function snippet(body, terms) {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const line = lines.find((candidate) => {
    const folded = fold(candidate);
    return terms.some((term) => folded.includes(term));
  });
  return line ? clip(line) : null;
}

function firstHeading(body) {
  const match = /^#{1,6}\s+(.+)$/m.exec(body);
  return match ? match[1].trim() : null;
}

function clip(text, length = EXCERPT_LENGTH) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function countByKind(entries) {
  const counts = {};
  for (const {document} of entries) counts[document.kind] = (counts[document.kind] ?? 0) + 1;
  return counts;
}

function compareEntries(left, right) {
  return right.score - left.score
    || (right.document.at ?? "").localeCompare(left.document.at ?? "")
    || left.document.ref.localeCompare(right.document.ref);
}

function normalizeEntity(value) {
  return fold(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

function fold(text) {
  return String(text).normalize("NFC").toLocaleLowerCase();
}

function isString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
